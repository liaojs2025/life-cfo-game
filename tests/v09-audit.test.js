import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_VERSION } from '../dist/data.js';
import { newGame, settleYear, simulateStrategy } from '../dist/engine.js';
import { buildDecisionContext, fallbackDecisionPack, validateDecisionPack, validateApiConfig, requestDecision,
  fallbackPersona, requestPersona, validatePersona, getApiProviderHint } from '../dist/ai.js';
import { restoreDuel } from '../dist/session.js';
import { relay } from '../worker/handler.js';
import { PROVIDERS, EFUND_DEFAULTS, DEFAULT_API_CONFIG, providerForEndpoint, PUBLIC_RELAY_ORIGIN } from '../dist/providers.js';

const PAGES_ORIGIN = 'https://liaojs2025.github.io';
const TEST_KEY = 'v09-audit-secret';
const EXPECTED_PROVIDERS = {
  deepseek: 'https://api.deepseek.com/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  efund: 'https://aigc.efunds.com.cn/v1/chat/completions',
};
const chatBody = () => ({ model: 'audit-model', stream: false, temperature: 0,
  response_format: { type: 'json_object' }, messages: [
    { role: 'system', content: 'Only anonymous public facts.' }, { role: 'user', content: '{}' },
  ] });
const envelope = (provider = 'efund') => ({ provider, apiKey: TEST_KEY, request: chatBody() });
const relayRequest = (body = envelope(), origin = PAGES_ORIGIN, extra = {}) => new Request(`${PUBLIC_RELAY_ORIGIN}/api/ai`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...extra,
});
const modelReply = content => new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
  headers: { 'Content-Type': 'application/json' },
});
function browserLocation(t, origin = PAGES_ORIGIN) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: {
    origin, protocol: new URL(origin).protocol, href: `${origin}/life-cfo-game/`, pathname: '/life-cfo-game/',
  } });
  t.after(() => original ? Object.defineProperty(globalThis, 'location', original) : delete globalThis.location);
}

// Captured from the released v0.3 implementation before the v0.9 API rewrite.
// A generated-at-test-time expectation would miss silent invalidation of saves.
const V03_CONTEXT_IDS = [
  'case3-2e3695be8b423624', 'case3-e5e8f67d54ef68e1', 'case3-f36bdd9168895f55',
  'case3-f77135898cdc7b2f', 'case3-7a3150bd3f6ade81', 'case3-64d936951ba13167',
  'case3-1c96189df39284a9', 'case3-54870aa633cf819a', 'case3-28444899f241b0db',
  'case3-38e1c2eb58c7e47f', 'case3-6427f055e674c44d', 'case3-e68a52deb5ca8018',
  'case3-2e5efa201dc4535a', 'case3-0691268d269f8009', 'case3-45c40523b00fbe2f',
  'case3-d2da9db8a3f1efee', 'case3-09f126249bf73230', 'case3-e8a2c1b9ab5e9ff1',
  'case3-c8dcc3500b350c24', 'case3-1bfa9a19e8a0ba2d',
];
const V03_DECISION = {
  allocation: { cash: 20, stock: 20, tech: 8, consumer: 6, health: 6, bond: 30, gold: 10 },
  insurance: true, buyHome: false, buyCar: false, choiceId: 'travel', rebalance: 'annual',
};
const V03_PACK = {
  source: 'model', model: 'v03-audit-fixture', stage: 1, contextId: 'case3-2e3695be8b423624',
  analysis: [{ signalId: 'news-1', observation: '政策利率保持不变，住房市场降温',
    reasoning: '住房需求与利息负担需要分别考虑。', risk: '当前信息无法保证下一阶段的表现。' }],
  playerDecision: V03_DECISION, rivalDecision: V03_DECISION,
  summary: '先核对家庭支出，再按各自预算安排资产。',
};

test('v0.9 audit: all twenty released v3 context identities remain replay-compatible', () => {
  assert.equal(DATA_VERSION, 'harbor-2007-2026-v3');
  let player = newGame(), rival = newGame('rival');
  for (const expected of V03_CONTEXT_IDS) {
    assert.equal(buildDecisionContext(player, rival).contextId, expected);
    const pack = fallbackDecisionPack(player, rival);
    player = settleYear(player, pack.playerDecision);
    rival = settleYear(rival, pack.rivalDecision);
  }
  assert.equal(player.round, 20);
  assert.equal(rival.round, 20);
});

test('v0.9 audit: an old saved model pack retains its original valid partial quotation', () => {
  const player = newGame(), rival = newGame('rival');
  assert.deepEqual(validateDecisionPack(V03_PACK, player, rival), V03_PACK);
  const pending = restoreDuel({ dataVersion: 'harbor-2007-2026-v3', state: player,
    rivalState: rival, agentRounds: [], agentPack: structuredClone(V03_PACK), persona: null });
  assert.deepEqual(pending.pack, V03_PACK);
  const completed = restoreDuel({ dataVersion: 'harbor-2007-2026-v3',
    state: settleYear(player, V03_PACK.playerDecision), rivalState: settleYear(rival, V03_PACK.rivalDecision),
    agentRounds: [structuredClone(V03_PACK)], agentPack: null, persona: null });
  assert.deepEqual(completed.rounds[0], V03_PACK);
  assert.equal(completed.player.round, 1);
  assert.equal(completed.rival.round, 1);
  const forged = structuredClone(V03_PACK);
  forged.analysis[0].observation = '实际历史中不存在的事实';
  assert.throws(() => validateDecisionPack(forged, player, rival));
});

test('v0.9 audit: public relay preflight grants only exact trusted origins and the required JSON header', async () => {
  let calls = 0;
  const upstream = async () => { calls++; throw Error('preflight must not call a model'); };
  for (const origin of [PAGES_ORIGIN, PUBLIC_RELAY_ORIGIN, 'http://localhost:4173', 'http://127.0.0.1:4173']) {
    const request = new Request(`${PUBLIC_RELAY_ORIGIN}/api/ai`, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
    } });
    const response = await relay(request, upstream);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST');
    assert.equal(response.headers.get('Access-Control-Allow-Headers').toLowerCase(), 'content-type');
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
    assert.match(response.headers.get('Vary'), /Origin/i);
  }
  for (const origin of ['null', 'https://liaojs2025.github.io.attacker.example',
    'https://liaojs2025.github.io/life-cfo-game', 'http://liaojs2025.github.io', 'http://localhost:9999', 'https://attacker.example']) {
    const response = await relay(relayRequest(envelope(), origin), upstream);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const forbiddenHeader = new Request(`${PUBLIC_RELAY_ORIGIN}/api/ai`, { method: 'OPTIONS', headers: {
    Origin: PAGES_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type',
  } });
  assert.equal((await relay(forbiddenHeader, upstream)).status, 403);
  assert.equal(calls, 0);
});

test('v0.9 audit: every approved provider maps to one fixed HTTPS target and strips relay credentials from the model body', async () => {
  assert.deepEqual(Object.fromEntries(PROVIDERS.map(item => [item.id, item.endpoint])), EXPECTED_PROVIDERS);
  for (const [provider, endpoint] of Object.entries(EXPECTED_PROVIDERS)) {
    let calls = 0;
    const response = await relay(relayRequest(envelope(provider)), async (url, options) => {
      calls++;
      assert.equal(url, endpoint);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.Authorization, `Bearer ${TEST_KEY}`);
      assert.equal(options.headers.Accept, provider === 'efund' ? 'text/event-stream, application/json' : 'application/json');
      assert.equal(JSON.parse(options.body).stream, provider === 'efund');
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      assert.equal(Object.hasOwn(options.headers, 'Cookie'), false);
      const body = JSON.parse(options.body);
      assert.equal(body.apiKey, undefined);
      assert.equal(body.provider, undefined);
      assert.equal(body[provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'], 2500);
      assert.equal(Object.hasOwn(body, provider === 'openai' ? 'max_tokens' : 'max_completion_tokens'), false);
      assert.deepEqual(body.thinking, provider === 'deepseek' ? { type: 'disabled' } : undefined);
      assert.equal(options.body.includes(TEST_KEY), false);
      return new Response('{"choices":[]}');
    });
    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), PAGES_ORIGIN);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const provider of ['__proto__', 'constructor', 'https://169.254.169.254/', 'openai.attacker.example',
    'paratera', 'deepseek-v1', 'dashscope', 'dashscope-intl', 'zhipu', 'moonshot']) {
    let calls = 0;
    const response = await relay(relayRequest(envelope(provider)), async () => { calls++; return new Response('{}'); });
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  }
});

test('v0.9 audit: relay keeps safe status and parameter information without reflecting provider errors', async () => {
  for (const status of [400, 401, 403, 404, 429]) {
    const response = await relay(relayRequest(), async () => new Response('private provider detail', { status }));
    assert.equal(response.status, status, `plain-text upstream ${status} must retain its meaning`);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), PAGES_ORIGIN);
    assert.doesNotMatch(await response.text(), /private provider detail/);
  }
  for (const parameter of ['temperature', 'response_format']) {
    const response = await relay(relayRequest(), async () => new Response(JSON.stringify({
      error: { code: 'unsupported_parameter', param: parameter, message: 'Unsupported parameter: private provider detail' },
    }), { status: 400 }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: 'unsupported_parameter', parameter } });
  }
});

test('v0.9 audit: upstream diagnostics expose only actual status and fixed labels, never provider text', async () => {
  const privateMarker = 'PRIVATE-AUDIT-DETAIL';
  const payloads = [
    ['parameter', { error: { code: 'unsupported_parameter', param: 'max_tokens' } }],
    ['quota', { error: { type: 'insufficient_quota' } }],
    ['rate_limit', { error: { message: 'too many requests' } }],
    ['capacity', { error: { message: 'no available channel' } }],
    ['credential', { error: { code: 'invalid_api_key' } }],
    ['policy', { error: { type: 'content_filter' } }],
    ['timeout', { error: { message: 'upstream timeout' } }],
    ['unknown', { error: { code: '__proto__', message: 'unrecognized error' }, upstreamStatus: 200, upstreamReason: 'forged' }],
  ];
  for (const [reason, payload] of payloads) {
    payload.error.message = `${payload.error.message || ''} ${privateMarker} <script>alert(1)</script> https://private.example/?token=secret`;
    let calls = 0;
    const response = await relay(relayRequest(), async () => {
      calls++;
      return new Response(JSON.stringify(payload), { status: 503, statusText: privateMarker,
        headers: { 'Set-Cookie': 'private-session=secret', Location: 'https://private.example/' } });
    });
    assert.equal(calls, 1, 'diagnostics must not retry the request');
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: {
      code: 'upstream_error', upstreamStatus: 503, upstreamReason: reason,
    } });
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), PAGES_ORIGIN);
  }
  for (const status of [502, 520]) {
    let calls = 0;
    const plain = await relay(relayRequest(), async () => {
      calls++;
      return new Response(`<html>${privateMarker} ${TEST_KEY}</html>`, { status });
    });
    assert.equal(calls, 1, 'request negotiation headers must not introduce implicit 520 retries');
    assert.deepEqual(await plain.json(), { error: {
      code: 'upstream_error', upstreamStatus: status, upstreamReason: 'non_json',
    } });
  }
  const echo = await relay(relayRequest(), async () => new Response(JSON.stringify({
    error: { code: 'insufficient_quota', message: `${privateMarker} ${TEST_KEY}` },
  }), { status: 503 }));
  assert.deepEqual(await echo.json(), { error: { code: 'unsafe_response' } },
    'JSON credential detection must take priority over diagnostic classification');
  const thrown = await relay(relayRequest(), async () => { throw new Error(`${privateMarker} ${TEST_KEY}`); });
  assert.deepEqual(await thrown.json(), { error: { code: 'upstream_connection', upstreamReason: 'unknown', upstreamPhase: 'headers' } });
});

test('v0.9 audit: operational failure logs allow only safe categories and credential-free diagnostic identifiers', async t => {
  const logs = [];
  t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const privateText = 'PRIVATE-UPSTREAM-PROMPT-AND-ADDRESS';
  const variants = [
    { key: TEST_KEY, ray: 'abcdefabcdefabcd-SJC', requestId: '202611170001234567890123', errorType: '520' },
    { key: TEST_KEY, ray: `${TEST_KEY}<script>`, requestId: `${TEST_KEY}:private`, errorType: `<script>${TEST_KEY}` },
    { key: '0123456789abcdef', ray: '0123456789abcdef-SJC', requestId: '202611170001234567890123', errorType: '520' },
    { key: '111111111111111111111111', ray: 'abcdefabcdefabcd-SJC', requestId: '111111111111111111111111', errorType: '520' },
  ];
  for (const value of variants) {
    const body = envelope(); body.apiKey = value.key;
    const response = await relay(relayRequest(body), async () => new Response(
      `<html>Request Rejected ${value.key} ${privateText}</html>`, { status: 520, headers: {
        'Content-Type': `text/html; private=${value.key}`, 'cf-ray': value.ray,
        'x-oneapi-request-id': value.requestId, 'cf-error-type': value.errorType,
        'cf-error-origin': `${privateText} ${value.key}`, 'Set-Cookie': `secret=${value.key}`,
      } }));
    assert.equal(response.status, 502);
    const log = logs.at(-1), serialized = JSON.stringify(log);
    assert.deepEqual(Object.keys(log).sort(), ['bodyKind', 'cloudflareError', 'contentType', 'elapsedMs',
      'errorType', 'event', 'providerRequestId', 'ray', 'status']);
    assert.equal(log.event, 'ai_upstream_failure');
    assert.equal(log.status, 520);
    assert.equal(Number.isFinite(log.elapsedMs), true);
    assert.equal(log.contentType, 'html');
    assert.equal(log.bodyKind, 'request_rejected');
    assert.equal(log.cloudflareError, true);
    assert.equal(serialized.includes(value.key), false);
    assert.doesNotMatch(serialized, /PRIVATE-UPSTREAM|<script>|Set-Cookie|Request Rejected/);
    assert.equal((await response.text()).includes(value.key), false);
  }
  assert.equal(logs.length, variants.length);
  assert.equal(logs[0].ray, 'abcdefabcdefabcd-SJC');
  assert.equal(logs[0].providerRequestId, '202611170001234567890123');
  assert.equal(logs[1].ray, null); assert.equal(logs[1].providerRequestId, null); assert.equal(logs[1].errorType, null);
  assert.equal(logs[2].ray, null, 'a syntactically valid ray containing the actual credential is still rejected');
  assert.equal(logs[3].providerRequestId, null, 'a numeric credential is never accepted as a request identifier');
});

test('v0.9 audit: Pages browser uses body-scoped relay credentials for all approved providers and direct custom credentials stay isolated', async t => {
  browserLocation(t);
  const player = newGame(), rival = newGame('rival');
  const raw = structuredClone(V03_PACK);
  delete raw.analysis[0].observation;
  let expected;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    if (expected.provider) {
      assert.equal(url, `${PUBLIC_RELAY_ORIGIN}/api/ai`);
      assert.equal(new Headers(options.headers).has('Authorization'), false);
      assert.equal(body.provider, expected.provider);
      assert.equal(body.apiKey, expected.key);
      assert.equal(JSON.stringify(body.request).includes(expected.key), false);
    } else {
      assert.equal(url, expected.endpoint);
      assert.equal(new Headers(options.headers).get('Authorization'), `Bearer ${expected.key}`);
      assert.equal(body.apiKey, undefined);
      assert.equal(body.provider, undefined);
    }
    return modelReply(JSON.stringify(raw));
  });
  for (const [provider, endpoint] of Object.entries(EXPECTED_PROVIDERS)) {
    expected = { provider, endpoint, key: `key-for-${provider}` };
    const pack = await requestDecision({ endpoint, model: 'audit-model', apiKey: expected.key }, buildDecisionContext(player, rival));
    assert.equal(pack.source, 'model');
  }
  expected = { endpoint: 'https://custom-provider.example/v1/chat/completions', key: 'only-custom-secret' };
  await requestDecision({ endpoint: expected.endpoint, model: 'audit-model', apiKey: expected.key }, buildDecisionContext(player, rival));
});

test('v0.9 audit: provider base addresses normalize without duplicated paths or embedded credentials', () => {
  for (const endpoint of Object.values(EXPECTED_PROVIDERS)) {
    const base = endpoint.replace(/\/chat\/completions$/, '');
    for (const input of [base, `${base}/`, endpoint, `${endpoint}/`]) {
      assert.equal(validateApiConfig({ base_url: input, model: 'audit-model', apiKey: `Bearer ${TEST_KEY}` }).endpoint, endpoint);
    }
  }
  assert.equal(validateApiConfig({ endpoint: 'https://aigc.efunds.com.cn', model: 'account-model', apiKey: TEST_KEY }).endpoint,
    EXPECTED_PROVIDERS.efund);
  for (const endpoint of ['https://user:password@api.openai.com/v1', 'http://api.openai.com/v1',
    `https://api.openai.com/v1?x=${TEST_KEY}`, 'https://api.openai.com/v1?api_key=another-secret',
    'https://api.openai.com/v1#hidden', 'javascript:alert(1)']) {
    assert.throws(() => validateApiConfig({ endpoint, model: 'audit-model', apiKey: TEST_KEY }));
  }
});

test('v1 audit: DeepSeek is the new default while EFUND account models remain explicit', () => {
  assert.deepEqual(DEFAULT_API_CONFIG, { endpoint: EXPECTED_PROVIDERS.deepseek, model: 'deepseek-flash' });
  assert.deepEqual(EFUND_DEFAULTS, { endpoint: EXPECTED_PROVIDERS.efund, model: 'gpt-4o' });
  assert.equal(providerForEndpoint(EFUND_DEFAULTS.endpoint), 'efund');
  assert.equal(getApiProviderHint(EFUND_DEFAULTS.endpoint).provider, 'EFUND');
  for (const input of ['https://aigc.efunds.com.cn', 'https://aigc.efunds.com.cn/',
    'https://aigc.efunds.com.cn/v1', 'https://aigc.efunds.com.cn/v1/',
    EFUND_DEFAULTS.endpoint, `${EFUND_DEFAULTS.endpoint}/`]) {
    assert.deepEqual(validateApiConfig({ base_url: input, model: 'account-model-id', apiKey: TEST_KEY }),
      { endpoint: EFUND_DEFAULTS.endpoint, model: 'account-model-id', apiKey: TEST_KEY });
    assert.deepEqual(validateApiConfig({ endpoint: input, model: '', apiKey: TEST_KEY }),
      { endpoint: EFUND_DEFAULTS.endpoint, model: 'gpt-4o', apiKey: TEST_KEY });
  }
  for (const endpoint of ['https://llmapi.paratera.com/v1/chat/completions',
    'https://aigc.efunds.com.cn.attacker.example/v1/chat/completions',
    'https://aigc-efunds.com.cn/v1/chat/completions',
    `${EFUND_DEFAULTS.endpoint}?tenant=another`,
    'https://aigc.efunds.com.cn:8443/v1/chat/completions']) {
    assert.equal(providerForEndpoint(endpoint), null);
  }
});

test('v0.9 audit: ID-only observations bind to real signals while budgets and allocation numbers remain usable', async t => {
  const player = newGame(), rival = newGame('rival'), context = buildDecisionContext(player, rival);
  const raw = structuredClone(V03_PACK);
  delete raw.analysis[0].observation;
  raw.analysis[0].reasoning = '当前期初金融资产为 100000 美元，建议现金 20%、科技 8%，分 3 项核对预算。';
  raw.analysis[0].risk = '这些配置比例不能保证收益。';
  let content;
  t.mock.method(globalThis, 'fetch', async () => modelReply(content));
  for (const form of [value => JSON.stringify(value), value => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``,
    value => [{ type: 'text', text: JSON.stringify(value) }]]) {
    content = form(raw);
    const pack = await requestDecision({ endpoint: 'https://audit-provider.example/v1', model: 'audit-model', apiKey: TEST_KEY }, context);
    assert.equal(pack.analysis[0].observation, context.signals[0].text);
    assert.equal(pack.analysis[0].reasoning, raw.analysis[0].reasoning);
  }
  for (const statement of ['预计明年科技上涨 35%。', '科技板块回报为 43.57%。', '股票上涨百分之二十。', '这是 2008 年。']) {
    content = JSON.stringify({ ...raw, summary: statement });
    await assert.rejects(requestDecision({ endpoint: 'https://audit-provider.example/v1', model: 'audit-model', apiKey: TEST_KEY }, context));
  }
  content = JSON.stringify({ ...raw, analysis: [{ ...raw.analysis[0], observation: '原文未记载的事实' }] });
  await assert.rejects(requestDecision({ endpoint: 'https://audit-provider.example/v1', model: 'audit-model', apiKey: TEST_KEY }, context));
});

test('v0.9 audit: a browser-to-relay compatibility retry stays on one provider and happens at most once', async t => {
  browserLocation(t);
  const player = newGame(), rival = newGame('rival'), context = buildDecisionContext(player, rival);
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  let attempts = [], firstFailure, alwaysFail = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${PUBLIC_RELAY_ORIGIN}/api/ai`);
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    const incoming = JSON.parse(options.body);
    assert.equal(incoming.provider, 'efund');
    assert.equal(incoming.apiKey, TEST_KEY);
    return relay(relayRequest(incoming), async (target, forwarded) => {
      assert.equal(target, EXPECTED_PROVIDERS.efund);
      attempts.push(JSON.parse(forwarded.body));
      if (attempts.length === 1 || alwaysFail) return new Response(JSON.stringify(firstFailure.body), { status: firstFailure.status });
      return modelReply(JSON.stringify(V03_PACK));
    });
  });
  firstFailure = { status: 400, body: { error: { code: 'unsupported_parameter', param: 'temperature' } } };
  const pack = await requestDecision(config, context);
  assert.equal(pack.source, 'model');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].temperature, 0);
  assert.equal(attempts[0].response_format.type, 'json_object');
  assert.equal(attempts[1].temperature, undefined);
  assert.equal(attempts[1].response_format, undefined);
  assert.deepEqual(attempts[1].messages, attempts[0].messages);
  assert.equal(attempts[1].model, attempts[0].model);
  attempts = []; alwaysFail = true;
  await assert.rejects(requestDecision(config, context));
  assert.equal(attempts.length, 2);
  for (const failure of [
    { status: 401, body: { error: { code: 'unsupported_parameter', param: 'temperature' } } },
    { status: 403, body: { error: { message: 'temperature not supported' } } },
    { status: 429, body: { error: { message: 'response_format not supported' } } },
    { status: 400, body: { error: { message: 'invalid model' } } },
    { status: 400, body: { error: { code: 'unsupported_parameter', param: 'tools' } } },
    { status: 500, body: { error: { message: 'temperature not supported' } } },
  ]) {
    attempts = []; firstFailure = failure;
    await assert.rejects(requestDecision(config, context));
    assert.equal(attempts.length, 1, `${failure.status}: unrelated failures must require explicit player retry`);
  }
});

test('v0.9 audit: portraits may cite their executed years without altering old hashes or permitting invented dates and outcomes', async t => {
  const player = simulateStrategy('balanced', 3), rival = simulateStrategy('advisor', 3);
  const old = fallbackPersona(player, rival);
  // Captured from the earlier output/pages/ai.js before retrospective-date changes.
  assert.equal(old.contextId, 'persona3-940bade39a425ee5');
  const raw = structuredClone(old);
  raw.description = '在2007年至2009年这三个已完成回合中，你采用了分散配置。';
  raw.evidence = old.evidence.map(({ factId, year }) => ({ factId,
    interpretation: `在${year}年，实际配置覆盖多种金融资产。` }));
  let selected = raw;
  t.mock.method(globalThis, 'fetch', async () => modelReply(JSON.stringify(selected)));
  const config = { endpoint: 'https://audit-provider.example/v1', model: 'audit-model', apiKey: TEST_KEY };
  const portrait = await requestPersona(config, player, rival);
  assert.equal(portrait.contextId, old.contextId);
  assert.equal(portrait.description, raw.description);
  for (let index = 0; index < 3; index++) {
    assert.equal(portrait.evidence[index].year, old.evidence[index].year);
    assert.equal(portrait.evidence[index].quote, old.evidence[index].quote);
    assert.equal(portrait.evidence[index].interpretation, raw.evidence[index].interpretation);
  }
  assert.deepEqual(validatePersona(portrait, player, rival), portrait);
  for (const mutate of [
    value => { value.evidence[0].year = 2008; },
    value => { value.evidence[0].interpretation = '在2010年，实际配置覆盖多种金融资产。'; },
    value => { value.evidence[0].interpretation = '在2007年1月1日，实际配置覆盖多种金融资产。'; },
    value => { value.evidence[0].interpretation = '在二〇〇七年一月一日，实际配置覆盖多种金融资产。'; },
    value => { value.description = '在2040年继续了同样的选择。'; },
    value => { value.description = '未来回报为30%。'; },
    value => { value.title = '焦虑症人格'; },
    value => { value.evidence[0].factId = 'player-99-allocation'; },
    value => { value.evidence[0].quote = '并不存在的配置记录'; },
  ]) {
    selected = structuredClone(raw); mutate(selected);
    await assert.rejects(requestPersona(config, player, rival));
  }
});

test('v0.9 audit: relay errors use exact safe categories without reflecting credentials or retrying', async t => {
  browserLocation(t);
  const player = newGame(), rival = newGame('rival'), context = buildDecisionContext(player, rival);
  const approved = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  let failure, calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ error: {
      code: failure.code, message: `private-body ${TEST_KEY} https://secret-host.example/path <script>`,
    } }), { status: failure.status });
  });
  for (const [code, expected, status = 502] of [
    ['upstream_connection', 'NETWORK'], ['invalid_response', 'RESPONSE_FORMAT'],
    ['response_too_large', 'RESPONSE_FORMAT'], ['unsafe_response', 'SECRET_ECHO'],
    ['redirect_rejected', 'PATH'], ['upstream_error', 'UPSTREAM'], ['timeout', 'TIMEOUT', 504],
    ['timeout', 'UPSTREAM', 502],
    ['unsafe_response', 'AUTH', 401], ['invalid_response', 'PERMISSION', 403], ['timeout', 'QUOTA', 429],
    ['upstream_connection<script>', 'UPSTREAM'], [`upstream_connection${TEST_KEY}`, 'UPSTREAM'],
    ['arbitrary-untrusted-code', 'UPSTREAM'],
  ]) {
    calls = 0; failure = { code, status };
    await assert.rejects(requestDecision(approved, context), error => {
      assert.equal(error.code, expected, code);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /private-body|v09-audit-secret|secret-host|<script>|arbitrary-untrusted-code/);
      return true;
    });
    assert.equal(calls, 1, `${code} must require an explicit retry`);
  }
  failure = { code: 'invalid_response', status: 502 }; calls = 0;
  await assert.rejects(requestDecision({ ...approved, endpoint: 'https://custom-provider.example/v1' }, context),
    error => error.code === 'UPSTREAM' && !error.message.includes(TEST_KEY));
  assert.equal(calls, 1, 'custom upstream codes do not claim to be trusted relay diagnoses');
});

test('v0.9 audit: 520, header reset and parameter compatibility share exactly three total calls in every mixed order', async t => {
  browserLocation(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const context = buildDecisionContext(newGame(), newGame('rival'));
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  let script, calls, notices;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), signal: options.signal });
    const step = script[calls.length - 1];
    if (step === 'success') return modelReply(JSON.stringify(V03_PACK));
    const error = step === 'parameter' ? { code: 'unsupported_parameter', parameter: 'temperature' }
      : step === 'reset' ? { code: 'upstream_connection', upstreamReason: 'connection_reset', upstreamPhase: 'headers' }
      : { code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json' };
    return new Response(JSON.stringify({ error }), { status: step === 'parameter' ? 400 : 502 });
  });
  for (const sequence of [
    ['gateway', 'parameter', 'success'], ['parameter', 'gateway', 'success'],
    ['gateway', 'reset', 'success'], ['reset', 'gateway', 'success'],
    ['reset', 'parameter', 'success'], ['parameter', 'reset', 'success'],
    ['gateway', 'reset', 'parameter'], ['gateway', 'parameter', 'reset'],
    ['reset', 'gateway', 'parameter'], ['reset', 'parameter', 'gateway'],
    ['parameter', 'gateway', 'reset'], ['parameter', 'reset', 'gateway'],
    ['reset', 'reset', 'reset'],
    ['gateway', 'gateway', 'gateway'], ['parameter', 'parameter'],
  ]) {
    script = sequence; calls = []; notices = [];
    const pending = requestDecision(config, context, { onRetry(value) {
      assert.equal(calls.length, value.attempt, 'notify only an actually invoked fetch');
      notices.push(value);
      // UI observer failure must not reset or alter the recovery budget.
      throw new Error('observer-private-error');
    } });
    let result, failure;
    const observed = pending.then(value => { result = value; }, error => { failure = error; });
    await flush();
    for (let tick = 0; tick < 4 && !result && !failure; tick++) {
      t.mock.timers.tick(2000); await flush();
    }
    await observed;
    assert.equal(calls.length, sequence.length);
    assert.equal(notices.length, sequence.length - 1);
    assert.deepEqual(notices.map(value => value.attempt), sequence.length === 3 ? [2, 3] : [2]);
    for (const value of notices) {
      assert.deepEqual(Object.keys(value).sort(), ['attempt', 'maxAttempts', 'reason']);
      assert.equal(value.maxAttempts, 3);
      assert.ok(['gateway', 'parameter'].includes(value.reason));
      assert.equal(Object.isFrozen(value), true);
    }
    for (const call of calls) {
      assert.equal(call.url, `${PUBLIC_RELAY_ORIGIN}/api/ai`);
      assert.equal(call.signal, calls[0].signal);
      assert.equal(call.body.provider, 'efund');
      assert.equal(call.body.apiKey, TEST_KEY);
      assert.equal(call.body.request.model, calls[0].body.request.model);
      assert.deepEqual(call.body.request.messages, calls[0].body.request.messages);
    }
    if (sequence.at(-1) === 'success') {
      assert.equal(result.source, 'model');
      assert.equal(result.contextId, V03_PACK.contextId);
      assert.equal(JSON.stringify(result).includes('maxAttempts'), false);
    } else assert.ok(failure, 'exhaustion or repeated optional-parameter failure must reject');
    t.mock.timers.tick(60000); await flush();
    assert.equal(calls.length, sequence.length, 'no latent fourth request is allowed');
  }
});

test('v0.9 audit: gateway recovery excludes all lookalike diagnostics, other providers, direct calls and credential echoes', async t => {
  browserLocation(t);
  const context = buildDecisionContext(newGame(), newGame('rival'));
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  const valid = { code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json' };
  let selected, calls;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (selected.thrown) throw new TypeError('private network failure');
    let body = JSON.stringify({ error: selected.error });
    if (selected.encoded) body = body.replaceAll(TEST_KEY,
      [...TEST_KEY].map(character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
    return new Response(body, { status: selected.status ?? 502 });
  });
  const cases = [
    ...[400, 401, 403, 429, 500, 520].map(status => ({ status, error: valid })),
    ...[
      { code: 'upstream_error<script>' }, { code: 'upstream_connection' },
      { upstreamStatus: '520' }, { upstreamStatus: 500 }, { upstreamReason: 'unknown' },
      { upstreamReason: 'non_json<script>' }, { message: TEST_KEY },
    ].map(patch => ({ error: { ...valid, ...patch } })),
    { encoded: true, error: { ...valid, message: TEST_KEY } },
    { error: { code: 'upstream_error' } }, { error: null }, { thrown: true },
    { endpoint: 'https://api.openai.com/v1/chat/completions', error: valid },
    { endpoint: 'https://custom-provider.example/v1', error: valid },
  ];
  for (const candidate of cases) {
    selected = candidate; calls = 0;
    await assert.rejects(requestDecision({ ...config, endpoint: candidate.endpoint || config.endpoint }, context), error => {
      assert.doesNotMatch(error.message, /v09-audit-secret|private network|<script>/);
      return true;
    });
    assert.equal(calls, 1, JSON.stringify(candidate));
  }
});

test('v0.9 audit: EFUND header resets travel through the real relay and retry only after the first backoff', async t => {
  browserLocation(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const logs = [];
  t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const calls = [], upstreamBodies = [], notices = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return relay(new Request(url, { ...options, headers: { ...options.headers, Origin: PAGES_ORIGIN } }), async (target, sent) => {
      assert.equal(target, EXPECTED_PROVIDERS.efund);
      upstreamBodies.push(JSON.parse(sent.body));
      if (upstreamBodies.length === 1)
        throw new TypeError(`private runtime error ${TEST_KEY}`, { cause: { code: 'UND_ERR_SOCKET' } });
      return modelReply(JSON.stringify(V03_PACK));
    });
  });
  const player = newGame(), rival = newGame('rival');
  const pending = requestDecision({ endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY },
    buildDecisionContext(player, rival), { onRetry: value => notices.push(value) });
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(upstreamBodies.length, 1, 'one client fetch produces exactly one upstream request');
  t.mock.timers.tick(999); await flush();
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1); await flush();
  const pack = await pending;
  assert.equal(pack.source, 'model');
  assert.deepEqual(validateDecisionPack(pack, player, rival), pack);
  assert.equal(calls.length, 2);
  assert.equal(upstreamBodies.length, 2);
  assert.deepEqual(upstreamBodies[0], upstreamBodies[1]);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.equal(calls[0].options.signal, calls[1].options.signal);
  assert.deepEqual(notices, [{ attempt: 2, maxAttempts: 3, reason: 'gateway' }]);
  assert.deepEqual(logs.map(({ event, reason, phase }) => ({ event, reason, phase })),
    [{ event: 'ai_transport_failure', reason: 'connection_reset', phase: 'headers' }]);
  assert.doesNotMatch(JSON.stringify(logs), /v09-audit-secret|private runtime/);
});

test('v0.9 audit: reset recovery requires exact trusted fields and refuses body resets, direct errors and secret echoes', async t => {
  browserLocation(t);
  const location = globalThis.location;
  const context = buildDecisionContext(newGame(), newGame('rival'));
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  const valid = { code: 'upstream_connection', upstreamReason: 'connection_reset', upstreamPhase: 'headers' };
  const cases = [
    ...[200, 400, 401, 403, 404, 429, 500, 503, 504, 520].map(status => ({ status, error: valid })),
    ...[
      { code: 'upstream_error' }, { code: 'upstream_connection<script>' },
      { upstreamReason: 'dns' }, { upstreamReason: 'connect_timeout' }, { upstreamReason: 'tls' },
      { upstreamReason: 'connection_refused' }, { upstreamReason: 'unknown' }, { upstreamReason: 'timeout' },
      { upstreamReason: 'connection_reset<script>' }, { upstreamReason: null },
      { upstreamPhase: 'body' }, { upstreamPhase: 'HEADERS' }, { upstreamPhase: 'headers<script>' },
      { upstreamPhase: null }, { upstreamPhase: undefined }, { upstreamPhase: 0 },
      { message: TEST_KEY },
    ].map(patch => ({ error: { ...valid, ...patch } })),
    { error: { code: 'upstream_connection' } }, { error: null },
    { error: { ...valid, message: TEST_KEY }, encoded: true },
    { error: valid, endpoint: 'https://api.openai.com/v1/chat/completions' },
    { error: valid, endpoint: 'https://custom-provider.example/v1' },
    { error: valid, directEFUND: true }, { thrown: true },
  ];
  let selected, calls = 0, notices = [];
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (selected.thrown) throw new TypeError(`private network ${TEST_KEY}`, { cause: { code: 'ECONNRESET' } });
    let body = JSON.stringify({ error: selected.error });
    if (selected.encoded) body = body.replaceAll(TEST_KEY,
      [...TEST_KEY].map(character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
    return new Response(body, { status: selected.status ?? 502 });
  });
  for (const candidate of cases) {
    selected = candidate; calls = 0; notices = [];
    if (candidate.directEFUND) delete globalThis.location;
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: location });
    await assert.rejects(requestDecision({ ...config, endpoint: candidate.endpoint || config.endpoint }, context,
      { timeoutMs: 20, onRetry: value => notices.push(value) }), error => {
      if (candidate.status !== 504)
        assert.notEqual(error.code, 'TIMEOUT', 'excluded failures must reject immediately instead of scheduling a retry');
      assert.doesNotMatch(error.message, /v09-audit-secret|private network|<script>/);
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(notices, []);
  }
});

test('v0.9 audit: header-reset backoff remains cancellable and shares the original sixty-second deadline', async t => {
  browserLocation(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  let calls = 0, slow = false, notices = [];
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (slow) await new Promise(resolve => setTimeout(resolve, 59000));
    return new Response(JSON.stringify({ error: {
      code: 'upstream_connection', upstreamReason: 'connection_reset', upstreamPhase: 'headers',
    } }), { status: 502 });
  });
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  const context = buildDecisionContext(newGame(), newGame('rival'));
  const controller = new AbortController();
  const cancelled = assert.rejects(requestDecision(config, context,
    { signal: controller.signal, onRetry: value => notices.push(value) }), error => error.code === 'CANCELLED');
  await flush(); controller.abort(); await cancelled;
  t.mock.timers.tick(60000); await flush();
  assert.equal(calls, 1); assert.deepEqual(notices, []);
  calls = 0; slow = true; notices = [];
  const timed = assert.rejects(requestDecision(config, context,
    { onRetry: value => notices.push(value) }), error => error.code === 'TIMEOUT');
  await flush(); t.mock.timers.tick(59000); await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1000); await flush(); await timed;
  assert.equal(calls, 1);
  assert.deepEqual(notices, []);
});

test('v0.9 audit: cancellation and the original sixty-second deadline stop gateway backoff without a new call', async t => {
  browserLocation(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const context = buildDecisionContext(newGame(), newGame('rival'));
  const config = { endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY };
  const failure = () => new Response(JSON.stringify({ error: {
    code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json',
  } }), { status: 502 });
  let calls = 0, slow = false, notices = [];
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (slow) await new Promise(resolve => setTimeout(resolve, 59000));
    return failure();
  });
  const controller = new AbortController();
  const cancelled = requestDecision(config, context, { signal: controller.signal, onRetry: value => notices.push(value) });
  const cancellation = assert.rejects(cancelled, error => error.code === 'CANCELLED');
  await flush();
  controller.abort();
  await cancellation;
  t.mock.timers.tick(60000); await flush();
  assert.equal(calls, 1);
  assert.deepEqual(notices, []);

  calls = 0; slow = true; notices = [];
  const timed = requestDecision(config, context, { onRetry: value => notices.push(value) });
  const timeout = assert.rejects(timed, error => error.code === 'TIMEOUT');
  await flush();
  t.mock.timers.tick(59000); await flush();
  assert.equal(calls, 1);
  t.mock.timers.tick(1000); await flush();
  await timeout;
  assert.equal(calls, 1, 'the initial call plus backoff exhausts the one shared deadline');
  assert.deepEqual(notices, [], 'a cancelled wait must not claim a second attempt occurred');
});

const streamFrame = (delta, finish = null) => JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] });
const streamBytes = (text, { pieceSize = 17, close = true, onCancel = () => {} } = {}) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += pieceSize) controller.enqueue(bytes.slice(offset, offset + pieceSize));
      if (close) controller.close();
    }, cancel: onCancel,
  });
};
const eventResponse = stream => new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });

test('v0.9 audit: browser-to-EFUND streaming preserves complete model decisions across UTF-8 and SSE frame boundaries', async t => {
  browserLocation(t);
  const player = newGame(), rival = newGame('rival'), context = buildDecisionContext(player, rival);
  const raw = structuredClone(V03_PACK); raw.summary = '依照各自预算，分开核对双方计划。🙂';
  const content = JSON.stringify(raw);
  let lineEnding, terminal, closed, calls;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${PUBLIC_RELAY_ORIGIN}/api/ai`);
    const browserPayload = JSON.parse(options.body);
    assert.equal(browserPayload.request.stream, false);
    return relay(new Request(url, { ...options, headers: { ...options.headers, Origin: PAGES_ORIGIN } }), async (endpoint, upstream) => {
      calls++;
      assert.equal(endpoint, EXPECTED_PROVIDERS.efund);
      const sent = JSON.parse(upstream.body);
      assert.equal(sent.stream, true);
      assert.deepEqual({ ...sent, stream: false }, browserPayload.request);
      const frames = [`: keepalive${lineEnding}${lineEnding}`,
        `data: {"choices": [${lineEnding}data: {"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}${lineEnding}${lineEnding}`];
      for (let offset = 0; offset < content.length; offset += 13) frames.push(`data: ${streamFrame({ content: content.slice(offset, offset + 13) })}${lineEnding}${lineEnding}`);
      frames.push(`data: ${streamFrame({}, 'stop')}${lineEnding}${lineEnding}`);
      if (terminal) frames.push(`data: [DONE]${lineEnding}${lineEnding}`);
      return eventResponse(streamBytes(frames.join(''), { pieceSize: 7, close: !terminal, onCancel: () => { closed = true; } }));
    });
  });
  for (const [separator, done] of [['\n', true], ['\r\n', true], ['\r', false]]) {
    lineEnding = separator; terminal = done; closed = false; calls = 0;
    const result = await requestDecision({ endpoint: EXPECTED_PROVIDERS.efund, model: 'audit-model', apiKey: TEST_KEY }, context);
    assert.equal(calls, 1);
    assert.equal(result.source, 'model');
    assert.equal(result.contextId, V03_PACK.contextId);
    assert.equal(result.summary, raw.summary);
    assert.deepEqual(result.playerDecision, V03_PACK.playerDecision);
    assert.deepEqual(result.rivalDecision, V03_PACK.rivalDecision);
    if (terminal) assert.equal(closed, true, '[DONE] closes an otherwise persistent response');
  }
});

test('v0.9 audit: streamed truncation, tool output, credential fragments and either size limit never become a successful response', async () => {
  const complete = `data: ${streamFrame({ content: JSON.stringify(V03_PACK) })}\n\n`;
  const stop = `data: ${streamFrame({}, 'stop')}\n\ndata: [DONE]\n\n`;
  const fragments = [TEST_KEY.slice(0, 4), TEST_KEY.slice(4, 10), TEST_KEY.slice(10)];
  const escaped = fragments.map(part => {
    const unicode = [...part].map(character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
    return `data: ${streamFrame({ content: part }).replace(JSON.stringify(part), `"${unicode}"`)}\n\n`;
  }).join('');
  const cases = [
    [complete, 'invalid_response'],
    ...['length', 'content_filter', 'tool_calls', 'unrecognized'].map(reason =>
      [complete + `data: ${streamFrame({}, reason)}\n\ndata: [DONE]\n\n`, 'invalid_response']),
    [complete + `data: ${streamFrame({ tool_calls: [{ function: { name: 'private_tool' } }] })}\n\n` + stop, 'invalid_response'],
    [complete + `data: ${streamFrame({ function_call: { name: 'private_tool' } })}\n\n` + stop, 'invalid_response'],
    ['event: error\ndata: {"message":"private provider body"}\n\n', 'upstream_error'],
    [escaped + stop, 'unsafe_response'],
    [`data: ${streamFrame({ content: '中'.repeat(70000) })}\n\n` + stop, 'response_too_large'],
    [`data: ${streamFrame({ content: '"'.repeat(110000) })}\n\n` + stop, 'response_too_large'],
    [':' + 'x'.repeat(2000000), 'response_too_large'],
  ];
  for (const [wire, code] of cases) {
    let calls = 0;
    const response = await relay(relayRequest(), async () => { calls++; return eventResponse(streamBytes(wire, { pieceSize: 65536 })); });
    assert.equal(calls, 1);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { error: { code } });
    assert.doesNotMatch(body, /v09-audit-secret|private provider body|private_tool/);
  }
  let calls = 0;
  const other = await relay(relayRequest(envelope('openai')), async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).stream, false);
    return eventResponse(streamBytes(complete + stop));
  });
  assert.equal(calls, 1);
  assert.equal(other.status, 502, 'OpenAI must honor the requested non-streaming JSON contract');
  assert.deepEqual(await other.json(), { error: { code: 'invalid_response', upstreamStatus: 200, upstreamReason: 'non_json' } });
});

test('v0.9 audit: nullable streaming placeholders are not mistaken for tools or a non-assistant role', async t => {
  const logs = [];
  t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const content = JSON.stringify(V03_PACK);
  const record = { tool_calls: null, function_call: null, choices: [{ index: 0,
    tool_calls: [], function_call: null, finish_reason: null,
    delta: { role: null, tool_calls: null, function_call: null, content },
  }] };
  const terminal = { choices: [{ index: 0, delta: { role: null, tool_calls: [], function_call: null }, finish_reason: 'stop' }] };
  const makeWire = value => `data: ${JSON.stringify(value)}\n\ndata: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`;
  const response = await relay(relayRequest(), async () => {
    const upstream = eventResponse(streamBytes(makeWire(record)));
    upstream.headers.set('X-AI-Stream-Reason', 'PRIVATE-STREAM-DIAG');
    return upstream;
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-AI-Stream-Reason'), null, 'upstream diagnostic headers are not reflected');
  assert.equal((await response.json()).choices[0].message.content, content);
  for (const patch of [
    { tool_calls: [{ function: { name: 'PRIVATE-STREAM-DIAG' } }] }, { tool_calls: {} },
    { function_call: { name: 'PRIVATE-STREAM-DIAG' } }, { function_call: 'PRIVATE-STREAM-DIAG' }, { role: 'system' }, { role: 0 },
  ]) {
    const invalid = structuredClone(record);
    Object.assign(invalid.choices[0].delta, patch);
    const rejected = await relay(relayRequest(), async () => eventResponse(streamBytes(makeWire(invalid))));
    assert.equal(rejected.status, 502, JSON.stringify(patch));
    assert.equal(rejected.headers.get('X-AI-Stream-Reason'), Object.hasOwn(patch, 'role') ? 'delta_role' : 'tool_call');
    assert.equal((await rejected.json()).error.code, 'invalid_response');
  }
  assert.equal(logs.length, 6);
  for (const log of logs) {
    assert.deepEqual(Object.keys(log).sort(), ['code', 'elapsedMs', 'event', 'reason']);
    assert.equal(log.event, 'ai_stream_failure');
    assert.equal(log.code, 'invalid_response');
    assert.ok(['tool_call', 'delta_role'].includes(log.reason));
    assert.doesNotMatch(JSON.stringify(log), /PRIVATE-STREAM-DIAG|v09-audit-secret/);
  }
});

test('v0.9 audit: cancellation and the original relay deadline terminate an unfinished SSE body without committing partial content', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  for (const manual of [true, false]) {
    const controller = new AbortController();
    let cancelled = false, calls = 0;
    const pending = relay(relayRequest(envelope(), PAGES_ORIGIN, { signal: controller.signal }), async () => {
      calls++;
      return eventResponse(streamBytes(`data: ${streamFrame({ content: JSON.stringify(V03_PACK) })}\n\n`, {
        close: false, onCancel: () => { cancelled = true; },
      }));
    });
    await flush();
    if (manual) controller.abort(); else t.mock.timers.tick(55000);
    const response = await pending;
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: { code: 'timeout', upstreamReason: 'timeout', upstreamPhase: 'body' } });
    assert.equal(cancelled, true);
    assert.equal(calls, 1);
  }
});

test('v1 audit: relay enforces provider-specific token caps and non-thinking mode before spending upstream', async () => {
  for (const [provider, model, field] of [
    ['deepseek', 'deepseek-flash', 'max_tokens'], ['openai', 'gpt-4.1-mini', 'max_completion_tokens'],
    ['efund', 'gpt-4o', 'max_completion_tokens'], ['efund', 'o3-mini', 'max_completion_tokens'],
    ['efund', 'deepseek-flash', 'max_tokens'],
  ]) {
    const other = field === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
    for (const cap of [1, 2500, 3500]) {
      const input = envelope(provider); input.request.model = model; input.request[field] = cap;
      let calls = 0;
      const result = await relay(relayRequest(input), async (_url, init) => {
        calls++; const body = JSON.parse(init.body);
        assert.equal(body[field], cap); assert.equal(body[other], undefined);
        assert.deepEqual(body.thinking, provider === 'deepseek' ? { type: 'disabled' } : undefined);
        return modelReply('{}');
      });
      assert.equal(result.status, 200); assert.equal(calls, 1);
    }
    for (const invalid of [
      { [field]: 0 }, { [field]: 3501 }, { [field]: 2.5 }, { [field]: '2500' }, { [field]: null },
      { [other]: 2500 }, { [field]: 2500, [other]: 2500 },
      { thinking: { type: 'enabled' } }, { thinking: { type: 'disabled', budget: 99999 } },
    ]) {
      const input = envelope(provider); input.request = { ...input.request, model, ...invalid };
      let calls = 0;
      const result = await relay(relayRequest(input), async () => { calls++; return modelReply('{}'); });
      assert.equal(result.status, 400, JSON.stringify({ provider, invalid })); assert.equal(calls, 0);
    }
  }
});
