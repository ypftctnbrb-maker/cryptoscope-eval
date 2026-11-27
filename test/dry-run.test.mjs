import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { canonical, digest, corePin } from '../scripts/capture-guard.mjs';
import { dryRun } from '../scripts/dry-run.mjs';

const keys = generateKeyPairSync('ed25519');
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
test('stages exact committed input then scores three paired predictions', () => {
  for (const missing of [false, true]) {
    const snapshot = fixture();
    if (missing) snapshot.market_data.oi = snapshot.market_data.funding = null;
    const proof = receipt(snapshot);
    const result = dryRun(snapshot, proof, outcome, policy, (bytes, commitment) => {
      assert.equal(commitment, proof.payload.digest);
      assert.equal(bytes, canonical(snapshot).toString('utf8'));
      return -4;
    });
    assert.equal(result.simulatedPush.snapshotDigest, proof.payload.digest);
    assert.deepEqual(Object.keys(result.simulatedPush.loss), ['coreOnly', 'corePlusModel', 'zero']);
    assert.deepEqual(result.simulatedPush.loss, { coreOnly: 5, corePlusModel: 1, zero: 5 });
    assert.equal(result.simulatedPush.missing.oi, missing);
  }
});

for (const [name, alter, error] of [
  ['missing anchor', ({ input }) => { input[1] = null; }, /anchor/],
  ['invalid anchor', ({ input }) => { input[1].signature = 'AAAA'; }, /signature/],
  ['changed snapshot', ({ snapshot }) => { snapshot.market_data.close_cents++; }, /digest/],
  ['future metric', ({ snapshot, input }) => { snapshot.market_data.oi.observed_at = 303001; input[1] = receipt(snapshot); }, /timing/],
  ['wrong venue', ({ input }) => { input[2].venue = 'Bybit'; }, /outcome/],
  ['secret field', ({ snapshot, input }) => { snapshot.market_data.api_key = 'fixture-secret'; input[1] = receipt(snapshot); }, /fields/],
  ['unsupported metric', ({ snapshot, input }) => { snapshot.cvd = 12; input[1] = receipt(snapshot); }, /metrics/],
  ['wrong units', ({ snapshot, input }) => { snapshot.market_data.oi.unit = 'BTC'; input[1] = receipt(snapshot); }, /units/],
]) {
  test(name + ' cannot reach model or simulated push', () => {
    const snapshot = fixture();
    let invocations = 0;
    const input = [snapshot, receipt(snapshot), { ...outcome }, policy, () => ++invocations];
    alter({ snapshot, input });
    assert.throws(() => dryRun(...input), error);
    assert.equal(invocations, 0);
  });
}

test('mutation during model execution cannot reach simulated push', () => {
  const snapshot = fixture();
  assert.throws(() => dryRun(snapshot, receipt(snapshot), outcome, policy, () => {
    snapshot.market_data.close_cents++;
    return -4;
  }), /digest/);
});

test('second venue uses its own native identity, units and outcome', () => {
  const snapshot = fixture();
  snapshot.venue = 'Bitfinex';
  snapshot.instrument = 'tBTCF0:USTF0';
  snapshot.market_data.signed_trade = metric(-125000, 'BTC-micro');
  snapshot.market_data.oi = metric(233000000, 'BTC-micro');
  const matchingOutcome = { ...outcome, venue: snapshot.venue, instrument: snapshot.instrument };
  const proof = receipt(snapshot);
  assert.equal(dryRun(snapshot, proof, matchingOutcome, policy, () => -4).simulatedPush.loss.corePlusModel, 1);
  assert.throws(() => dryRun(snapshot, proof, outcome, policy, () => -4), /outcome/);
});
