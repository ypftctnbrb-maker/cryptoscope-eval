import { createHash } from 'node:crypto';
import { corePin, digest } from './capture-guard.mjs';

const mapping = Object.freeze({
  version: 'synthetic-cvd-sign-v1',
  rule: 'Sign of the latest complete synthetic candle delta in native units, times 1 basis point',
  coreSha256: corePin.sha256,
});

export async function loadCoreBaseline(bytes) {
  const source = Buffer.from(bytes);
  if (createHash('sha256').update(source).digest('hex') !== corePin.sha256) {
    throw new Error('Core bytes do not match approved fixture pin');
  }
  const { tradeHistory } = await import('data:text/javascript;base64,' + source.toString('base64'));
  return snapshot => {
    const delta = snapshot.complete_tape ? tradeHistory(snapshot.complete_tape).at(-1).delta : null;
    return { bps: delta === null ? null : Math.sign(delta), version: mapping.version, mappingHash: digest(mapping) };
  };
}
