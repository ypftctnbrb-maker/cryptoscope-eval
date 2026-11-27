import { createHash, verify } from 'node:crypto';

export const corePin = Object.freeze({
  sha: '60c1c93ecc9410d9d7f100fb53048916bdd7ef35',
  sha256: '531d7b4ded7f3d4204a1249112ec46b7cb2eca845a29673e5780fd0c1436bc0b',
});
const syntheticMarkets = new Map([
  ['OKX', { instrument: 'BTC-USDT-SWAP', priceUnit: 'USDT-cent', sizeUnit: 'OKX-0.01-BTC-contract' }],
  ['Bitfinex', { instrument: 'tBTCF0:USTF0', priceUnit: 'USDT-cent', sizeUnit: 'BTC-micro' }],
]);
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

function verifySyntheticMarket(data, observedAt, { priceUnit, sizeUnit }) {
  fields(data, ['open_cents', 'close_cents', 'trade_price_cents', 'price_unit', 'signed_trade', 'oi', 'funding']);
  if (data.price_unit !== priceUnit) throw new Error('Invalid price units');
  if (![data.open_cents, data.close_cents, data.trade_price_cents].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Invalid market prices');
  }
  for (const [name, unit] of [
    ['signed_trade', sizeUnit], ['oi', sizeUnit], ['funding', 'bps'],
  ]) {
    const metric = data[name];
    if (metric === null) continue;
    fields(metric, ['value', 'unit', 'event_at', 'observed_at']);
    if (metric.unit !== unit || !Number.isSafeInteger(metric.value) ||
        (name === 'oi' && metric.value < 0) || (name === 'signed_trade' && metric.value === 0)) {
      throw new Error('Invalid metric units or value');
    }
    if (!validTimes(metric.event_at, metric.observed_at) ||
        metric.event_at > metric.observed_at || metric.observed_at > observedAt) {
      throw new Error('Invalid metric timing');
    }
  }
}

export function verifyCapture(snapshot, receipt, outcome, policy) {
  const synthetic = snapshot?.version === '1.1-synthetic';
  const extraFields = synthetic ? ['market_data'] : [];
  fields(snapshot, ['version', 'core', 'venue', 'instrument', 'candle', 'event_at', 'observed_at',
    'decision_at', 'horizon_ms', 'cvd', 'oi', 'funding', ...extraFields]);
  fields(snapshot.core, ['sha', 'sha256']);
  fields(snapshot.candle, ['open', 'close', 'closed']);
  if ((snapshot.version !== '1.1' && !synthetic) || snapshot.core.sha !== corePin.sha || snapshot.core.sha256 !== corePin.sha256) {
    throw new Error('Invalid version or core pin');
  }
  const { venue, instrument, candle, event_at, observed_at, decision_at, horizon_ms } = snapshot;
  const market = syntheticMarkets.get(venue);
  if (synthetic ? market?.instrument !== instrument || !market : venue !== 'OKX' || instrument !== 'BTC-USDT') {
    throw new Error('Unknown market');
  }
  if ([snapshot.cvd, snapshot.oi, snapshot.funding].some(value => value !== null)) {
    throw new Error('Unsupported metrics must be null');
  }
  if (!validTimes(candle.open, candle.close, event_at, observed_at, decision_at) ||
      candle.closed !== true || candle.open % barMs !== 0 || candle.close - candle.open !== barMs ||
      event_at < candle.close || event_at > observed_at || observed_at >= decision_at || horizon_ms !== barMs) {
    throw new Error('Invalid input timing');
  }

  if (synthetic) verifySyntheticMarket(snapshot.market_data, observed_at, market);

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

  const priceFields = synthetic ? ['open_cents', 'close_cents'] : [];
  fields(outcome, ['venue', 'instrument', 'start', 'end', 'observed_at', ...priceFields]);
  if (priceFields.some(field => !Number.isSafeInteger(outcome[field]) || outcome[field] <= 0)) {
    throw new Error('Invalid outcome prices');
  }
  const targetStart = (Math.floor(decision_at / barMs) + 1) * barMs;
  if (outcome.venue !== venue || outcome.instrument !== instrument ||
      !validTimes(outcome.start, outcome.end, outcome.observed_at) ||
      outcome.start !== targetStart || outcome.end - outcome.start !== horizon_ms || outcome.observed_at < outcome.end) {
    throw new Error('Invalid outcome contract');
  }
  return snapshotDigest;
}
