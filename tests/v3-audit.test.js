import test from 'node:test';
import assert from 'node:assert/strict';
import { YEARS, DATA_VERSION } from '../dist/data.js';
import { ASSET_KEYS, newGame, defaultDecision, settleYear, netWorth, retailComparison } from '../dist/engine.js';
import { buildDecisionContext, requestDecision, fallbackDecisionPack, validateDecisionPack,
  validateApiConfig, requestPersona, fallbackPersona, validatePersona } from '../dist/ai.js';
import { settleDuel, restoreDuel } from '../dist/session.js';
import { relay } from '../worker/handler.js';
import { PUBLIC_RELAY_ORIGIN } from '../dist/providers.js';

const config = { endpoint: 'https://audit-provider.example/v1/chat/completions', model: 'audit-model', apiKey: 'audit-secret' };
const weights = key => Object.fromEntries(ASSET_KEYS.map(k => [k, k === key ? 100 : 0]));
const household = () => ({ player: newGame(), rival: newGame('rival') });
const answer = (context, player, rival) => ({
  analysis: [{ signalId: context.signals[0].id, observation: context.signals[0].text.slice(0, 200),
    reasoning: '政策与家庭需求需要分别考虑。', risk: '消息无法排除未来市场波动。' }],
  playerDecision: { ...defaultDecision(player), allocation: weights('cash') },
  rivalDecision: { ...defaultDecision(rival), allocation: weights('tech') },
  summary: '按各自预算执行，家庭收入与投资回报分别观察。',
});
const response = raw => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(raw) } }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } });
const saveOf = duel => ({ dataVersion: DATA_VERSION, state: duel.player, rivalState: duel.rival,
  agentRounds: duel.rounds, agentPack: duel.pack || null, persona: null });
const modelPack = (player, rival) => { const context = buildDecisionContext(player, rival);
  return { ...answer(context, player, rival), source: 'model', model: 'audit-model', stage: context.stage, contextId: context.contextId }; };
const allStrings = value => typeof value === 'string' ? [value] : value && typeof value === 'object'
  ? Object.values(value).flatMap(allStrings) : [];
const relayBody = () => ({ provider: 'efund', apiKey: 'audit-secret', request: { model: 'audit-model', temperature: 0, stream: false,
  response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'anonymous financial case' }, { role: 'user', content: '{}' }] } });
const relayRequest = (overrides = {}) => new Request(`${PUBLIC_RELAY_ORIGIN}/api/ai`, {
  method: 'POST', headers: { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' },
  body: JSON.stringify(relayBody()), ...overrides,
});

test('v3 audit: relay forwards request-scoped credentials only to the selected fixed gateway and never caches them', async () => {
  let captured;
  const result = await relay(relayRequest(), async (url, options) => {
    captured = { url, options };
    return new Response('{"choices":[]}', { headers: { 'Set-Cookie': 'upstream=private' } });
  });
  assert.equal(result.status, 200);
  assert.equal(captured.url, 'https://aigc.efunds.com.cn/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer audit-secret');
  assert.deepEqual(Object.keys(captured.options.headers).sort(), ['Authorization', 'Cache-Control', 'Content-Type']);
  assert.equal(captured.options.redirect, 'manual');
  assert.equal(Object.hasOwn(captured.options, 'cache'), false);
  assert.equal(captured.options.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Set-Cookie'), null);
  assert.equal(captured.options.body.includes('audit-secret'), false);
  assert.equal(Object.hasOwn(JSON.parse(captured.options.body), 'max_tokens'), false);
  assert.equal(Object.hasOwn(JSON.parse(captured.options.body), 'max_completion_tokens'), false);
  assert.equal((await result.text()).includes('audit-secret'), false);
});

test('v3 audit: relay avoids unsupported Worker options and preserves the required fetch binding', async () => {
  let captured;
  async function legacyRuntimeFetch(url, options) {
    if (Object.hasOwn(options, 'cache')) throw new Error('The cache field on RequestInitializerDict is not implemented in fetch');
    if (options.redirect === 'error') throw new TypeError('Unsupported redirect mode: error');
    if (this !== globalThis) throw new TypeError('Illegal invocation: incorrect this');
    captured = { url, options };
    return new Response('{"choices":[]}');
  }
  const result = await relay(relayRequest(), legacyRuntimeFetch);
  assert.equal(result.status, 200);
  assert.equal(captured.url, 'https://aigc.efunds.com.cn/v1/chat/completions');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer audit-secret');
  assert.equal(captured.options.headers['Cache-Control'], 'no-store');
  assert.equal(captured.options.redirect, 'manual');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
});

test('v3 audit: upstream redirects are cancelled without following Location or forwarding credentials', async () => {
  for (const status of [300, 301, 302, 303, 307, 308, 399]) {
    let calls = 0, cancelled = false;
    const upstream = async (url, options) => {
      calls++;
      assert.equal(url, 'https://aigc.efunds.com.cn/v1/chat/completions');
      assert.equal(options.redirect, 'manual');
      const body = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('audit-secret private upstream body')); },
        cancel() { cancelled = true; },
      });
      return new Response(body, { status, headers: {
        Location: 'https://attacker.example/collect?key=audit-secret',
        'Set-Cookie': 'credential=audit-secret',
      } });
    };
    const result = await relay(relayRequest(), upstream);
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('Location'), null);
    assert.equal(result.headers.get('Set-Cookie'), null);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), { error: { code: 'redirect_rejected' } });
  }
});

test('v3 audit: relay rejects foreign origins, caller-selected targets, invalid payloads and oversized bodies', async () => {
  let calls = 0;
  const upstream = async () => { calls++; throw Error('must not forward'); };
  const ordinaryHeaders = { Origin: 'https://liaojs2025.github.io', 'Content-Type': 'application/json' };
  const cases = [
    [{ method: 'GET', body: undefined }, 405],
    [{ headers: { ...ordinaryHeaders, Origin: 'https://evil.example' } }, 403],
    [{ headers: { ...ordinaryHeaders, Origin: 'null' } }, 403],
    [{ body: JSON.stringify({ ...relayBody(), apiKey: '' }) }, 401],
    [{ headers: { ...ordinaryHeaders, 'Content-Type': 'text/plain' } }, 415],
    [{ body: JSON.stringify({ ...relayBody(), target: 'http://169.254.169.254/latest/meta-data/' }) }, 400],
    [{ body: JSON.stringify({ ...relayBody(), tools: [{ type: 'web_search' }] }) }, 400],
    [{ body: 'invalid JSON' }, 400],
    [{ headers: { ...ordinaryHeaders, 'Content-Length': '160001' } }, 413],
    [{ body: 'x'.repeat(160001) }, 400],
  ];
  for (const [options, status] of cases) assert.equal((await relay(relayRequest(options), upstream)).status, status);
  assert.equal(calls, 0);
});

test('v3 audit: upstream failures, key echoes and oversized output cannot leak through the relay', async () => {
  for (const [index, upstream] of [
    async () => new Response('audit-secret upstream problem', { status: 500 }),
    async () => new Response('{"message":"audit-secret"}'),
    async () => new Response('{"message":"audit\\u002dsecret"}'),
    async () => new Response('not-json'),
    async () => new Response('x'.repeat(200001)),
    async () => { throw Error('audit-secret connection failure'); },
    async () => { throw Error('audit-secret cache field on RequestInitializerDict is not implemented'); },
    async () => { throw Error('audit-secret TLS certificate rejected'); },
    async () => { throw new TypeError('audit-secret Illegal invocation'); },
    async () => { throw new TypeError('audit-secret arbitraryPrivateValue <script> redirect unsupported https://private.example'); },
  ].entries()) {
    const result = await relay(relayRequest(), upstream);
    assert.equal(result.status, 502);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    const output = await result.text();
    assert.doesNotMatch(output, /audit-secret|arbitraryPrivateValue|<script>|private\.example/);
    const diagnostic = JSON.parse(output).error;
    if (index === 0 || index === 3) assert.deepEqual(diagnostic, {
      code: index === 0 ? 'upstream_error' : 'invalid_response',
      upstreamStatus: index === 0 ? 500 : 200, upstreamReason: 'non_json',
    });
    else assert.deepEqual(Object.keys(diagnostic), ['code']);
  }
});

test('v3 audit: aborted relay requests cannot deliver a late successful response', async () => {
  const controller = new AbortController();
  let finish;
  const pending = relay(relayRequest({ signal: controller.signal }), async (_url, options) => {
    assert.equal(options.signal.aborted, false);
    return new Promise(resolve => { finish = () => resolve(new Response('{"choices":[]}')); });
  });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  controller.abort(); finish();
  const result = await pending;
  assert.equal(result.status, 504);
  assert.doesNotMatch(await result.text(), /choices/);
});

test('v3 audit: exact approved gateways use the public relay; custom endpoints stay direct', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { protocol: 'https:', origin: 'https://game.example' } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  const { player, rival } = household();
  const context = buildDecisionContext(player, rival);
  const targets = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    targets.push(url); assert.equal(JSON.parse(options.body).target, undefined);
    return response(answer(context, player, rival));
  });
  await requestDecision({ ...config, endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions' }, context);
  await requestDecision(config, context);
  await requestDecision({ ...config, endpoint: 'https://aigc.efunds.com.cn.attacker.example/v1/chat/completions' }, context);
  assert.deepEqual(targets, [`${PUBLIC_RELAY_ORIGIN}/api/ai`, config.endpoint,
    'https://aigc.efunds.com.cn.attacker.example/v1/chat/completions']);
});

test('v3 audit: completed 2019–2025 market values match independently reviewed source tables', () => {
  // NYU table and issuer SEC annual bar charts, read independently of market-v3.js.
  // Columns: year, broad stock, Treasury, gold, XLK, XLY, XLV; percent units.
  const expected = [
    [2019, 31.21, 9.64, 19.08, 49.97, 28.42, 20.66],
    [2020, 18.02, 11.33, 24.17, 43.57, 29.58, 13.27],
    [2021, 28.47, -4.42, -3.75, 34.53, 27.83, 25.92],
    [2022, -18.04, -17.83, 0.55, -27.71, -36.24, -2.05],
    [2023, 26.06, 3.88, 13.26, 55.98, 39.64, 1.99],
    [2024, 24.88, -1.64, 25.96, 21.62, 26.45, 2.50],
    [2025, 17.78, 7.80, 66.22, 24.60, 7.37, 14.51],
  ];
  for (const [year, ...values] of expected) {
    const record = YEARS.find(item => item.year === year);
    assert.deepEqual(['stock', 'bond', 'gold', 'tech', 'consumer', 'health'].map(k => record.returns[k]), values.map(v => v / 100));
    assert.equal(record.dataKind, 'historical');
    assert.match(record.sectorProxy, /XLK.*XLY.*XLV/);
    assert.match(record.sectorProxy, /不同|断点/);
  }
  const final = YEARS.at(-1);
  assert.equal(final.year, 2026);
  assert.equal(final.dataKind, 'scenario');
  assert.match(final.dataLabel, /架空.*非历史.*非预测/);
  assert.match(final.reveal.text, /不是.*全年历史/);
  assert.match(final.event.label, /架空/);
});

test('v3 audit: actual AI request is a public whitelist with no hidden outcomes, dates, URLs or tools', async t => {
  const { player, rival } = household();
  const originals = Object.getOwnPropertyDescriptors(YEARS[0]);
  for (const key of ['returns', 'event', 'homeReturn', 'inflation', 'reveal', 'year']) {
    Object.defineProperty(YEARS[0], key, { configurable: true, get() { throw Error(`hidden read: ${key}`); } });
  }
  t.after(() => { for (const [key, descriptor] of Object.entries(originals)) Object.defineProperty(YEARS[0], key, descriptor); });
  const context = buildDecisionContext(player, rival);
  let capture;
  t.mock.method(globalThis, 'fetch', async (url, options) => { capture = { url, options }; return response(answer(context, player, rival)); });
  const pack = await requestDecision(config, context);
  assert.equal(pack.source, 'model');
  assert.equal(capture.url, config.endpoint);
  const request = JSON.parse(capture.options.body);
  const payload = JSON.parse(request.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['contextId', 'stage', 'signals', 'households', 'rules', 'outputSchema'].sort());
  assert.equal(request.tools, undefined);
  assert.equal(request.functions, undefined);
  assert.equal(capture.options.credentials, 'omit');
  assert.equal(capture.options.redirect, 'error');
  assert.equal(capture.options.referrerPolicy, 'no-referrer');
  assert.equal(capture.options.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(capture.options.body.includes(config.apiKey), false);
  assert.doesNotMatch(JSON.stringify(payload), /"(?:year|history|returns|event|reveal|sourceUrl|sourceVintage|publishedAt|asOf)"/);
  assert.ok(allStrings(payload).every(s => !/https?:\/\/|\b(?:19|20)\d{2}年?|iPhone|美联储|Apple/.test(s)));
  assert.equal(player.round, 0);
  assert.equal(rival.round, 0);
});

test('v3 audit: each stage uses anonymous opening summaries without touching hidden outcomes', () => {
  let { player, rival } = household();
  for (const year of YEARS) {
    const descriptors = Object.getOwnPropertyDescriptors(year);
    for (const key of ['returns', 'event', 'reveal', 'homeReturn', 'inflation', 'year', 'briefing', 'marketSignals']) {
      Object.defineProperty(year, key, { configurable: true, get() { throw Error(`unexpected context read ${key}`); } });
    }
    try {
      const context = buildDecisionContext(player, rival);
      assert.equal(context.signals.length, 3);
      for (const signal of context.signals) assert.doesNotMatch(signal.text, /\d|[%％]|https?:|iPhone|ChatGPT|美联储|苹果|亚马逊|雷曼/);
      assert.equal(context.households.player.balanceSheet.netWorth, netWorth(player));
    } finally {
      for (const [key, descriptor] of Object.entries(descriptors)) Object.defineProperty(year, key, descriptor);
    }
    player = settleYear(player, defaultDecision(player));
    rival = settleYear(rival, defaultDecision(rival));
  }
});

test('v3 audit: context mutation, cross-round packs and false rule provenance are rejected', async t => {
  const { player, rival } = household();
  const context = buildDecisionContext(player, rival);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('should not fetch'); });
  context.households.player.plannedAnnualIncome += 1;
  await assert.rejects(requestDecision(config, context), /上下文/);
  assert.equal(calls, 0);
  const pack = modelPack(player, rival);
  assert.throws(() => validateDecisionPack({ ...pack, stage: 2 }, player, rival), /不匹配/);
  assert.throws(() => validateDecisionPack({ ...pack, source: 'rules' }, player, rival), /规则/);
  const nextP = settleYear(player, defaultDecision(player));
  const nextR = settleYear(rival, defaultDecision(rival));
  assert.throws(() => validateDecisionPack(pack, nextP, nextR));
});

test('v3 audit: endpoint and model cannot persist credentials disguised as settings', () => {
  for (const endpoint of [
    'http://remote.example/v1/chat/completions', 'javascript:alert(1)',
    'https://user:pass@example.test/v1/chat/completions',
    `https://example.test/v1/chat/completions?foo=${config.apiKey}`,
    'https://example.test/v1/audit%2Dsecret/chat/completions',
    'https://example.test/v1/chat/completions#credential',
  ]) assert.throws(() => validateApiConfig({ ...config, endpoint }), endpoint);
  assert.throws(() => validateApiConfig({ ...config, model: `model-${config.apiKey}` }));
  assert.equal(validateApiConfig({ ...config, endpoint: 'http://127.0.0.1:8010/v1/chat/completions' }).apiKey, config.apiKey);
});

test('v3 audit: malformed, injected and unsupported model output never becomes a decision pack', async t => {
  const { player, rival } = household();
  const context = buildDecisionContext(player, rival);
  let payload;
  t.mock.method(globalThis, 'fetch', async () => response(payload));
  const mutations = [
    p => { p.playerDecision.allocation.cash = 99; },
    p => { p.rivalDecision.buyHome = 'true'; },
    p => { p.playerDecision.choiceId = 'future-choice'; },
    p => { p.analysis[0].observation = '尚未发生的市场必然大涨'; },
    p => { p.analysis[0].reasoning = '<img src=x onerror=alert(1)>'; },
    p => { p.summary = '明年将上涨百分之五十'; },
    p => { p.summary = '二零零八年会崩盘'; },
    p => { p.summary = '下一年上涨 50%'; },
    p => { p.analysis.push({ ...p.analysis[0] }); },
    p => { p.summary = `服务商回显 ${config.apiKey}`; },
  ];
  for (const mutate of mutations) {
    payload = answer(context, player, rival); mutate(payload);
    await assert.rejects(requestDecision(config, context), undefined, JSON.stringify(payload));
    assert.equal(player.round, 0); assert.equal(rival.round, 0);
  }
});

test('v3 audit: provider failures and credential echoes produce only safe errors', async t => {
  const { player, rival } = household();
  const context = buildDecisionContext(player, rival);
  let factory;
  t.mock.method(globalThis, 'fetch', async () => factory());
  const cases = [
    () => new Response(`<h1>${config.apiKey}</h1>`, { status: 401 }),
    () => new Response(config.apiKey, { status: 429 }),
    () => new Response(config.apiKey, { status: 500 }),
    () => { throw new TypeError(`network ${config.apiKey} ${config.endpoint}`); },
    () => new Response('not-json', { status: 200 }),
    () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: 'web_search' } }], content: '{}' } }] })),
    () => new Response('x'.repeat(200001)),
  ];
  for (const item of cases) {
    factory = item;
    await assert.rejects(requestDecision(config, context), error => {
      assert.equal(error.message.includes(config.apiKey), false);
      assert.equal(error.message.includes(config.endpoint), false);
      assert.doesNotMatch(error.message, /<h1>|not-json|network/);
      return true;
    });
  }
});

test('v3 audit: cancellation and timeout reject even when a provider resolves late', async t => {
  const { player, rival } = household();
  const context = buildDecisionContext(player, rival);
  let resolveResponse;
  t.mock.method(globalThis, 'fetch', async () => new Promise(resolve => { resolveResponse = resolve; }));
  const cancel = new AbortController();
  const pending = requestDecision(config, context, { signal: cancel.signal });
  cancel.abort();
  resolveResponse(response(answer(context, player, rival)));
  await assert.rejects(pending, /取消/);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(requestDecision(config, buildDecisionContext(player, rival), { timeoutMs: 10 }), /超时/);
});

test('v3 audit: duel settlement is atomic and saved opponent decisions are replayed before results', () => {
  const { player, rival } = household();
  const pack = modelPack(player, rival);
  const before = JSON.stringify({ player, rival, pack });
  const corrupt = structuredClone(pack); corrupt.rivalDecision.allocation.tech = 99;
  assert.throws(() => settleDuel(player, rival, corrupt, pack.playerDecision, []));
  assert.equal(JSON.stringify({ player, rival, pack }), before);
  const result = settleDuel(player, rival, pack, pack.playerDecision, []);
  assert.equal(result.player.round, 1); assert.equal(result.rival.round, 1);
  assert.notEqual(netWorth(result.player), netWorth(result.rival));
  assert.equal(player.round, 0); assert.equal(rival.round, 0);
  assert.deepEqual(restoreDuel(saveOf(result)).player, result.player);
  const saved = saveOf(result);
  const wrongRound = structuredClone(saved); wrongRound.rivalState = newGame('rival');
  assert.throws(() => restoreDuel(wrongRound));
  const forged = structuredClone(saved); forged.agentRounds[0].rivalDecision = defaultDecision(rival);
  assert.throws(() => restoreDuel(forged), /不一致/);
  const tampered = structuredClone(saved); tampered.agentRounds[0].contextId = 'changed';
  assert.throws(() => restoreDuel(tampered));
});

test('v3 audit: all twenty dual-account rounds remain independent, conserved and restorable', () => {
  let duel = { ...household(), rounds: [] };
  for (let i = 0; i < 20; i++) {
    const pack = fallbackDecisionPack(duel.player, duel.rival);
    const chosen = { ...defaultDecision(duel.player), allocation: weights(i % 2 ? 'gold' : 'cash') };
    duel = settleDuel(duel.player, duel.rival, pack, chosen, duel.rounds);
    for (const state of [duel.player, duel.rival]) {
      const h = state.history.at(-1);
      assert.ok(Math.abs(h.endNetWorth - h.startNetWorth - h.netContribution - h.investmentProfit) < 0.01);
      assert.equal(state.round, i + 1);
    }
  }
  assert.equal(duel.player.age, 50);
  assert.equal(duel.player.history.at(-1).year, 2026);
  assert.equal(duel.rival.history.at(-1).year, 2026);
  assert.deepEqual(restoreDuel(saveOf(duel)).rival, duel.rival);
});

test('v3 audit: simulated percentile uses portfolio rate alone and handles equal returns explicitly', () => {
  const returns = Object.fromEntries(ASSET_KEYS.map(key => [key, 0.05]));
  const base = { portfolioReturn: 0.05, returns, investedCapital: 100000 };
  assert.equal(retailComparison(base).pct, 50);
  assert.equal(retailComparison(base).strictBeatPct, 0);
  assert.equal(retailComparison({ ...base, portfolioReturn: 0.06 }).pct, 100);
  assert.equal(retailComparison({ ...base, portfolioReturn: 0.06 }).strictBeatPct, 100);
  assert.equal(retailComparison({ ...base, portfolioReturn: 0.04 }).pct, 0);
  const wealthy = { ...base, income: 10000000, endNetWorth: 20000000, investmentProfit: 5000000, fees: 9999 };
  assert.deepEqual(retailComparison(wealthy), retailComparison(base));
  assert.match(retailComparison(base).method, /不代表真实中国散户|教学假设/);
  assert.equal(retailComparison({ ...base, investedCapital: 0 }).pct, null);
});

test('v3 audit: wages arriving after an unfunded year do not create retrospective investment participation', () => {
  const state = newGame();
  state.assets = Object.fromEntries(ASSET_KEYS.map(key => [key, 0]));
  state.totalContribution = -100000;
  const after = settleYear(state, defaultDecision(state));
  const record = after.history[0];
  assert.equal(record.investedCapital, 0);
  assert.equal(record.liquidReturn, 0);
  assert.ok(after.assets.cash > 0);
  assert.equal(retailComparison(record).available, false);
  assert.equal(retailComparison(record).pct, null);
});

test('v3 audit: persona evidence describes executed holdings and rejects invented decisions or diagnoses', async t => {
  let player = newGame(), rival = newGame('rival');
  for (let i = 0; i < 3; i++) {
    player = settleYear(player, { ...defaultDecision(player), allocation: weights('tech'), rebalance: 'hold' });
    rival = settleYear(rival, defaultDecision(rival));
  }
  const fallback = fallbackPersona(player, rival);
  assert.equal(fallback.evidence.length, 3);
  assert.ok(fallback.evidence.every(item => item.quote.includes('科技 0.0%')));
  assert.ok(fallback.evidence.every(item => item.quote.includes('宽基')));
  let output = structuredClone(fallback);
  let sent;
  t.mock.method(globalThis, 'fetch', async (_url, options) => { sent = JSON.parse(JSON.parse(options.body).messages[1].content); return response(output); });
  const actual = await requestPersona(config, player, rival);
  assert.equal(actual.source, 'model');
  assert.equal(new Set(actual.evidence.map(item => item.year)).size, 3);
  assert.ok(sent.facts.every(fact => fact.year <= 2009));
  assert.deepEqual(validatePersona(actual, player, rival), actual);
  output = structuredClone(fallback);
  output.evidence = player.history.map((_record, index) => ({
    factId: `player-${index + 1}-choice`, interpretation: '这条实际生活选择记录了当时的取舍。',
  }));
  const bound = await requestPersona(config, player, rival);
  for (const [index, evidence] of bound.evidence.entries()) {
    assert.equal(evidence.year, player.history[index].year);
    assert.equal(evidence.account, 'player');
    assert.equal(evidence.quote, `实际人生选择：${player.history[index].choiceLabel}；本年花费 $${Math.round(player.history[index].choiceCost)}。`);
  }
  for (const mutate of [
    p => { p.evidence[0].quote = '实际选择了未来从未选过的计划'; },
    p => { p.evidence[0].year = 2026; },
    p => { p.evidence[0].account = 'rival'; },
    p => { p.evidence[0] = { factId: 'player-99-choice', interpretation: '这是一条未发生的选择。' }; },
    p => { p.description = '你被诊断为焦虑症'; },
    p => { p.title = '<svg onload=alert(1)>'; },
  ]) { output = structuredClone(fallback); mutate(output); await assert.rejects(requestPersona(config, player, rival)); }
});
