import { canonical, digest, verifyCapture } from './capture-guard.mjs';

const returnBps = (open, close) => Math.round(((close - open) / open) * 10000);

// In-memory simulation only. The injected model in tests is a local numeric stub.
export function dryRun(snapshot, receipt, outcome, policy, model) {
  if (snapshot?.version !== '1.1-synthetic') throw new Error('Synthetic schema required');
  const snapshotDigest = verifyCapture(snapshot, receipt, outcome, policy);
  const committedBytes = canonical(snapshot).toString('utf8');
  const outcomeDigest = digest(outcome);
  const { market_data: data } = JSON.parse(committedBytes);
  const coreOnly = returnBps(data.open_cents, data.close_cents);

  // The model receives only the committed input and its digest, never the outcome.
  const adjustment = model(committedBytes, snapshotDigest);
  if (!Number.isSafeInteger(adjustment) || !Number.isSafeInteger(coreOnly + adjustment)) {
    throw new Error('Invalid synthetic model output');
  }

  if (verifyCapture(snapshot, receipt, outcome, policy) !== snapshotDigest || digest(outcome) !== outcomeDigest) {
    throw new Error('Committed snapshot or outcome digest changed');
  }
  const actualBps = returnBps(outcome.open_cents, outcome.close_cents);
  const simulatedPush = {
    snapshotDigest, actualBps,
    missing: { oi: data.oi === null, funding: data.funding === null, signedTrade: data.signed_trade === null },
    loss: {
      coreOnly: Math.abs(actualBps - coreOnly),
      corePlusModel: Math.abs(actualBps - (coreOnly + adjustment)),
      zero: Math.abs(actualBps),
    },
  };
  return { committedBytes, simulatedPush };
}
