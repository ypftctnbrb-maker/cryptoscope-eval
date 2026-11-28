import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runGeminiG0, modelId, fixture } from '../scripts/gemini-g0.mjs';

const now = Date.parse('2026-11-28T12:00:00Z');
const evidence = { model: modelId, tier: 'free', billingLinked: false, project: 'fixture-project',
  credentialProject: 'fixture-project', observedAt: '2026-11-28T11:58:00Z',
  rpmRemaining: 10, tpmRemaining: 30000, rpdRemaining: 10 };
const config = { evidence, key: 'fixture-key', clock: () => now, elapsed: () => 100 };
function success(data = { direction: 'up', reasoning: 'positive-cvd', metrics: fixture }) {
  return { status: 200, async json() { return {
    modelVersion: modelId, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }],
    usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 50, totalTokenCount: 200 },
  }; } };
}

test('project gate rejects before transport when any prerequisite is missing', async () => {
  for (const patch of [
    { evidence: null }, { key: '' }, { evidence: { ...evidence, billingLinked: true } },
    { evidence: { ...evidence, credentialProject: 'other' } },
    { evidence: { ...evidence, observedAt: '2026-11-28T11:00:00Z' } },
    { evidence: { ...evidence, rpmRemaining: 0 } },
  ]) await assert.rejects(runGeminiG0({ ...config, ...patch,
    transport: () => assert.fail('gate allowed transport') }), /gate/);
});

test('mock transport receives ten identical bounded requests and reports sanitized agreement', async () => {
  const seen = [];
  let tick = 0;
  const report = await runGeminiG0({ ...config, elapsed: () => tick, sleep: async ms => { tick += ms; }, transport: async (url, init) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent');
    assert.equal(init.headers['x-goog-api-key'], config.key);
    seen.push(init.body);
    return success();
  } });
  assert.equal(seen.length, 10);
  assert.equal(new Set(seen).size, 1);
  assert.equal(JSON.parse(seen[0]).generationConfig.maxOutputTokens, 128);
  assert.equal(report.valid, 10);
  assert.deepEqual(report.directionCounts, { up: 10 });
  assert.deepEqual(report.reasoningCounts, { 'positive-cvd': 10 });
  assert.equal(JSON.stringify(report).includes(config.key), false);
});

test('schema validation rejects invented metrics, missing null or free text', async () => {
  for (const [change, kind] of [
    [{ metrics: { ...fixture, oi: 999 } }, 'invented-metric'],
    [{ metrics: { ...fixture, liquidations: 1 } }, 'invented-metric'],
    [{ metrics: { cvd: fixture.cvd, oi: fixture.oi, funding: fixture.funding } }, 'schema'],
    [{ reasoning: 'raw response contains 123' }, 'schema'],
  ]) {
    const report = await runGeminiG0({ ...config, transport: async () =>
      success({ direction: 'up', reasoning: 'positive-cvd', metrics: fixture, ...change }) });
    assert.equal(report.attempts.length, 1);
    assert.equal(report.attempts[0].outcome, kind);
    assert.equal(report.valid, 0);
    assert.equal(JSON.stringify(report).includes('raw response'), false);
  }
});

test('a 429 or transport failure stops without retry or logging exception text', async () => {
  for (const transport of [async () => ({ status: 429 }), async () => { throw Error('fixture-key'); }]) {
    const report = await runGeminiG0({ ...config, transport });
    assert.equal(report.attempts.length, 1);
    assert.equal(report.valid, 0);
    assert.equal(JSON.stringify(report).includes(config.key), false);
  }
});

test('one available RPM supports ten sequential starts at least 65 seconds apart', async () => {
  let tick = 0;
  const starts = [];
  const report = await runGeminiG0({ ...config, evidence: { ...evidence, rpmRemaining: 1, tpmRemaining: 2048 },
    clock: () => now + tick, elapsed: () => tick, sleep: async ms => { tick += ms; },
    transport: async () => { starts.push(tick); tick += 100; return success(); } });
  assert.equal(report.valid, 10);
  assert.equal(starts.length, 10);
  assert.ok(starts.slice(1).every((start, i) => start - starts[i] >= 65000));
});

test('429 after a successful request stops further paced dispatch', async () => {
  let tick = 0, calls = 0;
  const report = await runGeminiG0({ ...config, elapsed: () => tick,
    sleep: async ms => { tick += ms; }, transport: async () => ++calls === 1 ? success() : { status: 429 } });
  assert.equal(tick, 65000);
  assert.equal(calls, 2);
  assert.deepEqual(report.attempts.map(a => a.outcome), ['valid', 'rate-limit']);
});
