import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import * as data from '../dist/data.js';
import * as engine from '../dist/engine.js';
import * as media from '../dist/media.js';
import * as ai from '../dist/ai.js';
import * as session from '../dist/session.js';
import * as providers from '../dist/providers.js';
import { createDOMAdapter } from './dom-adapter.js';

// Execute the shipped application with a minimal DOM adapter. These tests cover
// application state, node identity and focus calls, not browser paint or layout.
function application(storage = new Map(), failWrites = false) {
  const listeners = new Map();
  const downloads = [];
  const blobs = new Map();
  const dispatch = (type, event) => (listeners.get(type) || []).forEach(handler => handler(event));
  const { document, nodes, mutations, focusCalls } = createDOMAdapter(dispatch);
  const node = selector => document.querySelector(selector);
  const scrollCalls = [];
  const browserWindow = { scrollY: 0, scrollTo(first, second) {
    scrollCalls.push([first, second]); this.scrollY = typeof first === 'object' ? first.top : second;
  } };
  const context = vm.createContext({
    ...data, ...engine, ...media, ...ai, ...session, ...providers, console, structuredClone, Blob, AbortController, Event,
    // The adapter executes app.js in another realm; native module guards expect
    // ordinary same-realm objects, as in the real browser's module graph.
    validateApiConfig: value => ai.validateApiConfig(structuredClone(value)),
    restoreDuel: value => session.restoreDuel(structuredClone(value)),
    settleDuel: (...values) => session.settleDuel(...values.map(value => structuredClone(value))),
    URL: {
      createObjectURL(blob) { const url = `blob:audit-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL() {},
    },
    document: Object.assign(document, {
      addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
      createElement: () => ({ click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); } }),
    }),
    window: browserWindow,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { if (failWrites) throw new Error('Storage quota exceeded'); storage.set(key, String(value)); },
    },
    matchMedia: () => ({ matches: true }), setTimeout: () => 0, clearTimeout() {},
  });
  const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '');
  vm.runInContext(source, context, { filename: 'dist/app.js' });
  return {
    storage, nodes, downloads, document, mutations, focusCalls, scrollCalls, browserWindow,
    read: expression => vm.runInContext(expression, context),
    html: () => node('#app').innerHTML,
    modal: () => node('#modal-root').innerHTML,
    field(selector, value) { node(selector).value = value; },
    change(selector, value) { const target = node(selector); target.value = value; dispatch('change', { target }); },
    click(action, extra = {}) {
      const button = { dataset: { action, ...extra }, disabled: false };
      dispatch('click', { target: { closest: () => button }, preventDefault() {} });
    },
    input(asset, value) {
      dispatch('input', { target: { matches: () => true, dataset: { asset }, value } });
    },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const fakeModelReply = (request, summary = '分别考虑两个家庭预算，保留各自的行动空间。') => {
  const payload = JSON.parse(JSON.parse(request.body).messages[1].content);
  const plan = (account, asset) => ({
    allocation: Object.fromEntries(engine.ASSET_KEYS.map(key => [key, key === asset ? 100 : 0])),
    insurance: true, buyHome: false, buyCar: false, rebalance: 'annual',
    choiceId: payload.households[account].choices[0].id,
  });
  const result = { analysis: [{ signalId: payload.signals[0].id, observation: payload.signals[0].text.slice(0, 200),
    reasoning: '公开信息需要结合家庭预算理解。', risk: '同样的信息可能存在不同解释。' }],
    playerDecision: plan('player', 'cash'), rivalDecision: plan('rival', 'tech'), summary };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
};
const connect = (app, model = 'audit-model') => {
  app.click('ai-settings');
  app.field('#api-endpoint', 'https://aigc.efunds.com.cn/v1/chat/completions');
  app.field('#api-model', model);
  app.field('#api-key', 'audit-secret');
  app.click('ai-connect');
};

function holdDecision(app) {
  app.read(`apiConfig={endpoint:'https://aigc.efunds.com.cn/v1/chat/completions',model:'audit-model',apiKey:'audit-secret'};
    agentEnabled=true; requestDecision=(_config,_context,options)=>new Promise((resolve,reject)=>{
      globalThis.auditRetry=options.onRetry; globalThis.auditResolve=resolve; globalThis.auditReject=reject;
      globalThis.auditAnswer={...fallbackDecisionPack(state,rivalState),source:'model',model:'audit-model'};
    });`);
}
function finishRuleJourney(app) {
  app.click('mode', { mode: 'auto' });
  for (let round = 0; round < 20; round++) { app.click('settle'); app.click('continue'); }
}
function holdPersona(app) {
  app.read(`apiConfig={endpoint:'https://aigc.efunds.com.cn/v1/chat/completions',model:'audit-model',apiKey:'audit-secret'};
    agentEnabled=true; requestPersona=(_config,_player,_rival,options)=>new Promise((resolve,reject)=>{
      globalThis.auditRetry=options.onRetry; globalThis.auditResolve=resolve; globalThis.auditReject=reject;
      globalThis.auditAnswer={...fallbackPersona(state,rivalState),source:'model',model:'audit-model'};
    });`);
}

test('UI audit: annual async updates preserve photographs, inputs, focus and scroll without replacing the root', async () => {
  for (const outcome of ['success', 'failure']) {
    const app = application();
    app.click('choice', { choice: engine.getChoices(engine.newGame())[0].id });
    app.input('cash', 37);
    const root = app.nodes.get('#app'), photo = app.nodes.get('.history-photo img');
    const family = app.nodes.get('.family-card'), portfolio = app.nodes.get('.portfolio-card');
    const input = app.nodes.get('#allocation-cash'); input.focus();
    app.browserWindow.scrollY = 700; app.scrollCalls.length = 0; app.mutations.length = 0;
    const draft = app.read('JSON.stringify(decision)');
    holdDecision(app); app.click('ai-retry');
    const card = app.nodes.get('.agent-card'), progress = app.nodes.get('[data-ai-progress]');
    const changes = app.mutations.length;
    app.read("auditRetry({reason:'gateway',attempt:2,maxAttempts:3})");
    assert.equal(app.nodes.get('.agent-card'), card);
    assert.equal(app.nodes.get('[data-ai-progress]'), progress);
    assert.match(progress.textContent, /第 2 \/ 3 次/);
    assert.deepEqual(app.mutations.slice(changes).map(change => change.property), ['textContent']);
    if (outcome === 'success') app.read('auditResolve(auditAnswer)');
    else app.read("auditReject(new Error('固定的假连接错误'))");
    await flush();
    assert.equal(app.read('agentStatus'), outcome === 'success' ? 'ready' : 'error');
    assert.equal(app.nodes.get('#app'), root);
    assert.equal(app.mutations.filter(change => change.target === root).length, 0);
    assert.equal(app.nodes.get('.history-photo img'), photo);
    assert.equal(app.nodes.get('.family-card'), family);
    assert.equal(app.nodes.get('.portfolio-card'), portfolio);
    assert.equal(app.nodes.get('#allocation-cash'), input);
    assert.equal(input.value, '37');
    assert.equal(app.document.activeElement, input);
    assert.equal(app.browserWindow.scrollY, 700);
    assert.deepEqual(app.scrollCalls, []);
    assert.equal(app.read('JSON.stringify(decision)'), draft, 'a manual draft is not replaced by the model suggestion');
    assert.equal(app.nodes.get('#settle-button').disabled, outcome === 'failure');
    assert.equal(app.read('state.round'), 0);
    assert.doesNotMatch([...app.storage.values()].join(''), /audit-secret/);
  }
});

test('UI audit: managed success replaces only decision panels and restores the equivalent focused action', async () => {
  const app = application(); app.click('mode', { mode: 'auto' });
  holdDecision(app); app.click('ai-retry');
  const root = app.nodes.get('#app'), photo = app.nodes.get('.history-photo img');
  const family = app.nodes.get('.family-card'), portfolio = app.nodes.get('.portfolio-card');
  const focused = app.nodes.get('.agent-card [data-action="ai-settings"]'); focused.focus();
  app.browserWindow.scrollY = 600; app.scrollCalls.length = 0; app.mutations.length = 0;
  app.read('auditResolve(auditAnswer)'); await flush();
  assert.equal(app.read('agentStatus'), 'ready');
  assert.notEqual(app.nodes.get('.family-card'), family);
  assert.notEqual(app.nodes.get('.portfolio-card'), portfolio);
  assert.equal(app.nodes.get('.history-photo img'), photo);
  assert.equal(app.mutations.filter(change => change.target === root).length, 0);
  assert.notEqual(app.document.activeElement, focused);
  assert.equal(app.document.activeElement, app.nodes.get('.agent-card [data-action="ai-settings"]'));
  assert.equal(app.focusCalls.at(-1).options.preventScroll, true);
  assert.equal(app.browserWindow.scrollY, 600); assert.deepEqual(app.scrollCalls, []);
  assert.equal(app.nodes.get('#settle-button').disabled, false);
  assert.equal(app.read('JSON.stringify(decision)===JSON.stringify(agentPack.playerDecision)'), true);
  app.click('settle');
  assert.equal(app.read('state.round'), 1); assert.equal(app.read('rivalState.round'), 1);
});

test('UI audit: background annual and persona callbacks never reconstruct ledger or album content', async () => {
  for (const purpose of ['decision', 'persona']) for (const page of ['ledger', 'profile']) for (const outcome of ['success', 'failure']) {
    const app = application();
    if (purpose === 'persona') finishRuleJourney(app);
    app.click('nav', { page });
    const root = app.nodes.get('#app'), content = app.nodes.get(page === 'ledger' ? '.chart' : '.memory-grid');
    const focused = app.nodes.get(`.site-header [data-action="nav"][data-page="${page}"]`); focused.focus();
    app.browserWindow.scrollY = 900; app.scrollCalls.length = 0; app.mutations.length = 0;
    if (purpose === 'decision') { holdDecision(app); app.click('ai-retry'); }
    else { holdPersona(app); app.click('persona-generate'); }
    app.read("auditRetry({reason:'gateway',attempt:2,maxAttempts:3})");
    if (outcome === 'success') app.read('auditResolve(auditAnswer)');
    else app.read("auditReject(new Error('固定的假连接错误'))");
    await flush();
    assert.equal(app.read(purpose === 'decision' ? 'agentStatus' : 'personaStatus'), outcome === 'success' ? 'ready' : 'error');
    assert.equal(app.mutations.filter(change => change.target === root).length, 0);
    assert.equal(app.nodes.get(page === 'ledger' ? '.chart' : '.memory-grid'), content);
    assert.equal(app.document.activeElement, focused);
    assert.equal(app.browserWindow.scrollY, 900); assert.deepEqual(app.scrollCalls, []);
    app.click('nav', { page: 'game' });
    assert.ok(app.html().includes(outcome === 'failure' ? '固定的假连接错误' : purpose === 'decision' ? '本年已备牌' : 'AI 个性化画像'));
  }
});

test('UI audit: portrait exit clears stale errors and delayed callbacks cannot overwrite the rule result', async () => {
  for (const action of ['ai-disconnect', 'persona-fallback']) {
    const app = application(); finishRuleJourney(app);
    if (action === 'persona-fallback') app.read('persona=null;render()');
    holdPersona(app);
    const root = app.nodes.get('#app'), chart = app.nodes.get('.chart'), ending = app.nodes.get('.ending');
    app.mutations.length = 0; app.scrollCalls.length = 0;
    app.click('persona-generate');
    const card = app.nodes.get('.persona-card');
    app.read("auditRetry({reason:'gateway',attempt:2,maxAttempts:3})");
    assert.equal(app.nodes.get('.persona-card'), card);
    assert.match(app.nodes.get('[data-persona-progress]').textContent, /第 2 \/ 3 次/);
    app.read("auditReject(new Error('固定的假画像错误'))"); await flush();
    assert.match(app.html(), /固定的假画像错误/);
    assert.equal(app.nodes.get('.chart'), chart); assert.equal(app.nodes.get('.ending'), ending);
    assert.equal(app.mutations.filter(change => change.target === root).length, 0);
    assert.deepEqual(app.scrollCalls, []);
    if (action === 'ai-disconnect') { app.click('persona-generate'); app.click('ai-settings'); }
    app.click(action);
    assert.equal(app.read('persona.source'), 'rules'); assert.equal(app.read('personaStatus'), 'ready');
    assert.equal(app.read('personaError'), ''); assert.equal(app.read('personaProgress'), '');
    assert.doesNotMatch(app.html(), /固定的假画像错误|正在回看你的旅程/);
    const saved = app.read('JSON.stringify(persona)'), mutations = app.mutations.length;
    app.read("auditRetry({reason:'gateway',attempt:3,maxAttempts:3});auditResolve(auditAnswer)"); await flush();
    assert.equal(app.read('JSON.stringify(persona)'), saved);
    assert.equal(app.read('personaStatus'), 'ready');
    assert.equal(app.mutations.length, mutations);
  }
});

test('UI audit: repeated renders preserve nodes but a preset after a slider edit restores visible values', () => {
  const app = application();
  app.click('preset', { preset: 'balanced' });
  assert.equal(app.nodes.get('#allocation-cash').value, '20');
  const root = app.nodes.get('#app'), photo = app.nodes.get('.history-photo img');
  const input = app.nodes.get('#allocation-cash'); input.focus();
  app.mutations.length = 0; app.scrollCalls.length = 0;
  app.click('preset', { preset: 'balanced' });
  assert.equal(app.mutations.filter(change => change.target === root).length, 0);
  assert.equal(app.nodes.get('.history-photo img'), photo);
  assert.equal(app.document.activeElement, input); assert.deepEqual(app.scrollCalls, []);
  app.input('cash', 85);
  assert.equal(app.nodes.get('#allocation-cash').value, '85');
  app.click('preset', { preset: 'balanced' });
  assert.equal(app.read('decision.allocation.cash'), 20);
  assert.equal(app.nodes.get('#allocation-cash').value, '20');
  assert.equal(app.nodes.get('[data-allocation-value="cash"]').textContent, '20%');
});

test('UI audit: gateway retry shows actual count and cost disclosure, and late success cannot replace explicit fallback', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: {
    origin: 'https://liaojs2025.github.io', protocol: 'https:',
  } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, finish;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ error: {
      code: 'upstream_error', upstreamStatus: 520, upstreamReason: 'non_json',
    } }), { status: 502 });
    return new Promise(resolve => {
      finish = () => resolve(fakeModelReply({ ...request,
        body: JSON.stringify(JSON.parse(request.body).request),
      }, '这是已经被用户替补的迟到模型结果。'));
    });
  });
  const app = application();
  app.click('ai-settings');
  assert.match(app.modal(), /含重试最多 3 次请求/);
  assert.match(app.modal(), /按服务商用量计费/);
  assert.match(app.modal(), /单次输出上限：年度 2500、画像 3500 token/);
  app.field('#api-endpoint', 'https://aigc.efunds.com.cn/v1/');
  app.field('#api-model', 'audit-model'); app.field('#api-key', 'audit-secret');
  app.click('ai-connect'); await flush();
  assert.equal(calls, 1);
  assert.doesNotMatch(app.html(), /第 2 \/ 3 次/);
  t.mock.timers.tick(4000); await flush();
  assert.equal(calls, 2);
  assert.match(app.html(), /第 2 \/ 3 次/);
  assert.match(app.html(), /重复请求可能重复计费/);
  assert.equal(app.read('state.round'), 0);
  assert.equal(app.read('rivalState.round'), 0);
  app.click('ai-fallback');
  const sealedRules = app.read('JSON.stringify(agentPack)');
  assert.equal(app.read('agentPack.source'), 'rules');
  finish(); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.equal(calls, 2);
  assert.equal(app.read('JSON.stringify(agentPack)'), sealedRules);
  assert.doesNotMatch(app.html(), /迟到模型结果|第 2 \/ 3 次|audit-secret/);
  assert.equal([...app.storage.values()].join('').includes('audit-secret'), false);
});

test('UI audit: header resets and interrupted streams wait four then eight seconds and never seal an exhausted round', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: {
    origin: 'https://liaojs2025.github.io', protocol: 'https:',
  } });
  t.after(() => descriptor ? Object.defineProperty(globalThis, 'location', descriptor) : delete globalThis.location);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, diagnostic;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: 'upstream_connection', ...diagnostic } }), { status: 502 });
  });
  for (diagnostic of [{ upstreamReason: 'connection_reset', upstreamPhase: 'headers' },
    { upstreamReason: 'stream_interrupted', upstreamPhase: 'body' }]) {
    calls = 0;
    const app = application();
    const before = app.read('JSON.stringify([state,rivalState,agentRounds])');
    connect(app); await flush();
    assert.equal(calls, 1);
    assert.equal(app.read('agentStatus'), 'running');
    assert.equal(app.read('agentPack'), null);
    app.click('settle');
    assert.equal(app.read('JSON.stringify([state,rivalState,agentRounds])'), before);
    t.mock.timers.tick(3999); await flush(); assert.equal(calls, 1);
    t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
    assert.match(app.html(), /第 2 \/ 3 次/);
    assert.match(app.html(), /重复请求可能重复计费/);
    t.mock.timers.tick(7999); await flush(); assert.equal(calls, 2);
    t.mock.timers.tick(1); await flush(); assert.equal(calls, 3);
    assert.equal(app.read('agentStatus'), 'error');
    assert.equal(app.read('agentErrorCategory'), 'network');
    assert.match(app.html(), diagnostic.upstreamPhase === 'headers' ? /EFUND 在返回回答前中断连接/ : /EFUND 回答传输中断/);
    assert.match(app.html(), /<h2>连接未完成<\/h2>/);
    assert.equal(app.read('agentPack'), null);
    app.click('choice', { choice: 'travel' }); app.click('settle');
    assert.equal(app.read('JSON.stringify([state,rivalState,agentRounds])'), before);
    assert.equal(JSON.parse(app.storage.get('life-cfo-save-v3')).agentPack, null);
    t.mock.timers.tick(60000); await flush(); assert.equal(calls, 3);
    assert.equal(app.read('agentPack'), null);
  }
});

test('UI audit: upgrading an existing rule portrait keeps its retry and error messages visible and ignores stale callbacks', async () => {
  const app = application();
  app.click('mode', { mode: 'auto' });
  for (let round = 0; round < data.YEARS.length; round++) {
    app.click('settle'); app.click('continue');
  }
  assert.equal(app.read('persona.source'), 'rules');
  app.read(`apiConfig={endpoint:'https://aigc.efunds.com.cn/v1/chat/completions',model:'audit-model',apiKey:'audit-secret'};
    agentEnabled=true;
    requestPersona=(_config,_player,_rival,options)=>new Promise((_resolve,reject)=>{
      globalThis.auditPersonaRetry=options.onRetry;
      globalThis.auditPersonaReject=reject;
    });`);
  app.click('persona-generate');
  app.read("auditPersonaRetry({attempt:2,maxAttempts:3,reason:'gateway'})");
  assert.equal(app.read('persona.source'), 'rules', 'the previous portrait remains available during an upgrade');
  assert.match(app.html(), /第 2 \/ 3 次/);
  assert.match(app.html(), /重复请求可能重复计费/);
  app.read("auditPersonaReject(new Error('审计画像失败，请重试。'))"); await flush();
  assert.equal(app.read('personaStatus'), 'error');
  assert.match(app.html(), /审计画像失败，请重试/);
  app.click('persona-generate');
  app.read("auditPersonaRetry({attempt:2,maxAttempts:3,reason:'parameter'})");
  app.click('persona-fallback');
  const progress = app.read('personaProgress');
  app.read("auditPersonaRetry({attempt:3,maxAttempts:3,reason:'gateway'})");
  assert.equal(app.read('personaProgress'), progress);
  assert.equal(app.read('personaStatus'), 'ready');
  assert.doesNotMatch(app.html(), /第 3 \/ 3 次/);
});

const supportedApiCases = [
  { endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions', base: 'https://aigc.efunds.com.cn/v1/', model: 'deepseek-v4-flash' },
  { endpoint: 'https://api.deepseek.com/chat/completions', base: 'https://api.deepseek.com/v1/', model: 'deepseek-flash' },
  { endpoint: 'https://api.openai.com/v1/chat/completions', base: 'https://api.openai.com/v1/', model: 'gpt-4.1-mini' },
  { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', base: 'https://open.bigmodel.cn/', model: 'glm-4.7-flash' },
  { endpoint: 'https://api.moonshot.cn/v1/chat/completions', base: 'https://api.moonshot.cn/v1/', model: 'kimi-k3.1-pro' },
];

test('UI audit: every supported provider switch requires its own key and preserves the selected destination', async t => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    sent.push({ url, authorization: new Headers(request.headers).get('Authorization') });
    return fakeModelReply(request);
  });
  for (const previous of supportedApiCases) for (const next of supportedApiCases) {
    if (previous.endpoint === next.endpoint) continue;
    const app = application();
    app.read(`apiConfig=${JSON.stringify({ endpoint: previous.endpoint, model: 'old-model', apiKey: 'old-provider-secret' })}`);
    app.click('ai-settings');
    app.field('#api-endpoint', next.base); app.field('#api-model', 'selected-model'); app.field('#api-key', '');
    const before = sent.length;
    app.click('ai-connect'); await flush();
    assert.equal(sent.length, before, 'blank fields cannot forward another provider credential');
    assert.equal(app.read('apiConfig.endpoint'), previous.endpoint);
    assert.equal(app.modal().includes('old-provider-secret'), false);
    app.field('#api-key', 'new-provider-secret'); app.click('ai-connect'); await flush();
    assert.equal(sent.length, before + 1);
    assert.deepEqual(sent.at(-1), { url: next.endpoint, authorization: 'Bearer new-provider-secret' });
    assert.equal(app.read('apiConfig.model'), 'selected-model');
    assert.equal(app.read('agentPack.source'), 'model');
    assert.doesNotMatch([...app.storage.values()].join(''), /old-provider-secret|new-provider-secret/);
  }
});

test('UI audit: five provider presets clear old credentials while equivalent addresses retain only their own key', async t => {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    sent.push({ url, authorization: new Headers(request.headers).get('Authorization') });
    return fakeModelReply(request);
  });
  const app = application();
  assert.equal(app.read('apiConfig.endpoint'), 'https://api.deepseek.com/chat/completions');
  assert.equal(app.read('apiConfig.apiKey'), '');
  app.read("apiConfig={endpoint:'https://old-provider.example/v1/chat/completions',model:'old-model',apiKey:'old-provider-secret'}");
  app.click('ai-settings');
  assert.equal((app.modal().match(/<option /g) || []).length, 5);
  for (const label of ['EFUND', 'DeepSeek', 'OpenAI', 'GLM', 'Kimi']) assert.ok(app.modal().includes(label));
  assert.doesNotMatch(app.modal(), /Paratera|并行科技|DeepSeek-V3.2-Instruct/);
  for (const selected of supportedApiCases) {
    app.field('#api-key', 'old-provider-secret');
    app.change('#api-provider', selected.endpoint);
    assert.equal(app.nodes.get('#api-key').value, '');
    assert.equal(app.read('apiConfig.apiKey'), '', 'choosing another provider also clears the previous in-memory key');
    assert.equal(app.nodes.get('#api-endpoint').value, selected.endpoint);
    assert.equal(app.nodes.get('#api-model').value, selected.model);
    assert.match(app.nodes.get('#api-token-budget').textContent, selected.endpoint.includes('efunds.com.cn')
      ? /年度 4000、画像 6000 token/ : /年度 2500、画像 3500 token/);
    app.click('ai-connect'); await flush();
    assert.equal(sent.length, 0, 'choosing a provider cannot forward an old credential');
    assert.ok(app.nodes.get('#api-settings-error').innerHTML);
  }
  for (const selected of supportedApiCases) {
    const same = application();
    same.read(`apiConfig=${JSON.stringify({ endpoint: selected.endpoint, model: 'account-model', apiKey: 'own-provider-secret' })}`);
    same.click('ai-settings'); same.field('#api-endpoint', selected.base);
    assert.match(same.modal(), selected.endpoint.includes('efunds.com.cn')
      ? /年度 4000、画像 6000 token/ : /年度 2500、画像 3500 token/);
    same.field('#api-model', 'account-model'); same.field('#api-key', '');
    same.click('ai-connect'); await flush();
    assert.deepEqual(sent.at(-1), { url: selected.endpoint, authorization: 'Bearer own-provider-secret' });
    assert.equal(same.read('agentPack.source'), 'model');
    assert.equal([...same.storage.values()].join('').includes('own-provider-secret'), false);
    const restored = application(same.storage);
    assert.equal(restored.read('apiConfig.endpoint'), selected.endpoint);
    assert.equal(restored.read('apiConfig.model'), 'account-model');
    assert.equal(restored.read('apiConfig.apiKey'), '', 'saved preferences survive but credentials never do');
  }
});

test('UI audit: unknown destinations and noncanonical provider paths are rejected before any request even with a key', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('unsupported target must not be contacted'); });
  const targets = ['https://llmapi.paratera.com/v1/chat/completions', 'https://custom-provider.example/v1'];
  for (const { endpoint } of supportedApiCases) {
    const url = new URL(endpoint);
    targets.push(endpoint.replace(url.hostname, `${url.hostname}.attacker.example`),
      endpoint.replace(url.host, `${url.host}:8443`), endpoint.replace(url.pathname, `/other${url.pathname}`),
      `${endpoint}?tenant=another`);
  }
  for (const endpoint of targets) {
    const app = application();
    app.click('ai-settings'); app.field('#api-endpoint', endpoint);
    app.field('#api-model', 'account-model'); app.field('#api-key', 'audit-entered-key');
    app.click('ai-connect'); await flush();
    assert.equal(calls, 0);
    assert.ok(app.nodes.get('#api-settings-error').innerHTML, 'unsupported endpoint is explained');
    assert.equal(app.read('apiConfig.endpoint'), 'https://api.deepseek.com/chat/completions');
    assert.equal(app.read('apiConfig.apiKey'), '');
    assert.equal(app.read('agentEnabled'), false);
  }
});

test('UI audit: connection preferences restore or migrate without changing sealed history or the current pack', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, request) => { calls++; return fakeModelReply(request); });
  const app = application();
  connect(app, 'previous-account-model'); await flush();
  app.click('mode', { mode: 'auto' }); app.click('settle'); app.click('continue'); await flush();
  const original = JSON.parse(app.storage.get('life-cfo-save-v3'));
  assert.equal(original.state.round, 1);
  assert.equal(original.rivalState.round, 1);
  assert.equal(original.agentRounds.length, 1);
  assert.equal(original.agentPack.source, 'model');
  const requestsBeforeRestore = calls;
  const cases = [
    ...supportedApiCases.map(p => ({ input: p.base, expected: { endpoint: p.endpoint, model: 'previous-account-model' } })),
    ...['https://llmapi.paratera.com/v1/chat/completions', 'https://custom-provider.example/v1',
      'https://aigc.efunds.com.cn/v1/chat/completions?tenant=another'].map(input => ({ input,
        expected: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' } })),
  ];
  for (const { input, expected } of cases) {
    const stored = structuredClone(original);
    stored.apiPreference = { endpoint: input, model: 'previous-account-model' };
    const storage = new Map(app.storage); storage.set('life-cfo-save-v3', JSON.stringify(stored));
    const restored = application(storage);
    const after = JSON.parse(storage.get('life-cfo-save-v3'));
    assert.deepEqual(after.apiPreference, expected);
    for (const field of ['state', 'rivalState', 'agentRounds', 'agentPack', 'persona', 'draft', 'pendingReview'])
      assert.deepEqual(after[field], original[field], `${field} must not change with connection preferences`);
    assert.equal(restored.read('apiConfig.apiKey'), '');
    assert.equal(restored.read('agentPack.model'), 'previous-account-model');
    assert.equal(restored.read('agentStatus'), 'ready');
    assert.equal(calls, requestsBeforeRestore, 'migration cannot redraw a sealed decision');
  }
});

test('UI audit: the EFUND V4 preset preserves saved GPT preferences and changes only the next unsealed round', async t => {
  const sentModels = [];
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    sentModels.push(JSON.parse(request.body).model);
    return fakeModelReply(request);
  });
  const app = application();
  connect(app, 'gpt-4o'); await flush();
  app.click('mode', { mode: 'auto' }); app.click('settle'); app.click('continue'); await flush();
  assert.deepEqual(sentModels, ['gpt-4o', 'gpt-4o']);
  const before = JSON.parse(app.storage.get('life-cfo-save-v3'));
  const restored = application(app.storage);
  assert.equal(restored.read('apiConfig.model'), 'gpt-4o');
  assert.equal(restored.read('apiConfig.apiKey'), '');
  assert.equal(restored.read('agentPack.model'), 'gpt-4o');
  const after = JSON.parse(app.storage.get('life-cfo-save-v3'));
  for (const field of ['apiPreference', 'state', 'rivalState', 'agentPack', 'agentRounds', 'draft', 'pendingReview'])
    assert.deepEqual(after[field], before[field]);
  restored.click('ai-settings');
  restored.change('#api-provider', 'https://aigc.efunds.com.cn/v1/chat/completions');
  assert.equal(restored.nodes.get('#api-model').value, 'deepseek-v4-flash');
  restored.field('#api-key', 'audit-secret'); restored.click('ai-connect'); await flush();
  assert.equal(restored.read('apiConfig.model'), 'deepseek-v4-flash');
  assert.equal(restored.read('agentPack.model'), 'gpt-4o');
  assert.deepEqual(JSON.parse(restored.read('JSON.stringify(agentPack)')), before.agentPack);
  assert.deepEqual(sentModels, ['gpt-4o', 'gpt-4o'], 'the new default cannot redraw a sealed GPT decision');
  restored.click('settle'); restored.click('continue'); await flush();
  assert.deepEqual(sentModels, ['gpt-4o', 'gpt-4o', 'deepseek-v4-flash']);
  assert.equal(restored.read('agentPack.model'), 'deepseek-v4-flash');
  assert.equal(restored.read('agentRounds.every(pack=>pack.model===\'gpt-4o\')'), true);
  assert.doesNotMatch([...app.storage.values()].join(''), /audit-secret/);
});

test('UI audit: first model pack locks, survives refresh and never serializes the API key', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, request) => { calls++; return fakeModelReply(request); });
  const app = application();
  connect(app); await flush();
  assert.equal(app.read('agentPack.source'), 'model');
  assert.equal(app.read('agentStatus'), 'ready');
  assert.equal(calls, 1);
  const locked = app.read('JSON.stringify(agentPack)');
  app.click('mode', { mode: 'assisted' });
  app.click('choice', { choice: 'travel' });
  app.click('sector', { sector: 'consumer' });
  app.click('ai-retry');
  connect(app, 'new-model'); await flush();
  assert.equal(calls, 1);
  assert.equal(app.read('JSON.stringify(agentPack)'), locked);
  assert.equal([...app.storage.values()].join('').includes('audit-secret'), false);
  assert.equal(app.html().includes('audit-secret'), false);
  assert.equal(app.modal().includes('audit-secret'), false);
  const restored = application(app.storage);
  assert.equal(restored.read('apiConfig.apiKey'), '');
  assert.equal(restored.read('JSON.stringify(agentPack)'), locked);
  restored.click('settle');
  assert.equal(restored.read('state.round'), 1);
  assert.equal(restored.read('rivalState.round'), 1);
  assert.equal(restored.read('state.history[0].decision.choiceId'), 'travel');
  assert.equal(restored.read('rivalState.history[0].decision.allocation.tech'), 100);
  restored.click('export');
  assert.equal((await restored.downloads[0].blob.text()).includes('audit-secret'), false);
  restored.click('continue');
  assert.equal(restored.read('agentStatus'), 'needs-key');
  assert.equal(restored.read('agentPack'), null);
  assert.equal(calls, 1);
});

test('UI audit: API failure blocks both accounts until retry or explicit labeled fallback', async t => {
  let succeeds = false, calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    calls++; return succeeds ? fakeModelReply(request) : new Response('audit-secret provider failure', { status: 503 });
  });
  const app = application();
  connect(app); await flush();
  assert.equal(app.read('agentStatus'), 'error');
  assert.equal(app.html().includes('audit-secret'), false);
  assert.equal(app.read('agentPack'), null);
  app.click('choice', { choice: 'travel' }); app.click('settle');
  assert.equal(app.read('state.round'), 0); assert.equal(app.read('rivalState.round'), 0);
  succeeds = true; app.click('ai-retry'); await flush();
  assert.equal(calls, 2); assert.equal(app.read('agentPack.source'), 'model');
  app.click('settle'); app.click('continue');
  await flush();
  // Explicit fallback is tested on a fresh failed round, not by relabeling a successful AI pack.
  const second = application(); succeeds = false;
  connect(second); await flush(); second.click('ai-fallback');
  assert.equal(second.read('agentPack.source'), 'rules');
  second.click('mode', { mode: 'auto' }); second.click('settle');
  assert.equal(second.read('state.round'), 1); assert.equal(second.read('rivalState.round'), 1);
  assert.equal(second.read('agentRounds[0].source'), 'rules');
  assert.ok(second.modal().includes('规则替补'));
});

test('UI audit: HTTP 200 invalid answers are distinct from network failures and neither can settle or seal a round', async t => {
  let mode, invalidReply, calls = 0, finish;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    calls++;
    if (mode === 'format') return invalidReply(request);
    if (mode === 'network') throw new TypeError('audit-secret private network error');
    return new Promise(resolve => { finish = () => resolve(fakeModelReply(request)); });
  });
  for (const invalid of [
    () => new Response('not a JSON response', { status: 200 }),
    request => fakeModelReply(request, '明年股票上涨百分之二十。'),
  ]) {
    calls = 0; mode = 'format'; invalidReply = invalid;
    const app = application();
    const before = app.read('JSON.stringify([state,rivalState,agentRounds])');
    connect(app); await flush();
    assert.equal(calls, 1, 'invalid content must not trigger automatic retries');
    assert.equal(app.read('agentStatus'), 'error');
    assert.equal(app.read('agentErrorCategory'), 'format');
    assert.match(app.html(), /<h2>回答未通过核验<\/h2>/);
    assert.match(app.html(), /data-action="ai-retry">重新请求<\/button>/);
    assert.doesNotMatch(app.html(), /<h2>连接未完成<\/h2>|data-action="ai-retry">重试连接/);
    assert.equal(app.read('agentPack'), null);
    app.click('choice', { choice: 'travel' }); app.click('settle');
    assert.equal(app.read('JSON.stringify([state,rivalState,agentRounds])'), before);
    assert.equal(JSON.parse(app.storage.get('life-cfo-save-v3')).agentPack, null);

    mode = 'network'; app.click('ai-retry'); await flush();
    assert.equal(calls, 2);
    assert.equal(app.read('agentErrorCategory'), 'network');
    assert.match(app.html(), /<h2>连接未完成<\/h2>/);
    assert.match(app.html(), /data-action="ai-retry">重试连接<\/button>/);
    assert.doesNotMatch(app.html(), /回答未通过核验|audit-secret|private network error/);
    app.click('settle');
    assert.equal(app.read('agentPack'), null);
    assert.equal(app.read('JSON.stringify([state,rivalState,agentRounds])'), before);

    mode = 'success'; app.click('ai-retry');
    assert.equal(app.read('agentStatus'), 'running');
    assert.equal(app.read('agentErrorCategory'), '', 'a new request clears the previous error classification');
    assert.doesNotMatch(app.html(), /回答未通过核验|<h2>连接未完成<\/h2>/);
    finish(); await flush();
    assert.equal(calls, 3);
    assert.equal(app.read('agentStatus'), 'ready');
    assert.equal(app.read('agentPack.source'), 'model');
    assert.doesNotMatch(app.html(), /回答未通过核验|<h2>连接未完成<\/h2>/);
    app.click('settle');
    assert.equal(app.read('state.round'), 1);
    assert.equal(app.read('rivalState.round'), 1);
    assert.equal(app.read('agentRounds.length'), 1);
  }
});

test('UI audit: a late response cannot replace explicit fallback or overwrite a restarted journey', async t => {
  let complete;
  t.mock.method(globalThis, 'fetch', async (_url, request) => new Promise(resolve => {
    complete = () => resolve(fakeModelReply(request, '这是已经取消的旧计划。'));
  }));
  const app = application(); connect(app);
  assert.equal(app.read('agentStatus'), 'running');
  app.click('ai-fallback');
  const fallback = app.read('JSON.stringify(agentPack)');
  complete(); await flush();
  assert.equal(app.read('JSON.stringify(agentPack)'), fallback);
  assert.equal(app.read('agentStatus'), 'ready');
  t.mock.restoreAll();
  let calls = 0, resolveOld;
  t.mock.method(globalThis, 'fetch', async (_url, request) => {
    calls++;
    if (calls === 1) return new Promise(resolve => { resolveOld = () => resolve(fakeModelReply(request, '这是上一段旅程的计划。')); });
    return fakeModelReply(request, '这是新的旅程方案。');
  });
  const restarted = application(); connect(restarted);
  restarted.click('confirm-restart'); await flush();
  assert.equal(restarted.read('agentPack.summary'), '这是新的旅程方案。');
  resolveOld(); await flush();
  assert.equal(restarted.read('agentPack.summary'), '这是新的旅程方案。');
  assert.equal(restarted.read('state.round'), 0); assert.equal(restarted.read('rivalState.round'), 0);
});

test('UI audit: v1 and v2 saves remain intact while v3 advances its independent duel', async () => {
  const older = '{"version":1,"note":"first archive"}';
  const previous = '{"version":2,"note":"second archive"}';
  const storage = new Map([['life-cfo-save-v1', older], ['life-cfo-save-v2', previous]]);
  const app = application(storage);
  app.click('export-legacy');
  assert.equal(await app.downloads[0].blob.text(), previous);
  app.click('mode', { mode: 'auto' }); app.click('settle'); app.click('continue');
  app.click('confirm-restart');
  assert.equal(storage.get('life-cfo-save-v1'), older);
  assert.equal(storage.get('life-cfo-save-v2'), previous);
  assert.equal(JSON.parse(storage.get('life-cfo-save-v3')).state.version, 3);
});

test('UI audit: an unfunded year does not render a numeric simulated-investor rank', () => {
  const app = application();
  const html = app.read('annualRanking({portfolioReturn:0,investedCapital:0,returns:YEARS[0].returns},YEARS[0])');
  assert.match(html, /不参与|无可计算|未参与/);
  assert.doesNotMatch(html, /收益率超过|超过 <strong>/);
});

test('UI audit: annual view exposes public briefing but no unplayed outcome', () => {
  const app = application();
  assert.ok(app.html().includes(data.YEARS[0].briefing[0].title));
  for (const year of data.YEARS) assert.equal(app.html().includes(year.reveal.title), false);
  assert.equal(app.read('state.round'), 0);
  app.click('mode', { mode: 'auto' });
  app.click('settle');
  assert.equal(app.read('state.round'), 1);
  assert.ok(app.modal().includes(data.YEARS[0].reveal.title));
  assert.equal(app.modal().includes(data.YEARS[1].reveal.title), false);
});

test('UI audit: refreshing a first play restores pending review without falsely marking replay', () => {
  const app = application();
  app.click('choice', { choice: 'travel' });
  app.click('settle');
  assert.equal(app.read('pendingReview'), true);
  const restored = application(app.storage);
  assert.equal(restored.read('state.round'), 1);
  assert.equal(restored.read('pendingReview'), true);
  assert.equal(restored.read('replay'), false);
  assert.ok(restored.modal().includes(data.YEARS[0].reveal.title));
  restored.click('continue');
  assert.equal(restored.read('pendingReview'), false);
  assert.equal(application(restored.storage).read('pendingReview'), false);
});

test('UI audit: twenty managed rounds reach ending, preserve both ledgers and reset intentionally', () => {
  const app = application();
  app.click('mode', { mode: 'auto' });
  for (let i = 0; i < data.YEARS.length; i++) {
    app.click('settle');
    assert.equal(app.read('state.round'), i + 1);
    assert.ok(app.modal().includes(data.YEARS[i].reveal.title));
    app.click('continue');
  }
  assert.ok(app.html().includes('CHAPTER COMPLETE'));
  assert.ok(app.html().includes('同一段历史，几条不同的路'));
  assert.equal(app.read('state.history.length'), 20);
  assert.equal(app.read('rivalState.history.length'), 20);
  app.click('nav', { page: 'ledger' });
  assert.ok(app.html().includes('2026'));
  app.click('confirm-restart');
  assert.equal(app.read('state.round'), 0);
  assert.equal(app.read('state.history.length'), 0);
  assert.equal(app.read('replay'), true);
  assert.equal(application(app.storage).read('replay'), true);
});

test('UI audit: adviser adoption and taking control retain valid editable decisions', () => {
  const app = application();
  app.click('mode', { mode: 'assisted' });
  app.click('apply-advisor');
  assert.equal(app.read('state.mode'), 'assisted');
  assert.equal(app.read('chosen'), true);
  assert.equal(app.read('validateDecision(state, decision).valid'), true);
  app.click('mode', { mode: 'auto' });
  app.click('mode', { mode: 'player' });
  app.click('choice', { choice: 'travel' });
  app.click('settle');
  assert.equal(app.read('state.history[0].decision.choiceId'), 'travel');
  assert.equal(app.read('state.mode'), 'player');
});

test('UI audit: malformed storage does not prevent new play', () => {
  for (const raw of ['{invalid', JSON.stringify({ dataVersion: 'wrong' }), JSON.stringify({ dataVersion: data.DATA_VERSION, state: { mode: 'player', version: 1 } })]) {
    const app = application(new Map([['life-cfo-save-v3', raw]]));
    assert.equal(app.read('state.round'), 0);
    assert.ok(app.html().includes('2007'));
    app.click('choice', { choice: 'travel' });
    app.click('settle');
    assert.equal(app.read('state.round'), 1);
  }
});

test('UI audit: source panel withholds later macro-event explanations before completion', () => {
  const app = application();
  app.click('sources');
  for (const source of data.SOURCES.filter(s => !/French|NYU/.test(s.title))) {
    assert.equal(app.modal().includes(source.note), false, `unplayed macro event leaked: ${source.title}`);
  }
  assert.ok(app.modal().includes(data.SOURCES[0].title));
});

test('UI audit: unavailable storage is visible immediately', () => {
  const app = application(new Map(), true);
  assert.ok(app.html().includes('存档不可用'));
});

test('UI audit: legacy storage is preserved verbatim and exported without reinterpretation', async () => {
  const legacy = '{\n  "dataVersion": "harbor-2007-2018-v1", "state": {"version":1,"round":7}, "note":"旧版原始存档"\n}\n';
  const storage = new Map([['life-cfo-save-v1', legacy], ['life-cfo-played-v1', 'true']]);
  const app = application(storage);
  assert.equal(app.read('state.version'), 3);
  assert.equal(app.read('state.round'), 0);
  assert.equal(app.read('replay'), false);
  app.click('sources');
  assert.ok(app.modal().includes('导出封存的旧版原始旅程'));
  app.click('export-legacy');
  assert.equal(await app.downloads[0].blob.text(), legacy);
  app.click('close-modal');
  app.click('choice', { choice: 'travel' });
  app.click('settle');
  assert.equal(application(storage).read('state.round'), 1);
  app.click('continue');
  app.click('confirm-restart');
  assert.equal(storage.get('life-cfo-save-v1'), legacy);
  assert.equal(storage.get('life-cfo-played-v1'), 'true');
  const saved = JSON.parse(storage.get('life-cfo-save-v3'));
  assert.equal(saved.dataVersion, data.DATA_VERSION);
  assert.equal(saved.state.version, 3);
  assert.equal(saved.state.round, 0);
});

test('UI audit: cash controls impose no floor and sector changes preserve total allocation', () => {
  const app = application();
  assert.doesNotMatch(app.html(), /data-action="reserve"|reserveMonths|应急|储备月数/);
  app.click('choice', { choice: 'travel' });
  app.click('sector', { sector: 'tech' });
  app.input('equity', 100);
  assert.equal(app.read('decision.allocation.tech'), 100);
  assert.equal(app.read('decision.allocation.cash'), 0);
  assert.equal(app.read('previewDecision(state, decision).projectedCash'), 0);
  for (const sector of engine.STOCK_KEYS) {
    app.click('sector', { sector });
    assert.equal(app.read('Object.values(decision.allocation).reduce((a,b)=>a+b,0)'), 100);
    assert.equal(app.read(`decision.allocation.${sector}`), 100);
  }
  app.click('settle');
  assert.equal(app.read('state.history[0].decision.allocation.cash'), 0);
  assert.equal(app.read('state.history[0].decision.allocation.health'), 100);
  assert.equal(app.read('state.round'), 1);
});

test('UI audit: advisor mixed sectors survive grouped slider adjustments and refresh', () => {
  const app = application();
  app.click('mode', { mode: 'assisted' });
  app.click('apply-advisor');
  assert.deepEqual(Array.from(app.read('STOCK_KEYS.map(k=>decision.allocation[k])')), [20, 8, 6, 6]);
  app.input('equity', 60);
  assert.deepEqual(Array.from(app.read('STOCK_KEYS.map(k=>decision.allocation[k])')), [30, 12, 9, 9]);
  assert.equal(app.read('validateDecision(state, decision).valid'), true);
  const restored = application(app.storage);
  assert.deepEqual(Array.from(restored.read('STOCK_KEYS.map(k=>decision.allocation[k])')), [30, 12, 9, 9]);
  assert.ok(restored.html().includes('混合板块'));
  restored.click('sector', { sector: 'consumer' });
  assert.deepEqual(Array.from(restored.read('STOCK_KEYS.map(k=>decision.allocation[k])')), [0, 0, 60, 0]);
});

test('UI audit: diversification badge requires an executed multi-sector holding', () => {
  const app = application();
  app.click('mode', { mode: 'assisted' });
  app.click('apply-advisor');
  app.click('toggle-rebalance');
  app.click('close-modal');
  assert.equal(app.read('decision.rebalance'), 'hold');
  app.click('settle');
  assert.equal(app.read('STOCK_KEYS.filter(k=>state.history[0].endBalanceSheet.assets[k]>0).length'), 1);
  assert.equal(app.read('badges().find(b=>b.id==="diverse").unlocked'), false);
  app.click('continue');
  app.click('apply-advisor');
  app.click('settle');
  assert.equal(app.read('badges().find(b=>b.id==="diverse").unlocked'), true);
});

test('UI audit: photos unlock after their year and attribution returns to pending review', () => {
  const app = application();
  app.click('mode', { mode: 'auto' });
  for (const [i, year] of data.YEARS.entries()) {
    assert.ok(app.html().includes(media.HISTORY_MEDIA[year.year - 1].path));
    for (const future of data.YEARS.slice(i)) {
      assert.equal(app.html().includes(media.HISTORY_MEDIA[future.year].path), false);
      assert.equal(app.html().includes(media.HISTORY_MEDIA[future.year].title), false);
    }
    app.click('photo', { year: year.year });
    assert.equal(app.modal(), '');
    app.click('nav', { page: 'profile' });
    for (const future of data.YEARS.slice(i)) assert.equal(app.html().includes(media.HISTORY_MEDIA[future.year].path), false);
    app.click('nav', { page: 'game' });
    app.click('settle');
    const review = app.modal();
    assert.ok(review.includes(media.HISTORY_MEDIA[year.year].path));
    app.click('photo', { year: year.year });
    assert.ok(app.modal().includes(media.HISTORY_MEDIA[year.year].artist));
    assert.ok(app.modal().includes(media.HISTORY_MEDIA[year.year].page));
    assert.equal(app.read('pendingReview'), true);
    app.click('close-modal');
    assert.equal(app.modal(), review);
    assert.equal(app.read('pendingReview'), true);
    app.click('continue');
    assert.equal(app.read('pendingReview'), false);
  }
});

test('UI audit: settlement and selected ledger year display all balance-sheet rows to cents', () => {
  const app = application();
  app.click('mode', { mode: 'auto' });
  for (let i = 0; i < 3; i++) {
    app.click('settle');
    assert.ok(app.modal().includes('年初'));
    assert.ok(app.modal().includes('年末'));
    for (const name of ['现金', '宽基股票', '科技', '消费', '医疗', '国债', '黄金', '自住房', '家庭汽车', '住房按揭', '缺口借款', '资产合计', '负债合计']) {
      assert.ok(app.modal().includes(`<th scope="row">${name}</th>`), name);
    }
    assert.ok(app.modal().includes(app.read(`preciseMoney(state.history[${i}].endBalanceSheet.netWorth)`)));
    app.click('continue');
  }
  app.click('nav', { page: 'ledger' });
  app.click('ledger-year', { index: 0 });
  assert.ok(app.html().includes(app.read('preciseMoney(state.history[0].endBalanceSheet.netWorth)')));
  assert.ok(app.html().includes('展开 2007 年家庭收支明细'));
  app.click('ledger-year', { index: 2 });
  assert.ok(app.html().includes('展开 2009 年家庭收支明细'));
});

test('UI audit: all three modes complete twenty rounds with the same chosen strategy', () => {
  const outcomes = [];
  for (const mode of ['player', 'assisted', 'auto']) {
    const app = application();
    app.click('mode', { mode });
    for (let i = 0; i < 20; i++) {
      if (mode !== 'auto') app.click('apply-advisor');
      app.click('settle');
      assert.equal(app.read('state.round'), i + 1);
      app.click('continue');
    }
    assert.ok(app.html().includes('CHAPTER COMPLETE'));
    outcomes.push(app.read('netWorth(state)'));
  }
  assert.equal(outcomes[0], outcomes[1]);
  assert.equal(outcomes[1], outcomes[2]);
});

test('UI audit: historical photos, later-created event illustrations and the fictional finale are accurately labeled', () => {
  assert.deepEqual(Object.keys(media.HISTORY_MEDIA).map(Number), Array.from({ length: 21 }, (_, i) => 2006 + i));
  assert.ok(Object.values(media.HISTORY_MEDIA).filter(item => /航天/.test(item.theme)).length <= 3);
  for (const [year, item] of Object.entries(media.HISTORY_MEDIA)) {
    assert.ok(item.artist && item.license && item.title && item.caption && item.meme);
    const bytes = readFileSync(new URL(`../dist/${item.path.replace(/^\.\//, '')}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, `${year}: media bytes must match attributed asset`);
    if (year === '2026') {
      assert.equal(item.kind, 'scenario');
      assert.match(item.caption, /原创.*架空模拟/);
      assert.match(item.path, /\.svg$/);
      assert.match(bytes.toString(), /<svg/);
      assert.match(bytes.toString(), /模拟|SIMULAT|SCENARIO/i);
      continue;
    }
    if (item.kind === 'illustration') {
      assert.equal(item.capturedAt, null, 'an illustration cannot claim a photography date');
      assert.equal(item.eventDate.slice(0, 4), year);
      assert.ok(item.createdAt > item.eventDate);
      assert.match(item.caption, /原创.*(?:非照片|非产品截图|非芯片实拍)/);
      assert.ok(item.factSources.length > 0);
      for (const source of item.factSources) {
        assert.ok(source.publishedAt <= `${year}-12-31`);
        assert.match(source.url, /^https:\/\//);
      }
      assert.match(bytes.toString(), /原创历史主题图解.*非照片/s);
      assert.doesNotMatch(bytes.toString(), /<script|<foreignObject|onload=|<image/i);
      continue;
    }
    assert.equal(item.kind, 'historical');
    assert.equal(item.capturedAt.slice(0, 4), year);
    assert.match(item.page, /^https:\/\/commons\.wikimedia\.org\//);
    assert.ok(bytes.length > 10000, `${year}: suspiciously small image`);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
});
