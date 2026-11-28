import { DatabaseSync } from 'node:sqlite';
import { canonical, digest, targetStartFor, verifyAnchor, verifyOutcome, verifySnapshot } from './capture-guard.mjs';

const returnBps = (open, close) => Math.round(((close - open) / open) * 10000);
const modelConfig = Object.freeze({ id: 'local-fixture', version: '1', config: 'fixed-bps-adjustment' });

export function createDryRun({ database, policy, clock, model, anchor, baseline }) {
  if (!database) throw new Error('Explicit ledger database required');
  if (typeof baseline !== 'function') throw new Error('Explicit baseline required');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA busy_timeout = 2000;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS decisions (
      decision_key TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL UNIQUE,
      prediction TEXT, outcome TEXT, outcome_digest TEXT
    ) STRICT;`);
  const reserve = db.prepare('INSERT OR IGNORE INTO decisions (decision_key, snapshot_id) VALUES (?, ?)');
  const commit = db.prepare('UPDATE decisions SET prediction = ? WHERE snapshot_id = ? AND prediction IS NULL');
  const lookup = db.prepare('SELECT * FROM decisions WHERE snapshot_id = ?');
  const publish = db.prepare(`UPDATE decisions SET outcome = ?, outcome_digest = ?
    WHERE snapshot_id = ? AND prediction = ? AND outcome_digest IS NULL`);
  function readTime(earliest, deadline = Infinity) {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < earliest || now >= deadline) {
      throw new Error('Invalid or late clock time');
    }
    return now;
  }

  return {
    close() { db.close(); },

    predict(snapshot, snapshotReceipt) {
      if (arguments.length !== 2 || snapshot?.version !== '1.1-synthetic') throw new Error('Synthetic snapshot and receipt required');
      const id = verifySnapshot(snapshot, snapshotReceipt, policy);
      const bytes = canonical(snapshot).toString('utf8');
      const committedSnapshot = JSON.parse(bytes);
      const target = targetStartFor(committedSnapshot);
      const start = readTime(committedSnapshot.decision_at, target);
      const decisionKey = digest({ venue: committedSnapshot.venue, instrument: committedSnapshot.instrument,
        protocol: committedSnapshot.version, target });
      if (reserve.run(decisionKey, id).changes !== 1) throw new Error('Prediction replay');

      const base = baseline(committedSnapshot);
      if (!base || (base.bps !== null && !Number.isSafeInteger(base.bps)) ||
          typeof base.version !== 'string' || !/^[a-f0-9]{64}$/.test(base.mappingHash)) {
        throw new Error('Invalid baseline');
      }
      const coreOnly = base.bps;
      const adjustment = model(bytes, id, modelConfig);
      if (!Number.isSafeInteger(adjustment) || (coreOnly !== null && !Number.isSafeInteger(coreOnly + adjustment))) {
        throw new Error('Invalid synthetic model output');
      }
      const generatedAt = readTime(start, target);
      const record = { kind: 'g0-prediction', snapshotDigest: id, target, model: modelConfig,
        baseline: { version: base.version, mappingHash: base.mappingHash },
        coreOnly, corePlusModel: coreOnly === null ? null : coreOnly + adjustment, generatedAt };
      const predictionDigest = digest(record);
      const receipt = anchor(predictionDigest);
      const now = readTime(generatedAt, target);
      const anchoredAt = verifyAnchor(receipt, policy, predictionDigest, generatedAt, target);
      if (anchoredAt > now || verifySnapshot(snapshot, snapshotReceipt, policy) !== id) {
        throw new Error('Future anchor or changed snapshot digest');
      }
      const payload = JSON.stringify({ bytes, record, predictionDigest, receipt, snapshotReceipt });
      if (commit.run(payload, id).changes !== 1) throw new Error('Prediction commitment failed');
      return id;
    },

    getPrediction(id) {
      const payload = lookup.get(id)?.prediction;
      return payload ? JSON.parse(payload) : null;
    },

    score(id, outcome) {
      const row = lookup.get(id);
      if (!row?.prediction) throw new Error('No committed prediction');
      if (row.outcome_digest !== null) throw new Error('Outcome replay');
      if (outcome === null) return null;
      const prediction = JSON.parse(row.prediction);
      outcome = structuredClone(outcome);
      const snapshot = JSON.parse(prediction.bytes);
      verifyOutcome(snapshot, outcome);
      const { record, predictionDigest, receipt } = prediction;
      if (verifySnapshot(snapshot, prediction.snapshotReceipt, policy) !== id || record.snapshotDigest !== id || digest(record) !== predictionDigest) throw new Error('Changed commitment digest');
      verifyAnchor(receipt, policy, predictionDigest, record.generatedAt, record.target);
      const now = clock();
      if (!Number.isSafeInteger(now) || now < outcome.observed_at) throw new Error('Outcome is not mature');
      const actualBps = returnBps(outcome.open_cents, outcome.close_cents);
      const data = snapshot.market_data;
      const outcomeDigest = digest(outcome);
      if (publish.run(canonical(outcome).toString('utf8'), outcomeDigest, id, row.prediction).changes !== 1) {
        throw new Error('Outcome replay or changed prediction');
      }
      return { snapshotDigest: id, predictionDigest, outcomeDigest, actualBps,
        missing: { oi: data.oi === null, funding: data.funding === null, signedTrade: data.signed_trade === null },
        loss: {
          coreOnly: record.coreOnly === null ? null : Math.abs(actualBps - record.coreOnly),
          corePlusModel: record.corePlusModel === null ? null : Math.abs(actualBps - record.corePlusModel),
          zero: Math.abs(actualBps),
        } };
    },
  };
}
