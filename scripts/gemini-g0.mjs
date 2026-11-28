import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

export const modelId = 'gemini-2.5-flash-lite';
export const fixture = Object.freeze({ cvd: 12.5, oi: 50000, funding: -0.0001, liquidations: null });
const attemptLimit = 10;
const intervalMs = 65_000;
const inputBudget = 2048;
const outputLimit = 128;
const directions = ['up', 'down', 'flat'];
const reasoning = ['positive-cvd', 'negative-cvd', 'mixed-signals', 'insufficient-data'];
const exactKeys = (object, keys) => object && typeof object === 'object' &&
  Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent';
const body = JSON.stringify({
  contents: [{ role: 'user', parts: [{ text:
    'Synthetic market fixture only. Give a direction and choose one reason code. Echo the supplied metrics unchanged, including null. ' +
    'CVD is in base units, OI in quote units, funding is a fraction. Metrics: ' + JSON.stringify(fixture) }] }],
  generationConfig: {
    temperature: 0, candidateCount: 1, maxOutputTokens: outputLimit, thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT', required: ['direction', 'reasoning', 'metrics'], properties: {
      direction: { type: 'STRING', enum: directions },
      reasoning: { type: 'STRING', enum: reasoning },
      metrics: { type: 'OBJECT', required: Object.keys(fixture), properties: {
        cvd: { type: 'NUMBER' }, oi: { type: 'NUMBER' }, funding: { type: 'NUMBER' },
        liquidations: { type: 'NUMBER', nullable: true },
      } },
    } },
  },
});

function requireGate(evidence, key, now) {
  const observed = Date.parse(evidence?.observedAt);
  const minima = { rpmRemaining: 1, tpmRemaining: inputBudget, rpdRemaining: attemptLimit };
  if (typeof key !== 'string' || !key.trim() || !Number.isFinite(now) || !Number.isFinite(observed) ||
      observed > now || now - observed > 15 * 60_000 ||
      evidence.model !== modelId || evidence.tier !== 'free' || evidence.billingLinked !== false ||
      typeof evidence.project !== 'string' || !evidence.project.trim() || evidence.project !== evidence.credentialProject ||
      Object.entries(minima).some(([name, minimum]) => !Number.isSafeInteger(evidence[name]) || evidence[name] < minimum)) {
    throw new Error('Gemini zero-cost gate failed');
  }
}

function validateResponse(result, entry) {
  if (result.modelVersion !== modelId) return 'model-version';
  const usage = result.usageMetadata;
  if (!usage || !['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount']
    .every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)) return 'token-usage';
  const { promptTokenCount, candidatesTokenCount, totalTokenCount } = usage;
  entry.tokens = { promptTokenCount, candidatesTokenCount, totalTokenCount };
  if (promptTokenCount > inputBudget || candidatesTokenCount > outputLimit || totalTokenCount > inputBudget + outputLimit ||
      totalTokenCount < promptTokenCount + candidatesTokenCount || (usage.thoughtsTokenCount ?? 0) !== 0) return 'token-budget';
  const candidate = result.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (result.candidates.length !== 1 || candidate?.finishReason !== 'STOP' ||
      !Array.isArray(parts) || parts.length !== 1 || typeof parts[0].text !== 'string') return 'schema';
  const data = JSON.parse(parts[0].text);
  if (!exactKeys(data, ['direction', 'reasoning', 'metrics']) ||
      !directions.includes(data.direction) || !reasoning.includes(data.reasoning)) return 'schema';
  if (!exactKeys(data.metrics, Object.keys(fixture))) {
    return data.metrics && Object.keys(data.metrics).some(k => !Object.hasOwn(fixture, k)) ? 'invented-metric' : 'schema';
  }
  if (Object.keys(fixture).some(k => data.metrics[k] !== fixture[k])) return 'invented-metric';
  entry.response = { direction: data.direction, reasoning: data.reasoning, metrics: { ...fixture } };
  return 'valid';
}

export async function runGeminiG0({ evidence, key, transport, clock = Date.now, elapsed = () => performance.now(), sleep = delay }) {
  requireGate(evidence, key, clock());
  // Start each request in its own minute-sized window.
  const attempts = [], directionCounts = {}, reasoningCounts = {};
  let nextStart = -Infinity;
  for (let index = 0; index < attemptLimit; index++) {
    let remaining;
    while ((remaining = nextStart - elapsed()) > 0) await sleep(Math.ceil(remaining));
    const entry = { utc: new Date(clock()).toISOString(), model: modelId, status: null };
    const started = elapsed();
    nextStart = started + intervalMs;
    try {
      const response = await transport(endpoint, {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body, signal: AbortSignal.timeout(12_000),
      });
      entry.status = response.status;
      entry.outcome = response.status === 200 ? validateResponse(await response.json(), entry)
        : response.status === 429 ? 'rate-limit' : 'http-error';
    } catch {
      entry.outcome = entry.status === 200 ? 'schema' : 'transport-error';
    }
    entry.latencyMs = Math.round(elapsed() - started);
    attempts.push(entry);
    if (entry.outcome !== 'valid') break;
    const { direction, reasoning: reason } = entry.response;
    directionCounts[direction] = (directionCounts[direction] ?? 0) + 1;
    reasoningCounts[reason] = (reasoningCounts[reason] ?? 0) + 1;
  }
  const timings = attempts.map(entry => entry.latencyMs).sort((a, b) => a - b);
  const quantile = p => timings[Math.ceil(p * timings.length) - 1];
  return { attempts, valid: attempts.filter(entry => entry.outcome === 'valid').length,
    directionCounts, reasoningCounts,
    latencyMs: { min: timings[0], p50: quantile(.5), p95: quantile(.95), max: timings.at(-1) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidencePath = process.argv[2];
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const key = process.env.GEMINI_API_KEY;
    requireGate(evidence, key, Date.now());
    // Preserve the marker even if the process dies or the provider returns an error.
    writeFileSync(evidencePath + '.attempted', '', { flag: 'wx', mode: 0o600 });
    const report = await runGeminiG0({ evidence, key, transport: fetch });
    console.log(JSON.stringify(report, null, 2));
    if (report.valid !== attemptLimit) process.exitCode = 1;
  } catch {
    console.error('Gemini gate or one-run reservation failed.');
    process.exitCode = 1;
  }
}
