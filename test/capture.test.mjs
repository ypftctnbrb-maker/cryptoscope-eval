import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { canonical, digest, verifyCapture, corePin } from '../scripts/capture-guard.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const policy = { publicKey, provider: 'test-anchor', free: true };
const fixture = () => ({
  version: '1.1', core: { ...corePin }, venue: 'OKX', instrument: 'BTC-USDT',
  candle: { open: 0, close: 300000, closed: true },
  event_at: 300000, observed_at: 301000, decision_at: 303000, horizon_ms: 300000,
  cvd: null, oi: null, funding: null,
});
const outcome = { venue: 'OKX', instrument: 'BTC-USDT', start: 600000, end: 900000, observed_at: 901000 };
function anchor(snapshot) {
  const payload = { provider: policy.provider, digest: digest(snapshot), anchored_at: 302000 };
  return { payload, signature: sign(null, canonical(payload), privateKey).toString('base64') };
}

test('bounded synthetic dry-run verifies canonical bytes and paired contract', () => {
  const snapshot = fixture();
  const receipt = anchor(snapshot);
  assert.equal(verifyCapture(snapshot, receipt, outcome, policy), receipt.payload.digest);
  assert.deepEqual(canonical(snapshot), canonical(Object.fromEntries(Object.entries(snapshot).reverse())));
});
test('missing, forged, late or unapproved anchor fails closed', () => {
  const snapshot = fixture();
  const receipt = anchor(snapshot);
  assert.throws(() => verifyCapture(snapshot, null, outcome, policy), /anchor/);
  assert.throws(() => verifyCapture(snapshot, receipt, outcome, { ...policy, free: false }), /anchor/);
  assert.throws(() => verifyCapture(snapshot, { ...receipt, signature: 'AAAA' }, outcome, policy), /signature/);
  const payload = { ...receipt.payload, anchored_at: 304000 };
  assert.throws(() => verifyCapture(snapshot, { payload, signature: sign(null, canonical(payload), privateKey).toString('base64') }, outcome, policy), /anchor/);
});
test('altered snapshot and substituted core pin fail closed', () => {
  const snapshot = fixture();
  const receipt = anchor(snapshot);
  assert.throws(() => verifyCapture({ ...snapshot, observed_at: 301001 }, receipt, outcome, policy), /digest/);
  snapshot.core.sha = '0'.repeat(40);
  assert.throws(() => verifyCapture(snapshot, anchor(snapshot), outcome, policy), /core/);
});
test('secret fields and non-allowlisted identifiers fail closed', () => {
  const snapshot = { ...fixture(), api_key: 'test-only-secret' };
  assert.throws(() => verifyCapture(snapshot, anchor(snapshot), outcome, policy), /fields/);
  const disguised = { ...fixture(), instrument: 'fixture-secret' };
  assert.throws(() => verifyCapture(disguised, anchor(disguised), outcome, policy), /market/);
});
test('future input or open candle fails closed', () => {
  for (const snapshot of [
    { ...fixture(), event_at: 301001 },
    { ...fixture(), observed_at: 303001 },
    { ...fixture(), candle: { ...fixture().candle, closed: false } },
  ]) assert.throws(() => verifyCapture(snapshot, anchor(snapshot), outcome, policy), /timing/);
});
test('wrong venue, overlapping target or premature outcome fails closed', () => {
  const snapshot = fixture();
  for (const invalid of [
    { ...outcome, venue: 'Bybit' }, { ...outcome, start: 300000 }, { ...outcome, observed_at: 899999 },
  ]) assert.throws(() => verifyCapture(snapshot, anchor(snapshot), invalid, policy), /outcome/);
});
test('unsupported metrics must remain null', () => {
  for (const key of ['cvd', 'oi', 'funding']) {
    const snapshot = { ...fixture(), [key]: 0 };
    assert.throws(() => verifyCapture(snapshot, anchor(snapshot), outcome, policy), /metrics/);
  }
});
