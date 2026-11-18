import test from 'node:test';
import assert from 'node:assert/strict';
import { YEARS } from '../dist/data.js';
import {
  ASSET_KEYS, RULES, newGame, netWorth, liquidAssets, annualExpenses, defaultDecision,
  previewDecision, validateDecision, settleYear, advisorDecision, simulateStrategy,
  restoreGame, summary, assertState,
} from '../dist/engine.js';
import { relay, transportReason } from '../worker/handler.js';
import { requestDecision, buildDecisionContext, fallbackDecisionPack, requestPersona, fallbackPersona } from '../dist/ai.js';

const near = (actual, expected, tolerance = 0.0001) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`,
);
const assetMap = values => ({ ...Object.fromEntries(ASSET_KEYS.map(key => [key, 0])), ...values });
const cashDecision = state => ({ ...defaultDecision(state), allocation: assetMap({ cash: 100 }) });
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
};
const trackedFixture = state => {
  state.totalContribution = netWorth(state) - RULES.initialNetWorth - state.totalInvestmentProfit;
  return state;
};
const withEvent = (round, changes, run) => {
  const original = YEARS[round].event;
  YEARS[round].event = { ...original, ...changes };
  try { return run(); } finally { YEARS[round].event = original; }
};

const connectionAuditKey = 'efund-transport-audit-fake-key';
const connectionAuditRequest = () => new Request('https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai', {
  method: 'POST', headers: { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'efund', apiKey: connectionAuditKey, request: {
    model: 'audit-model', stream: false,
    messages: [{ role: 'system', content: 'Public information only.' }, { role: 'user', content: '{}' }],
  } }),
});

test('audit: four and eight second recovery survives a six second gateway outage without changing EFUND budgets', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'warn', () => {});
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const player = newGame(), rival = newGame('rival');
  const finished = simulateStrategy('balanced', 3), finishedRival = simulateStrategy('advisor', 3);
  let elapsed, calls, upstreamBodies, answer;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ elapsed, body: init.body, signal: init.signal });
    return relay(new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://liaojs2025.github.io' } }), async (_target, sent) => {
      upstreamBodies.push(JSON.parse(sent.body));
      if (elapsed < 6000) return new Response('<html>temporary gateway failure</html>', { status: 520 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
  });
  const advance = async milliseconds => { elapsed += milliseconds; t.mock.timers.tick(milliseconds); await flush(); };
  for (const purpose of ['decision', 'persona']) {
    elapsed = 0; calls = []; upstreamBodies = []; const notices = [];
    answer = purpose === 'decision' ? fallbackDecisionPack(player, rival) : fallbackPersona(finished, finishedRival);
    const config = { endpoint: 'https://aigc.efunds.com.cn/v1', model: 'deepseek-v4-flash', apiKey: connectionAuditKey };
    const options = { onRetry: value => notices.push(value) };
    const pending = purpose === 'decision' ? requestDecision(config, buildDecisionContext(player, rival), options)
      : requestPersona(config, finished, finishedRival, options);
    await flush();
    await advance(3999); assert.equal(calls.length, 1); assert.equal(notices.length, 0);
    await advance(1); assert.equal(calls.length, 2); assert.equal(notices.length, 1);
    await advance(7999); assert.equal(calls.length, 2);
    await advance(1);
    assert.equal((await pending).source, 'model');
    assert.deepEqual(calls.map(call => call.elapsed), [0, 4000, 12000]);
    assert.equal(upstreamBodies.length, 3);
    assert.deepEqual(notices.map(notice => notice.attempt), [2, 3]);
    for (const call of calls) { assert.equal(call.body, calls[0].body); assert.equal(call.signal, calls[0].signal); }
    for (const body of upstreamBodies) {
      assert.equal(body.max_tokens, purpose === 'decision' ? 4000 : 6000);
      assert.deepEqual(body.thinking, { type: 'disabled' }); assert.equal(body.model, 'deepseek-v4-flash');
    }
    await advance(60000); assert.equal(calls.length, 3, 'no hidden fourth request can follow a completed recovery');
  }
});

test('audit: the second recovery wait remains cancellable and cannot extend the original sixty second deadline', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  let calls, slow;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (slow && calls === 2) await new Promise(resolve => setTimeout(resolve, 50000));
    return new Response(JSON.stringify({ error: { code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json' } }), { status: 502 });
  });
  const config = { endpoint: 'https://aigc.efunds.com.cn/v1', model: 'deepseek-v4-flash', apiKey: connectionAuditKey };
  for (const manual of [true, false]) {
    calls = 0; slow = !manual; const notices = [], controller = new AbortController();
    const checked = assert.rejects(requestDecision(config, buildDecisionContext(newGame(), newGame('rival')),
      { signal: controller.signal, onRetry: value => notices.push(value) }), error => error.code === (manual ? 'CANCELLED' : 'TIMEOUT'));
    await flush(); t.mock.timers.tick(4000); await flush();
    assert.equal(calls, 2);
    if (manual) { t.mock.timers.tick(7999); await flush(); controller.abort(); }
    else {
      t.mock.timers.tick(50000); await flush();
      t.mock.timers.tick(5999); await flush(); assert.equal(calls, 2);
      t.mock.timers.tick(1); await flush();
    }
    await checked; t.mock.timers.tick(60000); await flush();
    assert.equal(calls, 2);
    assert.deepEqual(notices.map(value => value.attempt), [2]);
  }
});

test('audit: upstream diagnostic references expose only validated credential-free Cloudflare ray identifiers', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const [ray, key, expected] of [
    ['abcdef0123456789-NRT', connectionAuditKey, 'abcdef0123456789-NRT'],
    ['abcdef0123456789', connectionAuditKey, 'abcdef0123456789'],
    ['ABCDEF0123456789-NRT', connectionAuditKey, undefined],
    ['abcdef0123456789-nrt', connectionAuditKey, undefined],
    ['abcdef01234567890-NRT', connectionAuditKey, undefined],
    ['abcdef012345678-NRT', connectionAuditKey, undefined],
    ['https://private.example/', connectionAuditKey, undefined],
    ['abcdef0123456789-NRT<script>', connectionAuditKey, undefined],
    ['abcdef0123456789-NRT', 'abcdef0123456789', undefined],
    ['abcdef0123456789-NRT', '3456', undefined],
  ]) {
    const envelope = await connectionAuditRequest().json(); envelope.apiKey = key;
    let calls = 0;
    const request = new Request('https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai', {
      method: 'POST', headers: { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
    });
    const result = await relay(request, async () => {
      calls++;
      return new Response(`<html>PRIVATE ${key}</html>`, { status: 520,
        headers: { 'cf-ray': ray, 'x-oneapi-request-id': '202611170001234567890123', 'cf-error-type': '520' } });
    });
    assert.equal(calls, 1); assert.equal(result.status, 502);
    const text = await result.text(); assert.ok(!text.includes(key)); assert.doesNotMatch(text, /PRIVATE|private\.example|script|202611170001234567890123/);
    assert.deepEqual(JSON.parse(text), { error: { code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json',
      ...(expected ? { upstreamRay: expected } : {}) } });
  }
});

test('audit: only the exact controlled EFUND 520 failure may display a safe diagnostic reference', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const location = { protocol: 'https:', origin: 'https://liaojs2025.github.io' };
  Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  const ray = 'abcdef0123456789-NRT';
  const base = { code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json', upstreamRay: ray };
  const config = { endpoint: 'https://aigc.efunds.com.cn/v1', model: 'deepseek-v4-flash', apiKey: connectionAuditKey };
  let selected, calls;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    let text = JSON.stringify({ error: { ...base, ...selected.error } });
    if (selected.encoded) text = text.replaceAll(connectionAuditKey,
      [...connectionAuditKey].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
    return new Response(text, { status: selected.status ?? 502 });
  });
  for (const candidate of [
    { expected: true }, { error: { upstreamRay: 'abcdef0123456789' }, expected: true },
    ...[null, 123, {}, [], 'ABCDEF0123456789-NRT', 'abcdef0123456789-nrt', 'PRIVATE<script>', 'https://private.example/'].map(upstreamRay => ({ error: { upstreamRay } })),
    { error: { message: connectionAuditKey } }, { error: { message: connectionAuditKey }, encoded: true },
    { apiKey: 'abcdef0123456789' },
    { error: { code: 'upstream_error_injected' } }, { error: { upstreamStatus: '520' } },
    { error: { upstreamReason: 'unknown' } }, { status: 520 }, { status: 403 },
    { endpoint: 'https://api.openai.com/v1/chat/completions' }, { direct: true },
    { error: { code: 'upstream_connection', upstreamReason: 'connection_reset', upstreamPhase: 'headers' } },
  ]) {
    selected = candidate; calls = 0;
    if (candidate.direct) delete globalThis.location;
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
    const settings = { ...config, ...(candidate.endpoint ? { endpoint: candidate.endpoint } : {}), ...(candidate.apiKey ? { apiKey: candidate.apiKey } : {}) };
    await assert.rejects(requestDecision(settings, buildDecisionContext(newGame(), newGame('rival')), { maxAttempts: 1 }), error => {
      assert.equal(error.message.includes('诊断编号：'), candidate.expected === true);
      if (candidate.expected) assert.ok(error.message.includes(candidate.error?.upstreamRay || ray));
      assert.ok(!error.message.includes(settings.apiKey)); assert.doesNotMatch(error.message, /PRIVATE|script|private\.example/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('audit: a real SSE reader rejection is a bounded network recovery and never commits its partial answer', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const logs = []; t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const player = newGame(), rival = newGame('rival'), original = JSON.stringify([player, rival]);
  const answer = fallbackDecisionPack(player, rival);
  const frame = (content, finish = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
  const config = { endpoint: 'https://aigc.efunds.com.cn/v1', model: 'deepseek-v4-flash', apiKey: connectionAuditKey };
  let calls, upstreamBodies, alwaysFail, diagnostics;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    const response = await relay(new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://liaojs2025.github.io' } }), async (_target, sent) => {
      upstreamBodies.push(JSON.parse(sent.body));
      if (!alwaysFail && calls > 1) return new Response(frame(JSON.stringify(answer), 'stop') + 'data: [DONE]\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
      let first = true;
      return new Response(new ReadableStream({ pull(controller) {
        if (first) { first = false; controller.enqueue(new TextEncoder().encode(frame('{"summary":"partial answer'))); }
        else controller.error(new TypeError(`PRIVATE-READ ${connectionAuditKey} https://private.example/`));
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    if (!response.ok) {
      assert.equal(response.status, 502); assert.equal(response.headers.get('X-AI-Stream-Reason'), 'read');
      diagnostics.push(await response.clone().json());
    }
    return response;
  });
  for (alwaysFail of [false, true]) {
    calls = 0; upstreamBodies = []; diagnostics = []; let result, failure;
    const pending = requestDecision(config, buildDecisionContext(player, rival)).then(value => { result = value; }, error => { failure = error; });
    await flush(); assert.equal(calls, 1); assert.equal(result, undefined);
    t.mock.timers.tick(3999); await flush(); assert.equal(calls, 1);
    t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
    if (alwaysFail) { assert.equal(result, undefined); t.mock.timers.tick(8000); await flush(); }
    await pending;
    assert.equal(calls, alwaysFail ? 3 : 2);
    if (alwaysFail) { assert.equal(failure.code, 'NETWORK'); assert.equal(failure.category, 'network'); assert.equal(result, undefined); }
    else { assert.equal(result.source, 'model'); assert.equal(result.summary, answer.summary); assert.equal(failure, undefined); }
    for (const diagnostic of diagnostics) assert.deepEqual(diagnostic, { error: {
      code: 'upstream_connection', upstreamReason: 'stream_interrupted', upstreamPhase: 'body',
    } });
    for (const body of upstreamBodies) {
      assert.deepEqual(body, upstreamBodies[0]); assert.equal(body.max_tokens, 4000);
      assert.deepEqual(body.thinking, { type: 'disabled' });
    }
    assert.equal(JSON.stringify([player, rival]), original);
    assert.doesNotMatch(JSON.stringify({ diagnostics, result, failure }), /PRIVATE-READ|private\.example|efund-transport-audit-fake-key|partial answer/);
    t.mock.timers.tick(60000); await flush(); assert.equal(calls, alwaysFail ? 3 : 2);
  }
  assert.ok(logs.every(log => log.event === 'ai_stream_failure' && log.code === 'upstream_connection' && log.reason === 'read'));
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE-READ|private\.example|efund-transport-audit-fake-key/);
});

test('audit: interrupted-stream recovery excludes wrong diagnostics and all malformed or unsafe model output', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const location = { protocol: 'https:', origin: 'https://liaojs2025.github.io' };
  Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.method(console, 'warn', () => {});
  const valid = { code: 'upstream_connection', upstreamReason: 'stream_interrupted', upstreamPhase: 'body' };
  const frame = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  const stop = frame({}, 'stop') + 'data: [DONE]\n\n';
  let selected, calls;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++;
    if (selected.wire !== undefined) return relay(new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://liaojs2025.github.io' } }), async () =>
      new Response(selected.wire, { headers: { 'Content-Type': 'text/event-stream' } }));
    if (selected.thrown) throw new TypeError('PRIVATE browser failure');
    let text = JSON.stringify({ error: { ...valid, ...selected.error } });
    if (selected.encoded) text = text.replaceAll(connectionAuditKey,
      [...connectionAuditKey].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
    return new Response(text, { status: selected.status ?? 502 });
  });
  for (const candidate of [
    ...[{ code: 'invalid_response' }, { code: 'upstream_connection_injected' },
      { upstreamReason: 'read' }, { upstreamReason: 'stream_interrupted ' }, { upstreamReason: null },
      { upstreamPhase: 'headers' }, { upstreamPhase: 'BODY' }, { upstreamPhase: undefined },
      { message: connectionAuditKey }].map(error => ({ error })),
    { error: { message: connectionAuditKey }, encoded: true },
    ...[200, 400, 401, 403, 429, 500, 503, 504, 520].map(status => ({ status })),
    { endpoint: 'https://api.openai.com/v1' }, { direct: true }, { thrown: true },
    { wire: frame({ content: '{}' }), expectedCode: 'RESPONSE_FORMAT' },
    { wire: frame({ content: '{}' }, 'length') + 'data: [DONE]\n\n', expectedCode: 'RESPONSE_FORMAT' },
    { wire: frame({ refusal: 'PRIVATE refusal' }) + stop, expectedCode: 'RESPONSE_FORMAT' },
    { wire: frame({ tool_calls: [{ function: { name: 'PRIVATE_TOOL' } }] }) + stop, expectedCode: 'RESPONSE_FORMAT' },
    { wire: 'data: not-json\n\n', expectedCode: 'RESPONSE_FORMAT' },
    { wire: new Uint8Array([0xff, 0xfe]), expectedCode: 'RESPONSE_FORMAT' },
    { wire: frame({ content: connectionAuditKey.slice(0, 10) }) + frame({ content: connectionAuditKey.slice(10) }) + stop, expectedCode: 'SECRET_ECHO' },
  ]) {
    selected = candidate; calls = 0;
    if (candidate.direct) delete globalThis.location;
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
    await assert.rejects(requestDecision({ endpoint: candidate.endpoint || 'https://aigc.efunds.com.cn/v1',
      model: 'deepseek-v4-flash', apiKey: connectionAuditKey }, buildDecisionContext(newGame(), newGame('rival')),
    { timeoutMs: 20 }), error => {
      if (candidate.status !== 504) assert.notEqual(error.code, 'TIMEOUT', 'excluded failures cannot enter a recovery wait');
      if (candidate.expectedCode) assert.equal(error.code, candidate.expectedCode);
      assert.doesNotMatch(error.message, /PRIVATE|efund-transport-audit-fake-key/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('audit: EFUND default and optional GLM Flash keep thinking disabled and both token caps on parameter recovery', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  const player = newGame(), rival = newGame('rival');
  const finished = simulateStrategy('balanced', 3), finishedRival = simulateStrategy('advisor', 3);
  let browserBodies, upstreamBodies, reply;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const incoming = JSON.parse(init.body);
    assert.equal(incoming.provider, 'efund');
    browserBodies.push(incoming.request);
    return relay(new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://liaojs2025.github.io' } }), async (target, sent) => {
      assert.equal(target, 'https://aigc.efunds.com.cn/v1/chat/completions');
      upstreamBodies.push(JSON.parse(sent.body));
      if (upstreamBodies.length === 1) return new Response(JSON.stringify({ error: {
        code: 'unsupported_parameter', param: 'response_format',
      } }), { status: 400 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    });
  });
  for (const [selectedModel, expectedModel, purpose] of [
    ['', 'deepseek-v4-flash', 'decision'], ['', 'deepseek-v4-flash', 'persona'],
    ['glm-5.3-flash', 'glm-5.3-flash', 'decision'], ['glm-5.3-flash', 'glm-5.3-flash', 'persona'],
  ]) {
    const config = { endpoint: 'https://aigc.efunds.com.cn/v1', model: selectedModel, apiKey: connectionAuditKey };
    browserBodies = []; upstreamBodies = [];
    reply = purpose === 'decision' ? fallbackDecisionPack(player, rival) : fallbackPersona(finished, finishedRival);
    const result = purpose === 'decision'
      ? await requestDecision(config, buildDecisionContext(player, rival), { maxAttempts: 2 })
      : await requestPersona(config, finished, finishedRival, { maxAttempts: 2 });
    assert.equal(result.source, 'model');
    assert.equal(result.model, expectedModel);
    assert.equal(browserBodies.length, 2);
    assert.equal(upstreamBodies.length, 2, 'the relay never adds a hidden provider retry');
    for (const body of [...browserBodies, ...upstreamBodies]) {
      assert.equal(body.model, expectedModel);
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.max_tokens, purpose === 'decision' ? 4000 : 6000);
      assert.equal(body.max_completion_tokens, undefined);
      assert.equal(body.reasoning_effort, undefined);
    }
    assert.equal(upstreamBodies[0].temperature, 0);
    assert.equal(upstreamBodies[1].temperature, undefined);
    assert.equal(upstreamBodies[1].response_format, undefined);
    assert.deepEqual(upstreamBodies[0].messages, upstreamBodies[1].messages);
    assert.ok(upstreamBodies.every(body => body.stream === true));
    assert.ok(browserBodies.every(body => body.stream === false));
  }
});

test('audit: old EFUND tabs receive thinking defaults only for the two exact Flash model identifiers', async () => {
  for (const [model, expectedThinking, tokenField] of [
    ['deepseek-v4-flash', { type: 'disabled' }, 'max_tokens'],
    ['gpt-4o', undefined, 'max_completion_tokens'],
    ['deepseek-flash', undefined, 'max_tokens'],
    ['glm-5.3-flash', { type: 'disabled' }, 'max_tokens'],
    ['glm-5.3-flash-extra', undefined, 'max_tokens'],
    ['GLM-5.3-flash', undefined, 'max_tokens'],
    ['glm-5.3-flash ', undefined, 'max_tokens'],
    ['deepseek-v4-flash-extra', undefined, 'max_tokens'],
    ['DeepSeek-v4-flash', undefined, 'max_tokens'],
    ['deepseek-v4-flash ', undefined, 'max_tokens'],
  ]) {
    const envelope = await connectionAuditRequest().json();
    envelope.request.model = model;
    let calls = 0;
    const response = await relay(new Request('https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai', {
      method: 'POST', headers: { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
    }), async (_target, sent) => {
      calls++;
      const body = JSON.parse(sent.body);
      assert.equal(body.model, model, 'server-side defaults must not change an explicit model');
      assert.deepEqual(body.thinking, expectedThinking);
      assert.equal(body[tokenField], 4000, 'missing old-client token limits receive the bounded EFUND default');
      assert.equal(body[tokenField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'], undefined);
      assert.equal(body.reasoning_effort, undefined);
      return new Response('{"choices":[]}');
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  }
});

test('audit: both EFUND Flash models reject unapproved thinking and inference fields before a provider request', async () => {
  const invalidFields = [
    { thinking: { type: 'enabled' } }, { thinking: { type: 'disabled', budget: 99999 } },
    { thinking: { type: 'disabled', ignored: true } }, { thinking: { type: 'DISABLED' } },
    { thinking: 'disabled' }, { thinking: null }, { thinking: false }, { thinking: [] }, { thinking: {} },
    { reasoning_effort: 'low' }, { temperature: 1 }, { max_completion_tokens: 2500 },
    { max_tokens: 6001 }, { max_tokens: 0 }, { max_tokens: '2500' },
  ];
  const cases = ['deepseek-v4-flash','glm-5.3-flash'].flatMap(model =>
    invalidFields.map(fields => ({ model, ...fields })));
  for (const model of ['gpt-4o','deepseek-flash','glm-5.3-flash-extra','GLM-5.3-flash','glm-5.3-flash '])
    cases.push({ model, thinking: { type: 'disabled' } });
  for (const change of cases) {
    const envelope = await connectionAuditRequest().json();
    Object.assign(envelope.request, change);
    let calls = 0;
    const response = await relay(new Request('https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai', {
      method: 'POST', headers: { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
    }), async () => { calls++; return new Response('{}'); });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: 'unsupported_request' } });
    assert.equal(calls, 0);
  }
});

test('audit: selecting the same GLM model name on a different service preserves that service’s sampling and token contract', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  const player = newGame(), rival = newGame('rival');
  const reply = fallbackDecisionPack(player, rival);
  let captured;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const request = new Request(url, { ...init, headers: { ...init.headers, Origin: 'https://liaojs2025.github.io' } });
    return relay(request, async (endpoint, forwarded) => {
      captured = { endpoint, body: JSON.parse(forwarded.body) };
      return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
    });
  });
  for (const [endpoint, temperature, thinking, effort, field, cap] of [
    ['https://aigc.efunds.com.cn/v1/chat/completions', 0, 'disabled', undefined, 'max_tokens', 4000],
    ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 1, 'disabled', undefined, 'max_tokens', 2500],
    ['https://api.openai.com/v1/chat/completions', 0, undefined, undefined, 'max_completion_tokens', 2500],
    ['https://api.moonshot.cn/v1/chat/completions', undefined, undefined, 'low', 'max_tokens', 2500],
    ['https://api.deepseek.com/chat/completions', 0, 'disabled', undefined, 'max_tokens', 2500],
  ]) {
    captured = null;
    const result = await requestDecision({ endpoint, model: 'glm-5.3-flash', apiKey: connectionAuditKey },
      buildDecisionContext(player, rival), { maxAttempts: 1 });
    assert.equal(result.model, 'glm-5.3-flash');
    assert.equal(captured.endpoint, endpoint);
    assert.equal(captured.body.temperature, temperature);
    assert.deepEqual(captured.body.thinking, thinking ? { type: thinking } : undefined);
    assert.equal(captured.body.reasoning_effort, effort);
    assert.equal(captured.body[field], cap);
  }
});

test('audit: EFUND JSON size rejection stays distinct from connection failure without Content-Length', async () => {
  for (const [size, expectedStatus] of [[200000, 200], [200001, 502]]) {
    const body = '{"padding":"' + 'x'.repeat(size - 14) + '"}';
    assert.equal(new TextEncoder().encode(body).byteLength, size);
    let calls = 0, cancelled = false;
    const result = await relay(connectionAuditRequest(), async () => {
      calls++;
      const source = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(body)); if (expectedStatus === 200) controller.close(); },
        cancel() { cancelled = true; },
      });
      const upstream = new Response(source, { headers: { 'Content-Type': 'application/json' } });
      assert.equal(upstream.headers.has('Content-Length'), false);
      return upstream;
    });
    assert.equal(calls, 1);
    assert.equal(result.status, expectedStatus);
    if (expectedStatus === 200) assert.equal(await result.text(), body);
    else {
      assert.deepEqual(await result.json(), { error: { code: 'response_too_large' } });
      assert.equal(cancelled, true, 'oversized bodies must be cancelled rather than read to completion');
    }
  }
  const utf8 = await relay(connectionAuditRequest(), async () => new Response(JSON.stringify({ padding: '中'.repeat(70000) })));
  assert.equal(utf8.status, 502, 'the relay limit counts bytes, not JS characters');
  assert.deepEqual(await utf8.json(), { error: { code: 'response_too_large' } });
});

test('audit: EFUND transport diagnostics expose only fixed categories and phases, never runtime text', async t => {
  const logs = [];
  t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const privateDetail = `PRIVATE-DIAGNOSTIC https://private.example/?credential=${connectionAuditKey}`;
  const cases = [
    ['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'], ['UND_ERR_CONNECT_TIMEOUT', 'connect_timeout'],
    ['ETIMEDOUT', 'connect_timeout'], ['ECONNRESET', 'connection_reset'], ['EPIPE', 'connection_reset'],
    ['UND_ERR_SOCKET', 'connection_reset'], ['ECONNREFUSED', 'connection_refused'],
    ['CERT_HAS_EXPIRED', 'tls'], ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'], ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls'],
    [privateDetail, 'unknown'], ['ENOTFOUND<script>', 'unknown'], [null, 'unknown'],
  ];
  for (const [code, reason] of cases) {
    const nested = Object.assign(new Error(privateDetail), { code });
    for (const cause of [nested, new TypeError(privateDetail, { cause: nested }),
      new TypeError(privateDetail, { cause: { errors: [nested] } })]) {
      assert.equal(transportReason(cause), reason);
      let calls = 0;
      const result = await relay(connectionAuditRequest(), async () => { calls++; throw cause; });
      assert.equal(calls, 1);
      assert.equal(result.status, 502);
      assert.deepEqual(await result.json(), { error: { code: 'upstream_connection', upstreamReason: reason, upstreamPhase: 'headers' } });
      const log = logs.at(-1);
      assert.deepEqual(Object.keys(log).sort(), ['elapsedMs', 'event', 'phase', 'reason']);
      assert.equal(log.event, 'ai_transport_failure');
      assert.equal(log.phase, 'headers');
      assert.equal(log.reason, reason);
      assert.ok(Number.isFinite(log.elapsedMs) && log.elapsedMs >= 0);
    }
  }
  const result = await relay(connectionAuditRequest(), async () => new Response(new ReadableStream({
    start(controller) { controller.error(Object.assign(new Error(privateDetail), { code: 'ECONNRESET' })); },
  }), { headers: { 'Content-Type': 'application/json' } }));
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: { code: 'upstream_connection', upstreamReason: 'connection_reset', upstreamPhase: 'body' } });
  assert.equal(logs.at(-1).phase, 'body');
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE-DIAGNOSTIC|private\.example|efund-transport-audit-fake-key|<script>/);
});

test('audit: EFUND transport reasons without a trusted phase never trigger recovery or save a partial decision', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://liaojs2025.github.io' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  let calls = 0, reason;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 'upstream_connection', upstreamReason: reason } }), { status: 502 });
  });
  const player = newGame(), rival = newGame('rival');
  const original = JSON.stringify([player, rival]);
  for (reason of ['dns', 'connect_timeout', 'connection_reset', 'connection_refused', 'tls', 'unknown', 'non_json']) {
    calls = 0;
    await assert.rejects(requestDecision({ endpoint: 'https://aigc.efunds.com.cn/v1', model: 'audit-model', apiKey: connectionAuditKey },
      buildDecisionContext(player, rival)), error => error.code === 'NETWORK' && !error.message.includes(connectionAuditKey));
    assert.equal(calls, 1);
    assert.equal(JSON.stringify([player, rival]), original);
  }
});

test('audit: 20 chronological rounds expose public information and explicit historical return units', () => {
  assert.deepEqual(ASSET_KEYS, ['cash', 'stock', 'tech', 'consumer', 'health', 'bond', 'gold']);
  assert.deepEqual(YEARS.map(year => year.year), Array.from({ length: 20 }, (_, i) => 2007 + i));
  assert.equal(newGame().version, 3);
  for (const year of YEARS) {
    assert.equal(year.informationAsOf, `${year.year}-01-01`);
    assert.equal(year.family.choices.length, 2);
    assert.equal(new Set(year.family.choices.map(choice => choice.id)).size, 2);
    assert.ok(year.briefing.every(item => item.title && item.text));
    assert.ok(ASSET_KEYS.every(key => Number.isFinite(year.returns[key]) && year.returns[key] > -1));
  }
  // Source transcription spot checks, not the implementation's own calculations.
  assert.equal(YEARS[1].returns.stock, -0.3655);
  assert.equal(YEARS[6].returns.gold, -0.2761);
  assert.equal(YEARS[11].returns.bond, -0.0002);
  assert.equal(YEARS[1].returns.tech, -0.4078);
  assert.equal(YEARS[6].returns.health, 0.4138);
  assert.equal(YEARS[11].returns.consumer, -0.0362);
});

test('audit: richer briefing and signals use prior dates and label retrospective observations', () => {
  for (const year of YEARS) {
    assert.equal(year.briefing.length, 3);
    assert.equal(year.marketSignals.length, 3);
    for (const item of [...year.briefing, ...year.marketSignals]) {
      assert.match(item.asOf, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(item.asOf < year.informationAsOf, `${year.year}: ${item.title || item.label}`);
      assert.match(item.sourceUrl, /^https:\/\//);
      if (item.retrospective) {
        assert.ok(item.observationEnd < year.informationAsOf);
        assert.ok(item.sourceVintage);
        assert.match(item.context, /已结束|历史整理/);
      } else {
        assert.ok(item.publishedAt <= item.asOf);
      }
    }
  }
});

test('audit: public preview and adviser cannot access current hidden outcomes', () => {
  const state = newGame('assisted');
  const year = YEARS[0];
  const originals = Object.getOwnPropertyDescriptors(year);
  const hidden = ['returns', 'event', 'homeReturn', 'inflation', 'reveal'];
  for (const key of hidden) Object.defineProperty(year, key, {
    configurable: true, get() { throw new Error(`future information accessed: ${key}`); },
  });
  try {
    const decision = advisorDecision(state);
    assert.equal(validateDecision(state, decision).valid, true);
    assert.equal(previewDecision(state, decision).valid, true);
  } finally {
    for (const key of hidden) Object.defineProperty(year, key, originals[key]);
  }
});

test('audit: cash-only first-year ledger matches independently calculated dollars', () => {
  const state = freeze(newGame());
  const decision = { ...cashDecision(state), choiceId: 'travel' };
  const result = settleYear(state, decision);
  const initialSaleFee = 40000 * 0.002;
  const invested = 100000 - 3500 - initialSaleFee;
  const householdContribution = 72000 - 36000 - 1200 - 3500;
  const investmentProfit = invested * 0.02 - initialSaleFee;
  near(result.totalContribution, householdContribution);
  near(result.totalInvestmentProfit, investmentProfit);
  near(netWorth(result), 100000 + householdContribution + investmentProfit);
  assert.equal(state.round, 0);
  assert.equal(state.history.length, 0);
  assert.equal(result.round, 1);
  assert.equal(result.age, 31);
});

test('audit: purchased home mortgage agrees with closed-form amortization and car is depreciated once', () => {
  const state = newGame();
  const decision = { ...cashDecision(state), choiceId: 'travel', buyHome: true, buyCar: true };
  const result = settleYear(state, decision);
  const principal = 240000 * 0.8;
  const rate = 0.05 / 12;
  const payment = principal * rate / (1 - (1 + rate) ** -360);
  const expectedBalance = principal * (1 + rate) ** 12 - payment * ((1 + rate) ** 12 - 1) / rate;
  near(result.mortgage.balance, expectedBalance);
  near(result.history[0].mortgagePrincipal, principal - expectedBalance);
  near(result.history[0].mortgageInterest, payment * 12 - (principal - expectedBalance));
  near(result.homeValue, 240000 * 0.97);
  near(result.carValue, 18000 * 0.85);
  near(result.history[0].homePurchaseFee, 4800);
  near(result.history[0].homeMaintenance, 2880);
  near(result.history[0].carMaintenance, 1800);
  near(result.history[0].livingExpense, 18000);
  near(netWorth(result), liquidAssets(result) + result.homeValue + result.carValue - expectedBalance);
  assert.equal(validateDecision(result, { ...cashDecision(result), buyHome: true }).valid, false);
  assert.equal(validateDecision(result, { ...cashDecision(result), buyCar: true }).valid, false);
});

test('audit: insurance pays only covered medical costs, honors limit, and no unrelated family expense', () => {
  const beforeMedical = simulateStrategy('balanced', 5);
  const insured = settleYear(beforeMedical, { ...cashDecision(beforeMedical), insurance: true });
  const uninsured = settleYear(beforeMedical, { ...cashDecision(beforeMedical), insurance: false });
  const insuredRecord = insured.history.at(-1);
  assert.equal(insuredRecord.medicalCost, 42000);
  near(insuredRecord.insurancePayout, 30000 * beforeMedical.priceIndex);
  near(insuredRecord.insurancePremium, 1200 * beforeMedical.priceIndex);
  near(netWorth(insured) - netWorth(uninsured), insuredRecord.insurancePayout - insuredRecord.insurancePremium);
  const beforeCare = simulateStrategy('balanced', 8);
  const afterCare = settleYear(beforeCare, cashDecision(beforeCare));
  assert.equal(afterCare.history.at(-1).eventCost, 9000);
  assert.equal(afterCare.history.at(-1).insurancePayout, 0);
});

test('audit: exhausting assets creates explicit debt and next-year interest rather than negative cash', () => {
  const state = simulateStrategy('balanced', 5);
  // A stress-event fixture preserves the authentic earlier ledger and snapshots.
  const after = withEvent(state.round, { incomeMultiplier: 0, medicalCost: liquidAssets(state) * 1.5 },
    () => settleYear(state, { ...cashDecision(state), choiceId: 'visit', insurance: false }));
  assert.equal(after.assets.cash, 0);
  assert.ok(after.shortfallDebt > 0);
  assert.equal(after.shortfallYears, 1);
  assert.equal(summary(after).debtFreeYears, 5);
  assert.equal(summary(after).goals.find(goal => goal.id === 'life').achieved, false);
  const repaid = settleYear(after, { ...cashDecision(after), insurance: false });
  near(repaid.history.at(-1).debtInterest, after.shortfallDebt * 0.12);
  assert.ok(repaid.history.at(-1).debtRepaid > 0);
  assert.ok(repaid.assets.cash === 0 || repaid.shortfallDebt === 0);
  assert.ok(repaid.shortfallDebt > 0);
  assert.equal(repaid.history.at(-1).newDebt, 0);
  assert.equal(summary(repaid).debtFreeYears, 5, 'carried debt is not a debt-free year');
});

test('audit: forced sale charges fees and conserves the balance sheet', () => {
  const state = simulateStrategy('advisor', 5);
  const result = withEvent(state.round, { incomeMultiplier: 0, medicalCost: state.assets.cash + 10000 }, () => settleYear(state, {
    ...defaultDecision(state), choiceId: 'visit', insurance: false, rebalance: 'hold',
  }));
  const record = result.history.at(-1);
  assert.ok(record.forcedSales > 0);
  near(record.fees, record.forcedSales * RULES.transactionFee);
  near(record.endNetWorth - record.startNetWorth, record.netContribution + record.investmentProfit);
  near(result.assets.cash, 0);
  assert.equal(result.shortfallDebt, 0);
  for (const key of ASSET_KEYS.slice(1)) {
    const beforeSale = state.assets[key] * (1 + YEARS[state.round].returns[key]);
    assert.ok(result.assets[key] < beforeSale, `${key} must participate in forced sales`);
    const reference = 'stock';
    const referenceBefore = state.assets[reference] * (1 + YEARS[state.round].returns[reference]);
    near(result.assets[key] / beforeSale, result.assets[reference] / referenceBefore);
  }
});

test('audit: operating mode does not alter settlement; every benchmark completes from identical start', () => {
  const states = ['player', 'assisted', 'auto'].map(mode => newGame(mode));
  const decision = defaultDecision(states[0]);
  const settled = states.map(state => settleYear(state, decision));
  for (const state of settled) {
    near(netWorth(state), netWorth(settled[0]));
    assert.deepEqual(state.assets, settled[0].assets);
  }
  for (const strategy of ['cash', 'balanced', 'growth', 'advisor', 'tech', 'consumer', 'health']) {
    const result = simulateStrategy(strategy);
    assert.equal(result.history[0].startNetWorth, 100000);
    assert.equal(result.round, YEARS.length);
    assert.equal(summary(result).completed, true);
    assert.deepEqual(result, simulateStrategy(strategy));
    assert.throws(() => settleYear(result, defaultDecision(result)), /旅程已经结束/);
  }
});

test('audit: canonical restore reproduces state, rejects corrupt balances and invalid decisions', () => {
  const state = simulateStrategy('advisor', 7);
  const serialized = JSON.parse(JSON.stringify(state));
  assert.deepEqual(restoreGame(serialized), state);
  const corruptBalance = structuredClone(serialized);
  corruptBalance.assets.cash += 10;
  assert.throws(() => restoreGame(corruptBalance));
  const corruptHistory = structuredClone(serialized);
  corruptHistory.history[0].decision.allocation.stock = 101;
  assert.throws(() => restoreGame(corruptHistory));
  assert.throws(() => restoreGame({ version: 999 }));
  assert.throws(() => restoreGame({ ...serialized, version: 1 }), /版本|存档/);
  assert.throws(() => restoreGame({ ...serialized, version: 2 }), /版本|存档/);
  assert.throws(() => restoreGame({ ...serialized, assets: null }));
});

test('audit: zero cash allocation is honored with no hidden reserve and exact two-sided fees', () => {
  const state = newGame();
  for (const key of ['tech', 'consumer', 'health']) {
    const decision = { ...defaultDecision(state), choiceId: 'travel', allocation: assetMap({ [key]: 100 }) };
    const preview = previewDecision(state, decision);
    assert.equal(preview.valid, true);
    near(preview.projectedAllocation.cash, 0);
    near(preview.projectedAllocation[key], 100);
    const expectedInvested = (100000 - 3500 - 40000 * 0.002) / 1.002;
    near(preview.remainingLiquid, expectedInvested);
    near(preview.fees, 40000 * 0.002 + expectedInvested * 0.002);
    const after = settleYear(state, decision);
    near(after.history[0].liquidReturn, expectedInvested * YEARS[0].returns[key]);
    near(after.history[0].investmentProfit, after.history[0].liquidReturn - preview.fees);
    assert.equal('reserveTarget' in preview, false);
    assert.equal('reserveMonths' in decision, false);
    assert.equal(summary(after).debtFreeYears, 1, 'zero cash target must not lose a debt-free year');
  }
});

test('audit: hold performs no allocation trade or cash top-up beyond real household purchases', () => {
  const initial = newGame();
  const state = trackedFixture({ ...initial, assets: assetMap({ cash: 3500, stock: 50000, tech: 10000, consumer: 10000, health: 10000, bond: 10000, gold: 6500 }) });
  const decision = { ...defaultDecision(state), choiceId: 'travel', rebalance: 'hold', allocation: assetMap({ cash: 100 }) };
  const preview = previewDecision(state, decision);
  assert.equal(preview.valid, true);
  near(preview.fees, 0);
  near(preview.projectedAllocation.cash, 0);
  for (const key of ASSET_KEYS.slice(1)) near(preview.remainingLiquid * preview.projectedAllocation[key] / 100, state.assets[key]);
});

test('audit: expense preview remains coherent but summary has no cash-month metric or target', () => {
  const initial = newGame();
  near(annualExpenses(initial), 36000 + 1200);
  for (const insurance of [true, false]) {
    const state = settleYear(initial, { ...cashDecision(initial), choiceId: 'travel', insurance, buyHome: true, buyCar: true });
    const decision = { ...cashDecision(state), insurance };
    const preview = previewDecision(state, decision);
    near(annualExpenses(state), preview.expectedExpense);
    assert.equal('emergencyMonths' in summary(state), false);
    assert.equal(summary(state).goals.some(goal => /应急|现金储备|个月/.test(goal.label)), false);
    assert.equal(summary(state).goals.find(goal => goal.id === 'wealth').target, 1000000);
  }
});

test('audit: yearly snapshots reconcile every asset, every debt and acquisition transfers', () => {
  const state = newGame();
  const result = settleYear(state, { ...cashDecision(state), choiceId: 'travel', buyHome: true, buyCar: true });
  const record = result.history[0];
  for (const [snapshot, expectedState] of [[record.startBalanceSheet, state], [record.endBalanceSheet, result]]) {
    assert.deepEqual(Object.keys(snapshot.assets).sort(), [...ASSET_KEYS, 'home', 'car'].sort());
    assert.deepEqual(Object.keys(snapshot.liabilities).sort(), ['mortgage', 'shortfallDebt'].sort());
    for (const key of ASSET_KEYS) near(snapshot.assets[key], expectedState.assets[key]);
    near(snapshot.assets.home, expectedState.homeValue);
    near(snapshot.assets.car, expectedState.carValue);
    near(snapshot.liabilities.mortgage, expectedState.mortgage.balance);
    near(snapshot.liabilities.shortfallDebt, expectedState.shortfallDebt);
    near(snapshot.totalAssets, Object.values(snapshot.assets).reduce((sum, value) => sum + value, 0));
    near(snapshot.totalLiabilities, Object.values(snapshot.liabilities).reduce((sum, value) => sum + value, 0));
    near(snapshot.netWorth, snapshot.totalAssets - snapshot.totalLiabilities);
    near(snapshot.netWorth, netWorth(expectedState));
  }
});

test('audit: reported satisfaction change matches the actual capped score', () => {
  const nearMaximum = { ...newGame(), lifeScore: 99 };
  const happy = settleYear(nearMaximum, { ...cashDecision(nearMaximum), choiceId: 'travel' });
  assert.equal(happy.lifeScore, 100);
  assert.equal(happy.history.at(-1).lifeDelta, 1);
  const minimum = { ...happy, lifeScore: 0 };
  const stressed = settleYear(minimum, { ...cashDecision(minimum), choiceId: 'overtime' });
  assert.equal(stressed.lifeScore, 0);
  assert.equal(stressed.history.at(-1).lifeDelta, 0);
});

test('audit: 120 deterministic varied decision paths preserve annual and cumulative accounting', () => {
  let seed = 716593;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let path = 0; path < 120; path++) {
    let state = newGame();
    for (let round = 0; round < YEARS.length; round++) {
      const cuts = [0, ...Array.from({ length: ASSET_KEYS.length - 1 }, () => Math.floor(random() * 101)), 100].sort((a, b) => a - b);
      const decision = { ...defaultDecision(state),
        allocation: Object.fromEntries(ASSET_KEYS.map((key, i) => [key, cuts[i + 1] - cuts[i]])),
        insurance: random() < 0.5,
        buyHome: !state.homeValue && random() < 0.12, buyCar: !state.carValue && random() < 0.12,
        choiceId: YEARS[round].family.choices[Math.floor(random() * 2)].id,
        rebalance: random() < 0.75 ? 'annual' : 'hold',
      };
      if (!validateDecision(state, decision).valid) {
        decision.buyHome = false;
        decision.buyCar = false;
        decision.choiceId = [...YEARS[round].family.choices].sort((a, b) => a.cost - b.cost)[0].id;
      }
      assert.equal(validateDecision(state, decision).valid, true, `path ${path}, round ${round}`);
      const snapshot = structuredClone(state);
      state = settleYear(state, decision);
      assertState(state);
      const record = state.history.at(-1);
      near(record.endNetWorth - record.startNetWorth, record.investmentProfit + record.netContribution);
      near(netWorth(state), 100000 + state.totalContribution + state.totalInvestmentProfit);
      for (const sheet of [record.startBalanceSheet, record.endBalanceSheet]) {
        near(sheet.totalAssets, Object.values(sheet.assets).reduce((sum, value) => sum + value, 0));
        near(sheet.totalLiabilities, Object.values(sheet.liabilities).reduce((sum, value) => sum + value, 0));
        near(sheet.netWorth, sheet.totalAssets - sheet.totalLiabilities);
      }
      assert.ok(ASSET_KEYS.every(key => state.assets[key] >= -1e-6));
      assert.ok(state.lifeScore >= 0 && state.lifeScore <= 100);
      assert.equal(snapshot.round, round);
      assert.equal(state.round, round + 1);
    }
    assert.equal(summary(state).completed, true);
  }
});
