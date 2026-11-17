import { YEARS } from './data.js';
import { ASSET_KEYS, STOCK_KEYS, RULES, balanceSheet, annualExpenses, getChoices,
  validateDecision, advisorDecision } from './engine.js';
import { PROVIDERS, OUTPUT_TOKEN_LIMITS, outputTokenField, inferenceParameters, providerForEndpoint, relayURLForLocation } from './providers.js';

const snapshots = new WeakMap();
const clone = value => JSON.parse(JSON.stringify(value));
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
class SafeAIError extends Error {
  constructor(message, code = 'RESPONSE_FORMAT', status = null) {
    super(message);
    this.name = 'SafeAIError';
    this.code = code;
    this.status = status;
    this.category = ({ AUTH: 'authentication', PERMISSION: 'permission', PATH: 'path', MODEL: 'model',
      NETWORK: 'network', TIMEOUT: 'network', CANCELLED: 'cancelled', QUOTA: 'quota',
      UPSTREAM: 'upstream', CONFIG: 'configuration', SECRET_ECHO: 'privacy' })[code] || 'format';
  }
}
const fail = (message, code, status) => { throw new SafeAIError(message, code, status); };
const labels = { cash: '现金', stock: '宽基', tech: '科技', consumer: '消费', health: '医疗', bond: '债券', gold: '黄金' };

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hash(value) {
  const text = stable(value);
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = (Math.imul(second, 33) ^ code) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

/** Best-effort removal of historical identity; this cannot erase model training memories. */
export function anonymize(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:19|20)\d{2}(?:[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?)?年?/g, '某时期')
    .replace(/\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/g, '近期')
    .replace(/(?:S&P\s*500|标普\s*500|纳斯达克|道琼斯)/gi, '宽基市场')
    .replace(/(?:美联储|Federal Reserve|联邦储备委员会)/gi, '央行')
    .replace(/(?:美国|中国|英国|欧洲|欧盟|日本|加拿大)/g, '本地区')
    .replace(/(?:Apple Pay|App Store|iPhone\s*(?:\d+[A-Z]*)?|iPad|iCloud|Siri|苹果|Apple)/gi, '消费科技企业的产品')
    .replace(/(?:Amazon S3|Amazon|亚马逊|Prime Day|AWS|英伟达|NVIDIA|OpenAI|ChatGPT|特斯拉|Tesla|Meta|Facebook|微软|Microsoft|谷歌|Google)/gi, '科技企业')
    .replace(/(?:FDA|H1N1|Sovaldi|Keytruda|CAR-T|辉瑞|Moderna)/gi, '医疗研发项目')
    .replace(/(?:新冠|COVID[- ]?19|冠状病毒|疫情)/gi, '公共卫生冲击')
    .replace(/(?:雷曼|Lehman|特朗普|Trump|拜登|Biden|英国脱欧|Brexit|次贷危机|金融海啸)/gi, '市场事件')
    .replace(/\s+/g, ' ').trim();
}

function publicHousehold(state) {
  const sheet = balanceSheet(state);
  const result = {
    age: state.age, balanceSheet: sheet, plannedAnnualIncome: state.income,
    plannedRecurringExpense: annualExpenses(state), baseExpense: state.baseExpense,
    rent: state.rent, priceIndex: state.priceIndex, lifeScore: state.lifeScore,
    housingOffer: { price: state.marketHomePrice, downPaymentRate: RULES.homeDownPayment,
      purchaseFeeRate: RULES.homePurchaseFee, mortgageRate: RULES.mortgageRate,
      mortgageMonths: RULES.mortgageMonths, maintenanceRate: RULES.homeMaintenance,
      alreadyOwned: state.homeValue > 0 },
    carOffer: { price: RULES.carPrice * state.priceIndex, annualMaintenance: RULES.carMaintenance * state.priceIndex,
      depreciationRate: RULES.carDepreciation, alreadyOwned: state.carValue > 0 },
    insuranceOffer: { annualPremium: RULES.insurancePremium * state.priceIndex,
      deductible: RULES.insuranceDeductible * state.priceIndex, limit: RULES.insuranceLimit * state.priceIndex },
    choices: getChoices(state).map(choice => ({ id: choice.id, label: anonymize(choice.label),
      description: anonymize(choice.description), cost: choice.cost, life: choice.life,
      incomeBoost: choice.incomeBoost || 0, expenseBoost: choice.expenseBoost || 0 })),
  };
  const numeric = [state.age, state.income, state.baseExpense, state.rent, state.priceIndex, state.lifeScore,
    ...Object.values(sheet.assets), ...Object.values(sheet.liabilities)];
  if (numeric.some(number => !Number.isFinite(number))) fail('家庭账本含无效数字，无法请求顾问。');
  return result;
}

const DECISION_SHAPE = {
  allocation: Object.fromEntries(ASSET_KEYS.map(key => [key, '0–100 的整数，七项合计 100'])),
  insurance: 'boolean', buyHome: 'boolean', buyCar: 'boolean', choiceId: '本账户 choices 中的 id',
  rebalance: 'annual 或 hold',
};

export function buildDecisionContext(player, rival) {
  if (player.version !== 3 || rival.version !== 3 || player.round !== rival.round
    || player.round < 0 || player.round >= YEARS.length) fail('双方必须处于同一有效回合，才能请求顾问。');
  const current = YEARS[player.round];
  // Never spread `current`: it contains unrevealed market outcomes and life events.
  const signals = (Array.isArray(current.aiContext) && current.aiContext.length > 0
    ? current.aiContext.map((item, index) => ({ id: `news-${index + 1}`,
      text: anonymize(`${item.topic || ''}｜${item.title || ''}：${item.text || ''}`) }))
    : [
    ...(current.briefing || []).map((item, index) => ({ id: `news-${index + 1}`,
      text: anonymize(`${item.tag || ''}｜${item.title || ''}：${item.text || ''}`) })),
    ...(current.marketSignals || []).map((item, index) => ({ id: `signal-${index + 1}`,
      text: anonymize(`${item.label || ''}：${item.value ?? ''}。${item.context || ''}`) })),
  ]).filter(item => item.text.length > 0);
  const body = {
    stage: player.round + 1, signals,
    households: { player: publicHousehold(player), rival: publicHousehold(rival) },
    rules: { assetKeys: [...ASSET_KEYS], transactionFee: RULES.transactionFee,
      execution: '先支付人生选择与购置成本，再按目标比例配置；随后市场变化，最后结算全年家计。不能透支购买房车。',
      income: '计划收入不是承诺；家庭可能遇到未披露的外生事件。工资与投资回报分开计算。',
      cash: '没有现金比例下限，现金模拟年利率固定为百分之二。hold 不主动调仓。',
      risk: '宽基与行业存在重叠。保险只保障约定医疗费用；房车买入后不能卖出。',
      choices: 'incomeBoost 与 expenseBoost 是从下一回合开始的年度金额增量。' },
    // This v3 hash material stays frozen so saved decision packs remain replayable.
    // requestDecision supplies the current response schema only in the wire payload.
    outputSchema: { analysis: [{ signalId: '必须来自 signals.id', observation: 'signal.text 内连续原文片段',
      reasoning: '只写基于观察的定性推理，不写数值或年代', risk: '定性不确定性，不写数值或年代' }],
      playerDecision: DECISION_SHAPE, rivalDecision: DECISION_SHAPE, summary: '不超过两百字的定性小结，无数值和年代' },
  };
  const context = { contextId: `case3-${hash(body)}`, ...body };
  snapshots.set(context, { player: clone(player), rival: clone(rival), body: stable(context) });
  return context;
}

function text(value, name, max = 600, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max
    || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail(`${name}格式无效，请重试。`);
  return value.trim();
}

function qualitative(value, name, max = 600, allowedYears = []) {
  const result = text(value, name, max);
  const date = /\b(?:19|20)\d{2}\s*年|\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}|(?:一九|二[零〇])[零〇一二三四五六七八九]{2}年|(?:这是|处于|回到|发生在|对应历史|year\s+|in\s+)(?:19|20)\d{2}(?!\d|\s*(?:元|美元))/i;
  // Decisions have no allowed years. A retrospective persona can mention only
  // years supplied by its executed facts; calendar days were never supplied.
  const digits = { 零: '0', 〇: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
  const yearValue = token => Number(/^\d+$/.test(token) ? token : [...token].map(char => digits[char]).join(''));
  // Bare year comparisons still refer to dates; explicit monetary ranges do not.
  const yearRange = /(?<![\d$])((?:19|20)\d{2}|(?:一九|二[零〇])[零〇一二三四五六七八九]{2})\s*年?\s*(?:到|至|与|和|[-–—~～]|\bto\b|\bthrough\b|\bversus\b)\s*((?:19|20)\d{2}|(?:一九|二[零〇])[零〇一二三四五六七八九]{2})\s*年?(?![\d.]|\s*(?:元|美元|dollars?|USD))/gi;
  const unknownYearRange = [...result.matchAll(yearRange)].some(match =>
    !allowedYears.includes(yearValue(match[1])) || !allowedYears.includes(yearValue(match[2])));
  const dateCheck = result.replace(/\b(?:19|20)\d{2}(?!\d)|(?:一九|二[零〇])[零〇一二三四五六七八九]{2}(?=年)/g, token => {
    const year = yearValue(token);
    return allowedYears.includes(year) ? '已执行年度' : token;
  });
  const preciseReturn = /(?:收益率|回报率|收益|回报|上涨|下跌|涨幅|跌幅|亏损|获利|涨|跌|return|gain|rise|fall)[^，,；;。！？\n]{0,12}?(?:[+-]?\d+(?:\.\d+)?\s*(?:[%％]|倍|成|美元|元)|百分之[零〇一二三四五六七八九十百点两]+|[一二三四五六七八九十百千万零〇两半]+(?:成|倍|个百分点))|(?:翻[一二三四五六七八九十两]?倍|翻番)/i;
  const guaranteeText = result.replace(/(?:不能|无法|不会|不作|不构成|不应|不|未|没有)\s*(?:保证(?:收益|回报|盈利)|稳赚(?:不赔)?|一定上涨|一定下跌)/g, '');
  if (unknownYearRange || date.test(dateCheck) || /\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}/.test(result)
    || /(?:\b(?:19|20)\d{2}|(?:一九|二[零〇])[零〇一二三四五六七八九]{2})\s*年\s*(?:\d{1,2}|[一二三四五六七八九十廿]+)\s*月/.test(result)
    || /https?:/i.test(result) || preciseReturn.test(result)
    || /稳赚|保证(?:收益|回报|盈利)|必然(?:上涨|下跌|盈利)|一定(?:上涨|下跌|盈利)|guaranteed\s+(?:profit|return)/i.test(guaranteeText))
    fail(`${name}包含未获准的数值预测或确定性表述，请重试。`);
  return result;
}

function decision(raw, state) {
  if (!plain(raw) || !plain(raw.allocation) || Object.keys(raw.allocation).length !== ASSET_KEYS.length
    || ASSET_KEYS.some(key => !own(raw.allocation, key))) fail('模型没有返回完整的七类资产配置，请重试。');
  const clean = {
    allocation: Object.fromEntries(ASSET_KEYS.map(key => [key, raw.allocation[key]])),
    insurance: raw.insurance, buyHome: raw.buyHome, buyCar: raw.buyCar,
    choiceId: raw.choiceId, rebalance: raw.rebalance,
  };
  const result = validateDecision(state, clean);
  if (!result.valid) fail(`模型决策未通过规则校验：${result.errors.join(' ')}`);
  return clean;
}

function normalizeDecisionPack(raw, player, rival, source, model) {
  const context = buildDecisionContext(player, rival);
  if (!plain(raw) || !Array.isArray(raw.analysis) || raw.analysis.length < 1 || raw.analysis.length > 6)
    fail('模型分析必须包含一至六条可核对的信息引用。');
  const seen = new Set();
  const analysis = raw.analysis.map(item => {
    if (!plain(item)) fail('模型分析格式无效。');
    const signalId = text(item.signalId, '信息编号', 40);
    const signal = context.signals.find(entry => entry.id === signalId);
    if (!signal || seen.has(signalId)) fail('模型引用的事实未出现在本轮信息中，或引用重复。');
    // New answers reference IDs; legacy saved excerpts stay unchanged after validation.
    const observation = own(item, 'observation') ? text(item.observation, '事实观察', 500, 4) : signal.text;
    if (!signal.text.includes(observation)) fail('模型引用的事实未出现在本轮信息中，或引用重复。');
    seen.add(signalId);
    return { signalId, observation, reasoning: qualitative(item.reasoning, '推理'), risk: qualitative(item.risk, '风险') };
  });
  return { source, model, stage: context.stage, contextId: context.contextId, analysis,
    playerDecision: decision(raw.playerDecision, player), rivalDecision: decision(raw.rivalDecision, rival),
    summary: qualitative(raw.summary, '顾问小结', 800) };
}

export function fallbackDecisionPack(player, rival) {
  const context = buildDecisionContext(player, rival);
  const first = context.signals[0];
  if (!first) fail('本轮没有可用公开信息。');
  return normalizeDecisionPack({ analysis: [{ signalId: first.id, observation: first.text.slice(0, 400),
    reasoning: '规则替补使用固定分散配置，不根据这条新闻预测市场；双方家庭预算分别计算。',
    risk: '固定配置不能避免亏损；新闻可能有多种解释，也不能预知家庭事件。' }],
    playerDecision: advisorDecision(player), rivalDecision: advisorDecision(rival),
    summary: '本轮采用规则替补，非大模型分析；你仍可修改自己的选择，对手按固定规则独立行动。',
  }, player, rival, 'rules', 'harbor-rules-3');
}

/** Validates persisted packs as well as requests; does not trust the stored source label. */
export function validateDecisionPack(pack, player, rival) {
  if (!plain(pack) || !['model', 'rules'].includes(pack.source)) fail('顾问记录来源无效。');
  const model = text(pack.model, '模型标识', 200);
  const canonical = normalizeDecisionPack(pack, player, rival, pack.source, model);
  if (pack.contextId !== canonical.contextId || pack.stage !== canonical.stage) fail('顾问记录与本轮双方账本不匹配。');
  if (pack.source === 'rules' && stable(canonical) !== stable(fallbackDecisionPack(player, rival))) fail('规则替补记录与固定规则不一致。');
  return canonical;
}

export function getApiProviderHint(endpoint) {
  let host = '';
  try { host = new URL(String(endpoint)).hostname; } catch { /* UI hints do not validate credentials. */ }
  const entry = PROVIDERS.find(provider => new URL(provider.endpoint).hostname === host);
  if (entry) return { provider: entry.id === 'efund' ? 'EFUND' : entry.name, defaultModel: entry.defaultModel,
    message: `使用 ${entry.name}，默认 ${entry.defaultModel}；也可填写此账号已开通的文本对话模型。` };
  return { provider: '未支持的服务', defaultModel: '', message: '请选择 DeepSeek、EFUND、OpenAI、GLM 或 Kimi 的官方服务地址。' };
}

export function validateConfig(config) {
  if (!plain(config)) fail('请填写兼容接口的基础地址或完整地址。', 'CONFIG');
  const input = config.endpoint || config.baseURL || config.baseUrl || config.base_url;
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) fail('请填写兼容接口的基础地址或完整地址。', 'CONFIG');
  let url;
  try { url = new URL(input.trim()); } catch { fail('接口地址格式无效，请填写包含 https:// 的 URL。', 'CONFIG'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && local) || url.username || url.password || url.hash
    || [...url.searchParams.keys()].some(key => /(?:key|token|auth|secret)/i.test(key)))
    fail('接口须使用 HTTPS（本机可用 HTTP），且不能在 URL 内放密钥。', 'CONFIG');
  const hint = getApiProviderHint(url.href);
  let path = url.pathname.replace(/\/+$/, '');
  if (!path) {
    const known = PROVIDERS.find(provider => new URL(provider.endpoint).hostname === url.hostname);
    path = known ? new URL(known.endpoint).pathname.replace(/\/chat\/completions$/, '')
      : hint.provider === 'Qwen / DashScope' ? '/compatible-mode/v1' : '/v1';
  }
  if (!path.endsWith('/chat/completions')) path += '/chat/completions';
  if (url.hostname === 'api.deepseek.com' && path === '/v1/chat/completions') path = '/chat/completions';
  url.pathname = path;
  const modelValue = typeof config.model === 'string' ? config.model.trim() : '';
  if (!modelValue && !hint.defaultModel) fail('请填写这个兼容服务实际开放的模型 ID。', 'CONFIG');
  const model = text(modelValue || hint.defaultModel, '模型名称', 200);
  if (typeof config.apiKey !== 'string' || !config.apiKey.trim() || config.apiKey.length > 4096 || /[\r\n\u0000]/.test(config.apiKey))
    fail('请填写有效 API Key。密钥只在本次页面内存中使用。', 'CONFIG');
  const apiKey = config.apiKey.trim().replace(/^Bearer\s+/i, '').trim();
  if (!apiKey || /\s/.test(apiKey)) fail('API Key 格式无效，请只粘贴密钥本身。', 'CONFIG');
  if (model.includes(apiKey)) fail('模型名称不能包含 API Key。', 'CONFIG');
  let decodedURL = url.href;
  for (let depth = 0; depth < 5; depth++) {
    if (decodedURL.includes(apiKey)) fail('接口地址不能包含 API Key，请使用独立密钥输入框。', 'CONFIG');
    let next;
    try { next = decodeURIComponent(decodedURL); } catch { fail('接口地址编码无效。', 'CONFIG'); }
    if (next === decodedURL) break;
    decodedURL = next;
  }
  if (decodedURL.includes(apiKey)) fail('接口地址不能包含 API Key，请使用独立密钥输入框。', 'CONFIG');
  return { endpoint: url.href, model, apiKey };
}

export const validateApiConfig = validateConfig;

const DECISION_SYSTEM = `你是一位有明确主张的家庭投资顾问，只分析这份匿名案例中的年初公开信息。
所有金额统一使用“美元”或“$”，不要用“元”省略币种。
先给判断，再引用资讯解释配置：说明更看重哪个变化、为何加减某类资产，以及什么新情况会让你改变判断。敢于作出取舍，不要堆叠“可能”“不保证”“仅供参考”等套话。risk 写具体触发条件和相应调整，不写泛泛的“市场有风险”；条件须能从本案例的家计或资讯更新中观察，不能虚构尚未提供的监测数据。
不得识别真实年份、公司、人物或事件，不得用记忆补齐历史结果，不联网、不调用工具、不寻求外部数据。
同一次请求独立考虑 player 和 rival 两个家庭，给玩家建议与对手执行决策。两者拥有相同信息但账本可能不同。
只输出一个严格 JSON 对象，字段完全遵循 outputSchema，不要 Markdown 围栏。
analysis 只输出 signalId、reasoning、risk。signalId 必须从所给 signals 中原样选取且不重复；不要复写 observation，程序会按编号绑定真实原文。推理、风险和 summary 可以使用当前预算、配置比例及条目编号，但不得识别真实历史年份、断言未来精确涨跌或保证收益。
配置是七个整数，合计恰好一百；禁止负值和杠杆。choiceId 必须是对应家庭可选项。买不起的房车不能购买，已有房车不得再买，缺口借款未还清不得买房车。不要把 hold 目标比例当成实际交易。
不输出 HTML、URL、密钥或任何身份推断。不把自己的预测写成事实。`;

function unsupportedOptional(envelope, fromRelay = false) {
  const error = plain(envelope?.error) ? envelope.error : null;
  if (!error) return false;
  if (fromRelay) return error.code === 'unsupported_parameter'
    && ['response_format', 'temperature'].includes(error.parameter);
  const parameter = error.parameter || error.param;
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : '';
  const message = typeof error.message === 'string' ? error.message.slice(0, 4000) : '';
  const named = ['response_format', 'temperature'].includes(parameter)
    || /\b(?:response_format|temperature)\b/i.test(message);
  return named && (['unsupported_parameter', 'unsupported_value', 'unsupported_param'].includes(code)
    || /(?:not support|unsupported|not allowed|not permitted|unrecognized (?:request )?(?:argument|parameter)|unknown (?:argument|parameter)|不支持)/i.test(message));
}

const RELAY_ERRORS = new Map([
  ['upstream_connection', { statuses: [502], code: 'NETWORK', message: '转发服务未能连接模型服务，本轮未保存结果；请稍后重试。' }],
  ['invalid_response', { statuses: [502], code: 'RESPONSE_FORMAT', message: '模型服务返回了无法解析的响应，本轮未保存结果；请重试或核对接口兼容性。' }],
  ['response_too_large', { statuses: [502], code: 'RESPONSE_FORMAT', message: '模型服务的响应超过大小限制，本轮未保存结果；请重试或更换可用模型。' }],
  ['unsafe_response', { statuses: [502], code: 'SECRET_ECHO', message: '模型服务的响应含敏感凭证，已拦截且未保存本轮结果；请检查接口提供方。' }],
  ['redirect_rejected', { statuses: [502], code: 'PATH', message: '模型服务要求跳转，转发已停止且未保存本轮结果；请检查服务商接口设置。' }],
  ['upstream_error', { statuses: [400, 404, 502], code: 'UPSTREAM', message: '模型服务返回错误，本轮未保存结果；请核对模型设置或稍后重试。' }],
  ['timeout', { statuses: [504], code: 'TIMEOUT', message: '模型服务等待上游响应超时，本轮未保存结果；请重试或明确选择规则替补。' }],
]);

function providerError(status, envelope, fromRelay = false) {
  // Provider text is inspected for categories only, never interpolated into UI errors.
  const error = plain(envelope?.error) ? envelope.error : {};
  if (status === 401) fail('接口认证失败，请检查 API Key 是否正确、有效且属于所选服务商。', 'AUTH', status);
  if (status === 403) fail('接口权限不足，请检查账号、模型权限及服务商地域限制。', 'PERMISSION', status);
  if (status === 429) fail('接口额度不足或请求过于频繁，请稍后重试。', 'QUOTA', status);
  // The relay contract is an exact code/status allowlist. Never interpret its
  // arbitrary messages, injected code suffixes, or unknown error fields.
  if (fromRelay) {
    const safe = RELAY_ERRORS.get(error.code);
    if (safe?.statuses.includes(status)) fail(safe.message, safe.code, status);
  }
  const hint = fromRelay ? '' : [error.code, error.type, error.message]
    .filter(value => typeof value === 'string').join(' ').slice(0, 8000);
  if ((status === 400 || status === 404) && /model(?:[ _-](?:not[ _-]found|not[ _-]supported|unavailable))|(?:model|模型).{0,80}(?:not exist|does not exist|not found|unknown|invalid|unavailable|not support|无效|不存在|不可用)|(?:unknown|invalid|unsupported).{0,20}model/i.test(hint))
    fail('这个模型不可用，请填写该服务商账号已开通的准确模型 ID。', 'MODEL', status);
  if (status === 404 || status === 405) fail('接口路径不存在或不支持此请求，请检查基础地址或完整 chat/completions 地址。', 'PATH', status);
  if (status === 400 || status === 422) fail('接口不接受当前请求格式或参数，请核对模型是否支持 Chat Completions。', 'RESPONSE_FORMAT', status);
  if (status >= 300 && status < 400) fail('接口尝试跳转，已停止发送密钥；请填写最终的接口地址。', 'PATH', status);
  if (status === 504) fail('模型服务等待上游响应超时，本轮未保存结果；请重试或明确选择规则替补。', 'TIMEOUT', status);
  if (status >= 500) fail('模型服务或转发链路暂时不可用，请稍后重试。', 'UPSTREAM', status);
  fail('模型接口拒绝了请求，请检查服务商设置后重试。', 'UPSTREAM', Number.isInteger(status) ? status : null);
}

function parseJSONContent(raw) {
  let content = raw;
  if (Array.isArray(raw)) {
    if (raw.length < 1 || raw.length > 32 || raw.some(part => !plain(part)
      || !['text', 'output_text'].includes(part.type) || typeof part.text !== 'string'))
      fail('模型回答包含不支持的内容类型，请只返回 JSON 文本。');
    content = raw.map(part => part.text).join('');
  }
  if (typeof content !== 'string' || !content.trim() || content.length > 30000) fail('模型回答为空或过长，请重试。');
  content = content.trim();
  // A single optional Markdown fence is accepted; surrounding prose and extra JSON are not.
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(content);
  if (fenced) content = fenced[1].trim();
  let parsed;
  try { parsed = JSON.parse(content); } catch { fail('模型没有返回单个有效 JSON 对象，请重试。'); }
  if (!plain(parsed)) fail('模型必须返回单个 JSON 对象，请重试。');
  return parsed;
}

function waitToRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const complete = () => { signal.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(complete, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

function announceRetry(callback, attempt, reason, maxAttempts = 3) {
  if (typeof callback !== 'function') return;
  // Only fixed transport metadata reaches the UI. Callback failures cannot
  // affect the request, enter a saved model pack, or expose provider content.
  try {
    Promise.resolve(callback(Object.freeze({ attempt, maxAttempts, reason }))).catch(() => {});
  } catch { /* A UI observer is not part of model execution. */ }
}

async function requestJSON(config, system, payload, options = {}, purpose = 'decision') {
  const clean = validateConfig(config);
  // Only exact allowlisted endpoints use the relay. Its credential is in the POST
  // body, avoiding conflict with the hosting platform's Authorization header.
  const provider = providerForEndpoint(clean.endpoint);
  const relayURL = provider ? relayURLForLocation() : null;
  const requestURL = relayURL || clean.endpoint;
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3)
    fail('请求次数必须是 1 至 3 的整数。', 'CONFIG');
  if (options.signal?.aborted) fail('请求已取消。', 'CANCELLED');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = Number.isFinite(options.timeoutMs) ? Math.max(10, Math.min(120000, options.timeoutMs)) : 60000;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const ensureActive = () => {
    if (controller.signal.aborted) fail(timedOut ? '模型请求超时，请重试。' : '请求已取消。', timedOut ? 'TIMEOUT' : 'CANCELLED');
  };
  const request = { model: clean.model, ...inferenceParameters(provider), stream: false,
    response_format: { type: 'json_object' },
    [outputTokenField(provider, clean.model)]: OUTPUT_TOKEN_LIMITS[purpose],
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }] };
  let parametersRetried = false;
  let retryReason = null;
  try {
    // All recovery, including optional-parameter compatibility, shares this
    // three-fetch budget and the original timer/controller. Nothing resets it.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      ensureActive();
      const pending = fetch(requestURL, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: relayURL ? { 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${clean.apiKey}` },
        body: JSON.stringify(relayURL ? { provider, apiKey: clean.apiKey, request } : request),
        signal: controller.signal,
      });
      // Emitted only after this actual retry fetch has been invoked, before
      // waiting for it. Cancelled backoffs therefore never report an attempt.
      if (retryReason) announceRetry(options.onRetry, attempt, retryReason, maxAttempts);
      const response = await pending;
      ensureActive();
      if (Number(response.headers.get('content-length')) > 200000) fail('模型响应过大，已拒绝处理。');
      const body = await response.text();
      ensureActive();
      if (body.length > 200000) fail('模型响应过大，已拒绝处理。');
      let envelope;
      try { envelope = JSON.parse(body); } catch { /* Non-JSON errors still receive a safe status category. */ }
      if (!response.ok) {
        const status = Number(response.status);
        const containsCredential = body.includes(clean.apiKey)
          || envelope !== undefined && stable(envelope).includes(clean.apiKey);
        const canRetry = attempt < maxAttempts && !containsCredential;
        // Optional parameters may be removed once, without changing provider,
        // model, messages or credential, and still consume the same total cap.
        if (canRetry && !parametersRetried && status === 400 && unsupportedOptional(envelope, Boolean(relayURL))) {
          parametersRetried = true;
          delete request.temperature;
          delete request.response_format;
          retryReason = 'parameter';
          continue;
        }
        // Only exact sanitized relay diagnostics qualify for gateway recovery:
        // non-JSON 520, or a socket reset before any response headers arrived.
        // Direct browser network throws and body/validation failures never qualify.
        // A reset can happen after the provider accepted the request, so another
        // attempt may incur another charge and shares the original budget.
        const gateway520 = envelope?.error?.code === 'upstream_error'
          && envelope.error.upstreamStatus === 520 && envelope.error.upstreamReason === 'non_json';
        const resetBeforeHeaders = envelope?.error?.code === 'upstream_connection'
          && envelope.error.upstreamReason === 'connection_reset' && envelope.error.upstreamPhase === 'headers';
        if (relayURL && provider === 'efund' && status === 502
          && (gateway520 || resetBeforeHeaders)) {
          if (canRetry) {
            retryReason = 'gateway';
            await waitToRetry(attempt * 1000, controller.signal);
            continue;
          }
          fail(gateway520 ? '模型网关连接异常（520），本轮未保存结果。请稍后重试，或明确选择本年用规则陪练。'
            : 'EFUND 在返回回答前中断连接，有限重连仍未完成；本轮未保存结果。请稍后重试或选择规则陪练。', gateway520 ? 'UPSTREAM' : 'NETWORK', status);
        }
        providerError(status, envelope, Boolean(relayURL));
      }
      if (body.includes(clean.apiKey)) fail('模型响应含敏感凭证，已拒绝保存；请检查接口提供方。', 'SECRET_ECHO');
      if (!plain(envelope)) fail('接口没有返回有效 JSON 对象，请检查兼容性。');
      const message = envelope?.choices?.[0]?.message;
      const finish = envelope?.choices?.[0]?.finish_reason;
      if (finish != null && finish !== 'stop') fail('模型回答未完整结束，请重新请求。');
      if (message?.tool_calls?.length || message?.function_call) fail('模型尝试调用外部工具，已拒绝该结果。');
      const parsed = parseJSONContent(message?.content);
      if (stable(parsed).includes(clean.apiKey)) fail('模型响应含敏感凭证，已拒绝保存；请检查接口提供方。', 'SECRET_ECHO');
      return { parsed, model: clean.model };
    }
  } catch (error) {
    ensureActive();
    // Never surface provider bodies, browser error text, URLs, or credentials.
    if (error instanceof TypeError) fail('无法连接模型接口。请检查网络、接口地址及浏览器 CORS 支持；可重试或明确选择规则替补。', 'NETWORK');
    if (error instanceof SafeAIError && !error.message.includes(clean.apiKey)) throw error;
    fail('模型请求失败，未保存任何结果；请重试或明确选择规则替补。', 'NETWORK');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

export async function requestDecision(config, context, options = {}) {
  const snapshot = snapshots.get(context);
  if (!snapshot || snapshot.body !== stable(context)) fail('顾问请求上下文无效或已被修改，请重新生成。');
  const payload = { ...context, outputSchema: {
    analysis: [{ signalId: '必须来自 signals.id，不复写 observation',
      reasoning: '先给判断，再说明此资讯为何支持具体配置取舍；可引用当前预算和配置比例',
      risk: '写清哪个具体变化会推翻判断，以及届时调整什么；不编造未提供的数据' }],
    playerDecision: DECISION_SHAPE, rivalDecision: DECISION_SHAPE,
    summary: '直接概括本年主张、双方账本差异和最重要的配置理由；简洁鲜明',
  } };
  const { parsed, model } = await requestJSON(config, DECISION_SYSTEM, payload, options);
  return normalizeDecisionPack(parsed, snapshot.player, snapshot.rival, 'model', model);
}

function executedFacts(player, rival) {
  return ['player', 'rival'].flatMap(account => {
    const state = account === 'player' ? player : rival;
    return state.history.flatMap((record, index) => {
      const base = { account, year: record.year, stage: index + 1 };
      const share = ASSET_KEYS.map(key => `${labels[key]} ${record.allocation[key].toFixed(1)}%`).join('、');
      return [
        { ...base, factId: `${account}-${index + 1}-allocation`, quote: `当年配置后的实际金融资产比例：${share}。` },
        { ...base, factId: `${account}-${index + 1}-choice`, quote: `实际人生选择：${record.choiceLabel}；本年花费 $${Math.round(record.choiceCost)}。` },
        { ...base, factId: `${account}-${index + 1}-protection`, quote: `实际${record.insurancePremium > 0 ? '投保' : '未投保'}；${record.homePurchase ? '本年买房' : '本年未买房'}；${record.carPurchase ? '本年买车' : '本年未买车'}；执行${record.decision.rebalance === 'hold' ? '维持持仓' : '年度再平衡'}。` },
      ];
    });
  });
}

function personaContext(player, rival) {
  if (player.version !== 3 || rival.version !== 3 || player.round !== rival.round || player.round < 3)
    fail('双方至少完成三个同版本回合后才能生成有证据的人格小结。');
  return { description: '只评价游戏里实际执行的财务行为偏好，不是现实心理、能力或健康诊断。',
    facts: executedFacts(player, rival),
    outputSchema: { title: '给玩家的游戏风格称号', description: '只评价实际游戏行为',
      riskPreference: { label: '风险偏好描述', description: '定性依据' },
      traits: [{ label: '行为特点', description: '可解释的偏好' }],
      evidence: [{ factId: '选择 account 为 player 的真实 facts.factId 字段原值',
        interpretation: '这条已执行行为说明的可能偏好，不推断现实心理；不重写年份、账户或原文' }] } };
}

function behaviorText(value, name, max, allowedYears = []) {
  const result = qualitative(value, name, max, allowedYears);
  if (/(?:抑郁症|焦虑症|双相障碍|躁郁|人格障碍|精神病|心理疾病|诊断为|临床诊断)/.test(result))
    fail('人格小结包含心理或健康诊断，已拒绝该结果。');
  return result;
}

function normalizePersona(raw, player, rival, source, model) {
  const context = personaContext(player, rival);
  const completedYears = [...new Set(context.facts.filter(fact => fact.account === 'player').map(fact => fact.year))];
  if (!plain(raw) || !plain(raw.riskPreference) || !Array.isArray(raw.traits)
    || raw.traits.length < 1 || raw.traits.length > 4 || !Array.isArray(raw.evidence)
    || raw.evidence.length < 3 || raw.evidence.length > 6) fail('人格小结需要行为特点和至少三个回合的真实证据。');
  const seen = new Set();
  const stages = new Set();
  const evidence = raw.evidence.map(item => {
    if (!plain(item)) fail('人格证据格式无效。');
    const fact = context.facts.find(entry => entry.factId === item.factId);
    if (!fact || fact.account !== 'player' || seen.has(item.factId)
      || own(item, 'account') && item.account !== fact.account
      || own(item, 'year') && item.year !== fact.year
      || own(item, 'quote') && item.quote !== fact.quote) fail('人格小结引用了未发生或不匹配的决策。');
    seen.add(item.factId);
    stages.add(fact.stage);
    return { year: fact.year, account: fact.account, factId: fact.factId, quote: fact.quote,
      interpretation: behaviorText(item.interpretation, '行为解释', 400, completedYears) };
  });
  if (stages.size < 3) fail('人格小结必须引用至少三个不同回合的玩家真实决策。');
  const result = { source, model, contextId: `persona3-${hash(context)}`,
    title: behaviorText(raw.title, '游戏风格称号', 80, completedYears), description: behaviorText(raw.description, '行为小结', 800, completedYears),
    riskPreference: { label: behaviorText(raw.riskPreference.label, '风险偏好', 80, completedYears),
      description: behaviorText(raw.riskPreference.description, '风险偏好依据', 500, completedYears) },
    traits: raw.traits.map(item => {
      if (!plain(item)) fail('行为特点格式无效。');
      return { label: behaviorText(item.label, '行为特点', 80, completedYears), description: behaviorText(item.description, '特点说明', 500, completedYears) };
    }), evidence, caveat: '仅描述本局已执行的财务行为偏好，不是现实心理诊断，也不证明未来投资能力。' };
  return result;
}

function legacyFallbackPersona(player, rival) {
  const context = personaContext(player, rival);
  const equity = player.history.reduce((total, record) => total + STOCK_KEYS.reduce((sum, key) => sum + record.allocation[key], 0), 0) / player.round;
  const label = equity >= 65 ? '愿意承受股票波动' : equity >= 35 ? '在增长与稳定间取舍' : '更偏向低股票敞口';
  const facts = context.facts.filter(fact => fact.account === 'player' && fact.factId.endsWith('-allocation'));
  const selected = [facts[0], facts[Math.floor((facts.length - 1) / 2)], facts[facts.length - 1]];
  return normalizePersona({ title: '有记录可回看的家庭掌舵人',
    description: '规则小结依据实际配置与已执行选择描述本局风格，不推断你的现实性格。',
    riskPreference: { label, description: '按本局各回合实际股票敞口的平均水平归纳；行情变化和家庭支出也会影响实际配置。' },
    traits: [{ label: '用行动留下证据', description: '把自己的配置、生活选择和保障安排放在一起复盘，比单看最后财富更完整。' }],
    evidence: selected.map(fact => ({ ...fact, interpretation: '这是当年实际执行后的资产比例，可用于回看自己愿意承担的市场敞口。' })),
  }, player, rival, 'rules', 'harbor-rules-3');
}

export function fallbackPersona(player, rival) {
  const context = personaContext(player, rival);
  const equityShare = record => STOCK_KEYS.reduce((total, key) => total + record.allocation[key], 0);
  const equity = player.history.reduce((total, record) => total + equityShare(record), 0) / player.round;
  const insured = player.history.filter(record => record.insurancePremium > 0).length;
  const held = player.history.filter(record => record.decision.rebalance === 'hold').length;
  const style = equity >= 65
    ? { title: '风浪里的进攻船长', label: '股票担当主力', view: '你让股票站到舞台中央，把更多资金交给企业增长，也让账户更直接地承受市场波动。' }
    : equity >= 35
      ? { title: '会换挡的家庭经理', label: '增长与稳定并行', view: '你给股票留了出场空间，也让其他资产分担任务；这份账本的重点是让增长计划和家庭日常同时运转。' }
      : { title: '先打地基的筑城者', label: '低股票敞口', view: '你没有让股票主导账本，把更多资金留给了其他资产；面对市场行情，你更愿意先安排好账户的结构。' };
  const facts = context.facts.filter(fact => fact.account === 'player' && fact.factId.endsWith('-allocation'));
  const selected = [facts[0], facts[Math.floor((facts.length - 1) / 2)], facts[facts.length - 1]];
  return normalizePersona({ title: style.title, description: style.view,
    riskPreference: { label: style.label, description: `本局实际股票配置的年度平均值为 ${equity.toFixed(1)}%。这是你已经执行的资金安排，重点看仓位如何承担任务。` },
    traits: [
      { label: insured === player.round ? '每年留一把伞' : insured === 0 ? '医疗费用自己扛' : '选择性买伞',
        description: `${player.round} 个已完成回合里，你有 ${insured} 年投保。保障是这份家庭计划中可直接核对的一笔安排。` },
      { label: held > player.round / 2 ? '给持仓时间' : '定期重新排阵',
        description: `你有 ${held} 年维持持仓，其余 ${player.round - held} 年执行年度再平衡。前者延续已有布局，后者按当年目标重新分工。` },
    ],
    evidence: selected.map(fact => ({ ...fact,
      interpretation: `这次实际股票敞口为 ${equityShare(player.history[fact.stage - 1]).toFixed(1)}%，记录了你在这一站给增长资产分配的位置。` })),
  }, player, rival, 'rules', 'harbor-rules-3');
}

export function validatePersona(result, player, rival) {
  if (!plain(result) || !['model', 'rules'].includes(result.source)) fail('人格小结来源无效。');
  const canonical = normalizePersona(result, player, rival, result.source, text(result.model, '模型标识', 200));
  if (result.contextId !== canonical.contextId) fail('人格小结与实际决策记录不匹配。');
  if (result.source === 'rules' && stable(canonical) !== stable(fallbackPersona(player, rival))
    && stable(canonical) !== stable(legacyFallbackPersona(player, rival))) fail('规则人格小结与实际记录不一致。');
  return canonical;
}

export async function requestPersona(config, player, rival, options = {}) {
  const context = personaContext(player, rival);
  const system = `为这位玩家写一张有趣、鲜明、有证据的二十年人物卡。先给一个贴切的称号和明确判断，再讲实际选择里的特点、转折或反差；直接说出你的观察，不堆叠“可能”“不保证”“仅供参考”等套话。
所有金额统一使用“美元”或“$”，不要用“元”省略币种。
只依据 facts 中已执行的游戏行为，不评估现实心理健康，不凭最终财富给人贴能力标签。观点可以鲜明，证据必须真实；没有变化的轨迹就写坚持，不编造转折。
只输出严格 JSON，字段遵循 outputSchema。riskPreference 说明风险偏好；引用至少三个不同回合、account 为 player 的真实事实。
riskPreference 必须是含 label 和 description 的对象；traits 必须是 1 至 4 项的数组，每项含 label 和 description；evidence 必须是 3 至 6 项的数组，覆盖至少三个不同回合。不要把对象或数组改成字符串，不要省略这些字段。
outputSchema 中的文字是字段说明，不是回答内容，不要照抄；description 应写基于实际记录的具体行为小结。
每条 evidence 只输出 factId 和 interpretation：factId 必须原样选择所给 facts 中的 factId。不要输出 year、account 或 quote；程序会按编号绑定真实年份、账户和原文，不要尝试复写或改写原句。
factId 保留原始数字；interpretation 和其他文案可以引用并对照玩家已完成的事实年份。每条证据以所选 factId 为主要依据，跨年比较也须来自所给已执行 facts；不要猜测未完成年份或具体日期。可引用实际资金和配置比例，不编造精确市场回报。不要捏造选择，不要把目标比例当实际配置，不要依据收益好坏反推性格。
不联网、不调用工具，不输出 HTML 或 URL。`;
  const snapshotPlayer = clone(player);
  const snapshotRival = clone(rival);
  const payload = { ...context, description: '根据已执行记录写人物卡：鲜明判断、真实证据、具体特点。',
    outputSchema: { ...context.outputSchema, title: '贴合实际选择的生动称号', description: '先给明确判断，再写这局选择的特点与反差',
      riskPreference: { label: '简洁鲜明的风险偏好', description: '用实际配置与行为解释判断' },
      evidence: [{ factId: '原样选择 player 的真实 facts.factId', interpretation: '具体说明这条已执行选择支持什么判断' }] } };
  const { parsed, model } = await requestJSON(config, system, payload, options, 'persona');
  return normalizePersona(parsed, snapshotPlayer, snapshotRival, 'model', model);
}
