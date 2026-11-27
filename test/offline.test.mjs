import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameAt, evaluateOffline } from '../scripts/offline-audit.mjs';

const step = 300000;
const start = 1780000200000;
const candle = i => ({ venue: 'fixture', instrument: 'BTC-USD', openTime: start + i * step,
  closeTime: start + (i + 1) * step, availableAt: start + (i + 1) * step + 1000,
  open: 100 + i, close: 100.5 + i, closed: true, cvd: null, oi: null, funding: null });
const rows = Array.from({ length: 18 }, (_, i) => candle(i));
const cutoff = rows[6].availableAt;
test('later records and late revisions cannot affect an earlier prediction', () => {
  const early = evaluateOffline(rows, { asOf: cutoff }).pairs;
  assert.ok(early.length > 0);
  const future = rows.map((row, i) => i > 6 ? { ...row, close: row.close + 50 } : row);
  assert.deepEqual(evaluateOffline(future, { asOf: cutoff }).pairs, early);
  const late = { ...rows[0], close: 1000, availableAt: cutoff + 1 };
  assert.deepEqual(frameAt([...rows, late], cutoff), frameAt(rows, cutoff));
});
test('future, unclosed and unpublished candle rows are unavailable', () => {
  const future = { ...rows[7], availableAt: cutoff };
  const pending = { ...rows[5], closed: false };
  assert.throws(() => frameAt([future], cutoff), /timestamp/);
  assert.deepEqual(frameAt([pending, rows[7]], cutoff), []);
  assert.throws(() => frameAt([{ ...rows[1], availableAt: null }], cutoff), /timestamp/);
});
test('outcomes use later bars on the same venue, with identical pairs and null metrics', () => {
  const r = evaluateOffline(rows, { asOf: rows.at(-1).availableAt });
  assert.ok(r.pairs.every(p => p.targetOpen > p.decisionAt && p.targetAvailable <= r.asOf &&
    p.venue === 'fixture' && p.cvd === null && p.oi === null && p.funding === null));
  assert.throws(() => evaluateOffline([...rows, { ...rows[0], venue: 'other' }], { asOf: cutoff }), /one market/);
});

const full = evaluateOffline(rows, { asOf: rows.at(-1).availableAt });
console.log(JSON.stringify({ source: 'synthetic-fixture', bars: full.closedPublishedBars, pairs: full.pairedRows,
  cvd: null, oi: null, funding: null }));
