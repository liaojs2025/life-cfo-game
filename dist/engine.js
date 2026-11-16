import { YEARS } from './data.js';

/** All rates are decimal fractions; all balances are nominal US dollars. */
export const ASSET_KEYS = Object.freeze(['cash', 'stock', 'tech', 'consumer', 'health', 'bond', 'gold']);
export const STOCK_KEYS = Object.freeze(['stock', 'tech', 'consumer', 'health']);
const NONCASH_KEYS = ASSET_KEYS.slice(1);
export const RULES = Object.freeze({
  version: 'harbor-3.0', initialNetWorth: 100000, transactionFee: 0.002,
  initialIncome: 72000, initialExpense: 36000, initialRent: 18000,
  incomeGrowth: 0.025, insurancePremium: 1200, insuranceDeductible: 1000,
  insuranceLimit: 30000, homePrice: 240000, homeDownPayment: 0.2,
  homePurchaseFee: 0.02, mortgageRate: 0.05, mortgageMonths: 360,
  homeMaintenance: 0.012, carPrice: 18000, carMaintenance: 1800,
  carDepreciation: 0.15, shortfallDebtRate: 0.12,
});

const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dollars = value => `$${Math.round(value).toLocaleString('en-US')}`;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function newGame(mode = 'player') {
  return {
    version: 3, mode, round: 0, age: 30,
    assets: { cash: 60000, stock: 20000, tech: 0, consumer: 0, health: 0, bond: 15000, gold: 5000 },
    homeValue: 0, carValue: 0,
    mortgage: { balance: 0, monthlyPayment: 0, monthsRemaining: 0 },
    shortfallDebt: 0, income: RULES.initialIncome,
    baseExpense: RULES.initialExpense, rent: RULES.initialRent,
    priceIndex: 1, marketHomePrice: RULES.homePrice, lifeScore: 50,
    history: [], lastDecision: null, returnIndex: 1, peakReturnIndex: 1,
    maxInvestmentDrawdown: 0, peakNetWorth: RULES.initialNetWorth,
    maxNetWorthDrawdown: 0, totalIncome: 0, totalInvestmentProfit: 0,
    totalContribution: 0, shortfallYears: 0, insuredYears: 0,
  };
}

export const createGame = newGame;
export const liquidAssets = state => sum(ASSET_KEYS.map(key => state.assets[key]));
export const netWorth = state => liquidAssets(state) + state.homeValue + state.carValue
  - state.mortgage.balance - state.shortfallDebt;

/** A complete, detached household balance sheet at one instant. */
export function balanceSheet(state) {
  const assets = { ...Object.fromEntries(ASSET_KEYS.map(key => [key, state.assets[key]])),
    home: state.homeValue, car: state.carValue };
  const liabilities = { mortgage: state.mortgage.balance, shortfallDebt: state.shortfallDebt };
  const totalAssets = sum(Object.values(assets));
  const totalLiabilities = sum(Object.values(liabilities));
  return { assets, liabilities, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
}

export function annualExpenses(state) {
  return state.baseExpense - (state.homeValue > 0 ? state.rent : 0)
    + state.homeValue * RULES.homeMaintenance
    + (state.carValue > 0 ? RULES.carMaintenance * state.priceIndex : 0)
    + state.mortgage.monthlyPayment * Math.min(12, state.mortgage.monthsRemaining)
    + ((state.lastDecision?.insurance ?? true) ? RULES.insurancePremium * state.priceIndex : 0);
}

export function currentAllocation(state) {
  const total = liquidAssets(state);
  return Object.fromEntries(ASSET_KEYS.map(key => [key, total > 0 ? state.assets[key] / total * 100 : key === 'cash' ? 100 : 0]));
}

export function defaultDecision(state) {
  const previous = state.lastDecision;
  const available = state.assets.cash + (liquidAssets(state) - state.assets.cash) * (1 - RULES.transactionFee);
  const choices = getChoices(state);
  return {
    allocation: previous ? { ...previous.allocation } : { cash: 25, stock: 40, tech: 0, consumer: 0, health: 0, bond: 25, gold: 10 },
    insurance: previous?.insurance ?? true,
    buyHome: false, buyCar: false,
    choiceId: choices.find(choice => choice.cost <= available)?.id ?? '',
    rebalance: previous?.rebalance ?? 'annual',
  };
}

export function getChoices(state) {
  const choices = YEARS[state.round]?.family.choices || [];
  const available = state.assets.cash + (liquidAssets(state) - state.assets.cash) * (1 - RULES.transactionFee);
  if (choices.length && choices.every(choice => choice.cost > available + 1e-6)) return [...choices, {
    id: 'defer', label: '暂缓计划，先稳住生活', description: '无需支出；生活 −2。资金恢复后再规划新的目标。',
    cost: 0, life: -2, incomeBoost: 0, expenseBoost: 0,
  }];
  return choices;
}

function choiceFor(state, decision) {
  return getChoices(state).find(choice => choice.id === decision.choiceId);
}

function mortgagePayment(principal) {
  const rate = RULES.mortgageRate / 12;
  return principal * rate / (1 - (1 + rate) ** -RULES.mortgageMonths);
}

function plannedExpenses(state, decision) {
  const house = state.homeValue || (decision.buyHome ? state.marketHomePrice : 0);
  const monthly = state.homeValue > 0 ? state.mortgage.monthlyPayment
    : decision.buyHome ? mortgagePayment(state.marketHomePrice * (1 - RULES.homeDownPayment)) : 0;
  return state.baseExpense - (house > 0 ? state.rent : 0) + house * RULES.homeMaintenance
    + (state.carValue > 0 || decision.buyCar ? RULES.carMaintenance * state.priceIndex : 0)
    + monthly * (state.homeValue > 0 ? Math.min(12, state.mortgage.monthsRemaining) : 12)
    + (decision.insurance ? RULES.insurancePremium * state.priceIndex : 0);
}

function upfrontCost(state, decision) {
  return (choiceFor(state, decision)?.cost || 0)
    + (decision.buyHome ? state.marketHomePrice * (RULES.homeDownPayment + RULES.homePurchaseFee) : 0)
    + (decision.buyCar ? RULES.carPrice * state.priceIndex : 0);
}

/** Withdraw cash, selling non-cash assets in proportion to their current value.
 * Cash is allowed below zero temporarily; settlement converts a final deficit to debt. */
function raiseCash(state, amount) {
  const required = Math.max(0, amount - state.assets.cash);
  const riskTotal = sum(NONCASH_KEYS.map(key => state.assets[key]));
  if (required <= 1e-8 || riskTotal <= 1e-8) return { fees: 0, sold: 0 };
  const sold = Math.min(riskTotal, required / (1 - RULES.transactionFee));
  for (const key of NONCASH_KEYS) state.assets[key] *= 1 - sold / riskTotal;
  const fees = sold * RULES.transactionFee;
  state.assets.cash += sold - fees;
  return { fees, sold };
}

function allocate(state, decision) {
  if (decision.rebalance === 'hold') return { fees: 0, turnover: 0 };
  const wealth = liquidAssets(state);
  if (wealth <= 1e-8) return { fees: 0, turnover: 0 };
  const targets = afterFees => Object.fromEntries(ASSET_KEYS.map(key => [key, afterFees * decision.allocation[key] / 100]));
  // Solve final wealth + exact traded-volume fees = starting wealth.
  let low = 0;
  let high = wealth;
  for (let i = 0; i < 64; i++) {
    const middle = (low + high) / 2;
    const target = targets(middle);
    const fees = sum(NONCASH_KEYS.map(key => Math.abs(target[key] - state.assets[key]))) * RULES.transactionFee;
    if (middle + fees > wealth) high = middle;
    else low = middle;
  }
  const target = targets((low + high) / 2);
  const turnover = sum(NONCASH_KEYS.map(key => Math.abs(target[key] - state.assets[key])));
  state.assets = target;
  return { fees: turnover * RULES.transactionFee, turnover };
}

export function validateDecision(state, decision) {
  const errors = [];
  const warnings = [];
  if (state.version !== 3) errors.push('此存档属于旧版规则，请保留旧档并开始新的一局。');
  if (state.round >= YEARS.length) errors.push('这段旅程已经结束，请开始新的人生。');
  if (!decision || typeof decision !== 'object') return { valid: false, errors: ['请选择本年的决策。'], warnings };
  if (!decision.allocation || ASSET_KEYS.some(key => !Number.isInteger(decision.allocation[key])
    || decision.allocation[key] < 0 || decision.allocation[key] > 100)) errors.push('每类资产比例必须是 0–100 的整数。');
  else if (sum(ASSET_KEYS.map(key => decision.allocation[key])) !== 100) errors.push('资产配置比例合计需要为 100%。');
  if (!['annual', 'hold'].includes(decision.rebalance)) errors.push('请选择年度再平衡或维持持仓。');
  if (['insurance', 'buyHome', 'buyCar'].some(key => typeof decision[key] !== 'boolean')) errors.push('保障、购房和购车选项格式有误。');
  if (!choiceFor(state, decision)) errors.push('请选择一项本年的人生决定。');
  if (decision.buyHome && state.homeValue > 0) errors.push('你已经拥有一套住房。');
  if (decision.buyCar && state.carValue > 0) errors.push('你已经拥有一辆车。');
  if (state.shortfallDebt > 0 && (decision.buyHome || decision.buyCar)) errors.push('请先偿还现金缺口借款，再购买房产或车辆。');
  if (errors.length === 0) {
    const cost = upfrontCost(state, decision);
    const available = state.assets.cash + sum(NONCASH_KEYS.map(key => state.assets[key])) * (1 - RULES.transactionFee);
    if (cost > available + 1e-6) errors.push(`年初需要 ${dollars(cost)}，可变现资金只有 ${dollars(available)}。`);
    if (!decision.insurance) warnings.push('本年度医疗支出需要全部自行承担。');
    if (decision.rebalance === 'hold') warnings.push('维持持仓时不执行目标比例；只为实际发生的家庭支出筹资。');
  }
  return { valid: errors.length === 0, errors, warnings };
}

function prepareYear(state, decision) {
  const next = clone(state);
  const choice = choiceFor(state, decision);
  const cost = upfrontCost(state, decision);
  const funding = raiseCash(next, cost);
  next.assets.cash -= cost;
  if (next.assets.cash < 0 && next.assets.cash > -1e-6) next.assets.cash = 0;
  if (decision.buyHome) {
    next.homeValue = state.marketHomePrice;
    const principal = state.marketHomePrice * (1 - RULES.homeDownPayment);
    next.mortgage = { balance: principal, monthlyPayment: mortgagePayment(principal), monthsRemaining: RULES.mortgageMonths };
  }
  if (decision.buyCar) next.carValue = RULES.carPrice * state.priceIndex;
  const trade = allocate(next, decision);
  return { next, choice, upfrontCost: cost, fees: funding.fees + trade.fees };
}

/** Public-information-only budget preview: never reads the current year's returns or event. */
export function previewDecision(state, decision) {
  const validation = validateDecision(state, decision);
  if (!validation.valid) return { ...validation, upfrontCost: 0, projectedCash: state.assets.cash,
    expectedIncome: state.income, expectedExpense: annualExpenses(state), mortgagePayment: 0,
    projectedAllocation: currentAllocation(state), fees: 0, remainingLiquid: liquidAssets(state) };
  const prepared = prepareYear(state, decision);
  return { ...validation, upfrontCost: prepared.upfrontCost, projectedCash: prepared.next.assets.cash,
    expectedIncome: state.income, expectedExpense: plannedExpenses(state, decision),
    mortgagePayment: prepared.next.mortgage.monthlyPayment * Math.min(12, prepared.next.mortgage.monthsRemaining),
    projectedAllocation: currentAllocation(prepared.next), fees: prepared.fees,
    remainingLiquid: liquidAssets(prepared.next) };
}

function amortize(mortgage) {
  let principal = 0;
  let interest = 0;
  const months = Math.min(12, mortgage.monthsRemaining);
  for (let month = 0; month < months && mortgage.balance > 0; month++) {
    const monthlyInterest = mortgage.balance * RULES.mortgageRate / 12;
    const monthlyPrincipal = Math.min(mortgage.balance, mortgage.monthlyPayment - monthlyInterest);
    interest += monthlyInterest;
    principal += monthlyPrincipal;
    mortgage.balance -= monthlyPrincipal;
    mortgage.monthsRemaining--;
  }
  if (mortgage.balance < 1e-7) {
    mortgage.balance = 0;
    mortgage.monthlyPayment = 0;
    mortgage.monthsRemaining = 0;
  }
  return { principal, interest };
}

export function settleYear(state, decision) {
  const validation = validateDecision(state, decision);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const year = YEARS[state.round];
  const startNetWorth = netWorth(state);
  const startBalanceSheet = balanceSheet(state);
  const prepared = prepareYear(state, decision);
  const next = prepared.next;
  const choice = prepared.choice;
  const investedCapital = liquidAssets(next);
  const allocation = currentAllocation(next);
  const liquidReturn = sum(ASSET_KEYS.map(key => {
    const profit = next.assets[key] * year.returns[key];
    next.assets[key] += profit;
    return profit;
  }));
  const homeChange = next.homeValue * year.homeReturn;
  const homeMaintenance = next.homeValue * RULES.homeMaintenance;
  const carDepreciation = next.carValue * RULES.carDepreciation;
  const carMaintenance = next.carValue > 0 ? RULES.carMaintenance * state.priceIndex : 0;
  next.homeValue += homeChange;
  next.carValue -= carDepreciation;
  const mortgage = amortize(next.mortgage);
  const event = year.event || {};
  const income = state.income * (event.incomeMultiplier ?? 1);
  const livingExpense = state.baseExpense - (next.homeValue > 0 ? state.rent : 0);
  const insurancePremium = decision.insurance ? RULES.insurancePremium * state.priceIndex : 0;
  const medicalCost = event.medicalCost || 0;
  const insurancePayout = decision.insurance
    ? Math.min(Math.max(0, medicalCost - RULES.insuranceDeductible * state.priceIndex), RULES.insuranceLimit * state.priceIndex) : 0;
  const eventCost = event.extraCost || 0;
  const debtInterest = state.shortfallDebt * RULES.shortfallDebtRate;
  const homePurchaseFee = decision.buyHome ? state.marketHomePrice * RULES.homePurchaseFee : 0;
  const expenses = livingExpense + insurancePremium + medicalCost - insurancePayout + eventCost
    + homeMaintenance + carMaintenance + mortgage.interest + debtInterest + choice.cost + homePurchaseFee;
  const netContribution = income - expenses;
  // Choice and purchase fee were already paid before investing; mortgage principal is a transfer.
  next.assets.cash += income - (expenses - choice.cost - homePurchaseFee) - mortgage.principal;
  const forced = raiseCash(next, 0);
  const newDebt = Math.max(0, -next.assets.cash);
  next.assets.cash = Math.max(0, next.assets.cash);
  next.shortfallDebt += newDebt;
  // Repay old emergency borrowing before carrying cash into the next year.
  const debtRepaid = Math.min(next.assets.cash, next.shortfallDebt);
  next.assets.cash -= debtRepaid;
  next.shortfallDebt -= debtRepaid;
  const fees = prepared.fees + forced.fees;
  const investmentProfit = liquidReturn + homeChange - carDepreciation - fees;
  const portfolioReturn = investedCapital > 1e-8 ? liquidReturn / investedCapital : 0;
  next.returnIndex *= 1 + portfolioReturn;
  next.peakReturnIndex = Math.max(state.peakReturnIndex, next.returnIndex);
  next.maxInvestmentDrawdown = Math.max(state.maxInvestmentDrawdown,
    next.peakReturnIndex > 0 ? 1 - next.returnIndex / next.peakReturnIndex : 0);
  next.round++;
  next.age++;
  next.income = Math.max(0, state.income * (1 + RULES.incomeGrowth) + (choice.incomeBoost || 0));
  next.baseExpense = Math.max(state.rent * (1 + year.inflation), state.baseExpense * (1 + year.inflation) + (choice.expenseBoost || 0));
  next.rent = state.rent * (1 + year.inflation);
  next.priceIndex *= 1 + year.inflation;
  next.marketHomePrice *= 1 + year.homeReturn;
  const plannedLifeDelta = (choice.life || 0) + (decision.buyHome ? 4 : 0) + (decision.buyCar ? 3 : 0) - (newDebt > 0 ? 8 : 0);
  next.lifeScore = clamp(state.lifeScore + plannedLifeDelta, 0, 100);
  const lifeDelta = next.lifeScore - state.lifeScore;
  next.totalIncome += income;
  next.totalInvestmentProfit += investmentProfit;
  next.totalContribution += netContribution;
  next.shortfallYears += newDebt > 0 ? 1 : 0;
  next.insuredYears += decision.insurance ? 1 : 0;
  next.lastDecision = clone(decision);
  const endNetWorth = netWorth(next);
  const endBalanceSheet = balanceSheet(next);
  next.peakNetWorth = Math.max(state.peakNetWorth, endNetWorth);
  next.maxNetWorthDrawdown = Math.max(state.maxNetWorthDrawdown,
    next.peakNetWorth > 0 ? 1 - endNetWorth / next.peakNetWorth : 0);
  const explanation = [
    `税后工资 ${dollars(income)}；扣除家庭开支后，本年净投入 ${dollars(netContribution)}。`,
    `金融资产回报 ${dollars(liquidReturn)}；房价变动 ${dollars(homeChange)}；车辆折旧 ${dollars(carDepreciation)}；交易费 ${dollars(fees)}。`,
    `净资产变化 ${dollars(endNetWorth - startNetWorth)} = 净投入 ${dollars(netContribution)} + 投资与资产变动 ${dollars(investmentProfit)}。`,
  ];
  if (insurancePayout > 0) explanation.push(`医疗费用 ${dollars(medicalCost)}，简化保障赔付 ${dollars(insurancePayout)}。`);
  if (forced.sold > 0) explanation.push(`年末现金不足，被动卖出 ${dollars(forced.sold)} 的金融资产，已计交易费。`);
  if (newDebt > 0) explanation.push(`资产变现后仍不足，新增现金缺口借款 ${dollars(newDebt)}；从下一年起收取 12% 年息。`);
  if (mortgage.principal > 0) explanation.push(`本年月供：本金 ${dollars(mortgage.principal)} + 利息 ${dollars(mortgage.interest)}。偿还本金只改变资产负债结构。`);
  next.history.push({
    year: year.year, age: next.age, startNetWorth, endNetWorth, startBalanceSheet, endBalanceSheet, income, expenses,
    investmentProfit, investedCapital, liquidReturn, homeChange, carDepreciation, netContribution, fees,
    insurancePremium, insurancePayout, medicalCost, eventCost, livingExpense,
    homeMaintenance, carMaintenance, debtInterest, debtRepaid,
    mortgageInterest: mortgage.interest, mortgagePrincipal: mortgage.principal,
    choiceCost: choice.cost, choiceLabel: choice.label, homePurchase: decision.buyHome,
    carPurchase: decision.buyCar, homePurchaseFee, forcedSales: forced.sold, newDebt,
    lifeDelta, plannedLifeDelta, lifeScore: next.lifeScore, decision: clone(decision), allocation,
    returns: { ...year.returns }, explanation, returnIndex: next.returnIndex,
    portfolioReturn, endAssets: { ...next.assets }, endDebt: next.mortgage.balance + next.shortfallDebt,
  });
  assertState(next);
  if (Math.abs(endNetWorth - startNetWorth - investmentProfit - netContribution) > 0.01)
    throw new Error('账本核验失败：净资产变动无法与现金流和资产回报对齐。');
  return next;
}

/** Educational rule adviser; receives no current/future market data. */
export function advisorDecision(state) {
  const decision = defaultDecision(state);
  decision.allocation = { cash: 20, stock: 20, tech: 8, consumer: 6, health: 6, bond: 30, gold: 10 };
  decision.insurance = true;
  decision.rebalance = 'annual';
  const choices = getChoices(state);
  const wealth = liquidAssets(state);
  const spendLimit = Math.max(0, Math.min(wealth * 0.08, state.income * 0.12));
  const affordable = choices.filter(choice => choice.cost <= spendLimit);
  const ranked = [...(affordable.length ? affordable : choices)].sort((a, b) => {
    const score = choice => (choice.life || 0) * 700 + (choice.incomeBoost || 0) * 2 - choice.cost - (choice.expenseBoost || 0) * 2;
    return score(b) - score(a);
  });
  decision.choiceId = ranked[0]?.id ?? '';
  // Buy only from observable balance-sheet capacity, never from knowledge of future prices.
  if (state.homeValue === 0 && state.shortfallDebt === 0 && wealth > state.marketHomePrice * 0.7
    && state.income > state.marketHomePrice * 0.25) decision.buyHome = true;
  if (state.carValue === 0 && state.shortfallDebt === 0 && state.lifeScore < 65
    && wealth > 260000) decision.buyCar = true;
  if (!validateDecision(state, decision).valid) {
    decision.buyHome = false;
    decision.buyCar = false;
    decision.choiceId = [...choices].sort((a, b) => a.cost - b.cost)[0]?.id ?? '';
  }
  return decision;
}

export function simulateStrategy(strategy = 'balanced', rounds = YEARS.length) {
  let state = newGame(strategy === 'advisor' ? 'auto' : 'benchmark');
  for (let i = 0; i < Math.min(rounds, YEARS.length); i++) {
    let decision = advisorDecision(state);
    if (typeof strategy === 'function') decision = strategy(clone(state));
    else if (strategy === 'cash') {
      decision = { ...decision, allocation: { cash: 100, stock: 0, tech: 0, consumer: 0, health: 0, bond: 0, gold: 0 }, buyHome: false, buyCar: false };
    } else if (strategy === 'balanced') {
      decision = { ...decision, allocation: { cash: 20, stock: 40, tech: 0, consumer: 0, health: 0, bond: 30, gold: 10 }, buyHome: false, buyCar: false };
    } else if (strategy === 'growth') {
      decision = { ...decision, allocation: { cash: 10, stock: 70, tech: 0, consumer: 0, health: 0, bond: 10, gold: 10 }, buyHome: false, buyCar: false };
    } else if (['tech', 'consumer', 'health'].includes(strategy)) {
      decision = { ...decision, allocation: { cash: 20, stock: 0, tech: 0, consumer: 0, health: 0,
        bond: 30, gold: 10, [strategy]: 40 }, buyHome: false, buyCar: false };
    }
    state = settleYear(state, decision);
  }
  return state;
}

export function summary(state) {
  const worth = netWorth(state);
  const debtFreeYears = state.history.filter(record => record.newDebt <= 1e-6
    && record.endBalanceSheet.liabilities.shortfallDebt <= 1e-6).length;
  const inflationAdjustedWorth = worth / state.priceIndex;
  const goals = [
    { id: 'security', label: `稳稳走完：${YEARS.length} 年无缺口借款`, achieved: debtFreeYears === YEARS.length,
      value: debtFreeYears, target: YEARS.length, progress: clamp(debtFreeYears / YEARS.length, 0, 1) },
    { id: 'wealth', label: '挑战 100 万美元净资产', achieved: worth >= 1000000,
      value: worth, target: 1000000, progress: clamp(worth / 1000000, 0, 1) },
    { id: 'life', label: '生活满意度达到 75', achieved: state.lifeScore >= 75 && state.shortfallDebt === 0,
      value: state.lifeScore, target: 75, progress: clamp(state.lifeScore / 75, 0, 1) },
  ];
  const score = Math.round(clamp(clamp(worth / 1000000, 0, 1) * 35 + state.lifeScore * 0.25
    + (state.round ? debtFreeYears / state.round : 0) * 20 + (state.round ? state.insuredYears / state.round : 0) * 20
    - state.shortfallYears * 8 - (state.shortfallDebt > 0 ? 20 : 0), 0, 100));
  const title = score >= 85 ? '从容的家庭掌舵人' : score >= 65 ? '稳步成长的人生 CFO'
    : score >= 45 ? '正在找到平衡的探索者' : '值得重新规划的一段旅程';
  const lessons = [];
  if (state.history.some(record => record.forcedSales > 0)) lessons.push('现金缓冲能减少被动卖出；配置比例之外，还需要关注生活支出的时间。');
  else lessons.push('你的现金安排避免了年末被动卖出，给家庭留下了选择空间。');
  if (state.insuredYears < state.round) lessons.push('少交保费会增加当期可用资金，也意味着医疗风险由家庭资产承担。');
  else lessons.push('连续保障把部分医疗损失转移出去；保费是保障成本，不是投资收益。');
  lessons.push(`这段旅程累计家庭净投入 ${dollars(state.totalContribution)}，投资与资产变动 ${dollars(state.totalInvestmentProfit)}。工资积累与投资能力需要分开看。`);
  if (state.homeValue > 0) lessons.push('住房增加居住稳定性，也让部分财富难以随时变现；按揭本金偿还是资产负债转换。');
  return { netWorth: worth, liquidAssets: liquidAssets(state), investmentProfit: state.totalInvestmentProfit,
    netContribution: state.totalContribution, income: state.totalIncome, inflationAdjustedWorth,
    maxInvestmentDrawdown: state.maxInvestmentDrawdown, maxNetWorthDrawdown: state.maxNetWorthDrawdown,
    lifeScore: state.lifeScore, debtFreeYears, insuredYears: state.insuredYears,
    shortfallYears: state.shortfallYears, goals, grade: score, score, title, lessons,
    allocation: currentAllocation(state), completed: state.round >= YEARS.length,
    investmentReturn: state.returnIndex - 1, shortfallDebt: state.shortfallDebt,
  };
}

export const summarize = summary;

// The grid is fixed before any market returns are read. It is not a survey or account dataset.
const RETAIL_STYLE_POOL = (() => {
  const unique = new Map();
  for (const equityShare of [0, 20, 40, 60, 80, 100]) {
    for (const focus of STOCK_KEYS) {
      for (const [cash, bond, gold] of [[1, 0, 0], [0.25, 0.75, 0], [0.25, 0.5, 0.25]]) {
        const weights = Object.fromEntries(ASSET_KEYS.map(key => [key, 0]));
        weights[focus] = equityShare;
        weights.cash = (100 - equityShare) * cash;
        weights.bond = (100 - equityShare) * bond;
        weights.gold = (100 - equityShare) * gold;
        unique.set(JSON.stringify(weights), Object.freeze(weights));
      }
    }
  }
  return Object.freeze([...unique.values()]);
})();

export function retailComparison(record) {
  if (!record || !Number.isFinite(record.portfolioReturn)
    || ASSET_KEYS.some(key => !Number.isFinite(record.returns?.[key]))) throw new Error('年度投资收益记录无效，无法计算模拟分位。');
  const method = '固定的股票集中度与股债金配置网格，比较相同年度七类金融资产的税费前收益率；超过比例只计严格低于玩家的策略，并列不计超过；百分位将并列按半个样本计。不含工资、房车或家庭开支。全部为教学假设，美股美元体系，不代表真实中国散户或 A 股统计。';
  if (!Number.isFinite(record.investedCapital) || record.investedCapital <= 1e-8) return {
    available: false, pct: null, strictBeatPct: null, sampleSize: RETAIL_STYLE_POOL.length, portfolioReturn: null,
    version: 'retail-style-grid-v1', label: '中国散户风格模拟参照池',
    method: `本年没有可计算回报的年初金融投资本金，因此不参与排名。${method}`,
  };
  const distribution = RETAIL_STYLE_POOL.map(weights => sum(ASSET_KEYS.map(key => weights[key] / 100 * record.returns[key])));
  const below = distribution.filter(value => value < record.portfolioReturn - 1e-10).length;
  const tied = distribution.filter(value => Math.abs(value - record.portfolioReturn) <= 1e-10).length;
  return { available: true, pct: Math.round((below + tied * 0.5) / distribution.length * 1000) / 10,
    strictBeatPct: Math.round(below / distribution.length * 1000) / 10,
    sampleSize: distribution.length, portfolioReturn: record.portfolioReturn, version: 'retail-style-grid-v1',
    label: '中国散户风格模拟参照池',
    method };
}

function assertBalanceSheet(sheet) {
  const assets = [...ASSET_KEYS, 'home', 'car'].map(key => sheet?.assets?.[key]);
  const liabilities = ['mortgage', 'shortfallDebt'].map(key => sheet?.liabilities?.[key]);
  if ([...assets, ...liabilities].some(value => !finite(value) || value < -1e-6)
    || ![sheet?.totalAssets, sheet?.totalLiabilities, sheet?.netWorth].every(finite)
    || Math.abs(sum(assets) - sheet.totalAssets) > 0.01
    || Math.abs(sum(liabilities) - sheet.totalLiabilities) > 0.01
    || Math.abs(sheet.totalAssets - sheet.totalLiabilities - sheet.netWorth) > 0.01)
    throw new Error('资产负债表逐项金额与汇总不一致。');
}

/** Used for saved-game validation as well as invariant checks after settlement. */
export function assertState(state) {
  if (state?.version !== 3) throw new Error('此存档属于旧版规则，请保留旧档并开始新的一局。');
  if (!state || !Number.isInteger(state.round) || state.round < 0 || state.round > YEARS.length
    || !Array.isArray(state.history) || state.history.length !== state.round) throw new Error('存档格式或回合记录无效。');
  const amounts = [...ASSET_KEYS.map(key => state.assets?.[key]), state.homeValue, state.carValue,
    state.mortgage?.balance, state.mortgage?.monthlyPayment, state.shortfallDebt, state.income,
    state.baseExpense, state.rent, state.priceIndex, state.marketHomePrice, state.returnIndex,
    state.peakReturnIndex, state.peakNetWorth, state.totalIncome];
  if (amounts.some(value => !finite(value) || value < -1e-6)) throw new Error('账本包含无效或负数资产。');
  if (![state.totalContribution, state.totalInvestmentProfit, state.lifeScore, state.maxInvestmentDrawdown,
    state.maxNetWorthDrawdown].every(finite)) throw new Error('存档统计数值无效。');
  if (Math.abs(netWorth(state) - RULES.initialNetWorth - state.totalContribution - state.totalInvestmentProfit) > 0.02)
    throw new Error('存档中的资产与累计现金流不一致。');
  state.history.forEach((record, index) => {
    assertBalanceSheet(record.startBalanceSheet);
    assertBalanceSheet(record.endBalanceSheet);
    if (Math.abs(record.startBalanceSheet.netWorth - record.startNetWorth) > 0.01
      || Math.abs(record.endBalanceSheet.netWorth - record.endNetWorth) > 0.01)
      throw new Error('年度资产负债表与净资产记录不一致。');
    if (index > 0) {
      const previous = state.history[index - 1].endBalanceSheet;
      const current = record.startBalanceSheet;
      if ([...ASSET_KEYS, 'home', 'car'].some(key => Math.abs(previous.assets[key] - current.assets[key]) > 0.01)
        || ['mortgage', 'shortfallDebt'].some(key => Math.abs(previous.liabilities[key] - current.liabilities[key]) > 0.01))
        throw new Error('年度资产负债表起点与上一年终点不一致。');
    }
  });
  return true;
}

export function restoreGame(value) {
  assertState(value);
  let replay = newGame(value.mode);
  for (const record of value.history) replay = settleYear(replay, record.decision);
  if (Math.abs(netWorth(replay) - netWorth(value)) > 0.02) throw new Error('存档与决策重放结果不一致。');
  return replay;
}
