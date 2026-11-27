import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { corePin } from './capture-guard.mjs';

const bytes = readFileSync(process.argv[2]);
const actual = createHash('sha256').update(bytes).digest('hex');
assert.equal(actual, corePin.sha256, 'Core bytes do not match the audited SHA-256');
const { tradeHistory } = await import('data:text/javascript;base64,' + bytes.toString('base64'));
const trades = [
  { id: 'a', time: 1000, side: 'Buy', quantity: 2 },
  { id: 'b', time: 2000, side: 'Sell', quantity: 1 },
  { id: 'b', time: 2000, side: 'Sell', quantity: 1 },
  { id: 'c', time: 301000, side: 'Buy', quantity: 3 },
  { id: 'd', time: 901000, side: 'Sell', quantity: 2 },
];
assert.deepEqual(tradeHistory(trades).map(({ time, open, close }) => [time, open, close]), [
  [0, 0, 1], [300000, 1, 4], [900000, 0, -2],
]);
console.log('Verified core bytes and tradeHistory on complete synthetic buckets and a gap:', actual);
