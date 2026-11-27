const maxRows = 256;
const positive = value => Number.isFinite(value) && value > 0;
const validTime = value => Number.isSafeInteger(value) && value > 0;

function validate(rows) {
  if (!Array.isArray(rows) || rows.length > maxRows) throw Error('Invalid bounded input');
  const keys = new Set();
  for (const row of rows) {
    if (![row.openTime, row.closeTime, row.availableAt].every(validTime) ||
        row.openTime >= row.closeTime || row.closeTime > row.availableAt) throw Error('Invalid candle timestamp');
    if (!positive(row.open) || !positive(row.close) || !row.venue || !row.instrument ||
        typeof row.closed !== 'boolean') throw Error('Invalid candle');
    const key = JSON.stringify([row.venue, row.instrument, row.openTime, row.availableAt]);
    if (keys.has(key)) throw Error('Duplicate candle revision timestamp');
    keys.add(key);
  }
}

export function frameAt(rows, asOf) {
  if (!validTime(asOf)) throw Error('Invalid decision timestamp');
  validate(rows);
  const selected = new Map();
  for (const row of rows) {
    if (!row.closed || row.availableAt > asOf) continue;
    const key = JSON.stringify([row.venue, row.instrument, row.openTime]);
    if (!selected.has(key) || selected.get(key).availableAt < row.availableAt) selected.set(key, row);
  }
  return [...selected.values()].sort((a, b) => a.openTime - b.openTime);
}

export function evaluateOffline(rows, { asOf }) {
  if (!validTime(asOf)) throw Error('Invalid decision timestamp');
  validate(rows);
  if (new Set(rows.map(row => JSON.stringify([row.venue, row.instrument]))).size > 1) {
    throw Error('Use one market per evaluation');
  }

  // Freeze the first closed publication of each outcome. Later revisions do not relabel a pair.
  const first = new Map();
  for (const row of [...rows].sort((a, b) => a.availableAt - b.availableAt)) {
    if (row.closed && row.availableAt <= asOf && !first.has(row.openTime)) first.set(row.openTime, row);
  }
  const observed = [...first.values()].sort((a, b) => a.openTime - b.openTime);
  const pairs = [];
  const interval = observed[0] ? observed[0].closeTime - observed[0].openTime : 0;
  if (observed.some(row => row.closeTime - row.openTime !== interval || row.openTime % interval !== observed[0].openTime % interval)) {
    throw Error('Mixed or misaligned candle intervals');
  }

  for (const signal of observed) {
    const decisionAt = signal.availableAt;
    // Fixed next eligible time slot strictly after the decision, even if the data has a gap.
    const targetOpen = signal.openTime + (Math.floor((decisionAt - signal.openTime) / interval) + 1) * interval;
    const target = first.get(targetOpen);
    if (!target) continue;
    // One bar of embargo after outcome publication.
    const training = observed.filter(row => row.availableAt <= decisionAt - interval && row.closeTime < signal.openTime);
    if (training.length < 3) continue;
    const change = row => row.close / row.open - 1;
    const candidate = training.reduce((sum, row) => sum + change(row), 0) / training.length;
    const actual = change(target);
    pairs.push({ venue: signal.venue, instrument: signal.instrument, decisionAt,
      targetOpen, targetAvailable: target.availableAt, trainingRows: training.length,
      candidate, baseline: 0, actual, pairedLoss: Math.abs(candidate - actual) - Math.abs(actual),
      cvd: null, oi: null, funding: null });
  }

  return { asOf, closedPublishedBars: observed.length, pairedRows: pairs.length, pairs };
}
