import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_KEYS, COUNTRIES, getCampaignYears, HISTORY30_EVENTS } from '../dist/history30.js';
import { MARKET_OBSERVATIONS } from '../dist/history30-markets.js';
import { newCampaign, publicRound, campaignDecisionContext, fallbackCampaignPack,
  validateCampaignPack, validateAllocation, ruleDecisions, settleCampaign,
  accountNetWorth, campaignSummary, restoreCampaign, campaignContextId } from '../dist/campaign.js';
import { requestCampaignDecision, requestCampaignReview, fallbackCampaignReview,
  validateCampaignReview, campaignReviewFacts } from '../dist/campaign-ai.js';

const ids = ['player', 'aggressive', 'conservative'];
const clone = value => structuredClone(value);
const sum = values => values.reduce((a, b) => a + b, 0);
const near = (actual, expected, scale = 1) => assert.ok(Math.abs(actual - expected) <= Math.max(0.00001, Math.abs(scale) * 1e-10), `${actual} != ${expected}`);
const weights = key => Object.fromEntries(ASSET_KEYS.map(k => [k, k === key ? 100 : 0]));
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
const config = { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash', apiKey: 'campaign-audit-not-a-real-key' };
const response = value => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }),
  { headers: { 'Content-Type': 'application/json' } });

test('campaign audit: both countries have thirty chronological finite return observations and independent equal starts', () => {
  assert.deepEqual(ASSET_KEYS, ['cash', 'indexA', 'indexB', 'gold']);
  for (const country of ['us', 'jp']) {
    const years = getCampaignYears(country);
    assert.deepEqual(years.map(y => y.year), Array.from({ length: 30 }, (_, i) => 1995 + i));
    for (const year of years) {
      assert.deepEqual(Object.keys(year.returns).sort(), [...ASSET_KEYS].sort());
      for (const value of Object.values(year.returns)) assert.ok(Number.isFinite(value) && value >= -1);
      assert.equal(year.returns.cash, 0, 'cash is a labelled zero-interest teaching balance');
    }
    const state = newCampaign({ country, seed: 'audit-start' });
    assert.ok(state.startAge >= 22 && state.startAge <= 35);
    assert.deepEqual(state.accounts.player, state.accounts.aggressive);
    assert.deepEqual(state.accounts.player, state.accounts.conservative);
    state.accounts.player.assets.cash--;
    assert.equal(state.accounts.aggressive.assets.cash, COUNTRIES[country].initialWealth, 'accounts do not share a mutable asset object');
  }
});

test('campaign audit: price returns use adjacent closes and Japanese gold compounds the independently read yen-per-dollar series once', () => {
  // Independently read Table 8.2, printed p.15 / PDF p.17, Cabinet Office
  // point_stock_en20260120.pdf. The source repeats 2021; retain that year once.
  const fx = [99.83,102.91,115.98,129.92,115.20,102.08,114.90,131.47,119.37,106.97,
    103.78,117.48,118.92,113.12,90.28,92.13,81.51,77.57,86.32,105.37,119.80,120.42,
    117.11,112.65,110.40,109.15,103.33,115.12,132.14,141.40,157.89];
  assert.deepEqual(MARKET_OBSERVATIONS.map(row => row.year), Array.from({ length: 31 }, (_, i) => i + 1994));
  assert.deepEqual(MARKET_OBSERVATIONS.map(row => row.jpyPerUSD), fx);
  for (let i = 1; i < MARKET_OBSERVATIONS.length; i++) {
    const current = MARKET_OBSERVATIONS[i], previous = MARKET_OBSERVATIONS[i - 1];
    for (const prefix of ['nasdaq', 'nikkei', 'topix'])
      near(current[prefix + 'PriceReturn'], current[prefix + 'Close'] / previous[prefix + 'Close'] - 1);
    near(current.goldJPYPriceReturn, (1 + current.goldUSDPriceReturn) * fx[i] / fx[i - 1] - 1);
    assert.equal(getCampaignYears('jp')[i - 1].returns.gold, current.goldJPYPriceReturn);
    assert.equal(getCampaignYears('us')[i - 1].returns.gold, current.goldUSDPriceReturn);
  }
  // Source-table checkpoints, not values copied from the campaign generator.
  const year1995 = MARKET_OBSERVATIONS[1];
  near(year1995.sp500TotalReturn, 0.372);
  assert.equal(year1995.nasdaqClose, 1052.13);
  assert.equal(year1995.topixClose, 1577.7);
  assert.equal(year1995.nikkeiClose, 19868.15);
  assert.equal(COUNTRIES.us.assets.find(asset => asset.key === 'indexA').returnType, 'total');
  for (const [country, key] of [['us','indexB'], ['jp','indexA'], ['jp','indexB']])
    assert.equal(COUNTRIES[country].assets.find(asset => asset.key === key).returnType, 'price');
});

test('campaign audit: event knowledge links resolve and opening briefings use only earlier public facts', () => {
  assert.equal(HISTORY30_EVENTS.length, 24);
  const byId = new Map(HISTORY30_EVENTS.map(event => [event.id, event]));
  assert.equal(byId.size, 24);
  for (const event of HISTORY30_EVENTS) {
    assert.equal(Number(event.date.slice(0, 4)), event.year);
    assert.ok(event.publicKnownAt >= event.date);
    assert.equal(event.analysisKind, 'educational-mechanism');
    assert.ok(event.transmission.length >= 1 && event.sources.length >= 1);
    for (const item of event.transmission) assert.ok(item.assets.every(asset => ASSET_KEYS.includes(asset)));
    for (const id of event.relatedIds) assert.ok(byId.has(id), `unresolved graph edge ${id}`);
    for (const source of event.sources) assert.equal(new URL(source.url).protocol, 'https:');
  }
  for (const country of ['us', 'jp']) {
    assert.equal(HISTORY30_EVENTS.filter(event => event.country === country).length, 12);
    for (const year of getCampaignYears(country)) {
      for (const item of year.briefing) {
        assert.ok(item.asOf < `${year.year}-01-01`);
        if (item.contextEventId) {
          const event = byId.get(item.contextEventId);
          assert.equal(event.country, country);
          assert.ok(event.year < year.year && event.publicKnownAt < `${year.year}-01-01`);
          assert.ok(item.text.includes(event.publicBrief));
        }
      }
      for (const id of year.eventIds) assert.equal(byId.get(id).year, year.year);
      const context = campaignDecisionContext({ ...newCampaign({ country }), round: year.year - 1995 });
      assert.equal(/(?:19|20)\d{2}\s*年|https?:\/\//.test(JSON.stringify(context)), false);
    }
  }
});

test('campaign audit: a first cash year has no fictional market gains or fees and its cashflow items reconcile', () => {
  for (const country of ['us', 'jp']) {
    const state = newCampaign({ country, seed: 'cash-only-audit' });
    const next = settleCampaign(freeze(state), weights('cash'));
    const record = next.history[0], player = record.accounts.player;
    near(sum(record.cashflow.items.map(item => item.amount)), record.cashflow.net, record.cashflow.net);
    near(player.investmentProfit, 0); near(player.fees, 0);
    near(player.endNetWorth, COUNTRIES[country].initialWealth + record.cashflow.net, player.endNetWorth);
    near(next.household.expense, state.household.expense * (1 + getCampaignYears(country)[0].inflation), next.household.expense);
    near(next.household.priceIndex, 1 + getCampaignYears(country)[0].inflation);
    assert.equal(player.portfolioReturn, 0);
    assert.equal(player.returnIndex, 1);
    assert.equal(state.round, 0);
    assert.equal(state.history.length, 0);
  }
});

test('campaign audit: first stock purchase and necessary liquidation agree with independent closed-form dollars', () => {
  for (const country of ['us', 'jp']) for (const key of ['indexA', 'indexB', 'gold']) {
    const state = newCampaign({ country, seed: 'fees-audit' });
    // Force a net withdrawal while retaining ample invested capital.
    state.household.income = 0;
    state.household.expense = COUNTRIES[country].initialWealth * 0.03;
    const next = settleCampaign(state, weights(key));
    const record = next.history[0], player = record.accounts.player;
    const capital = COUNTRIES[country].initialWealth / 1.001;
    const gain = capital * getCampaignYears(country)[0].returns[key];
    const sold = Math.min(capital + gain, Math.max(0, -record.cashflow.net) / 0.999);
    near(player.investedCapital, capital, capital);
    near(player.tradingFees, capital * 0.001, capital);
    near(player.liquidationFees, sold * 0.001, sold);
    near(player.investmentProfit, gain, capital);
    near(player.portfolioReturn, getCampaignYears(country)[0].returns[key]);
    near(player.endNetWorth, capital + gain + record.cashflow.net - sold * 0.001, capital);
  }
});

test('campaign audit: seed fixes household history independently of allocations and every annual ledger conserves money', () => {
  for (const country of ['us', 'jp']) for (const seed of ['seed-a', 'seed-b', 'seed-c', 'seed-d']) {
    const paths = ['cash', 'indexA', 'indexB', 'gold'].map(() => newCampaign({ country, seed }));
    for (let round = 0; round < 30; round++) {
      const active = [];
      for (const [i, prior] of paths.entries()) {
        if (prior.finished) continue;
        const next = settleCampaign(prior, weights(['cash', 'indexA', 'indexB', 'gold'][i]));
        paths[i] = next;
        const year = next.history.at(-1); active.push(year);
        near(sum(year.cashflow.items.map(item => item.amount)), year.cashflow.net, year.cashflow.net);
        for (const id of [...ids, 'benchmark']) {
          const before = id === 'benchmark' ? prior.benchmark : prior.accounts[id];
          const after = id === 'benchmark' ? next.benchmark : next.accounts[id];
          const record = id === 'benchmark' ? year.benchmark : year.accounts[id];
          near(record.startNetWorth, accountNetWorth(before), record.startNetWorth);
          near(record.endNetWorth, sum(Object.values(record.endAssets)) - record.shortfallDebt, record.endNetWorth);
          near(record.endNetWorth, record.startNetWorth + record.investmentProfit + record.contribution - record.fees, record.endNetWorth);
          near(after.totalInvestmentProfit - after.totalFees + after.totalContribution + COUNTRIES[country].initialWealth,
            accountNetWorth(after), accountNetWorth(after));
          assert.ok(Object.values(after.assets).every(value => Number.isFinite(value) && value >= 0));
          if (record.inactive) assert.deepEqual(after, before);
          else near(after.returnIndex, before.returnIndex * (1 + (record.portfolioReturn ?? 0)), after.returnIndex);
        }
        for (const event of year.events) {
          if (event.id === 'marriage') assert.ok(year.age >= 25 && year.age <= 42);
          if (event.id === 'birth') assert.ok(year.age <= 43 && next.household.children.length <= 2);
          if (event.id === 'inheritance') assert.ok(year.age >= 42);
          if (event.id === 'retirement') assert.ok(year.age >= 62);
        }
      }
      for (const year of active.slice(1)) {
        assert.deepEqual(year.events, active[0].events);
        assert.deepEqual(year.cashflow, active[0].cashflow);
      }
    }
    for (const path of paths) assert.ok(path.finished && ['completed', 'bankruptcy'].includes(path.endReason));
  }
});

test('campaign audit: economic insolvency preserves the unpaid amount and ends the player turn permanently', () => {
  const state = newCampaign({ country: 'us', seed: 'insolvency' });
  state.household.income = 0;
  state.household.expense = COUNTRIES.us.initialWealth * 20;
  const next = settleCampaign(state, weights('indexA'));
  const year = next.history[0], player = next.accounts.player;
  assert.ok(player.bankrupt && player.shortfallDebt > 0);
  assert.equal(sum(Object.values(player.assets)), 0);
  assert.equal(accountNetWorth(player), -player.shortfallDebt);
  near(accountNetWorth(player), COUNTRIES.us.initialWealth + year.accounts.player.investmentProfit + year.cashflow.net - year.accounts.player.fees,
    player.shortfallDebt);
  assert.equal(next.finished, true); assert.equal(next.endReason, 'bankruptcy');
  assert.equal(publicRound(next), null);
  assert.throws(() => settleCampaign(next, weights('cash')));
});

test('campaign audit: a failed opponent remains inactive without wage resurrection while the player continues', () => {
  const state = newCampaign({ country: 'us', seed: 'opponent-exit' });
  state.accounts.aggressive.assets = { ...weights('cash'), cash: 1 };
  state.household.income = 0; state.household.expense = 1000;
  const first = settleCampaign(state, weights('cash'));
  assert.equal(first.accounts.aggressive.bankrupt, true); assert.equal(first.finished, false);
  first.household.income = COUNTRIES.us.initialWealth;
  const next = settleCampaign(first, weights('cash'));
  assert.deepEqual(next.accounts.aggressive, first.accounts.aggressive);
  assert.equal(next.history.at(-1).accounts.aggressive.inactive, true);
  assert.equal(next.history.at(-1).accounts.aggressive.portfolioReturn, null);
  assert.equal(campaignSummary(next).curves.at(-1).returnIndex.aggressive, null);
});

test('campaign audit: current outcomes are unreadable from public preview, rule decisions and anonymous model context', () => {
  for (const country of ['us', 'jp']) {
    const state = newCampaign({ country, seed: 'information-audit' });
    for (let round = 0; round < 30; round++) {
      state.round = round; state.age = state.startAge + round;
      const year = getCampaignYears(country)[round];
      const descriptors = Object.fromEntries(['returns', 'reveal', 'inflation', 'wageGrowth'].map(key => [key, Object.getOwnPropertyDescriptor(year, key)]));
      try {
        for (const key of Object.keys(descriptors)) Object.defineProperty(year, key, { configurable: true, get() { throw new Error(`hidden ${key} read`); } });
        assert.equal(publicRound(state).year, 1995 + round);
        assert.ok(ruleDecisions(state));
        const context = campaignDecisionContext(state);
        assert.ok(context.signals.length);
        const serialized = JSON.stringify(context);
        assert.equal(serialized.includes(state.seed), false);
        assert.equal(/"(?:year|returns|reveal|marketReturns|history)"\s*:/.test(serialized), false);
        assert.equal(/https?:\/\//.test(serialized), false);
      } finally {
        for (const [key, descriptor] of Object.entries(descriptors)) Object.defineProperty(year, key, descriptor);
      }
    }
  }
});

test('campaign audit: pending model responses bind to the requested state snapshot rather than a mutated live object', async t => {
  let state = newCampaign({ country: 'us', seed: 'async-audit' });
  const initial = clone(state), answer = fallbackCampaignPack(initial);
  t.mock.method(globalThis, 'fetch', async () => {
    state.accounts.player.assets.cash += 123;
    return response(answer);
  });
  const pack = await requestCampaignDecision(config, state, { maxAttempts: 1 });
  assert.equal(pack.contextId, campaignContextId(initial));
  assert.deepEqual(validateCampaignPack(pack, initial), pack);
  assert.throws(() => validateCampaignPack(pack, state));

  state = newCampaign({ country: 'jp', seed: 'review-snapshot-audit' });
  for (let i = 0; i < 3; i++) state = settleCampaign(state, weights('cash'));
  const requested = clone(state), review = fallbackCampaignReview(requested);
  globalThis.fetch = async () => {
    Object.assign(state, settleCampaign(state, weights('gold')));
    return response(review);
  };
  const result = await requestCampaignReview(config, state, { maxAttempts: 1 });
  assert.equal(result.contextId, review.contextId);
  assert.deepEqual(validateCampaignReview(result, requested), result);
  assert.throws(() => validateCampaignReview(result, state));
});

test('campaign audit: a model failure does not create either opponent decision or advance any account', async t => {
  const state = newCampaign({ seed: 'failure-audit' }), before = clone(state);
  const invalid = fallbackCampaignPack(state);
  invalid.decisions.conservative = weights('indexA');
  let answer = invalid, calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response(answer); });
  await assert.rejects(requestCampaignDecision(config, state, { maxAttempts: 1 }));
  assert.deepEqual(state, before); assert.equal(calls, 1);
  answer = { ...fallbackCampaignPack(state), analysis: [{ signalId: 'invented', reasoning: '理由', risk: '风险' }] };
  await assert.rejects(requestCampaignDecision(config, state, { maxAttempts: 1 }));
  assert.deepEqual(state, before); assert.equal(calls, 2);
  assert.equal(fallbackCampaignPack(state).source, 'rules', 'degradation is explicit and distinguishable from a model result');
});

test('campaign audit: early ending reviews and completed-year comparisons remain tied to real facts without future forecasts or diagnoses', () => {
  let state = newCampaign({ seed: 'persona-audit' });
  state = settleCampaign(state, weights('cash'));
  const early = fallbackCampaignReview(state);
  assert.equal(early.evidence.length, 1);
  assert.deepEqual(validateCampaignReview(early, state), early);
  for (let i = 0; i < 2; i++) state = settleCampaign(state, weights('cash'));
  const valid = { ...fallbackCampaignReview(state), source: 'model', model: 'audit-model' };
  valid.evidence[0].interpretation = '从1995到1997，现金配置在这段已完成经历中保持一致。';
  assert.doesNotThrow(() => validateCampaignReview(valid, state));
  for (const text of ['1995—2030期间保持现金配置。', '未来收益率30%。', '你患有人格障碍。', '1995年3月进行了调整。']) {
    const bad = clone(valid); bad.evidence[0].interpretation = text;
    assert.throws(() => validateCampaignReview(bad, state), text);
  }
  for (const patch of [{ factId: 'player-99' }, { year: 1996 }, { quote: '虚构投资决定' }]) {
    const bad = clone(valid); Object.assign(bad.evidence[0], patch);
    assert.throws(() => validateCampaignReview(bad, state));
  }
});

test('campaign audit: numeric review claims bind to the correct year and any replacement is an explicitly verified ledger comment', async t => {
  let state = newCampaign({ country: 'us', seed: 'numeric-year-audit' });
  for (let i = 0; i < 3; i++) state = settleCampaign(state, weights('indexA'));
  const answer = { ...fallbackCampaignReview(state), source: 'model', model: 'audit-model' };
  answer.evidence = campaignReviewFacts(state).map(fact => ({ factId: fact.factId, year: fact.year, quote: fact.quote,
    interpretation: '实际配置体现了风险取舍。' }));
  answer.evidence[0].interpretation = '1995年实际组合收益37.20%。';
  assert.doesNotThrow(() => validateCampaignReview(answer, state));
  answer.evidence[0].interpretation = '1996年实际组合收益37.20%。';
  assert.throws(() => validateCampaignReview(answer, state), '1996 actually returned 22.68%, not the primary 1995 fact return');
  t.mock.method(globalThis, 'fetch', async () => response(answer));
  const returned = await requestCampaignReview(config, state, { maxAttempts: 1 });
  assert.equal(returned.evidence[0].interpretationSource, 'ledger');
  assert.equal(returned.evidence[0].interpretation.includes('37.20'), false);
  assert.deepEqual(validateCampaignReview(returned, state), returned);
  const bad = clone(returned); bad.evidence[0].interpretation += '并保证未来收益。';
  assert.throws(() => validateCampaignReview(bad, state));
});

test('campaign audit: malformed allocations and fake conservative/aggressive labels cannot relax investment constraints', () => {
  for (const patch of [{ cash: 99 }, { cash: NaN }, { cash: Infinity }, { cash: -1 }, { cash: '100' }, { cash: 99.5 }, { extra: 0 }])
    assert.throws(() => validateAllocation({ ...weights('cash'), ...patch }));
  const state = newCampaign(), pack = fallbackCampaignPack(state);
  for (const [id, allocation] of [['aggressive', weights('cash')], ['conservative', weights('indexA')]]) {
    const bad = clone(pack); bad.source = 'model'; bad.model = 'audit-fake-model'; bad.decisions[id] = allocation;
    assert.throws(() => validateCampaignPack(bad, state));
  }
});

test('campaign audit: canonical restores are identical at every completed year and reject changed seed, cash, events or sealed decisions', () => {
  for (const country of ['us', 'jp']) {
    let state = newCampaign({ country, seed: 'restore-audit' });
    while (!state.finished) {
      state = settleCampaign(state, ruleDecisions(state).player);
      assert.deepEqual(restoreCampaign(clone(state)), state);
    }
    for (const mutate of [
      saved => { saved.seed += '-other'; },
      saved => { saved.accounts.player.assets.cash += 1; },
      saved => { saved.history[0].cashflow.net += 1; },
      saved => { saved.history[0].pack.summary += ' changed'; },
      saved => { saved.history[0].playerAllocation = weights('gold'); },
      saved => { saved.country = country === 'us' ? 'jp' : 'us'; },
      saved => { saved.round -= 1; },
      saved => { saved.version = 3; },
    ]) { const bad = clone(state); mutate(bad); assert.throws(() => restoreCampaign(bad)); }
    const summary = campaignSummary(state);
    assert.equal(summary.curves.length, state.round + 1);
    assert.equal(summary.curves[0].returnIndex.player, 1);
  }
});
