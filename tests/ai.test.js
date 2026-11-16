import test from 'node:test';
import assert from 'node:assert/strict';
import { YEARS } from '../dist/data.js';
import { ASSET_KEYS, newGame, settleYear, advisorDecision, simulateStrategy, retailComparison } from '../dist/engine.js';
import { buildDecisionContext, requestDecision, fallbackDecisionPack, validateDecisionPack,
  requestPersona, fallbackPersona, validatePersona, validateApiConfig, getApiProviderHint } from '../dist/ai.js';
import { PUBLIC_RELAY_ORIGIN } from '../dist/providers.js';

const config = { endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', apiKey: 'fake-key-for-unit-tests' };
const clone = value => JSON.parse(JSON.stringify(value));
const response = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  { status: 200, headers: { 'content-type': 'application/json' } });

async function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await run(); } finally { globalThis.fetch = original; }
}

function modelAnswer(player, rival) {
  const answer = fallbackDecisionPack(player, rival);
  delete answer.source;
  delete answer.model;
  delete answer.contextId;
  delete answer.stage;
  return answer;
}

test('decision context uses only public fields, removes identity, and remains stable across UI mode changes', () => {
  const player = newGame();
  const rival = newGame('auto');
  const current = YEARS[0];
  const hiddenKeys = ['year', 'returns', 'event', 'reveal', 'homeReturn', 'inflation'];
  const descriptors = Object.fromEntries(hiddenKeys.map(key => [key, Object.getOwnPropertyDescriptor(current, key)]));
  for (const key of hiddenKeys) Object.defineProperty(current, key, { configurable: true, get() { throw new Error(`hidden read: ${key}`); } });
  try {
    const context = buildDecisionContext(player, rival);
    const serialized = JSON.stringify(context);
    assert.doesNotMatch(serialized, /sourceUrl|publishedAt|asOf|https?:|returns|reveal|medicalCost|200[6789]年|美联储|Amazon|Apple/);
    assert.equal(context.households.player.balanceSheet.netWorth, 100000);
    assert.ok(context.signals.length >= 3);
    assert.equal(buildDecisionContext({ ...player, mode: 'auto' }, rival).contextId, context.contextId);
    const changed = clone(player);
    changed.income += 1000;
    assert.notEqual(buildDecisionContext(changed, rival).contextId, context.contextId);
  } finally {
    for (const key of hiddenKeys) Object.defineProperty(current, key, descriptors[key]);
  }
});

test('one provider request returns both separately validated decisions without persisting credentials', async () => {
  const player = newGame();
  const rival = newGame('auto');
  const context = buildDecisionContext(player, rival);
  const answer = modelAnswer(player, rival);
  answer.playerDecision.allocation = { cash: 0, stock: 0, tech: 100, consumer: 0, health: 0, bond: 0, gold: 0 };
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    assert.equal(url, config.endpoint);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
    const body = JSON.parse(options.body);
    assert.equal(body.tools, undefined);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_object');
    assert.doesNotMatch(options.body, /fake-key-for-unit-tests|sourceUrl|medicalCost|homeReturn/);
    return response(answer);
  }, async () => {
    const pack = await requestDecision(config, context);
    assert.equal(pack.source, 'model');
    assert.equal(pack.model, 'test-model');
    assert.equal(pack.playerDecision.allocation.tech, 100);
    assert.equal(pack.rivalDecision.allocation.tech, 8);
    assert.equal(calls, 1);
    assert.deepEqual(validateDecisionPack(pack, player, rival), pack);
    assert.doesNotMatch(JSON.stringify(pack), /fake-key-for-unit-tests|Authorization/);
  });
});

test('invalid provider allocations, purchases and invented observations fail rather than silently becoming rule decisions', async () => {
  const player = newGame();
  const rival = newGame('auto');
  const mutations = [
    answer => { answer.playerDecision.allocation.tech = 99; },
    answer => { answer.rivalDecision.choiceId = 'not-offered'; },
    answer => { answer.analysis[0].observation = '下个回合股票会翻倍'; },
    answer => { answer.analysis[0].signalId = 'future-market'; },
    answer => { answer.analysis[0].reasoning = '明年预计上涨 35%'; },
    answer => { answer.summary = '这是 2008 年的金融危机'; },
    answer => { answer.analysis[0].risk = '<img src=x onerror=alert(1)>'; },
  ];
  for (const mutate of mutations) {
    const answer = modelAnswer(player, rival);
    mutate(answer);
    await withFetch(async () => response(answer), async () => {
      await assert.rejects(requestDecision(config, buildDecisionContext(player, rival)));
    });
  }
  const owned = settleYear(player, { ...advisorDecision(player), buyHome: true });
  const other = settleYear(rival, advisorDecision(rival));
  const badPurchase = modelAnswer(owned, other);
  badPurchase.playerDecision.buyHome = true;
  await withFetch(async () => response(badPurchase), async () => {
    await assert.rejects(requestDecision(config, buildDecisionContext(owned, other)), /已经拥有/);
  });
});

test('fallback and saved packs bind to both ledgers and cannot masquerade as altered rule outputs', async () => {
  const player = newGame();
  const rival = newGame('auto');
  const pack = fallbackDecisionPack(player, rival);
  assert.equal(pack.source, 'rules');
  assert.deepEqual(validateDecisionPack(pack, player, rival), pack);
  const changed = clone(pack);
  changed.rivalDecision.allocation = { cash: 100, stock: 0, tech: 0, consumer: 0, health: 0, bond: 0, gold: 0 };
  assert.throws(() => validateDecisionPack(changed, player, rival), /固定规则/);
  const nextRival = clone(rival);
  nextRival.income += 1000;
  assert.throws(() => validateDecisionPack(pack, player, nextRival), /不匹配/);
  const context = buildDecisionContext(player, rival);
  context.households.player.lifeScore = 100;
  await assert.rejects(requestDecision(config, context), /已被修改/);
});

test('endpoint validation accepts base, root, full and loopback URLs and rejects URL credentials', () => {
  assert.equal(validateApiConfig(config).endpoint, config.endpoint);
  assert.equal(validateApiConfig({ ...config, endpoint: 'http://localhost:8080/v1/chat/completions' }).endpoint,
    'http://localhost:8080/v1/chat/completions');
  assert.equal(validateApiConfig({ ...config, endpoint: 'https://example.test/' }).endpoint, config.endpoint);
  assert.equal(validateApiConfig({ ...config, endpoint: ' https://example.test/v1/ ' }).endpoint, config.endpoint);
  assert.equal(validateApiConfig({ ...config, endpoint: `${config.endpoint}/` }).endpoint, config.endpoint);
  assert.equal(validateApiConfig({ ...config, endpoint: undefined, baseURL: 'https://example.test/v1' }).endpoint, config.endpoint);
  assert.equal(validateApiConfig({ ...config, apiKey: ` Bearer ${config.apiKey} ` }).apiKey, config.apiKey);
  for (const endpoint of ['http://example.test/v1/chat/completions',
    'https://name:secret@example.test/v1/chat/completions', 'https://example.test/v1/chat/completions?api_key=secret',
    `https://example.test/v1?foo=${config.apiKey}`, `https://example.test/${config.apiKey}/v1`,
    'javascript:alert(1)']) assert.throws(() => validateApiConfig({ ...config, endpoint }));
  assert.throws(() => validateApiConfig({ ...config, model: '' }), /模型 ID/);
});

test('known service roots normalize to their official compatible paths and preserve explicit model IDs', () => {
  for (const [root, endpoint, expectedDefault] of [
    ['https://aigc.efunds.com.cn', 'https://aigc.efunds.com.cn/v1/chat/completions', 'gpt-4o'],
    ['https://api.openai.com', 'https://api.openai.com/v1/chat/completions', 'gpt-4o'],
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions', 'deepseek-flash'],
    ['https://dashscope.aliyuncs.com', 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', 'qwen-plus'],
    ['https://open.bigmodel.cn', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', ''],
    ['https://api.moonshot.cn', 'https://api.moonshot.cn/v1/chat/completions', ''],
  ]) {
    assert.equal(validateApiConfig({ ...config, endpoint: root }).endpoint, endpoint);
    assert.equal(validateApiConfig({ ...config, endpoint: root }).model, config.model);
    assert.equal(getApiProviderHint(root).defaultModel, expectedDefault);
    if (expectedDefault) assert.equal(validateApiConfig({ ...config, endpoint: root, model: '' }).model, expectedDefault);
  }
});

test('provider errors, network errors and success-body key echoes never expose the credential', async () => {
  const player = newGame();
  const rival = newGame('auto');
  for (const stub of [
    async () => new Response(`credentials: ${config.apiKey}`, { status: 401 }),
    async () => { throw new TypeError(`failed to load ${config.apiKey}`); },
    async () => { throw new Error(`模型错误：${config.apiKey}`); },
    async () => { const answer = modelAnswer(player, rival); answer.summary = config.apiKey; return response(answer); },
  ]) {
    await withFetch(stub, async () => {
      await assert.rejects(requestDecision(config, buildDecisionContext(player, rival)), error => {
        assert.equal(error.message.includes(config.apiKey), false);
        return true;
      });
    });
  }
});

test('timeout and cancellation abort provider fetch and produce distinct safe messages', async () => {
  const blocked = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await withFetch(blocked, async () => {
    await assert.rejects(requestDecision(config, buildDecisionContext(newGame(), newGame('auto')), { timeoutMs: 10 }), /超时/);
    const controller = new AbortController();
    const pending = requestDecision(config, buildDecisionContext(newGame(), newGame('auto')), { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, /取消/);
  });
});

test('tool calls, oversize content and non-JSON responses are rejected', async () => {
  const payloads = [
    new Response(JSON.stringify({ choices: [{ message: { content: '{}', tool_calls: [{ name: 'search' }] } }] })),
    new Response(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(30001) } }] })),
    new Response('not json'),
    new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{}\n```' } }] })),
  ];
  for (const payload of payloads) await withFetch(async () => payload, async () => {
    await assert.rejects(requestDecision(config, buildDecisionContext(newGame(), newGame('auto'))));
  });
});

test('personas cite actual executed choices in three different years and reject invented clinical claims', async () => {
  const player = simulateStrategy('balanced', 3);
  const rival = simulateStrategy('advisor', 3);
  const fallback = fallbackPersona(player, rival);
  assert.equal(new Set(fallback.evidence.map(item => item.year)).size, 3);
  assert.deepEqual(validatePersona(fallback, player, rival), fallback);
  await withFetch(async (url, options) => {
    const context = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.equal(context.facts.length, 18);
    assert.ok(context.facts.every(fact => fact.stage <= 3));
    assert.doesNotMatch(JSON.stringify(context), /reveal|medicalCost|nextYear/);
    return response(fallback);
  }, async () => {
    const result = await requestPersona(config, player, rival);
    assert.equal(result.source, 'model');
    assert.deepEqual(validatePersona(result, player, rival), result);
  });
  const invented = clone(fallback);
  invented.source = 'model';
  invented.evidence[0].quote = '实际选择了未发生的购房';
  assert.throws(() => validatePersona(invented, player, rival), /未发生或不匹配/);
  const clinical = clone(fallback);
  clinical.source = 'model';
  clinical.title = '焦虑症人格';
  assert.throws(() => validatePersona(clinical, player, rival), /心理或健康诊断/);
  assert.throws(() => fallbackPersona(newGame(), newGame()), /至少完成三个/);
});

test('persona evidence can select three real IDs while the program binds their exact historical facts', async () => {
  const player = simulateStrategy('balanced', 3);
  const rival = simulateStrategy('advisor', 3);
  const expected = fallbackPersona(player, rival);
  const minimal = clone(expected);
  minimal.evidence = minimal.evidence.map(({ factId, interpretation }) => ({ factId, interpretation }));
  await withFetch(async () => response(minimal), async () => {
    const result = await requestPersona(config, player, rival);
    assert.deepEqual(result.evidence, expected.evidence);
    assert.deepEqual(validatePersona(result, player, rival), result);
  });
  const invented = clone(minimal);
  invented.evidence[0].factId = 'player-99-choice';
  await withFetch(async () => response(invented), async () => {
    await assert.rejects(requestPersona(config, player, rival), /未发生或不匹配/);
  });
  const mismatched = clone(minimal);
  mismatched.evidence[0].year = 2099;
  await withFetch(async () => response(mismatched), async () => {
    await assert.rejects(requestPersona(config, player, rival), /未发生或不匹配/);
  });
});

test('simulated retail percentile uses only annual tax-and-fee-before portfolio returns with midrank ties', () => {
  const same = Object.fromEntries(ASSET_KEYS.map(key => [key, 0.05]));
  const tied = retailComparison({ investedCapital: 100, portfolioReturn: 0.05, returns: same });
  assert.equal(tied.pct, 50);
  assert.equal(tied.strictBeatPct, 0);
  assert.equal(tied.sampleSize, 55);
  assert.match(tied.method, /教学假设/);
  assert.equal(retailComparison({ investedCapital: 100, portfolioReturn: 0.06, returns: same }).pct, 100);
  assert.equal(retailComparison({ investedCapital: 100, portfolioReturn: 0.06, returns: same }).strictBeatPct, 100);
  assert.equal(retailComparison({ investedCapital: 100, portfolioReturn: 0.04, returns: same }).pct, 0);
  assert.equal(retailComparison({ investedCapital: 0, portfolioReturn: 0, returns: same }).available, false);
  const row = simulateStrategy('balanced', 1).history[0];
  const modified = { ...row, income: 1e12, netContribution: 1e12, endNetWorth: 1e12, homeChange: 1e12 };
  assert.deepEqual(retailComparison(row), retailComparison(modified));
});

test('browser allowlisted requests put credentials only in relay body; unknown endpoints stay direct', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true,
    value: { protocol: 'https:', origin: 'https://game.example.test' } });
  try {
    const player = newGame();
    const rival = newGame('auto');
    const urls = [];
    await withFetch(async (url, options) => {
      urls.push(url);
      const body = JSON.parse(options.body);
      if (url === `${PUBLIC_RELAY_ORIGIN}/api/ai`) {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(body.apiKey, config.apiKey);
        assert.equal(body.provider, 'efund');
        assert.equal(body.request.model, config.model);
        assert.equal(body.request.messages.length, 2);
        assert.equal(body.endpoint, undefined);
      } else {
        assert.equal(options.headers.Authorization, `Bearer ${config.apiKey}`);
        assert.equal(body.apiKey, undefined);
      }
      return response(modelAnswer(player, rival));
    }, async () => {
      await requestDecision({ ...config, endpoint: 'https://aigc.efunds.com.cn/v1/chat/completions' }, buildDecisionContext(player, rival));
      await requestDecision(config, buildDecisionContext(player, rival));
      await requestDecision({ ...config, endpoint: 'https://aigc.efunds.com.cn.evil.test/v1/chat/completions' }, buildDecisionContext(player, rival));
    });
    assert.deepEqual(urls, [`${PUBLIC_RELAY_ORIGIN}/api/ai`, config.endpoint,
      'https://aigc.efunds.com.cn.evil.test/v1/chat/completions']);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
    else delete globalThis.location;
  }
});

test('ID-only analysis binds actual visible text and permits current numeric budget reasoning', async () => {
  const player = newGame();
  const rival = newGame('auto');
  const context = buildDecisionContext(player, rival);
  const answer = modelAnswer(player, rival);
  delete answer.analysis[0].observation;
  answer.analysis[0].reasoning = '1. 当前现金为 60000 美元，可将股票比例设为 40%，债券 30%。';
  answer.analysis[0].risk = '资产价格存在波动，40% 的股票敞口需要承受风险，不能保证收益。';
  answer.summary = '保留 20% 现金，结合 2 个家庭各自的预算做决定。';
  await withFetch(async (url, options) => {
    const payload = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.equal(payload.outputSchema.analysis[0].observation, undefined);
    assert.equal(payload.contextId, context.contextId);
    return response(answer);
  }, async () => {
    const pack = await requestDecision(config, context);
    assert.equal(pack.analysis[0].observation, context.signals[0].text);
    assert.equal(pack.analysis[0].reasoning, answer.analysis[0].reasoning);
    assert.deepEqual(validateDecisionPack(pack, player, rival), pack);
  });
  for (const bad of ['科技板块回报为 43.57%', '股票上涨百分之二十', '预计明年上涨 10%',
    '二零零八年会崩盘', '这是 2008 年', '保证收益稳定上涨']) {
    const invalid = clone(answer);
    invalid.summary = bad;
    await withFetch(async () => response(invalid), async () => {
      await assert.rejects(requestDecision(config, buildDecisionContext(player, rival)));
    });
  }
});

test('single fenced JSON objects and text-array content are accepted without accepting surrounding prose', async () => {
  const player = newGame();
  const rival = newGame('auto');
  const answer = modelAnswer(player, rival);
  const json = JSON.stringify(answer);
  for (const content of [`\x60\x60\x60json\n${json}\n\x60\x60\x60`,
    [{ type: 'text', text: json.slice(0, 100) }, { type: 'text', text: json.slice(100) }]]) {
    await withFetch(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })), async () => {
      assert.equal((await requestDecision(config, buildDecisionContext(player, rival))).source, 'model');
    });
  }
  for (const content of [`Here is the JSON: ${json}`, `${json}\n${json}`, `[${json}]`,
    [{ type: 'image_url', image_url: { url: 'https://example.test/image' } }]]) {
    await withFetch(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] })), async () => {
      await assert.rejects(requestDecision(config, buildDecisionContext(player, rival)));
    });
  }
});

test('explicit unsupported optional parameters retry once without format or temperature on the identical endpoint', async () => {
  const player = newGame();
  const rival = newGame('auto');
  for (const error of [
    { code: 'unsupported_parameter', parameter: 'response_format' },
    { message: 'This model does not support temperature=0; only the default value is supported.' },
  ]) {
    const calls = [];
    await withFetch(async (url, options) => {
      calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      return calls.length === 1 ? new Response(JSON.stringify({ error }), { status: 400 }) : response(modelAnswer(player, rival));
    }, async () => {
      assert.equal((await requestDecision(config, buildDecisionContext(player, rival))).source, 'model');
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, calls[1].url);
    assert.deepEqual(calls[0].headers, calls[1].headers);
    assert.deepEqual(calls[0].body.messages, calls[1].body.messages);
    assert.equal(calls[1].body.temperature, undefined);
    assert.equal(calls[1].body.response_format, undefined);
  }
  let calls = 0;
  await withFetch(async () => { calls++; return new Response(JSON.stringify({ error: { code: 'unsupported_parameter', param: 'temperature' } }), { status: 400 }); }, async () => {
    await assert.rejects(requestDecision(config, buildDecisionContext(player, rival)), error => error.category === 'format');
  });
  assert.equal(calls, 2);
});

test('auth, permission, missing models, paths, quota and generic bad requests are classified without retries or raw messages', async () => {
  for (const [status, providerCode, message, code] of [
    [401, 'invalid_api_key', 'bad key', 'AUTH'],
    [403, 'access_denied', 'denied', 'PERMISSION'],
    [404, 'model_not_found', 'model unavailable', 'MODEL'],
    [404, 'not_found', 'invalid path', 'PATH'],
    [429, 'quota', 'quota', 'QUOTA'],
    [400, 'bad_request', 'generic failure', 'RESPONSE_FORMAT'],
    [502, 'upstream_failure', 'connection failed', 'UPSTREAM'],
    [504, 'upstream_timeout', 'upstream deadline exceeded', 'TIMEOUT'],
  ]) {
    let calls = 0;
    await withFetch(async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: providerCode, message: `${message}: ${config.apiKey}` } }), { status });
    }, async () => {
      await assert.rejects(requestDecision(config, buildDecisionContext(newGame(), newGame('auto'))), error => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.equal(error.message.includes(config.apiKey), false);
        return true;
      });
    });
    assert.equal(calls, 1);
  }
});

test('persona retrospectives can repeat each cited fact year, without allowing wrong years or invented returns', async () => {
  const player = simulateStrategy('balanced', 3);
  const rival = simulateStrategy('advisor', 3);
  const expected = fallbackPersona(player, rival);
  const answer = clone(expected);
  answer.description = '回看2007年到2009年，玩家持续关注家庭配置。';
  answer.evidence = answer.evidence.map(({ factId, year }) => ({ factId,
    interpretation: `玩家在${year}年选择了多元化的资产配置，显示出对风险的适度控制和增长机会的关注。` }));
  answer.evidence[1].interpretation = '二〇〇八年的实际配置显示了对分散资产的关注。';
  await withFetch(async () => response(answer), async () => {
    const result = await requestPersona(config, player, rival);
    assert.equal(result.description, answer.description);
    assert.deepEqual(result.evidence.map(item => item.quote), expected.evidence.map(item => item.quote));
    assert.deepEqual(validatePersona(result, player, rival), result);
  });
  for (const mutate of [
    bad => { bad.evidence[0].interpretation = '玩家在2008年选择了多元化配置。'; },
    bad => { bad.evidence[0].interpretation = '玩家在二零零九年选择了多元化配置。'; },
    bad => { bad.description = '到2010年玩家继续扩大股票敞口。'; },
    bad => { bad.evidence[0].interpretation = '玩家在2007年收益率达到50%。'; },
    bad => { bad.evidence[0].interpretation = '玩家在2007-01-01调整配置。'; },
    bad => { bad.evidence[0].year = 2008; },
    bad => { bad.evidence[0].quote = '编造的已执行选择。'; },
  ]) {
    const invalid = clone(answer);
    mutate(invalid);
    await withFetch(async () => response(invalid), async () => {
      await assert.rejects(requestPersona(config, player, rival));
    });
  }
});
