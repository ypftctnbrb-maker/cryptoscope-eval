import { canonical, digest, targetStartFor, verifyAnchor, verifyOutcome, verifySnapshot } from './capture-guard.mjs';

const returnBps = (open, close) => Math.round(((close - open) / open) * 10000);
const modelConfig = Object.freeze({ id: 'local-fixture', version: '1', config: 'fixed-bps-adjustment' });

export function createDryRun({ policy, clock, model, anchor }) {
  const predictions = new Map();
  const started = new Set();
  const scored = new Set();
  function readTime(earliest, deadline = Infinity) {
    const now = clock();
    if (!Number.isSafeInteger(now) || now < earliest || now >= deadline) {
      throw new Error('Invalid or late clock time');
    }
    return now;
  }

  return {
    predict(snapshot, snapshotReceipt) {
      if (arguments.length !== 2 || snapshot?.version !== '1.1-synthetic') throw new Error('Synthetic snapshot and receipt required');
      const id = verifySnapshot(snapshot, snapshotReceipt, policy);
      if (started.has(id)) throw new Error('Prediction replay');
      const bytes = canonical(snapshot).toString('utf8');
      const committedSnapshot = JSON.parse(bytes);
      const target = targetStartFor(committedSnapshot);
      const start = readTime(committedSnapshot.decision_at, target);
      started.add(id);
      const data = committedSnapshot.market_data;
      const coreOnly = returnBps(data.open_cents, data.close_cents);
      const adjustment = model(bytes, id, modelConfig);
      if (!Number.isSafeInteger(adjustment) || !Number.isSafeInteger(coreOnly + adjustment)) {
        throw new Error('Invalid synthetic model output');
      }
      const generatedAt = readTime(start, target);
      const record = { kind: 'g0-prediction', snapshotDigest: id, target, model: modelConfig,
        coreOnly, corePlusModel: coreOnly + adjustment, generatedAt };
      const predictionDigest = digest(record);
      const receipt = anchor(predictionDigest);
      const now = readTime(generatedAt, target);
      const anchoredAt = verifyAnchor(receipt, policy, predictionDigest, generatedAt, target);
      if (anchoredAt > now || verifySnapshot(snapshot, snapshotReceipt, policy) !== id) {
        throw new Error('Future anchor or changed snapshot digest');
      }
      predictions.set(id, { bytes, record, predictionDigest, receipt: structuredClone(receipt) });
      return id;
    },

    getPrediction(id) {
      const prediction = predictions.get(id);
      return prediction ? structuredClone(prediction) : null;
    },

    score(id, outcome) {
      const prediction = predictions.get(id);
      if (!prediction) throw new Error('No committed prediction');
      if (scored.has(id)) throw new Error('Outcome replay');
      if (outcome === null) return null;
      outcome = structuredClone(outcome);
      const snapshot = JSON.parse(prediction.bytes);
      verifyOutcome(snapshot, outcome);
      const { record, predictionDigest, receipt } = prediction;
      if (digest(snapshot) !== id || digest(record) !== predictionDigest) throw new Error('Changed commitment digest');
      verifyAnchor(receipt, policy, predictionDigest, record.generatedAt, record.target);
      const now = clock();
      if (!Number.isSafeInteger(now) || now < outcome.observed_at) throw new Error('Outcome is not mature');
      const actualBps = returnBps(outcome.open_cents, outcome.close_cents);
      const data = snapshot.market_data;
      scored.add(id);
      return { snapshotDigest: id, predictionDigest, actualBps,
        missing: { oi: data.oi === null, funding: data.funding === null, signedTrade: data.signed_trade === null },
        loss: {
          coreOnly: Math.abs(actualBps - record.coreOnly),
          corePlusModel: Math.abs(actualBps - record.corePlusModel),
          zero: Math.abs(actualBps),
        } };
    },
  };
}
