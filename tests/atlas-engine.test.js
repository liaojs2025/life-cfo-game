import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_KEYS, STOCK_KEYS, ACCOUNT_IDS, COUNTRIES, newCampaign, publicRound, stockWeight,
  ruleDecisions, settleCampaign, accountNetWorth, validateAllocation, fallbackCampaignPack,
  validateCampaignPack, campaignDecisionContext, campaignSummary, restoreCampaign } from '../dist/atlas-engine.js';
import { requestCampaignDecision, requestCampaignReview, fallbackCampaignReview, validateCampaignReview,
  campaignReviewFacts } from '../dist/atlas-agent.js';
import { getCampaignYears } from '../dist/atlas-scenarios.js';
import { newCampaign as oldCampaign, restoreCampaign as oldRestore } from '../dist/campaign.js';

const clone = value => structuredClone(value);
const allocation = key => Object.fromEntries(ASSET_KEYS.map(asset => [asset, asset === key ? 100 : 0]));
const cash = allocation('cash');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < Math.max(0.00001, Math.abs(expected) * 1e-10), `${actual} != ${expected}`);
const advance = (state, rounds = Infinity, weights = null) => {
  for (let round = 0; round < rounds && !state.finished; round++) state = settleCampaign(state, weights || ruleDecisions(state).player);
  return state;
};

test('atlas editions preserve independent old saves and replay 40/10 periods in both countries', () => {
  for (const country of ['us', 'jp']) for (const edition of ['full', 'short']) {
    const initial = newCampaign({ country, edition, seed: 'atlas-edition' });
    const years = getCampaignYears(country, edition);
    assert.equal(years.length, edition === 'full' ? 40 : 10);
    assert.equal(years[0].year, edition === 'full' ? 1987 : 2017);
    assert.equal(years.at(-1).year, 2026);
    assert.deepEqual(initial, newCampaign({ country, edition, seed: 'atlas-edition' }));
    const result = advance(initial, Infinity, cash);
    assert.equal(result.version, 5);
    assert.equal(result.finished, true);
    assert.deepEqual(restoreCampaign(JSON.parse(JSON.stringify(result))), result);
    near(result.age, result.startAge + result.history.reduce((sum, row) => sum + row.periodFraction, 0));
    assert.equal(accountNetWorth(initial.accounts.player), COUNTRIES[country].initialWealth);
  }
  assert.throws(() => restoreCampaign(oldCampaign()), /旧版/);
  assert.doesNotThrow(() => oldRestore(oldCampaign()));
  assert.throws(() => oldRestore(newCampaign()));
  assert.throws(() => newCampaign({ edition: 'legacy' }));
});

test('atlas style checks count all four equity sleeves and indices cannot be traded', () => {
  assert.deepEqual(STOCK_KEYS, ['broad', 'tech', 'consumer', 'health']);
  for (const key of STOCK_KEYS) assert.doesNotThrow(() => validateAllocation(allocation(key), { style: 'aggressive' }));
  assert.throws(() => validateAllocation(allocation('bond'), { style: 'aggressive' }));
  assert.throws(() => validateAllocation(allocation('tech'), { style: 'conservative' }));
  assert.throws(() => validateAllocation({ cash: 0, indexA: 50, indexB: 50, gold: 0 }));
  assert.throws(() => validateAllocation({ ...cash, broad: 0.5, cash: 99.5 }));
  for (const country of ['us', 'jp']) {
    let state = newCampaign({ country });
    for (let year = 0; year < 40 && !state.finished; year++) {
      const pack = fallbackCampaignPack(state);
      assert.ok(stockWeight(pack.decisions.aggressive) >= 60);
      assert.ok(stockWeight(pack.decisions.conservative) <= 40);
      state = settleCampaign(state, cash, pack);
      assert.deepEqual(state.history.at(-1).accounts.aggressive.allocation, pack.decisions.aggressive);
    }
  }
});

test('atlas all seven assets preserve contribution, trading fees and the balance equation', () => {
  for (const country of ['us', 'jp']) for (const key of ASSET_KEYS) {
    let state = newCampaign({ country, edition: 'short', seed: 'all-assets' });
    for (let round = 0; round < 10 && !state.finished; round++) {
      state = settleCampaign(state, allocation(key));
      const row = state.history.at(-1);
      near(row.cashflow.items.reduce((sum, item) => sum + item.amount, 0), row.cashflow.net);
      for (const id of ACCOUNT_IDS) {
        const record = row.accounts[id];
        assert.deepEqual(Object.keys(record.endAssets).sort(), [...ASSET_KEYS].sort());
        assert.equal(record.contribution, record.inactive ? 0 : row.cashflow.net);
        near(record.endNetWorth, record.startNetWorth + record.investmentProfit + record.contribution - record.fees);
        near(record.endNetWorth, Object.values(record.endAssets).reduce((sum, value) => sum + value, 0) - record.shortfallDebt);
        assert.ok(Object.values(record.endAssets).every(value => value >= 0));
        if (record.portfolioReturn !== null) near(record.portfolioReturn,
          ASSET_KEYS.reduce((sum, asset) => sum + record.allocation[asset] / 100 * row.marketReturns[asset], 0));
      }
      near(row.benchmark.portfolioReturn, row.benchmarkReturns.indexA);
      assert.equal(row.benchmark.fees, 0);
    }
  }
});

test('atlas Japan domestic-sector switch sells the old instrument, buys the new one and freezes both labels', () => {
  const before2008 = advance(newCampaign({ country: 'jp', edition: 'full', seed: 'jp-switch' }), 21, cash);
  assert.equal(before2008.round, 21);
  const years = getCampaignYears('jp', 'full');
  for (const key of ['tech', 'consumer', 'health']) {
    const oldState = settleCampaign(before2008, allocation(key));
    assert.equal(oldState.history.at(-1).year, 2008);
    const before = oldState.accounts.player;
    const oldHolding = before.assets[key], wealth = accountNetWorth(before);
    const expectedCapital = (wealth - 0.001 * oldHolding) / 1.001;
    const oldLabel = years.find(row => row.year === 2008).assets.find(asset => asset.key === key).label;
    const newLabel = years.find(row => row.year === 2009).assets.find(asset => asset.key === key).label;
    assert.notEqual(oldLabel, newLabel);
    assert.equal(campaignDecisionContext(oldState).assets.find(asset => asset.key === key).label, newLabel);
    const result = settleCampaign(oldState, allocation(key));
    const row = result.history.at(-1), record = row.accounts.player;
    assert.deepEqual(row.assetChanges.map(change => change.key), ['tech', 'consumer', 'health']);
    near(record.investedCapital, expectedCapital);
    near(record.tradingFees, 0.001 * (oldHolding + expectedCapital));
    near(record.replacementFees, record.tradingFees);
    near(record.portfolioReturn, row.marketReturns[key]);
    const facts = campaignReviewFacts(result);
    assert.ok(facts.at(-2).quote.includes(oldLabel));
    assert.ok(facts.at(-1).quote.includes(newLabel));
    assert.equal(facts.at(-2).assetLabels[key], oldLabel);
    assert.deepEqual(restoreCampaign(result), result);
  }
});

test('atlas YTD prorates recurring cash flow, censors events, and never reads a full-year CPI', () => {
  const year = getCampaignYears('us', 'short').at(-1);
  const originalInflation = Object.getOwnPropertyDescriptor(year, 'inflation');
  Object.defineProperty(year, 'inflation', { configurable: true, get() { throw new Error('unavailable annual CPI'); } });
  let witnessedEvent = false, witnessedOrdinary = false;
  try {
    for (let seed = 0; seed < 100; seed++) {
      const initial = newCampaign({ edition: 'short', seed: `partial-${seed}` });
      initial.round = 9; initial.age = 30;
      const visible = publicRound(initial);
      const next = settleCampaign(initial, cash), row = next.history[0];
      const fraction = year.periodFraction;
      near(row.cashflow.recurringIncome, initial.household.income * fraction);
      near(row.cashflow.recurringExpense, initial.household.expense * fraction);
      near(visible.household.periodIncome, row.cashflow.recurringIncome);
      assert.equal(row.asOf, year.asOf);
      assert.equal(row.isPartial, true);
      near(next.age, 30 + fraction);
      assert.equal(next.household.expense, initial.household.expense);
      assert.equal(next.household.priceIndex, initial.household.priceIndex);
      for (const event of row.events) {
        if (event.id !== 'ordinary') { witnessedEvent = true; assert.ok(event.dayOfYear <= row.elapsedDays); }
        if (event.id === 'marriage') near(event.amount, -initial.household.expense * 0.45);
        if (event.id === 'ordinary') witnessedOrdinary = true;
      }
      assert.equal(campaignSummary(next).accounts.player.annualizedReturn, null);
    }
    assert.ok(witnessedEvent && witnessedOrdinary);
  } finally { Object.defineProperty(year, 'inflation', originalInflation); }
});

test('atlas partial return remains actual cumulative return and is excluded from annualized statistic', () => {
  const state = advance(newCampaign({ edition: 'short', seed: 'cagr' }), Infinity);
  assert.equal(state.round, 10);
  const summary = campaignSummary(state), complete = state.history.filter(row => !row.isPartial);
  assert.equal(complete.length, 9);
  const compound = complete.reduce((value, row) => value * (1 + row.accounts.player.portfolioReturn), 1);
  near(summary.accounts.player.annualizedReturn, compound ** (1 / 9) - 1);
  near(summary.accounts.player.investmentReturn, state.accounts.player.returnIndex - 1);
  near(summary.curves.at(-1).returnIndex.indexB,
    state.history.reduce((value, row) => value * (1 + row.benchmarkReturns.indexB), 1));
  assert.equal(summary.curves.at(-1).isPartial, true);
  const tampered = clone(state); tampered.history.at(-1).periodFraction = 1;
  assert.throws(() => restoreCampaign(tampered));
  const otherEdition = clone(state); otherEdition.edition = 'full';
  assert.throws(() => restoreCampaign(otherEdition));
});

test('atlas previews and AI cannot read current returns, benchmarks, CPI, reveal or future events', () => {
  for (const country of ['us', 'jp']) for (const edition of ['full', 'short']) {
    const state = newCampaign({ country, edition });
    const year = getCampaignYears(country, edition)[0];
    const hidden = ['returns', 'benchmarks', 'inflation', 'wageGrowth', 'reveal'];
    const descriptors = Object.fromEntries(hidden.map(key => [key, Object.getOwnPropertyDescriptor(year, key)]));
    try {
      for (const key of hidden) Object.defineProperty(year, key, { configurable: true, get() { throw new Error(`read hidden ${key}`); } });
      assert.doesNotThrow(() => publicRound(state));
      assert.doesNotThrow(() => ruleDecisions(state));
      const context = campaignDecisionContext(state);
      assert.equal(context.year, undefined);
      assert.equal(context.asOf, undefined);
      assert.equal(context.returns, undefined);
      const pack = fallbackCampaignPack(state);
      assert.doesNotThrow(() => validateCampaignPack(pack, state));
      for (const text of ['明年股票上涨30%', '2026年会大涨', '科技回报为43.5%', '保证赚钱']) {
        const bad = clone(pack); bad.source = 'model'; bad.summary = text;
        assert.throws(() => validateCampaignPack(bad, state));
      }
    } finally { for (const key of hidden) Object.defineProperty(year, key, descriptors[key]); }
  }
});

test('atlas bankruptcy freezes exited accounts and preserves canonical early review evidence', () => {
  const initial = newCampaign({ edition: 'short', seed: 'bankrupt' });
  initial.household.income = 0; initial.household.expense = 100000000;
  const next = settleCampaign(initial, allocation('tech'));
  assert.equal(next.finished, true);
  assert.equal(next.endReason, 'bankruptcy');
  assert.ok(next.accounts.player.shortfallDebt > 0);
  assert.throws(() => settleCampaign(next, cash));
  const review = fallbackCampaignReview(next);
  assert.equal(review.evidence.length, 1);
  assert.doesNotThrow(() => validateCampaignReview(review, next));
  const alive = newCampaign({ seed: 'frozen' });
  alive.accounts.aggressive.bankrupt = true; alive.accounts.aggressive.assets = allocation('cash');
  const after = settleCampaign(alive, cash);
  assert.deepEqual(after.accounts.aggressive, alive.accounts.aggressive);
  assert.equal(campaignSummary(after).curves[1].returnIndex.aggressive, null);
});

test('atlas one AI request covers seven-asset suggestions and binds the request snapshot', async t => {
  const state = newCampaign({ edition: 'short' }), before = clone(state), expected = fallbackCampaignPack(before);
  let count = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    count++;
    const body = JSON.parse(init.body), context = JSON.parse(body.messages[1].content);
    assert.equal(body.max_tokens, 2500);
    assert.equal(context.assets.length, 7);
    assert.equal(context.returns, undefined);
    assert.equal(context.year, undefined);
    state.accounts.player.assets.cash += 100;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      decisions: expected.decisions, analysis: expected.analysis.map(({ signalId, reasoning, risk }) => ({ signalId, reasoning, risk })), summary: expected.summary,
    }) } }] }));
  });
  const pack = await requestCampaignDecision({ endpoint: 'https://api.deepseek.com', apiKey: 'atlas-test-secret' }, state, { maxAttempts: 1 });
  assert.equal(count, 1);
  assert.equal(pack.source, 'model');
  assert.equal(pack.contextId, expected.contextId);
  assert.deepEqual(validateCampaignPack(pack, before), pack);
  assert.throws(() => validateCampaignPack(pack, state));
});

test('atlas AI review binds seven actual sleeves and locally replaces only an unsupported numeric comment', async t => {
  const state = advance(newCampaign({ edition: 'full', seed: 'review' }));
  assert.equal(state.history.length, 40);
  const fallback = fallbackCampaignReview(state), facts = campaignReviewFacts(state);
  const response = { ...fallback, evidence: fallback.evidence.map(({ factId, interpretation }, index) => ({
    factId, interpretation: index ? interpretation : '当期组合亏损99%。',
  })) };
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body), context = JSON.parse(body.messages[1].content);
    assert.equal(body.max_tokens, 3500);
    assert.equal(context.edition, 'full');
    assert.equal(context.facts.length, 40);
    assert.equal(context.facts[0].opponents.aggressive.stockWeight, stockWeight(state.history[0].accounts.aggressive.allocation));
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(response) } }] }));
  });
  const review = await requestCampaignReview({ endpoint: 'https://api.deepseek.com', apiKey: 'atlas-test-secret' }, state, { maxAttempts: 1 });
  assert.equal(review.evidence[0].interpretationSource, 'ledger');
  assert.equal(review.evidence[1].interpretation, response.evidence[1].interpretation);
  assert.ok(facts[0].quote.includes(COUNTRIES.us.assets.find(asset => asset.key === 'bond').label));
  assert.deepEqual(validateCampaignReview(JSON.parse(JSON.stringify(review)), restoreCampaign(state)), review);
  const tampered = clone(review); tampered.evidence[0].interpretation += '伪造';
  assert.throws(() => validateCampaignReview(tampered, state));
});
