import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { enforceAnchorWindow, verifyFreeTsaCandidate } from '../scripts/rfc3161.mjs';

test('both edges of timestamp uncertainty must fit the authorized window', () => {
  assert.doesNotThrow(() => enforceAnchorWindow(1000, 10, 990, 1011));
  assert.throws(() => enforceAnchorWindow(1000, 10, 990, 1010), /boundary/);
  assert.throws(() => enforceAnchorWindow(1000, 10, 991, 1200), /boundary/);
});

test('stored DER nonce, imprint, signature and chain; missing accuracy fails closed', {
  skip: !process.env.G0_TEST_TSA_DIR,
}, () => {
  const bytes = name => readFileSync(join(process.env.G0_TEST_TSA_DIR, name));
  const input = { query: bytes('query.tsq'), response: bytes('response.tsr'), root: bytes('ca.pem'),
    expectedDigest: createHash('sha256').update(bytes('fixture')).digest('hex'),
    earliest: 0, deadline: Number.MAX_SAFE_INTEGER };
  assert.throws(() => verifyFreeTsaCandidate(input), /accuracy/);
  assert.throws(() => verifyFreeTsaCandidate({ ...input, query: bytes('changed-nonce.tsq') }), /nonce mismatch/);
  assert.throws(() => verifyFreeTsaCandidate({ ...input, expectedDigest: '0'.repeat(64) }), /imprint mismatch/);
  assert.throws(() => verifyFreeTsaCandidate({ ...input, response: bytes('tampered.tsr') }), /signature failure/);
  assert.throws(() => verifyFreeTsaCandidate({ ...input, root: bytes('tsa.crt') }), /root/);
});
