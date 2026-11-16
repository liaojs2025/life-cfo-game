import test from 'node:test';
import assert from 'node:assert/strict';
import { YEARS } from '../dist/data.js';
import {
  RULES, ASSET_KEYS, STOCK_KEYS, newGame, defaultDecision, advisorDecision, settleYear, simulateStrategy,
  summary, netWorth, liquidAssets, validateDecision, previewDecision, getChoices,
  restoreGame, assertState, balanceSheet,
} from '../dist/engine.js';

const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 0.0001,
  `${message}: expected ${expected}, received ${actual}`);
const clone = value => JSON.parse(JSON.stringify(value));
const allocation = values => ({ ...Object.fromEntries(ASSET_KEYS.map(key => [key, 0])), ...values });

function cashDecision(state) {
  return { ...defaultDecision(state), allocation: allocation({ cash: 100 }) };
}

function withScenario(round, change, callback) {
  const original = clone(YEARS[round]);
  Object.assign(YEARS[round], change);
  try { return callback(); }
  finally { Object.assign(YEARS[round], original); }
}

test('all baseline strategies finish all scenario years with an exactly reconcilable ledger', () => {
  for (const strategy of ['advisor', 'balanced', 'cash', 'growth', 'tech', 'consumer', 'health']) {
    const state = simulateStrategy(strategy);
    assert.equal(state.round, YEARS.length);
    assert.equal(state.age, 30 + YEARS.length);
    assert.equal(summary(state).completed, true);
    near(netWorth(state), RULES.initialNetWorth + state.totalContribution + state.totalInvestmentProfit);
    for (const year of state.history) {
      near(year.endNetWorth - year.startNetWorth, year.netContribution + year.investmentProfit, `ledger ${year.year}`);
      assert.ok(Object.values(year.endAssets).every(amount => amount >= 0));
    }
  }
});

test('same strategy is reproducible and settlement never mutates input state or decision', () => {
  const state = newGame();
  const decision = advisorDecision(state);
  const originalState = clone(state);
  const originalDecision = clone(decision);
  assert.deepEqual(settleYear(state, decision), settleYear(state, decision));
  assert.deepEqual(state, originalState);
  assert.deepEqual(decision, originalDecision);
  assert.deepEqual(simulateStrategy('advisor'), simulateStrategy('advisor'));
});

test('cash conversion pays sale fees once and returns are credited only on money already invested', () => {
  const state = newGame();
  const decision = cashDecision(state);
  const choice = getChoices(state).find(item => item.id === decision.choiceId);
  const next = settleYear(state, decision);
  const row = next.history[0];
  const saleFees = (20000 + 15000 + 5000) * 0.002;
  near(row.fees, saleFees);
  near(row.liquidReturn, (100000 - choice.cost - saleFees) * YEARS[0].returns.cash);
  near(row.income, 72000);
  assert.equal(next.assets.stock, 0);
  assert.equal(next.assets.bond, 0);
  assert.equal(next.assets.gold, 0);
});

test('changing family salary changes net contribution, not the current year market return', () => {
  const base = newGame();
  const highSalary = { ...clone(base), income: 172000 };
  const decision = cashDecision(base);
  const first = settleYear(base, decision).history[0];
  const second = settleYear(highSalary, decision).history[0];
  near(first.liquidReturn, second.liquidReturn);
  near(second.netContribution - first.netContribution, 100000);
  near(second.endNetWorth - first.endNetWorth, 100000);
});

test('home purchase fees, property loss, mortgage principal and interest reconcile without double counting', () => {
  const state = newGame();
  const decision = { ...cashDecision(state), buyHome: true };
  const next = settleYear(state, decision);
  const row = next.history[0];
  near(row.homePurchaseFee, 4800);
  near(row.homeChange, 240000 * YEARS[0].homeReturn);
  near(next.homeValue, 240000 * (1 + YEARS[0].homeReturn));
  near(next.mortgage.balance + row.mortgagePrincipal, 192000);
  near(row.mortgagePrincipal + row.mortgageInterest, next.mortgage.monthlyPayment * 12);
  assert.equal(next.mortgage.monthsRemaining, 348);
  assert.ok(row.mortgageInterest < 192000 * 0.05);
  assert.equal(row.livingExpense, 18000);
  near(row.homeMaintenance, 2880);
  near(row.endNetWorth - row.startNetWorth, row.netContribution + row.investmentProfit);
  assert.equal(validateDecision(next, { ...defaultDecision(next), buyHome: true }).valid, false);
});

test('vehicle purchase converts cash into a depreciating asset and records maintenance separately', () => {
  const state = newGame();
  const next = settleYear(state, { ...cashDecision(state), buyCar: true });
  const row = next.history[0];
  near(next.carValue, 15300);
  near(row.carDepreciation, 2700);
  near(row.carMaintenance, 1800);
  near(row.endNetWorth - row.startNetWorth, row.netContribution + row.investmentProfit);
  assert.equal(validateDecision(next, { ...defaultDecision(next), buyCar: true }).valid, false);
});

test('medical insurance applies its deductible and cap, and excludes nonmedical family costs', () => {
  withScenario(0, { event: { medicalCost: 42000, extraCost: 9000, incomeMultiplier: 1 } }, () => {
    const state = newGame();
    const insured = settleYear(state, cashDecision(state));
    const uninsured = settleYear(state, { ...cashDecision(state), insurance: false });
    near(insured.history[0].insurancePayout, 30000);
    near(uninsured.history[0].insurancePayout, 0);
    near(netWorth(insured) - netWorth(uninsured), 30000 - 1200);
    near(insured.history[0].eventCost, 9000);
    near(insured.history[0].medicalCost, 42000);
  });
  withScenario(0, { event: { medicalCost: 800, extraCost: 9000 } }, () => {
    const state = newGame();
    near(settleYear(state, cashDecision(state)).history[0].insurancePayout, 0);
  });
});

test('emergency selling includes transaction fees and converts an uncovered deficit into explicit debt', () => {
  withScenario(0, { event: { extraCost: 300000, incomeMultiplier: 0 } }, () => {
    const state = newGame();
    const decision = { ...defaultDecision(state), allocation: allocation({ stock: 100 }) };
    const next = settleYear(state, decision);
    assert.ok(next.history[0].forcedSales > 0);
    assert.ok(next.history[0].fees > 100);
    assert.ok(next.shortfallDebt > 0);
    near(liquidAssets(next), 0);
    assert.ok(Object.values(next.assets).every(value => value >= 0));
    near(netWorth(next), RULES.initialNetWorth + next.totalContribution + next.totalInvestmentProfit);
    const second = settleYear(next, defaultDecision(next));
    near(second.history[1].debtInterest, next.shortfallDebt * 0.12);
  });
});

test('a depleted household can finish the game using a no-cost fallback instead of becoming stuck', () => {
  let state = newGame();
  state.income = 0;
  state.baseExpense = 1000000;
  let fallbackSeen = false;
  for (let round = 0; round < YEARS.length; round++) {
    const decision = advisorDecision(state);
    if (decision.choiceId === 'defer') fallbackSeen = true;
    assert.equal(validateDecision(state, decision).valid, true);
    state = settleYear(state, decision);
  }
  assert.equal(fallbackSeen, true);
  assert.equal(state.round, YEARS.length);
  assert.ok(state.shortfallDebt > 0);
  assert.ok(summary(state).score < 50);
});

test('all-in asset and hold strategies remain playable across all years', () => {
  for (const asset of ASSET_KEYS) {
    for (const rebalance of ['annual', 'hold']) {
      let state = newGame();
      for (let round = 0; round < YEARS.length; round++) {
        const decision = { ...advisorDecision(state), buyHome: false, buyCar: false, insurance: false,
          rebalance, allocation: allocation({ [asset]: 100 }) };
        state = settleYear(state, decision);
      }
      assert.equal(state.round, YEARS.length);
      assertState(state);
    }
  }
});

test('allocation validation rejects malformed ratios, excessive purchases and invalid choices', () => {
  const state = newGame();
  const decision = defaultDecision(state);
  assert.equal(validateDecision(state, { ...decision, allocation: allocation({ cash: 20, stock: 20, bond: 20, gold: 20 }) }).valid, false);
  assert.equal(validateDecision(state, { ...decision, allocation: allocation({ cash: NaN, stock: 50, bond: 40, gold: 10 }) }).valid, false);
  assert.equal(validateDecision(state, { ...decision, allocation: { cash: 25, stock: 40, bond: 25, gold: 10 } }).valid, false);
  assert.equal(validateDecision(state, { ...decision, choiceId: 'future-choice' }).valid, false);
  assert.throws(() => settleYear(state, { ...decision, allocation: allocation({ cash: 101, gold: -1 }) }));
  const lowerWealth = clone(state);
  lowerWealth.assets = allocation({ cash: 1000 });
  assert.equal(validateDecision(lowerWealth, { ...defaultDecision(lowerWealth), buyHome: true }).valid, false);
});

test('zero cash allocation stays at zero with no hidden cash floor or reserve setting', () => {
  const state = newGame();
  const decision = { ...defaultDecision(state), allocation: allocation({ tech: 100 }) };
  const preview = previewDecision(state, decision);
  assert.equal('reserveMonths' in decision, false);
  assert.equal('reserveTarget' in preview, false);
  assert.equal('emergencyMonths' in summary(state), false);
  assert.equal(preview.projectedCash, 0);
  assert.equal(preview.projectedAllocation.cash, 0);
  near(preview.projectedAllocation.tech, 100);
  const costly = { ...decision, buyHome: true, buyCar: true };
  const tight = previewDecision(state, costly);
  assert.equal(tight.valid, true);
  assert.equal(tight.projectedCash, 0);
  near(tight.projectedAllocation.tech, 100);
});

test('advisor and decision preview cannot change when unseen returns and events change', () => {
  const state = newGame();
  const decision = advisorDecision(state);
  const preview = previewDecision(state, decision);
  withScenario(0, { returns: { cash: 0.9, stock: -0.99, tech: 10, consumer: -1, health: 5, bond: -0.8, gold: 5 },
    homeReturn: 2, event: { medicalCost: 1000000, incomeMultiplier: 0 },
    reveal: { title: '未来市场已改写' } }, () => {
    assert.deepEqual(advisorDecision(state), decision);
    assert.deepEqual(previewDecision(state, decision), preview);
  });
});

test('investment return index excludes salary injections and uses only annual observations', () => {
  const state = simulateStrategy('cash');
  near(state.returnIndex, 1.02 ** YEARS.length);
  near(state.maxInvestmentDrawdown, 0);
  assert.notEqual(summary(state).investmentReturn, netWorth(state) / 100000 - 1);
});

test('completed games cannot settle again and valid saves replay deterministically', () => {
  const state = simulateStrategy('advisor');
  assert.throws(() => settleYear(state, defaultDecision(state)), /已经结束/);
  assert.deepEqual(restoreGame(state), state);
  const corrupt = clone(state);
  corrupt.assets.cash += 10;
  assert.throws(() => restoreGame(corrupt), /不一致/);
  const corruptLedger = clone(state);
  corruptLedger.history[0].decision.allocation.stock = 99;
  assert.throws(() => restoreGame(corruptLedger));
});

test('satisfaction history reports the actual bounded change at both score limits', () => {
  const happy = newGame();
  happy.lifeScore = 99;
  const happier = settleYear(happy, { ...defaultDecision(happy), choiceId: 'travel' });
  assert.equal(happier.lifeScore, 100);
  assert.equal(happier.history[0].lifeDelta, 1);
  assert.equal(happier.history[0].plannedLifeDelta, 7);
  withScenario(0, { event: { extraCost: 300000, incomeMultiplier: 0 } }, () => {
    const worried = newGame();
    worried.lifeScore = 1;
    const next = settleYear(worried, defaultDecision(worried));
    assert.equal(next.lifeScore, 0);
    assert.equal(next.history[0].lifeDelta, -1);
    assert.equal(next.history[0].plannedLifeDelta, -7);
  });
});

test('each industry receives its own total return and pays both sides when switching out of old holdings', () => {
  const returns = { cash: 0, stock: 0.01, tech: 0.2, consumer: -0.1, health: 0.05, bond: 0, gold: 0 };
  withScenario(0, { returns }, () => {
    for (const sector of STOCK_KEYS.slice(1)) {
      const state = newGame();
      const decision = { ...defaultDecision(state), allocation: allocation({ [sector]: 100 }) };
      const result = settleYear(state, decision);
      const row = result.history[0];
      const openingSectorBalance = (100000 - row.choiceCost - 40000 * 0.002) / 1.002;
      near(row.fees, (40000 + openingSectorBalance) * 0.002);
      near(row.liquidReturn, openingSectorBalance * returns[sector]);
      near(result.assets[sector], openingSectorBalance * (1 + returns[sector]));
      assert.equal(row.allocation.cash, 0);
      near(row.allocation[sector], 100);
      for (const other of ASSET_KEYS.filter(key => key !== 'cash' && key !== sector)) near(result.assets[other], 0);
    }
  });
});

test('hold executes no rebalancing and sells industries only to pay a real chosen expense', () => {
  const state = newGame();
  const decision = { ...defaultDecision(state), allocation: allocation({ tech: 100 }), rebalance: 'hold' };
  const preview = previewDecision(state, decision);
  near(preview.fees, 0);
  near(preview.projectedCash, 60000 - preview.upfrontCost);
  near(preview.projectedAllocation.tech, 0);
  const allTech = newGame();
  allTech.assets = allocation({ tech: 100000 });
  const funded = previewDecision(allTech, decision);
  near(funded.fees, funded.upfrontCost / 0.998 * 0.002);
  near(funded.projectedCash, 0);
  near(funded.projectedAllocation.tech, 100);
});

test('a sector-only household can be fully liquidated for an event without hidden assets or lost fees', () => {
  withScenario(0, { event: { extraCost: 300000, incomeMultiplier: 0 } }, () => {
    for (const sector of ['tech', 'consumer', 'health']) {
      const state = newGame();
      const result = settleYear(state, { ...defaultDecision(state), allocation: allocation({ [sector]: 100 }) });
      const row = result.history[0];
      assert.ok(row.forcedSales > 0);
      assert.ok(row.newDebt > 0);
      for (const asset of ASSET_KEYS) near(result.assets[asset], 0);
      near(row.endBalanceSheet.totalAssets, 0);
      near(row.endBalanceSheet.netWorth, -row.endBalanceSheet.liabilities.shortfallDebt);
    }
  });
});

test('every year records complete before/after balance sheets with exact continuity and detached values', () => {
  let state = newGame();
  const first = settleYear(state, { ...cashDecision(state), buyHome: true, buyCar: true });
  const initial = balanceSheet(state);
  assert.deepEqual(first.history[0].startBalanceSheet, initial);
  assert.deepEqual(first.history[0].endBalanceSheet, balanceSheet(first));
  assert.deepEqual(Object.keys(initial.assets), [...ASSET_KEYS, 'home', 'car']);
  assert.deepEqual(Object.keys(initial.liabilities), ['mortgage', 'shortfallDebt']);
  assert.ok(first.history[0].endBalanceSheet.assets.home > 0);
  assert.ok(first.history[0].endBalanceSheet.assets.car > 0);
  assert.ok(first.history[0].endBalanceSheet.liabilities.mortgage > 0);
  const second = settleYear(first, advisorDecision(first));
  assert.deepEqual(second.history[1].startBalanceSheet, first.history[0].endBalanceSheet);
  for (const row of second.history) {
    for (const sheet of [row.startBalanceSheet, row.endBalanceSheet]) {
      near(Object.values(sheet.assets).reduce((a, b) => a + b, 0), sheet.totalAssets);
      near(Object.values(sheet.liabilities).reduce((a, b) => a + b, 0), sheet.totalLiabilities);
      near(sheet.totalAssets - sheet.totalLiabilities, sheet.netWorth);
    }
  }
  initial.assets.cash = 0;
  assert.equal(state.assets.cash, 60000);
  assert.equal(first.history[0].startBalanceSheet.assets.cash, 60000);
  const corrupt = clone(second);
  corrupt.history[0].endBalanceSheet.assets.home += 100;
  assert.throws(() => assertState(corrupt), /资产负债表/);
});

test('debt-free goal counts neither new borrowing nor outstanding carried debt, and does not reward cash holdings', () => {
  let debtState;
  withScenario(0, { event: { extraCost: 150000, incomeMultiplier: 0 } }, () => {
    const state = newGame();
    debtState = settleYear(state, cashDecision(state));
  });
  const next = settleYear(debtState, cashDecision(debtState));
  assert.equal(next.history[1].newDebt, 0);
  assert.ok(next.shortfallDebt > 0);
  assert.equal(summary(next).debtFreeYears, 0);
  const successful = simulateStrategy('balanced');
  assert.equal(summary(successful).debtFreeYears, YEARS.length);
  assert.equal(summary(successful).goals.find(goal => goal.id === 'security').achieved, true);
  const allCash = clone(successful);
  allCash.assets = allocation({ cash: liquidAssets(successful) });
  const noCash = clone(successful);
  noCash.assets = allocation({ tech: liquidAssets(successful) });
  assert.equal(summary(allCash).score, summary(noCash).score);
});

test('old-version saves and decisions cannot be silently replayed under version-three rules', () => {
  const state = newGame();
  assert.equal(state.version, 3);
  assert.equal(RULES.version, 'harbor-3.0');
  const old = { ...clone(state), version: 1 };
  delete old.assets.tech;
  delete old.assets.consumer;
  delete old.assets.health;
  assert.throws(() => restoreGame(old), /旧版规则/);
  assert.throws(() => settleYear(old, defaultDecision(state)), /旧版规则/);
  assert.deepEqual(restoreGame(simulateStrategy('tech')), simulateStrategy('tech'));
});
