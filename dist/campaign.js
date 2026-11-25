import { ASSET_KEYS, COUNTRIES, getCampaignYears } from './history30.js';
import { validateAIText } from './ai.js';

export { ASSET_KEYS, COUNTRIES };
export const CAMPAIGN_RULES = Object.freeze({ version: 4, feeRate: 0.001, aggressiveMinStocks: 60, conservativeMaxStocks: 40 });
export const ACCOUNT_IDS = Object.freeze(['player', 'aggressive', 'conservative']);
const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);
const total = assets => sum(ASSET_KEYS.map(key => assets[key]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const eps = 1e-7;
const emptyAssets = () => Object.fromEntries(ASSET_KEYS.map(key => [key, 0]));
const safeText = (value, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000]/.test(value)) throw new Error('文字格式无效。');
  return value.trim();
};
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

function newAccount(wealth) {
  return { assets: { ...emptyAssets(), cash: wealth }, shortfallDebt: 0, bankrupt: false, bankruptRound: null,
    returnIndex: 1, peakIndex: 1, maxDrawdown: 0, totalIncome: 0, totalExpense: 0,
    totalInvestmentProfit: 0, totalFees: 0, totalContribution: 0,
    lastAllocation: { cash: 100, indexA: 0, indexB: 0, gold: 0 } };
}

export function newCampaign({ country = 'us', seed = 'life-cfo-30', mode = 'manual' } = {}) {
  if (!Object.hasOwn(COUNTRIES, country)) throw new Error('请选择美国或日本。');
  if (!['manual', 'assisted', 'auto'].includes(mode)) throw new Error('游戏模式无效。');
  const normalizedSeed = safeText(String(seed), 80);
  const settings = COUNTRIES[country];
  const startAge = 22 + Math.floor(random(normalizedSeed, 0, 'start-age') * 14);
  return { version: CAMPAIGN_RULES.version, country, seed: normalizedSeed, mode, round: 0, startAge, age: startAge,
    household: { income: settings.annualIncome, expense: settings.annualExpense, priceIndex: 1,
      married: false, marriageAge: null, children: [], inherited: false, lastIllnessAge: null, retired: false },
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, newAccount(settings.initialWealth)])),
    benchmark: newAccount(settings.initialWealth), marketIndices: Object.fromEntries(ASSET_KEYS.map(key => [key, 1])),
    history: [], finished: false, endReason: null };
}

export function validateAllocation(input, { style = 'player' } = {}) {
  if (!plain(input) || Object.keys(input).length !== ASSET_KEYS.length || Object.keys(input).some(key => !ASSET_KEYS.includes(key))) throw new Error('请为全部四类资产设置比例。');
  const allocation = Object.fromEntries(ASSET_KEYS.map(key => {
    if (!finite(input[key]) || !Number.isInteger(input[key]) || input[key] < 0 || input[key] > 100) throw new Error('配置比例必须是 0 至 100 的整数。');
    return [key, input[key]];
  }));
  if (sum(Object.values(allocation)) !== 100) throw new Error('资产比例合计须为 100%。');
  const stocks = allocation.indexA + allocation.indexB;
  if (style === 'aggressive' && stocks < CAMPAIGN_RULES.aggressiveMinStocks) throw new Error('进取对手须保持至少 60% 股票指数。');
  if (style === 'conservative' && stocks > CAMPAIGN_RULES.conservativeMaxStocks) throw new Error('稳健对手股票指数不得超过 40%。');
  return allocation;
}

export function ruleDecisions(state) {
  const budget = householdBudget(state);
  const latest = state.history.at(-1)?.marketReturns;
  const priorSpread = latest ? latest.indexB - latest.indexA : 0;
  const secondTilt = priorSpread > 0.03 ? 8 : priorSpread < -0.03 ? -8 : 0;
  const liquidity = id => {
    const wealth = Math.max(1, accountNetWorth(state.accounts[id]));
    return Math.min(100, Math.round(100 * budget.expense / wealth));
  };
  // The aggressive account tilts between stock indices using the *previous* close.
  const growthCash = Math.max(5, Math.min(25, Math.round(liquidity('aggressive') / 2)));
  const growthStocks = 90 - growthCash;
  const growthSecond = Math.round(growthStocks * 0.45) + secondTilt;
  // The conservative account reserves about a year of spending within policy limits.
  const reserve = Math.max(state.age >= 60 ? 55 : 40, Math.min(65, liquidity('conservative')));
  const steadyStocks = 80 - reserve;
  const steadySecond = Math.round(steadyStocks / 4);
  return {
    player: state.age >= 60 ? { cash: 45, indexA: 25, indexB: 10, gold: 20 } : { cash: 25, indexA: 40, indexB: 20, gold: 15 },
    aggressive: { cash: growthCash, indexA: growthStocks - growthSecond, indexB: growthSecond, gold: 10 },
    conservative: { cash: reserve, indexA: steadyStocks - steadySecond, indexB: steadySecond, gold: 20 },
  };
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
  const year = getCampaignYears(state.country)[state.round];
  if (!year || state.finished) return null;
  const budget = householdBudget(state);
  return { round: state.round, year: year.year, age: state.age, startAge: state.startAge,
    stage: state.age < 30 ? '职业起步' : state.age < 45 ? '家庭成长期' : state.age < 60 ? '积累与照护期' : '退休转换期',
    country: clone(COUNTRIES[state.country]), assetKeys: [...ASSET_KEYS], briefing: clone(year.briefing || []),
    signals: (year.aiContext || []).map((item, index) => ({ id: `signal-${index + 1}`, topic: item.topic, title: item.title, text: item.text })),
    household: { ...clone(state.household), ...budget },
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, { ...clone(state.accounts[id]), netWorth: accountNetWorth(state.accounts[id]) }])) };
}

export function campaignDecisionContext(state) {
  const visible = publicRound(state);
  if (!visible) throw new Error('本局已结束。');
  // No calendar year, URL, article source or named historical entity enters model messages.
  return { stage: state.round + 1, age: state.age, lifeStage: visible.stage, currency: visible.country.currency,
    assets: visible.country.assets.map(({ key, label }) => ({ key, label })), signals: visible.signals,
    household: visible.household, accounts: visible.accounts,
    rules: { allocationTotal: 100, integerPercent: true, annualRebalanceFee: CAMPAIGN_RULES.feeRate,
      aggressiveMinStocks: 60, conservativeMaxStocks: 40,
      timing: '年初配置，全年市场回报，年末家庭现金流；未来个人事件未知。' } };
}
export function campaignContextId(state) { return `campaign4-${campaignHash({ seed: state.seed, country: state.country, ...campaignDecisionContext(state) })}`; }

export function fallbackCampaignPack(state) {
  const context = campaignDecisionContext(state);
  const decisions = ruleDecisions(state);
  const growth = decisions.aggressive, steady = decisions.conservative;
  return { source: 'rules', model: 'campaign-rules-4', contextId: campaignContextId(state), round: state.round,
    decisions,
    analysis: [{ signalId: context.signals[0].id, observation: context.signals[0].text,
      reasoning: state.history.length
        ? `进取账户根据上年两条股指的相对表现调整股票内部权重，本次主指数 ${growth.indexA}%、第二指数 ${growth.indexB}%。`
        : `首轮进取账户用两条股指建立增长仓，两者合计 ${growth.indexA + growth.indexB}%。`,
      risk: '两条股指可以同时下跌。股票占比越高，家庭账面波动越大。' }],
    summary: `进取对手用 ${growth.indexA + growth.indexB}% 投入股指；稳健对手按年度生活预算留出 ${steady.cash}% 现金。两者都在年初重新配仓。` };
}

export function validateCampaignPack(pack, state) {
  if (!plain(pack) || !['rules', 'model'].includes(pack.source) || pack.round !== state.round || pack.contextId !== campaignContextId(state)) throw new Error('AI 决策与本轮账本不匹配。');
  if (!plain(pack.decisions)) throw new Error('缺少三份配置建议。');
  const decisions = Object.fromEntries(ACCOUNT_IDS.map(id => [id, validateAllocation(pack.decisions[id], { style: id })]));
  const signals = campaignDecisionContext(state).signals;
  if (!Array.isArray(pack.analysis) || pack.analysis.length < 1 || pack.analysis.length > 4) throw new Error('AI 分析条数无效。');
  const used = new Set();
  const opinion = value => validateAIText(value, 'AI 分析');
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
  let income = budget.income, expense = budget.expense, windfall = 0;
  const events = [], items = [{ id: 'income', label: state.age >= 62 ? '退休及家庭收入' : '税后家庭工资', amount: income }, { id: 'living', label: '全年生活支出', amount: -expense }];
  const chance = label => random(state.seed, state.round, label);
  const add = (id, title, text, amount) => { events.push({ id, title, text, amount }); items.push({ id, label: title, amount }); };
  if (state.age >= 62 && !household.retired) {
    household.retired = true;
    events.push({ id: 'retirement', title: '迈入退休阶段', text: '模拟家庭收入转为原有水平的 55%，生活开支仍须支付。', amount: 0 });
  }
  if (!household.married && state.age >= 25 && state.age <= 42 && chance('marriage') < 0.12) {
    household.married = true; household.marriageAge = state.age;
    const cost = household.expense * 0.45; expense += cost;
    add('marriage', '组成新家庭', '支付婚礼与安家费用；从下一年起合并部分收入，家庭日常开支也上升。', -cost);
  } else if (household.married && state.age > household.marriageAge && state.age <= 43 && household.children.length < 2
    && (household.children.length === 0 || state.age - household.children.at(-1).parentAgeAtBirth >= 3) && chance('birth') < 0.16) {
    household.children.push({ parentAgeAtBirth: state.age });
    const cost = household.expense * 0.3; expense += cost;
    add('birth', '迎来新成员', '支付生育与婴儿用品费用；下一年起增加抚养开支。', -cost);
  }
  for (const [index, child] of household.children.entries()) if (state.age - child.parentAgeAtBirth === 18) {
    const cost = household.expense * 0.6; expense += cost;
    add(`education-${index}`, '子女升学', '成年子女开始升学，家庭承担一笔教育支出。', -cost);
  }
  if (state.age < 62 && chance('job') < 0.065) {
    const loss = income * (0.25 + chance('job-size') * 0.35); income -= loss;
    add('job-loss', '职业空档', '家庭经历一段工作转换期，本年工资减少；下一年恢复常态基数。', -loss);
  } else if (state.age < 58 && chance('promotion') < 0.09) {
    household.income *= 1.1;
    events.push({ id: 'promotion', title: '职业进阶', text: '岗位升级，下一年起模拟工资基数增加 10%。', amount: 0 });
  }
  if ((household.lastIllnessAge === null || state.age - household.lastIllnessAge >= 5)
    && chance('illness') < (state.age >= 50 ? 0.07 : 0.035)) {
    household.lastIllnessAge = state.age;
    const cost = household.income * (0.6 + chance('illness-size') * 1.5); expense += cost;
    add('illness', '突发健康支出', '这是基础保障之后的模拟自付医疗与康复费用，不代表当地真实医疗账单。', -cost);
  }
  if (!household.inherited && state.age >= 42 && chance('inheritance') < 0.035) {
    household.inherited = true;
    const amount = settings.initialWealth * household.priceIndex * (0.3 + chance('inheritance-size') * 1.4); windfall += amount;
    add('inheritance', '收到家庭遗产', '一次性模拟遗产入账；不会在之后年份重复领取。', amount);
  }
  if (!events.length) events.push({ id: 'ordinary', title: '平常的一年', text: '工作与生活照常推进，日常收支同样影响长期积累。', amount: 0 });
  const year = getCampaignYears(state.country)[state.round];
  household.income *= 1 + year.wageGrowth;
  household.expense *= 1 + year.inflation;
  household.priceIndex *= 1 + year.inflation;
  return { household, events, cashflow: { income, expense, windfall, net: income + windfall - expense, items } };
}

function rebalance(account, allocation, feeRate) {
  const wealth = total(account.assets);
  // Solve capital + trading fees = wealth; charge each noncash purchase/sale once.
  let low = 0, high = wealth;
  for (let i = 0; i < 60; i++) {
    const capital = (low + high) / 2;
    const fees = sum(ASSET_KEYS.filter(key => key !== 'cash').map(key => Math.abs(capital * allocation[key] / 100 - account.assets[key]))) * feeRate;
    if (capital + fees > wealth) high = capital; else low = capital;
  }
  const capital = (low + high) / 2;
  const fees = Math.max(0, wealth - capital);
  account.assets = Object.fromEntries(ASSET_KEYS.map(key => [key, capital * allocation[key] / 100]));
  return { fees, capital };
}

function settleAccount(original, allocation, returns, cashflow, round, { feeRate = CAMPAIGN_RULES.feeRate } = {}) {
  const account = clone(original), startAssets = clone(account.assets), startNetWorth = accountNetWorth(account);
  if (account.bankrupt) return { account, record: { inactive: true, allocation: clone(account.lastAllocation), startAssets, endAssets: clone(account.assets),
    startNetWorth, endNetWorth: startNetWorth, investedCapital: 0, investmentProfit: 0, contribution: 0,
    fees: 0, tradingFees: 0, liquidationFees: 0, portfolioReturn: null, returnIndex: account.returnIndex, bankrupt: true, shortfallDebt: account.shortfallDebt } };
  const { fees: tradingFees, capital } = rebalance(account, allocation, feeRate);
  const investmentProfit = sum(ASSET_KEYS.map(key => account.assets[key] * returns[key]));
  for (const key of ASSET_KEYS) account.assets[key] *= 1 + returns[key];
  const portfolioReturn = capital > eps ? investmentProfit / capital : null;
  if (portfolioReturn !== null) account.returnIndex *= 1 + portfolioReturn;
  account.peakIndex = Math.max(account.peakIndex, account.returnIndex);
  account.maxDrawdown = Math.max(account.maxDrawdown, 1 - account.returnIndex / account.peakIndex);
  account.assets.cash += cashflow.net;
  let liquidationFees = 0;
  if (account.assets.cash < 0) {
    const noncash = sum(ASSET_KEYS.filter(key => key !== 'cash').map(key => account.assets[key]));
    const sold = Math.min(noncash, -account.assets.cash / (1 - feeRate));
    if (noncash > 0) for (const key of ASSET_KEYS.filter(key => key !== 'cash')) account.assets[key] *= Math.max(0, 1 - sold / noncash);
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
    fees, tradingFees, liquidationFees, portfolioReturn, returnIndex: account.returnIndex,
    bankrupt: account.bankrupt, shortfallDebt: account.shortfallDebt };
  const error = endNetWorth - (startNetWorth + investmentProfit + cashflow.net - fees);
  if (Math.abs(error) > Math.max(0.001, Math.abs(endNetWorth) * 1e-10)) throw new Error('账本归因校验失败。');
  return { account, record };
}

export function settleCampaign(state, playerAllocation, suppliedPack = null) {
  if (state.version !== CAMPAIGN_RULES.version || state.finished) throw new Error('本局已结束或版本不兼容。');
  const years = getCampaignYears(state.country), year = years[state.round];
  if (!year) throw new Error('没有可结算的年份。');
  const player = validateAllocation(playerAllocation);
  const pack = validateCampaignPack(suppliedPack || fallbackCampaignPack(state), state);
  const returns = Object.fromEntries(ASSET_KEYS.map(key => {
    if (!finite(year.returns[key]) || year.returns[key] < -1) throw new Error('历史回报数据无效。');
    return [key, year.returns[key]];
  }));
  const next = clone(state), life = lifeYear(state), records = {};
  for (const id of ACCOUNT_IDS) {
    const result = settleAccount(state.accounts[id], id === 'player' ? player : pack.decisions[id], returns, life.cashflow, state.round);
    next.accounts[id] = result.account; records[id] = result.record;
  }
  const benchmarkAllocation = { ...emptyAssets(), [COUNTRIES[state.country].benchmarkKey]: 100 };
  const benchmark = settleAccount(state.benchmark, benchmarkAllocation, returns, life.cashflow, state.round, { feeRate: 0 });
  next.benchmark = benchmark.account;
  for (const key of ASSET_KEYS) next.marketIndices[key] *= 1 + returns[key];
  next.household = life.household;
  next.round++; next.age++;
  next.finished = next.accounts.player.bankrupt || next.round >= years.length;
  next.endReason = next.accounts.player.bankrupt ? 'bankruptcy' : next.finished ? 'completed' : null;
  next.history.push({ round: state.round, year: year.year, age: state.age,
    events: life.events, cashflow: life.cashflow, accounts: records, benchmark: benchmark.record,
    marketReturns: returns, marketIndices: clone(next.marketIndices), reveal: clone(year.reveal), pack,
    playerAllocation: player });
  return next;
}

export function campaignSummary(state) {
  const settings = COUNTRIES[state.country];
  return { round: state.round, rounds: getCampaignYears(state.country).length, age: state.age, startAge: state.startAge,
    country: clone(settings), finished: state.finished, endReason: state.endReason,
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => {
      const investedYears = state.history.filter(item => item.accounts[id].portfolioReturn !== null).length;
      return [id, { ...clone(state.accounts[id]), netWorth: accountNetWorth(state.accounts[id]), investedYears,
        investmentReturn: investedYears ? state.accounts[id].returnIndex - 1 : null,
        annualizedReturn: investedYears ? state.accounts[id].returnIndex ** (1 / investedYears) - 1 : null }];
    })),
    benchmark: { ...clone(state.benchmark), netWorth: accountNetWorth(state.benchmark) },
    curves: [{ year: getCampaignYears(state.country)[0].year - 1,
      netWorth: Object.fromEntries([...ACCOUNT_IDS, 'benchmark'].map(id => [id, settings.initialWealth])),
      returnIndex: Object.fromEntries([...ACCOUNT_IDS, ...ASSET_KEYS].map(id => [id, 1])) },
    ...state.history.map(record => ({ year: record.year,
      netWorth: { ...Object.fromEntries(ACCOUNT_IDS.map(id => [id, record.accounts[id].endNetWorth])), benchmark: record.benchmark.endNetWorth },
      returnIndex: { ...Object.fromEntries(ACCOUNT_IDS.map(id => [id, record.accounts[id].inactive ? null : record.accounts[id].returnIndex])), ...record.marketIndices } }))],
    comparisonMethod: '收益曲线以 1 为同起点，逐年复合年初配置的税费前回报，剔除家庭出入金；指数沿用各自价格或总回报口径。净资产另计共同家庭收支与费用。基准净资产为同起点、同现金流的主指数零费率账户。' };
}

export function restoreCampaign(saved) {
  if (!plain(saved) || saved.version !== CAMPAIGN_RULES.version || !Array.isArray(saved.history) || saved.history.length > 30) throw new Error('这不是可恢复的 30 年旅程存档。');
  let state = newCampaign({ country: saved.country, seed: saved.seed, mode: saved.mode });
  for (const record of saved.history) state = settleCampaign(state, record.playerAllocation, record.pack);
  if (canonical(state) !== canonical(saved)) throw new Error('存档账本或历史记录被修改，无法恢复。');
  return state;
}
