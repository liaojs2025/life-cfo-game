import { ASSET_KEYS, COUNTRIES, getCampaignYears } from './atlas-scenarios.js';
import { validateAIText } from './ai.js';

export { ASSET_KEYS, COUNTRIES };
export const CAMPAIGN_RULES = Object.freeze({ version: 5, feeRate: 0.001, aggressiveMinStocks: 60, conservativeMaxStocks: 40 });
export const STOCK_KEYS = Object.freeze(['broad', 'tech', 'consumer', 'health']);
export const stockWeight = allocation => STOCK_KEYS.reduce((value, key) => value + allocation[key], 0);
export const ACCOUNT_IDS = Object.freeze(['player', 'aggressive', 'conservative']);
const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);
const total = assets => sum(Object.values(assets));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const eps = 1e-7;
const emptyAssets = () => Object.fromEntries(ASSET_KEYS.map(key => [key, 0]));
const safeText = (value, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000]/.test(value)) throw new Error('文字格式无效。');
  return value.trim();
};
export function validateAtlasText(value, label, options = {}) {
  const promises = typeof value === 'string' ? value.replace(/(?:不(?:能|会)?|无法|并非)(?:保证|保證|确保)/g, '不作承诺') : '';
  if (/(?:保证|保證|确保|必然|一定)(?:能|会|可以|将|能够|让你|你|\s)*(?:赚钱|獲利|获利|盈利|回本|翻倍)/.test(promises)) throw new Error(`${label}不能承诺收益。`);
  return validateAIText(value, label, options);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function campaignHash(value) {
  const input = typeof value === 'string' ? value : canonical(value);
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b ^ input.charCodeAt(i), 3266489917); }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
function random(seed, round, label) { return parseInt(campaignHash(`${seed}|${round}|${label}`).slice(0, 8), 16) / 4294967296; }
export const accountNetWorth = account => total(account.assets) - account.shortfallDebt;

function newAccount(wealth, keys = ASSET_KEYS) {
  return { assets: Object.fromEntries(keys.map(key => [key, key === 'cash' ? wealth : 0])), shortfallDebt: 0, bankrupt: false, bankruptRound: null,
    returnIndex: 1, peakIndex: 1, maxDrawdown: 0, totalIncome: 0, totalExpense: 0,
    totalInvestmentProfit: 0, totalFees: 0, totalContribution: 0,
    lastAllocation: Object.fromEntries(keys.map(key => [key, key === 'cash' ? 100 : 0])) };
}

export function newCampaign({ country = 'us', edition = 'full', seed = 'life-cfo-atlas', mode = 'manual' } = {}) {
  if (!Object.hasOwn(COUNTRIES, country)) throw new Error('请选择美国或日本。');
  if (!['full', 'short'].includes(edition)) throw new Error('请选择完整版或简版。');
  if (!['manual', 'assisted', 'auto'].includes(mode)) throw new Error('游戏模式无效。');
  const normalizedSeed = safeText(String(seed), 80);
  const settings = COUNTRIES[country];
  const startAge = 22 + Math.floor(random(normalizedSeed, 0, 'start-age') * 14);
  return { version: CAMPAIGN_RULES.version, country, edition, seed: normalizedSeed, mode, round: 0, startAge, age: startAge,
    household: { income: settings.annualIncome, expense: settings.annualExpense, priceIndex: 1,
      married: false, marriageAge: null, children: [], inherited: false, lastIllnessAge: null, retired: false },
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, newAccount(settings.initialWealth)])),
    benchmark: newAccount(settings.initialWealth, ['cash', 'indexA']), marketIndices: Object.fromEntries([...ASSET_KEYS, 'indexA', 'indexB'].map(key => [key, 1])),
    history: [], finished: false, endReason: null };
}

export function validateAllocation(input, { style = 'player' } = {}) {
  if (!plain(input) || Object.keys(input).length !== ASSET_KEYS.length || Object.keys(input).some(key => !ASSET_KEYS.includes(key))) throw new Error('请为全部七类资产设置比例。');
  const allocation = Object.fromEntries(ASSET_KEYS.map(key => {
    if (!finite(input[key]) || !Number.isInteger(input[key]) || input[key] < 0 || input[key] > 100) throw new Error('配置比例必须是 0 至 100 的整数。');
    return [key, input[key]];
  }));
  if (sum(Object.values(allocation)) !== 100) throw new Error('资产比例合计须为 100%。');
  const stocks = stockWeight(allocation);
  if (style === 'aggressive' && stocks < CAMPAIGN_RULES.aggressiveMinStocks) throw new Error('进取对手须保持至少 60% 股票资产。');
  if (style === 'conservative' && stocks > CAMPAIGN_RULES.conservativeMaxStocks) throw new Error('稳健对手股票资产不得超过 40%。');
  return allocation;
}

export function ruleDecisions(state) {
  const budget = householdBudget(state);
  const year = getCampaignYears(state.country, state.edition)[state.round];
  if (year) budget.expense *= periodInfo(year).periodFraction;
  const latest = state.history.at(-1)?.marketReturns;
  const currentSectorLabel = (year?.assets || COUNTRIES[state.country].assets).find(asset => asset.key === 'tech').label;
  const sameSector = !state.history.length || state.history.at(-1).assetLabels?.tech === currentSectorLabel;
  const priorSpread = latest && sameSector ? latest.tech - latest.broad : 0;
  const techTilt = priorSpread > 0.03 ? 5 : priorSpread < -0.03 ? -5 : 0;
  const liquidity = id => Math.min(100, Math.round(100 * budget.expense / Math.max(1, accountNetWorth(state.accounts[id]))));
  const splitStocks = (weight, tilt = 0) => {
    const tech = Math.round(weight * 0.25) + tilt;
    const consumer = Math.round(weight * 0.125), health = Math.round(weight * 0.125);
    return { broad: weight - tech - consumer - health, tech, consumer, health };
  };
  const growthCash = Math.max(5, Math.min(25, Math.round(liquidity('aggressive') / 2)));
  const growthStocks = 90 - growthCash;
  const reserve = Math.max(state.age >= 60 ? 50 : 30, Math.min(55, liquidity('conservative')));
  const steadyStocks = Math.max(15, 65 - reserve);
  return {
    player: state.age >= 60
      ? { cash: 35, broad: 20, bond: 25, gold: 10, tech: 4, consumer: 3, health: 3 }
      : { cash: 20, broad: 30, bond: 20, gold: 10, tech: 8, consumer: 6, health: 6 },
    aggressive: { cash: growthCash, ...splitStocks(growthStocks, techTilt), bond: 5, gold: 5 },
    conservative: { cash: reserve, ...splitStocks(steadyStocks), bond: 90 - reserve - steadyStocks, gold: 10 },
  };
}

// Calendar metadata is public; financial outcomes and personal events are not.
function periodInfo(year) {
  const fraction = year.periodFraction;
  const date = typeof year.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(year.asOf) ? new Date(`${year.asOf}T00:00:00Z`) : null;
  const start = Date.UTC(year.year, 0, 1), end = Date.UTC(year.year + 1, 0, 1);
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== year.asOf || date.getTime() < start || date.getTime() >= end) throw new Error('截至日期无效。');
  const daysInYear = (end - start) / 86400000, elapsedDays = (date.getTime() - start) / 86400000 + 1;
  if (!finite(fraction) || fraction <= 0 || fraction > 1 || Math.abs(fraction - elapsedDays / daysInYear) > 1e-10 || year.isPartial !== (fraction < 1)) throw new Error('期间天数与截至日期不一致。');
  return { periodFraction: fraction, isPartial: year.isPartial, asOf: year.asOf, daysInYear, elapsedDays };
}

function householdBudget(state) {
  const family = state.household;
  const income = family.income * (family.married ? 1.35 : 1) * (state.age >= 62 ? 0.55 : 1);
  const childCost = sum(family.children.map(child => state.age - child.parentAgeAtBirth < 22 ? 0.18 : 0));
  const expense = family.expense * (1 + (family.married ? 0.3 : 0) + childCost);
  return { income, expense };
}

/** This whitelist never reads a market outcome or a future personal event. */
export function publicRound(state) {
  const year = getCampaignYears(state.country, state.edition)[state.round];
  if (!year || state.finished) return null;
  const budget = householdBudget(state), period = periodInfo(year);
  return { edition: state.edition, ...period, round: state.round, year: year.year, age: state.age, startAge: state.startAge,
    stage: state.age < 30 ? '职业起步' : state.age < 45 ? '家庭成长期' : state.age < 60 ? '积累与照护期' : '退休转换期',
    country: { ...clone(COUNTRIES[state.country]), assets: clone(year.assets || COUNTRIES[state.country].assets) }, assetKeys: [...ASSET_KEYS], briefing: clone(year.briefing || []),
    signals: (year.aiContext || []).map((item, index) => ({ id: `signal-${index + 1}`, topic: item.topic, title: item.title, text: item.text })),
    household: { ...clone(state.household), ...budget, periodIncome: budget.income * period.periodFraction, periodExpense: budget.expense * period.periodFraction },
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, { ...clone(state.accounts[id]), netWorth: accountNetWorth(state.accounts[id]) }])) };
}

export function campaignDecisionContext(state) {
  const visible = publicRound(state);
  if (!visible) throw new Error('本局已结束。');
  // No calendar year, URL, article source or named historical entity enters model messages.
  return { edition: state.edition, periodFraction: visible.periodFraction, isPartial: visible.isPartial, stage: state.round + 1, age: state.age, lifeStage: visible.stage, currency: visible.country.currency,
    assets: visible.country.assets.map(({ key, label }) => ({ key, label })), signals: visible.signals,
    household: visible.household, accounts: visible.accounts,
    rules: { allocationTotal: 100, integerPercent: true, annualRebalanceFee: CAMPAIGN_RULES.feeRate,
      aggressiveMinStocks: 60, conservativeMaxStocks: 40, stockKeys: [...STOCK_KEYS],
      timing: '期初配置，期间实际市场回报，期末家庭现金流；不足全年时经常收支按实际天数折算，一次事件发生后全额支付；未来事件未知。' } };
}
export function campaignContextId(state) { return `atlas5-${campaignHash({ seed: state.seed, country: state.country, ...campaignDecisionContext(state) })}`; }

export function fallbackCampaignPack(state) {
  const context = campaignDecisionContext(state);
  const decisions = ruleDecisions(state);
  const growth = decisions.aggressive, steady = decisions.conservative;
  const assetLabel = key => context.assets.find(asset => asset.key === key).label;
  return { source: 'rules', model: 'atlas-rules-5', contextId: campaignContextId(state), round: state.round,
    decisions,
    analysis: [{ signalId: context.signals[0].id, observation: context.signals[0].text,
      reasoning: state.history.length
        ? `进取账户参考同口径的上期行业与宽基表现调整股票内部权重；行业代理切换时重置倾向。本次${assetLabel('broad')} ${growth.broad}%、${assetLabel('tech')} ${growth.tech}%。`
        : `首轮进取账户用宽基和行业建立增长仓，股票合计 ${stockWeight(growth)}%。`,
      risk: '宽基与行业股票可以同时下跌。股票占比越高，家庭账面波动越大。' }],
    summary: `进取对手用 ${stockWeight(growth)}% 投入股票；稳健对手按生活预算留出 ${steady.cash}% 现金，并配置债券。两者都在期初重新配仓。` };
}

export function validateCampaignPack(pack, state) {
  if (!plain(pack) || !['rules', 'model'].includes(pack.source) || pack.round !== state.round || pack.contextId !== campaignContextId(state)) throw new Error('AI 决策与本轮账本不匹配。');
  if (!plain(pack.decisions)) throw new Error('缺少三份配置建议。');
  const decisions = Object.fromEntries(ACCOUNT_IDS.map(id => [id, validateAllocation(pack.decisions[id], { style: id })]));
  const signals = campaignDecisionContext(state).signals;
  if (!Array.isArray(pack.analysis) || pack.analysis.length < 1 || pack.analysis.length > 4) throw new Error('AI 分析条数无效。');
  const used = new Set();
  const opinion = value => validateAtlasText(value, 'AI 分析');
  const analysis = pack.analysis.map(item => {
    const signal = signals.find(signal => signal.id === item?.signalId);
    if (!signal || used.has(signal.id) || item.observation !== signal.text) throw new Error('AI 引用了本轮不存在或重复的资讯。');
    used.add(signal.id);
    return { signalId: signal.id, observation: signal.text, reasoning: opinion(item.reasoning), risk: opinion(item.risk) };
  });
  const normalized = { source: pack.source, model: safeText(pack.model, 200), contextId: pack.contextId, round: pack.round,
    decisions, analysis, summary: opinion(pack.summary) };
  if (pack.source === 'rules' && canonical(normalized) !== canonical(fallbackCampaignPack(state))) throw new Error('规则对手记录被修改。');
  return normalized;
}

/** Seeded events depend only on the household and year, never on any investment decision. */
function lifeYear(state) {
  const household = clone(state.household), budget = householdBudget(state), settings = COUNTRIES[state.country];
  const year = getCampaignYears(state.country, state.edition)[state.round], period = periodInfo(year);
  let income = budget.income * period.periodFraction, expense = budget.expense * period.periodFraction, windfall = 0;
  const events = [], items = [{ id: 'income', label: state.age >= 62 ? '退休及家庭收入' : '税后家庭工资', amount: income }, { id: 'living', label: period.isPartial ? '截至期生活支出' : '全年生活支出', amount: -expense }];
  const chance = label => random(state.seed, state.round, label);
  const eventDay = label => 1 + Math.floor(chance(`${label}-day`) * period.daysInYear);
  const occurred = label => eventDay(label) <= period.elapsedDays;
  const add = (id, title, text, amount) => { events.push({ id, title, text, amount, dayOfYear: eventDay(id) }); items.push({ id, label: title, amount }); };
  if (state.age >= 62 && !household.retired) {
    household.retired = true;
    events.push({ id: 'retirement', title: '迈入退休阶段', text: '模拟家庭收入转为原有水平的 55%，生活开支仍须支付。', amount: 0, dayOfYear: 1 });
  }
  if (!household.married && state.age >= 25 && state.age <= 42 && chance('marriage') < 0.12 && occurred('marriage')) {
    household.married = true; household.marriageAge = state.age;
    const cost = household.expense * 0.45; expense += cost;
    add('marriage', '组成新家庭', '支付婚礼与安家费用；从下一年起合并部分收入，家庭日常开支也上升。', -cost);
  } else if (household.married && state.age > household.marriageAge && state.age <= 43 && household.children.length < 2
    && (household.children.length === 0 || state.age - household.children.at(-1).parentAgeAtBirth >= 3) && chance('birth') < 0.16 && occurred('birth')) {
    household.children.push({ parentAgeAtBirth: state.age });
    const cost = household.expense * 0.3; expense += cost;
    add('birth', '迎来新成员', '支付生育与婴儿用品费用；下一年起增加抚养开支。', -cost);
  }
  for (const [index, child] of household.children.entries()) if (state.age - child.parentAgeAtBirth === 18 && occurred(`education-${index}`)) {
    const cost = household.expense * 0.6; expense += cost;
    add(`education-${index}`, '子女升学', '成年子女开始升学，家庭承担一笔教育支出。', -cost);
  }
  if (state.age < 62 && chance('job') < 0.065 && occurred('job-loss')) {
    const interruptedFraction = Math.min(0.25 + chance('job-size') * 0.35, (period.elapsedDays - eventDay('job-loss') + 1) / period.daysInYear);
    const loss = budget.income * interruptedFraction; income -= loss;
    add('job-loss', '职业空档', '家庭经历一段工作转换期，本年工资减少；下一年恢复常态基数。', -loss);
  } else if (state.age < 58 && chance('promotion') < 0.09 && occurred('promotion')) {
    household.income *= 1.1;
    events.push({ id: 'promotion', title: '职业进阶', text: '岗位升级，下一年起模拟工资基数增加 10%。', amount: 0, dayOfYear: eventDay('promotion') });
  }
  if ((household.lastIllnessAge === null || state.age - household.lastIllnessAge >= 5)
    && chance('illness') < (state.age >= 50 ? 0.07 : 0.035) && occurred('illness')) {
    household.lastIllnessAge = state.age;
    const cost = state.household.income * (0.6 + chance('illness-size') * 1.5); expense += cost;
    add('illness', '突发健康支出', '这是基础保障之后的模拟自付医疗与康复费用，不代表当地真实医疗账单。', -cost);
  }
  if (!household.inherited && state.age >= 42 && chance('inheritance') < 0.035 && occurred('inheritance')) {
    household.inherited = true;
    const amount = settings.initialWealth * household.priceIndex * (0.3 + chance('inheritance-size') * 1.4); windfall += amount;
    add('inheritance', '收到家庭遗产', '一次性模拟遗产入账；不会在之后年份重复领取。', amount);
  }
  if (!events.length) events.push({ id: 'ordinary', title: '平常的一年', text: '工作与生活照常推进，日常收支同样影响长期积累。', amount: 0 });
  // The final partial period has no following year: do not invent full-year CPI or wages.
  if (!period.isPartial) {
    if (!finite(year.wageGrowth) || year.wageGrowth <= -1 || !finite(year.inflation) || year.inflation <= -1) throw new Error('家庭年度基数数据无效。');
    household.income *= 1 + year.wageGrowth;
    household.expense *= 1 + year.inflation;
    household.priceIndex *= 1 + year.inflation;
  }
  return { household, events, cashflow: { periodFraction: period.periodFraction, recurringIncome: budget.income * period.periodFraction, recurringExpense: budget.expense * period.periodFraction, income, expense, windfall, net: income + windfall - expense, items } };
}

function rebalance(account, allocation, feeRate, keys, replacementKeys) {
  const wealth = total(account.assets);
  if (feeRate === 0) {
    account.assets = Object.fromEntries(keys.map(key => [key, wealth * allocation[key] / 100]));
    return { fees: 0, replacementFees: 0, capital: wealth };
  }
  const replaced = new Set(replacementKeys);
  const turnover = (capital, key) => replaced.has(key)
    ? account.assets[key] + capital * allocation[key] / 100
    : Math.abs(capital * allocation[key] / 100 - account.assets[key]);
  // Solve capital + trading fees = wealth; charge each noncash purchase/sale once.
  // A replacement is two different instruments: sell all old units and buy all new units.
  let low = 0, high = wealth;
  for (let i = 0; i < 60; i++) {
    const capital = (low + high) / 2;
    const fees = sum(keys.filter(key => key !== 'cash').map(key => turnover(capital, key))) * feeRate;
    if (capital + fees > wealth) high = capital; else low = capital;
  }
  const capital = (low + high) / 2;
  const fees = Math.max(0, wealth - capital);
  const replacementFees = sum(keys.filter(key => key !== 'cash' && replaced.has(key)).map(key => turnover(capital, key))) * feeRate;
  account.assets = Object.fromEntries(keys.map(key => [key, capital * allocation[key] / 100]));
  return { fees, capital, replacementFees };
}

function settleAccount(original, allocation, returns, cashflow, round, { feeRate = CAMPAIGN_RULES.feeRate, keys = ASSET_KEYS, replacementKeys = [] } = {}) {
  const account = clone(original), startAssets = clone(account.assets), startNetWorth = accountNetWorth(account);
  if (account.bankrupt) return { account, record: { inactive: true, allocation: clone(account.lastAllocation), startAssets, endAssets: clone(account.assets),
    startNetWorth, endNetWorth: startNetWorth, investedCapital: 0, investmentProfit: 0, contribution: 0,
    fees: 0, tradingFees: 0, replacementFees: 0, liquidationFees: 0, portfolioReturn: null, returnIndex: account.returnIndex, bankrupt: true, shortfallDebt: account.shortfallDebt } };
  const { fees: tradingFees, capital, replacementFees } = rebalance(account, allocation, feeRate, keys, replacementKeys);
  const investmentProfit = sum(keys.map(key => account.assets[key] * returns[key]));
  for (const key of keys) account.assets[key] *= 1 + returns[key];
  const portfolioReturn = capital > eps ? investmentProfit / capital : null;
  if (portfolioReturn !== null) account.returnIndex *= 1 + portfolioReturn;
  account.peakIndex = Math.max(account.peakIndex, account.returnIndex);
  account.maxDrawdown = Math.max(account.maxDrawdown, 1 - account.returnIndex / account.peakIndex);
  account.assets.cash += cashflow.net;
  let liquidationFees = 0;
  if (account.assets.cash < 0) {
    const noncash = sum(keys.filter(key => key !== 'cash').map(key => account.assets[key]));
    const sold = Math.min(noncash, -account.assets.cash / (1 - feeRate));
    if (noncash > 0) for (const key of keys.filter(key => key !== 'cash')) account.assets[key] *= Math.max(0, 1 - sold / noncash);
    liquidationFees = sold * feeRate;
    account.assets.cash += sold - liquidationFees;
    if (account.assets.cash < 0) { account.shortfallDebt = -account.assets.cash; account.assets.cash = 0; }
  }
  if (accountNetWorth(account) <= eps) {
    account.bankrupt = true; account.bankruptRound = round;
  }
  const fees = tradingFees + liquidationFees;
  account.totalIncome += cashflow.income + cashflow.windfall; account.totalExpense += cashflow.expense;
  account.totalInvestmentProfit += investmentProfit; account.totalFees += fees; account.totalContribution += cashflow.net;
  account.lastAllocation = clone(allocation);
  const endNetWorth = accountNetWorth(account);
  const record = { inactive: false, allocation: clone(allocation), startAssets, endAssets: clone(account.assets),
    startNetWorth, endNetWorth, investedCapital: capital, investmentProfit, contribution: cashflow.net,
    fees, tradingFees, replacementFees, liquidationFees, portfolioReturn, returnIndex: account.returnIndex,
    bankrupt: account.bankrupt, shortfallDebt: account.shortfallDebt };
  const error = endNetWorth - (startNetWorth + investmentProfit + cashflow.net - fees);
  if (Math.abs(error) > Math.max(0.001, Math.abs(endNetWorth) * 1e-10)) throw new Error('账本归因校验失败。');
  return { account, record };
}

export function settleCampaign(state, playerAllocation, suppliedPack = null) {
  if (state.version !== CAMPAIGN_RULES.version || state.finished) throw new Error('本局已结束或版本不兼容。');
  const years = getCampaignYears(state.country, state.edition), year = years[state.round];
  if (!year) throw new Error('没有可结算的年份。');
  const player = validateAllocation(playerAllocation);
  const pack = validateCampaignPack(suppliedPack || fallbackCampaignPack(state), state);
  const returns = Object.fromEntries(ASSET_KEYS.map(key => {
    if (!finite(year.returns[key]) || year.returns[key] < -1) throw new Error('历史回报数据无效。');
    return [key, year.returns[key]];
  }));
  const period = periodInfo(year);
  if (period.isPartial && state.round !== years.length - 1) throw new Error('截至期只能是本局最后一期。');
  const benchmarkReturns = Object.fromEntries(['indexA', 'indexB'].map(key => {
    if (!finite(year.benchmarks[key]) || year.benchmarks[key] < -1) throw new Error('对标指数回报无效。');
    return [key, year.benchmarks[key]];
  }));
  const next = clone(state), life = lifeYear(state), records = {};
  const assetLabels = Object.fromEntries((year.assets || COUNTRIES[state.country].assets).map(asset => [asset.key, asset.label]));
  const previousLabels = state.history.at(-1)?.assetLabels;
  const replacementKeys = previousLabels ? ASSET_KEYS.filter(key => key !== 'cash' && previousLabels[key] !== assetLabels[key]) : [];
  for (const id of ACCOUNT_IDS) {
    const result = settleAccount(state.accounts[id], id === 'player' ? player : pack.decisions[id], returns, life.cashflow, state.round, { replacementKeys });
    next.accounts[id] = result.account; records[id] = result.record;
  }
  const benchmark = settleAccount(state.benchmark, { cash: 0, indexA: 100 }, { cash: 0, indexA: benchmarkReturns.indexA }, life.cashflow, state.round, { feeRate: 0, keys: ['cash', 'indexA'] });
  next.benchmark = benchmark.account;
  for (const [key, value] of Object.entries({ ...returns, ...benchmarkReturns })) next.marketIndices[key] *= 1 + value;
  next.household = life.household;
  next.round++; next.age += period.periodFraction;
  next.finished = next.accounts.player.bankrupt || next.round >= years.length;
  next.endReason = next.accounts.player.bankrupt ? 'bankruptcy' : next.finished ? 'completed' : null;
  next.history.push({ round: state.round, year: year.year, age: state.age, ...period,
    assetLabels, assetChanges: replacementKeys.map(key => ({ key, from: previousLabels[key], to: assetLabels[key] })),
    events: life.events, cashflow: life.cashflow, accounts: records, benchmark: benchmark.record,
    marketReturns: returns, benchmarkReturns, marketIndices: clone(next.marketIndices), reveal: clone(year.reveal), pack,
    playerAllocation: player });
  return next;
}

export function campaignSummary(state) {
  const settings = COUNTRIES[state.country];
  return { edition: state.edition, elapsedYears: sum(state.history.map(record => record.periodFraction)), completeYears: state.history.filter(record => !record.isPartial).length, round: state.round, rounds: getCampaignYears(state.country, state.edition).length, age: state.age, startAge: state.startAge,
    country: clone(settings), finished: state.finished, endReason: state.endReason,
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => {
      const invested = state.history.filter(item => item.accounts[id].portfolioReturn !== null);
      const complete = invested.filter(item => !item.isPartial);
      const investedYears = invested.length;
      const completedIndex = complete.reduce((value, item) => value * (1 + item.accounts[id].portfolioReturn), 1);
      return [id, { ...clone(state.accounts[id]), netWorth: accountNetWorth(state.accounts[id]), investedYears, completeYears: complete.length, elapsedYears: sum(invested.map(item => item.periodFraction)),
        investmentReturn: investedYears ? state.accounts[id].returnIndex - 1 : null,
        annualizedReturn: complete.length ? completedIndex ** (1 / complete.length) - 1 : null, annualizedMethod: '仅完整年度配置回报的复合年化；截至期不年化' }];
    })),
    benchmark: { ...clone(state.benchmark), netWorth: accountNetWorth(state.benchmark) },
    curves: [{ year: getCampaignYears(state.country, state.edition)[0].year - 1,
      netWorth: Object.fromEntries([...ACCOUNT_IDS, 'benchmark'].map(id => [id, settings.initialWealth])),
      returnIndex: Object.fromEntries([...ACCOUNT_IDS, ...ASSET_KEYS, 'indexA', 'indexB'].map(id => [id, 1])) },
    ...state.history.map(record => ({ year: record.year, asOf: record.asOf, isPartial: record.isPartial, periodFraction: record.periodFraction,
      netWorth: { ...Object.fromEntries(ACCOUNT_IDS.map(id => [id, record.accounts[id].endNetWorth])), benchmark: record.benchmark.endNetWorth },
      returnIndex: { ...Object.fromEntries(ACCOUNT_IDS.map(id => [id, record.accounts[id].inactive ? null : record.accounts[id].returnIndex])), ...record.marketIndices } }))],
    comparisonMethod: '收益曲线以 1 为同起点，复合各完整年及截至期的期初配置税费前回报，剔除家庭出入金；指数沿用各自价格或总回报口径。净资产另计共同家庭收支与费用。基准净资产为同起点、同现金流的主指数零费率账户。2026 截至期直接计入累计曲线，年化指标仅采用完整年度。' };
}

export function restoreCampaign(saved) {
  if (!plain(saved) || saved.version !== CAMPAIGN_RULES.version || !Array.isArray(saved.history) || !['full', 'short'].includes(saved.edition) || saved.history.length > (saved.edition === 'full' ? 40 : 10)) throw new Error('这不是可恢复的新版旅程存档；旧版需在原入口打开。');
  let state = newCampaign({ country: saved.country, edition: saved.edition, seed: saved.seed, mode: saved.mode });
  for (const record of saved.history) state = settleCampaign(state, record.playerAllocation, record.pack);
  if (canonical(state) !== canonical(saved)) throw new Error('存档账本或历史记录被修改，无法恢复。');
  return state;
}
