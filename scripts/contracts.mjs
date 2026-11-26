export function number(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim()) &&
    Number.isFinite(Number(value)) ? Number(value) : null;
}

export function resolveSpotCoin(meta, base, quote) {
  const tokens = meta?.tokens;
  const markets = meta?.universe;
  if (!Array.isArray(tokens) || !Array.isArray(markets)) return null;
  const indexes = [base, quote].map(name => tokens.filter(token => token?.name === name));
  if (indexes.some(matches => matches.length !== 1 || !Number.isSafeInteger(matches[0].index))) return null;
  const matches = markets.filter(row => row?.tokens?.length === 2 &&
    row.tokens.every((id, index) => id === indexes[index][0].index) && row.isDelisted !== true);
  if (matches.length !== 1) return null;
  const { index, name } = matches[0];
  if (index === 0 && typeof name === 'string' && name === base + '/' + quote) return name;
  return Number.isSafeInteger(index) && index > 0 ? '@' + index : null;
}

export function contractSpec(venue, row) {
  let basePerContract;
  if (venue === 'okx' && row?.instId === 'BTC-USDT-SWAP' && row.ctType === 'linear' &&
      row.ctValCcy === 'BTC' && number(row.ctMult) === 1) basePerContract = number(row.ctVal);
  if (venue === 'mexc' && row?.symbol === 'BTC_USDT' && row.baseCoin === 'BTC' &&
      row.quoteCoin === 'USDT' && row.settleCoin === 'USDT') basePerContract = number(row.contractSize);
  return basePerContract > 0 ? { basePerContract, unit: 'BTC' } : null;
}

export function normalizeContractSize(raw, specification) {
  const contracts = number(raw);
  const size = specification?.basePerContract;
  const result = contracts * size;
  return contracts !== null && contracts >= 0 && size > 0 && Number.isFinite(result) ? result : null;
}

export function bitfinexStatus(row) {
  // Documented V2 layout: DERIV_SYMBOL [0], MTS [1], CURRENT_FUNDING [12], OPEN_INTEREST [18].
  if (!Array.isArray(row) || row.length !== 24 || row[0] !== 'tBTCF0:USTF0') return null;
  return { oiContracts: number(row[18]), fundingRate: number(row[12]), intervalHours: 8, timestampMs: number(row[1]) };
}
