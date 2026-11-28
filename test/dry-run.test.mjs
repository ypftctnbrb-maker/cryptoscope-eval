import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { canonical, digest, corePin } from '../scripts/capture-guard.mjs';
import { createDryRun } from '../scripts/dry-run.mjs';

const keys = generateKeyPairSync('ed25519');
const baseline = () => ({ bps: 10, version: 'test-double', mappingHash: '0'.repeat(64) });
const policy = { provider: 'fixture-only', free: true, publicKey: keys.publicKey };
const metric = (value, unit) => ({ value, unit, event_at: 300000, observed_at: 300500 });
function fixture() {
  return {
    version: '1.1-synthetic', core: { ...corePin }, venue: 'OKX', instrument: 'BTC-USDT-SWAP',
    candle: { open: 0, close: 300000, closed: true },
    event_at: 300000, observed_at: 301000, decision_at: 303000, horizon_ms: 300000,
    market_data: { open_cents: 9650000, close_cents: 9660000, trade_price_cents: 9659900, price_unit: 'USDT-cent',
      signed_trade: metric(120, 'OKX-0.01-BTC-contract'), oi: metric(23300, 'OKX-0.01-BTC-contract'),
      funding: metric(-2, 'bps') },
    cvd: null, oi: null, funding: null,
  };
}
const outcome = { venue: 'OKX', instrument: 'BTC-USDT-SWAP', start: 600000, end: 900000, observed_at: 901000,
  open_cents: 9665000, close_cents: 9670000 };
function receipt(snapshot) {
  const payload = { provider: policy.provider, digest: digest(snapshot), anchored_at: 302000 };
  return { payload, signature: sign(null, canonical(payload), keys.privateKey).toString('base64') };
}
function run(snapshot = fixture()) {
  let now = 303000;
  let calls = 0;
  const pipeline = createDryRun({ database: ':memory:', baseline,
    policy, clock: () => now,
    model: (...args) => {
      calls++;
      assert.equal(args.length, 3);
      assert.equal(JSON.parse(args[0]).market_data.close_cents, 9660000);
      assert.equal(args[1], digest(snapshot));
      assert.equal(args[2].version, '1');
      return -4;
    },
    anchor: hash => proof(hash, now),
  });
  return { pipeline, calls: () => calls, setTime(value) { now = value; } };
}
function proof(hash, anchored_at) {
  const payload = { provider: policy.provider, digest: hash, anchored_at };
  return { payload, signature: sign(null, canonical(payload), keys.privateKey).toString('base64') };
}
test('prediction is committed without an outcome and scores once when mature', () => {
  const snapshot = fixture();
  const { pipeline, setTime } = run(snapshot);
  const id = pipeline.predict(snapshot, receipt(snapshot));
  assert.equal(id, digest(snapshot));
  assert.equal(pipeline.getPrediction(id).record.model.version, '1');
  assert.throws(() => pipeline.predict(snapshot, receipt(snapshot)), /replay/i);
  assert.equal(pipeline.score(id, null), null);
  assert.throws(() => pipeline.score(id, outcome), /mature/i);
  setTime(901000);
  assert.throws(() => pipeline.score(id, { ...outcome, venue: 'Bybit' }), /outcome/i);
  assert.throws(() => pipeline.score('uncommitted', outcome), /commit/i);
  assert.deepEqual(pipeline.score(id, outcome).loss, { coreOnly: 5, corePlusModel: 1, zero: 5 });
  assert.throws(() => pipeline.score(id, outcome), /replay/i);
});
test('late and future input never reach the model', () => {
  const snapshot = fixture();
  const state = run(snapshot);
  state.setTime(600000);
  assert.throws(() => state.pipeline.predict(snapshot, receipt(snapshot)), /time/i);
  state.setTime(303000);
  snapshot.market_data.oi.observed_at = 303500;
  assert.throws(() => state.pipeline.predict(snapshot, receipt(snapshot)), /timing/i);
  assert.equal(state.calls(), 0);
});
test('mutation, invalid and late prediction receipts leave no prediction', () => {
  const snapshot = fixture();
  let now = 303000;
  const pipeline = createDryRun({ database: ':memory:', baseline, policy, clock: () => now, model: () => -4, anchor: hash => {
    now = 600000;
    return proof(hash, now);
  } });
  assert.throws(() => pipeline.predict(snapshot, receipt(snapshot)), /time/i);
  assert.equal(pipeline.getPrediction(digest(snapshot)), null);
  for (const mutate of [true, false]) {
    now = 303000;
    const attempt = createDryRun({ database: ':memory:', baseline, policy, clock: () => now, model: () => {
      if (mutate) snapshot.market_data.close_cents++;
      return -4;
    }, anchor: () => receipt(snapshot) });
    assert.throws(() => attempt.predict(snapshot, receipt(snapshot)), /digest|anchor/i);
    assert.equal(attempt.getPrediction(digest(snapshot)), null);
  }
});
for (const [label, modify, expected] of [
  ['missing receipt', (_snapshot, _proof) => null, /anchor/],
  ['forged receipt', (_snapshot, proof) => ({ ...proof, signature: 'AAAA' }), /signature/],
  ['altered snapshot', (snapshot, proof) => { snapshot.market_data.close_cents++; return proof; }, /digest/],
  ['extra secret field', (snapshot) => { snapshot.market_data.api_key = 'fixture-only'; return receipt(snapshot); }, /fields/],
  ['unsupported CVD', (snapshot) => { snapshot.cvd = 12; return receipt(snapshot); }, /metrics/],
  ['invalid units', (snapshot) => { snapshot.market_data.oi.unit = 'BTC'; return receipt(snapshot); }, /units/],
]) {
  test(label + ' stops before prediction', () => {
    const snapshot = fixture();
    const state = run(snapshot);
    assert.throws(() => state.pipeline.predict(snapshot, modify(snapshot, receipt(snapshot))), expected);
    assert.equal(state.calls(), 0);
  });
}
test('committed prediction survives mutation of returned copies and supports missing metrics', () => {
  const snapshot = fixture();
  snapshot.market_data.oi = snapshot.market_data.funding = null;
  const { pipeline, setTime } = run(snapshot);
  const id = pipeline.predict(snapshot, receipt(snapshot));
  pipeline.getPrediction(id).record.corePlusModel = 999;
  setTime(901000);
  const result = pipeline.score(id, outcome);
  assert.equal(result.loss.corePlusModel, 1);
  assert.deepEqual(result.missing, { oi: true, funding: true, signedTrade: false });
});
test('second venue requires a native matching outcome', () => {
  const snapshot = fixture();
  snapshot.venue = 'Bitfinex';
  snapshot.instrument = 'tBTCF0:USTF0';
  snapshot.market_data.signed_trade = metric(-125000, 'BTC-micro');
  snapshot.market_data.oi = metric(233000000, 'BTC-micro');
  const { pipeline, setTime } = run(snapshot);
  const id = pipeline.predict(snapshot, receipt(snapshot));
  setTime(901000);
  assert.throws(() => pipeline.score(id, outcome), /outcome/);
  assert.equal(pipeline.score(id, { ...outcome, venue: snapshot.venue, instrument: snapshot.instrument }).loss.corePlusModel, 1);
});

test('persistent reservation rejects competing and restarted workers for one target', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'g0-replay-'));
  const database = join(dir, 'ledger.sqlite');
  const snapshot = fixture();
  const changed = fixture();
  changed.market_data.close_cents++;
  const config = { database, policy, clock: () => 303000, anchor: hash => proof(hash, 303000) };
  const competitor = createDryRun({ database: ':memory:', baseline, ...config, model: () => assert.fail('duplicate model call') });
  const first = createDryRun({ database: ':memory:', baseline, ...config, model: () => {
    assert.throws(() => competitor.predict(changed, receipt(changed)), /replay/i);
    throw new Error('simulated crash after model dispatch');
  } });
  try {
    assert.throws(() => first.predict(snapshot, receipt(snapshot)), /simulated crash/);
    first.close();
    competitor.close();
    const restarted = createDryRun({ database: ':memory:', baseline, ...config, model: () => assert.fail('replayed model call') });
    try {
      assert.throws(() => restarted.predict(changed, receipt(changed)), /replay/i);
      assert.equal(restarted.getPrediction(digest(snapshot)), null);
    } finally {
      restarted.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pinned core drives the versioned baseline on a complete synthetic tape', {
  skip: !process.env.G0_TEST_CORE_BYTES,
}, async () => {
  const { readFileSync } = await import('node:fs');
  const { loadCoreBaseline } = await import('../scripts/core-baseline.mjs');
  const source = readFileSync(process.env.G0_TEST_CORE_BYTES);
  const actual = await loadCoreBaseline(source);
  await assert.rejects(loadCoreBaseline(Buffer.concat([source, Buffer.from('\n')])), /pin/);
  const snapshot = fixture();
  assert.equal(actual(snapshot).bps, null);
  snapshot.complete_tape = [
    { id: 1, time: 500, observed_at: 600, side: 'Buy', quantity: 120 },
    { id: 2, time: 700, observed_at: 800, side: 'Sell', quantity: 130 },
  ];
  const pipeline = createDryRun({ database: ':memory:', baseline: actual, policy, clock: () => 303000,
    model: () => 1, anchor: hash => proof(hash, 303000) });
  try {
    const id = pipeline.predict(snapshot, receipt(snapshot));
    const { record } = pipeline.getPrediction(id);
    assert.equal(record.coreOnly, -1);
    assert.equal(record.corePlusModel, 0);
    assert.equal(record.baseline.version, 'synthetic-cvd-sign-v1');
    assert.match(record.baseline.mappingHash, /^[a-f0-9]{64}$/);
  } finally {
    pipeline.close();
  }
});

test('restart retains verified prediction and outcome; tampering stops simulated push', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'g0-score-'));
  const database = join(dir, 'ledger.sqlite');
  let now = 303000;
  const config = { database, baseline, policy, clock: () => now, anchor: hash => proof(hash, now), model: () => -4 };
  const snapshot = fixture();
  try {
    const first = createDryRun(config);
    const id = first.predict(snapshot, receipt(snapshot));
    first.close();
    now = 901000;
    const second = createDryRun(config);
    const tamper = new DatabaseSync(database);
    try {
      assert.equal(second.score(id, null), null);
      const payload = second.getPrediction(id);
      const altered = structuredClone(payload);
      altered.receipt.signature = 'AAAA';
      const write = tamper.prepare('UPDATE decisions SET prediction = ? WHERE snapshot_id = ?');
      write.run(JSON.stringify(altered), id);
      assert.throws(() => second.score(id, outcome), /signature/);
      write.run(JSON.stringify(payload), id);
      assert.equal(second.score(id, outcome).outcomeDigest, digest(outcome));
      assert.equal(tamper.prepare('SELECT outcome_digest FROM decisions WHERE snapshot_id = ?').get(id).outcome_digest, digest(outcome));
    } finally {
      tamper.close();
      second.close();
    }
    const restarted = createDryRun(config);
    try {
      assert.throws(() => restarted.score(id, { ...outcome, close_cents: outcome.close_cents + 1 }), /replay/);
    } finally {
      restarted.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
