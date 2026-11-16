import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_VERSION } from '../dist/data.js';
import { newGame, settleYear, simulateStrategy } from '../dist/engine.js';
import { buildDecisionContext, fallbackDecisionPack, validateDecisionPack, validateApiConfig, requestDecision,
  fallbackPersona, requestPersona, validatePersona } from '../dist/ai.js';
import { restoreDuel } from '../dist/session.js';
import { relay } from '../worker/handler.js';
import { PROVIDERS, PUBLIC_RELAY_ORIGIN } from '../dist/providers.js';

const PAGES_ORIGIN = 'https://liaojs2025.github.io';
const TEST_KEY = 'v09-audit-secret';
const EXPECTED_PROVIDERS = {
  efund: 'https://aigc.efunds.com.cn/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  'deepseek-v1': 'https://api.deepseek.com/v1/chat/completions',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  'dashscope-intl': 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  moonshot: 'https://api.moonshot.cn/v1/chat/completions',
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
      assert.equal(options.headers.Accept, 'application/json');
      assert.equal(options.headers['Accept-Encoding'], 'identity');
      assert.equal(Object.hasOwn(options.headers, 'Cookie'), false);
      const body = JSON.parse(options.body);
      assert.equal(body.apiKey, undefined);
      assert.equal(body.provider, undefined);
      assert.equal(Object.hasOwn(body, 'max_tokens'), false);
      assert.equal(Object.hasOwn(body, 'max_completion_tokens'), false);
      assert.equal(options.body.includes(TEST_KEY), false);
      return new Response('{"choices":[]}');
    });
    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), PAGES_ORIGIN);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  for (const provider of ['__proto__', 'constructor', 'https://169.254.169.254/', 'openai.attacker.example']) {
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
  assert.deepEqual(await thrown.json(), { error: { code: 'upstream_connection' } });
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
  assert.equal(validateApiConfig({ endpoint: 'https://open.bigmodel.cn', model: 'glm-4-flash', apiKey: TEST_KEY }).endpoint,
    EXPECTED_PROVIDERS.zhipu);
  for (const endpoint of ['https://user:password@api.openai.com/v1', 'http://api.openai.com/v1',
    `https://api.openai.com/v1?x=${TEST_KEY}`, 'https://api.openai.com/v1?api_key=another-secret',
    'https://api.openai.com/v1#hidden', 'javascript:alert(1)']) {
    assert.throws(() => validateApiConfig({ endpoint, model: 'audit-model', apiKey: TEST_KEY }));
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
  const config = { endpoint: EXPECTED_PROVIDERS.openai, model: 'audit-model', apiKey: TEST_KEY };
  let attempts = [], firstFailure, alwaysFail = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${PUBLIC_RELAY_ORIGIN}/api/ai`);
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    const incoming = JSON.parse(options.body);
    assert.equal(incoming.provider, 'openai');
    assert.equal(incoming.apiKey, TEST_KEY);
    return relay(relayRequest(incoming), async (target, forwarded) => {
      assert.equal(target, EXPECTED_PROVIDERS.openai);
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
    value => { value.evidence[0].interpretation = '在2008年，实际配置覆盖多种金融资产。'; },
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
