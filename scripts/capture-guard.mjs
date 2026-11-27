import { createHash, verify } from 'node:crypto';

export const corePin = Object.freeze({
  sha: '60c1c93ecc9410d9d7f100fb53048916bdd7ef35',
  sha256: '531d7b4ded7f3d4204a1249112ec46b7cb2eca845a29673e5780fd0c1436bc0b',
});
const markets = new Map([['OKX', 'BTC-USDT']]);
const barMs = 300000;

function encode(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + encode(value[key])).join(',') + '}';
  }
  throw new Error('Unsupported canonical value');
}

export const canonical = value => Buffer.from(encode(value), 'utf8');
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

function fields(record, expected) {
  if (!record || Object.getPrototypeOf(record) !== Object.prototype ||
      Object.keys(record).length !== expected.length ||
      !expected.every(key => Object.hasOwn(record, key))) {
    throw new Error('Unexpected or missing fields');
  }
}

const validTimes = (...values) => values.every(value => Number.isSafeInteger(value) && value >= 0);

export function verifyCapture(snapshot, receipt, outcome, policy) {
  fields(snapshot, ['version', 'core', 'venue', 'instrument', 'candle', 'event_at', 'observed_at',
    'decision_at', 'horizon_ms', 'cvd', 'oi', 'funding']);
  fields(snapshot.core, ['sha', 'sha256']);
  fields(snapshot.candle, ['open', 'close', 'closed']);
  if (snapshot.version !== '1.1' || snapshot.core.sha !== corePin.sha || snapshot.core.sha256 !== corePin.sha256) {
    throw new Error('Invalid version or core pin');
  }
  const { venue, instrument, candle, event_at, observed_at, decision_at, horizon_ms } = snapshot;
  if (!markets.has(venue) || markets.get(venue) !== instrument) throw new Error('Unknown market');
  if ([snapshot.cvd, snapshot.oi, snapshot.funding].some(value => value !== null)) {
    throw new Error('Unsupported metrics must be null');
  }
  if (!validTimes(candle.open, candle.close, event_at, observed_at, decision_at) ||
      candle.closed !== true || candle.open % barMs !== 0 || candle.close - candle.open !== barMs ||
      event_at < candle.close || event_at > observed_at || observed_at >= decision_at || horizon_ms !== barMs) {
    throw new Error('Invalid input timing');
  }

  if (!receipt || policy?.free !== true || !policy.publicKey || !policy.provider) {
    throw new Error('Approved zero-cost anchor required');
  }
  fields(receipt, ['payload', 'signature']);
  fields(receipt.payload, ['provider', 'digest', 'anchored_at']);
  const { provider, digest: anchoredDigest, anchored_at } = receipt.payload;
  if (provider !== policy.provider || !validTimes(anchored_at) || anchored_at < observed_at || anchored_at >= decision_at) {
    throw new Error('Invalid anchor provider or time');
  }
  if (typeof receipt.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(receipt.signature) ||
      !verify(null, canonical(receipt.payload), policy.publicKey, Buffer.from(receipt.signature, 'base64'))) {
    throw new Error('Invalid anchor signature');
  }
  const snapshotDigest = digest(snapshot);
  if (anchoredDigest !== snapshotDigest) throw new Error('Snapshot digest mismatch');

  fields(outcome, ['venue', 'instrument', 'start', 'end', 'observed_at']);
  const targetStart = (Math.floor(decision_at / barMs) + 1) * barMs;
  if (outcome.venue !== venue || outcome.instrument !== instrument ||
      !validTimes(outcome.start, outcome.end, outcome.observed_at) ||
      outcome.start !== targetStart || outcome.end - outcome.start !== horizon_ms || outcome.observed_at < outcome.end) {
    throw new Error('Invalid outcome contract');
  }
  return snapshotDigest;
}
