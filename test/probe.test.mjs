import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTrade, normalizeOI, observe } from '../scripts/market-probe.mjs';
const now = 1780000000000;
test('maker flag and signed amount identify the aggressor, not the maker', () => {
  assert.equal(normalizeTrade({ price: '3', qty: '2', isBuyerMaker: true, time: now }, 'mexc-spot', now).side, 'sell');
  assert.equal(normalizeTrade([4, now, -2, 3], 'bitfinex', now).side, 'sell');
});
test('missing fields and stale observations remain unavailable', () => {
  assert.equal(normalizeTrade({ side: 'Buy', time: now, size: '' }, 'bybit', now), null);
  assert.equal(normalizeTrade({ side: 'Buy', time: now - 3600000, size: '2', price: '3' }, 'bybit', now), null);
});
test('contracts need an identified base multiplier before conversion', () => {
  assert.equal(normalizeOI('5', 'contracts', { size: 2, unit: 'USD' }), null);
  assert.deepEqual(normalizeOI('5', 'contracts', { size: 2, unit: 'base' }), { value: 10, unit: 'base' });
});
test('429 preserves status and Retry-After without retrying or retaining body', async () => {
  let calls = 0;
  const row = await observe({ venue: 'fixture', market: 'spot', url: 'https://example.com/' }, async () => {
    calls++;
    return new Response('must not be recorded', { status: 429, headers: { 'retry-after': '17' } });
  });
  assert.equal(calls, 1);
  assert.equal(row.httpStatus, 429);
  assert.equal(row.rateLimit.retryAfter, '17');
  assert.equal(row.schema, null);
  assert.equal(row.outcome, 'rate-limited');
  assert.ok(!JSON.stringify(row).includes('must not be recorded'));
});
