import { pathToFileURL } from 'node:url';
import { number, resolveSpotCoin, contractSpec, normalizeContractSize, bitfinexStatus } from './contracts.mjs';
import { endpoints } from './endpoints.mjs';

const sides = { Buy: 'buy', Sell: 'sell', buy: 'buy', sell: 'sell', B: 'buy', A: 'sell', 1: 'buy', 2: 'sell' };

export function normalizeTrade(row, format, now) {
  if (!row) return null;
  const amount = number(row[2]);
  const values = {
    bybit: [row.price, row.size, row.time, sides[row.side]],
    okx: [row.px, row.sz, row.ts, sides[row.side]],
    bitfinex: [row[3], amount === null ? null : Math.abs(amount), row[1], amount < 0 ? 'sell' : 'buy'],
    hyperliquid: [row.px, row.sz, row.time, sides[row.side]],
    'mexc-spot': [row.price, row.qty, row.time, row.isBuyerMaker === true ? 'sell' : row.isBuyerMaker === false ? 'buy' : null],
    'mexc-perp': [row.p, row.v, row.t, sides[row.T]],
  }[format];
  if (!values) return null;
  const [price, quantity, timestamp] = values.slice(0, 3).map(number);
  if (!(price > 0 && quantity > 0 && timestamp >= now - 900000 && timestamp <= now + 60000) ||
      !['buy', 'sell'].includes(values[3])) return null;
  return { price, quantity, timestamp, side: values[3] };
}

export function normalizeOI(raw, unit, multiplier) {
  const value = number(raw);
  if (value === null || value < 0) return null;
  if (unit === 'base') return { value, unit };
  const size = number(multiplier?.size);
  return unit === 'contracts' && size > 0 && multiplier.unit === 'base' && Number.isFinite(value * size)
    ? { value: value * size, unit: 'base' } : null;
}

function schema(value, depth = 0) {
  if (value === null) return 'null';
  if (typeof value !== 'object' || depth === 3) return Array.isArray(value) ? 'array' : typeof value;
  if (Array.isArray(value)) return value.length ? [schema(value[0], depth + 1)] : [];
  return Object.entries(value).slice(0, 32).map(([key, field]) => [key, schema(field, depth + 1)]);
}

function tradeRows(data, venue) {
  if (venue === 'bybit') return data?.result?.list;
  return Array.isArray(data) ? data : data?.data;
}

function metadata(data, target) {
  if (target.venue === 'bybit') {
    const row = data?.result?.list?.[0];
    return { oi: normalizeOI(row?.openInterest, 'base'), fundingRate: number(row?.fundingRate),
      intervalHours: number(row?.fundingIntervalHour), timestampMs: number(row?.timestamp ?? data?.time) };
  }
  if (target.venue === 'okx') {
    const row = data?.data?.[0];
    const start = number(row?.fundingTime), end = number(row?.nextFundingTime);
    return { oi: normalizeOI(row?.oiCcy, 'base'), oiContracts: number(row?.oi),
      contract: contractSpec('okx', row),
      fundingRate: number(row?.fundingRate), intervalHours: start > 0 && end > start ? (end - start) / 3600000 : null,
      timestampMs: number(row?.ts) };
  }
  if (target.venue === 'bitfinex') return bitfinexStatus(data?.[0]) ??
    { oiContracts: null, fundingRate: null, intervalHours: null, timestampMs: null };
  if (target.venue === 'hyperliquid') {
    const index = data?.[0]?.universe?.findIndex(row => row.name === 'BTC');
    const row = data?.[1]?.[index];
    return { oi: normalizeOI(row?.openInterest, 'base'), fundingRate: number(row?.funding),
      intervalHours: null, timestampMs: null };
  }
  const row = Array.isArray(data?.data) ? data.data.find(item => item.symbol === 'BTC_USDT') : data?.data;
  return { oiContracts: number(row?.holdVol), contract: contractSpec('mexc', row), fundingRate: number(row?.fundingRate),
    intervalHours: number(row?.collectCycle), timestampMs: number(row?.timestamp) };
}

export async function observe(target, request = fetch) {
  const { venue, market, kind, url, body } = target;
  const started = performance.now();
  const row = { venue, market, kind, endpoint: url, ...(body && { query: body }), utc: new Date().toISOString(),
    latencyMs: null, httpStatus: null, outcome: 'transport-error', rateLimit: null, schema: null, observations: null };
  try {
    const response = await request(url, {
      signal: AbortSignal.timeout(8000), redirect: 'error',
      ...(body && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    row.httpStatus = response.status;
    const headers = response.headers;
    row.rateLimit = Object.fromEntries(['retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
      'x-bapi-limit', 'x-bapi-limit-status', 'x-bapi-limit-reset-timestamp']
      .map(name => [name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), headers.get(name)]));
    row.outcome = response.status === 429 ? 'rate-limited' : [403, 451].includes(response.status) ? 'restricted' : 'http-error';
    if (!response.ok) {
      await response.body?.cancel();
      return row;
    }
    row.outcome = 'invalid-response';
    const data = await response.json();
    row.schema = schema(data);
    if (venue === 'bybit' && data?.retCode !== 0 || venue === 'okx' && data?.code !== '0' ||
        venue === 'mexc' && market === 'perp' && data?.success !== true) {
      row.outcome = 'venue-error';
      row.venueCode = number(data?.retCode ?? data?.code);
      return row;
    }
    if (kind === 'spot-meta') {
      const coin = resolveSpotCoin(data, 'UBTC', 'USDC');
      row.observations = { coin };
      row.outcome = coin ? 'observed' : 'unsupported';
      return row;
    }
    if (kind === 'trades') {
      const rows = tradeRows(data, venue);
      if (!Array.isArray(rows)) return row;
      const filtered = venue === 'hyperliquid' ? rows.filter(item => item?.coin === body.coin) : rows;
      const sample = filtered.slice(0, 5);
      const normalized = sample.map(item => normalizeTrade(item, venue === 'mexc' ? venue + '-' + market : venue, Date.now()))
        .filter(Boolean);
      row.observations = { inspected: sample.length, normalized: normalized.length,
        quantityUnit: market === 'spot' || venue === 'bybit' || venue === 'hyperliquid' ? 'base' : 'contracts',
        firstObservedQuantity: normalized[0]?.quantity ?? null,
        sides: [...new Set(normalized.map(item => item.side))],
        latestTimestampMs: normalized.length ? Math.max(...normalized.map(item => item.timestamp)) : null };
      row.outcome = normalized.length ? 'observed' : 'no-fresh-normalized-trades';
    } else {
      row.observations = metadata(data, target);
      row.outcome = Object.entries(row.observations).some(([key, value]) => key !== 'timestampMs' && value !== null)
        ? 'observed' : 'unsupported';
    }
    return row;
  } catch (error) {
    row.error = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'request-or-parse-failed';
    return row;
  } finally {
    row.latencyMs = Math.round(performance.now() - started);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  const maxRequests = 21;
  if (endpoints.length > maxRequests) throw Error('Probe request limit exceeded');
  for (const endpoint of endpoints) {
    if (endpoint.venue === 'hyperliquid' && endpoint.market === 'spot' && endpoint.kind === 'trades') {
      const coin = rows.find(row => row.kind === 'spot-meta')?.observations?.coin;
      if (!coin) {
        rows.push({ venue: endpoint.venue, market: endpoint.market, kind: endpoint.kind, endpoint: endpoint.url,
          utc: new Date().toISOString(), httpStatus: null, latencyMs: null, outcome: 'unresolved-spot-mapping', observations: null });
        continue;
      }
      rows.push(await observe({ ...endpoint, body: { ...endpoint.body, coin } }));
    } else rows.push(await observe(endpoint));
  }
  for (const row of rows.filter(row => ['okx', 'mexc'].includes(row.venue) && row.market === 'perp' && row.observations)) {
    const spec = rows.find(candidate => candidate.venue === row.venue && candidate.kind === 'contract')?.observations?.contract;
    if (row.kind === 'trades') row.observations.firstObservedQuantityBTC =
      normalizeContractSize(row.observations.firstObservedQuantity, spec);
    if (row.kind === 'oi') row.observations.convertedOiBTC =
      normalizeContractSize(row.observations.oiContracts, spec);
  }
  console.log(JSON.stringify({ utc: new Date().toISOString(), baseCandidate: process.env.GITHUB_SHA ?? null,
    geography: { runnerOS: process.env.RUNNER_OS ?? null, region: null }, rows }, null, 2));
}
