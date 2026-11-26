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

const { resolveSpotCoin, contractSpec, normalizeContractSize, bitfinexStatus } = await import('../scripts/contracts.mjs');
test('spot routing resolves native ID from unambiguous ordered metadata', () => {
  const tokens = [{ index: 15, name: 'USDC' }, { index: 19, name: 'UBTC' }];
  const pair = { index: 32, name: 'opaque', tokens: [19, 15] };
  assert.equal(resolveSpotCoin({ tokens, universe: [pair] }, 'UBTC', 'USDC'), '@32');
  assert.equal(resolveSpotCoin({ tokens, universe: [pair, { ...pair, index: 33 }] }, 'UBTC', 'USDC'), null);
  assert.equal(resolveSpotCoin({ tokens, universe: [{ ...pair, tokens: [15, 19] }] }, 'UBTC', 'USDC'), null);
});
test('OKX and MEXC contract sizes require venue, instrument and base evidence', () => {
  const okx = { instId: 'BTC-USDT-SWAP', ctVal: '0.01', ctMult: '1', ctValCcy: 'BTC', ctType: 'linear' };
  const mexc = { symbol: 'BTC_USDT', contractSize: '0.0001', baseCoin: 'BTC', quoteCoin: 'USDT', settleCoin: 'USDT' };
  assert.equal(normalizeContractSize(3, contractSpec('okx', okx)), 0.03);
  assert.equal(normalizeContractSize(3, contractSpec('mexc', mexc)), 0.00030000000000000003);
  assert.equal(contractSpec('okx', { ...okx, ctValCcy: 'USD' }), null);
  assert.equal(contractSpec('okx', { ...okx, ctMult: '2' }), null);
  assert.equal(contractSpec('mexc', { ...mexc, settleCoin: 'BTC' }), null);
});
test('Bitfinex uses explicit documented positions and rejects unknown schemas', () => {
  const row = Array(24).fill(null);
  Object.assign(row, { 0: 'tBTCF0:USTF0', 1: now, 9: .5, 12: -.0001, 18: 4 });
  assert.deepEqual(bitfinexStatus(row), { oiContracts: 4, fundingRate: -.0001, intervalHours: 8, timestampMs: now });
  assert.equal(bitfinexStatus(row.slice(0, -1)), null);
});
