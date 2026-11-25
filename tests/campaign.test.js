import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_KEYS, COUNTRIES, ACCOUNT_IDS, newCampaign, publicRound, ruleDecisions, settleCampaign,
  accountNetWorth, validateAllocation, fallbackCampaignPack, validateCampaignPack, campaignSummary, restoreCampaign } from '../dist/campaign.js';
import { getCampaignYears } from '../dist/history30.js';
import { requestCampaignDecision, requestCampaignReview, fallbackCampaignReview, validateCampaignReview, campaignReviewFacts } from '../dist/campaign-ai.js';

const clone = value => structuredClone(value);
const near = (a, b, scale = 1) => assert.ok(Math.abs(a - b) <= 0.00001 * Math.max(1, scale), `${a} != ${b}`);
const cash = { cash: 100, indexA: 0, indexB: 0, gold: 0 };
function advance(state, allocation = cash, rounds = 30) {
  for (let i = 0; i < rounds && !state.finished; i++) state = settleCampaign(state, allocation);
  return state;
}

test('campaign: both countries have 30 deterministic rounds and separate currency household defaults', () => {
  for (const country of ['us', 'jp']) {
    const initial = newCampaign({ country, seed: 'repeatable' });
    assert.deepEqual(initial, newCampaign({ country, seed: 'repeatable' }));
    assert.ok(initial.startAge >= 22 && initial.startAge <= 35);
    assert.equal(getCampaignYears(country).length, 30);
    assert.equal(accountNetWorth(initial.accounts.player), COUNTRIES[country].initialWealth);
    const result = advance(initial);
    assert.ok(result.finished);
    assert.equal(result.age, result.startAge + result.round);
    assert.deepEqual(restoreCampaign(JSON.parse(JSON.stringify(result))), result);
  }
  assert.notEqual(COUNTRIES.us.currency, COUNTRIES.jp.currency);
  assert.throws(() => newCampaign({ country: 'cn' }));
  assert.throws(() => restoreCampaign({ version: 3, history: [] }));
});

test('campaign: every account receives exactly the common external cash flow and attribution balances', () => {
  for (const country of ['us', 'jp']) {
    const state = advance(newCampaign({ country, seed: 'audit-life' }), { cash: 0, indexA: 50, indexB: 50, gold: 0 });
    for (const record of state.history) {
      near(record.cashflow.items.reduce((sum, item) => sum + item.amount, 0), record.cashflow.net);
      for (const id of ACCOUNT_IDS) {
        const account = record.accounts[id];
        assert.equal(account.contribution, account.inactive ? 0 : record.cashflow.net);
        near(account.endNetWorth, account.startNetWorth + account.investmentProfit + account.contribution - account.fees);
        near(Object.values(account.endAssets).reduce((a, b) => a + b, 0) - account.shortfallDebt, account.endNetWorth);
        assert.ok(Object.values(account.endAssets).every(value => value >= 0));
        if (account.portfolioReturn !== null) near(account.portfolioReturn, ASSET_KEYS.reduce((sum, key) => sum + account.allocation[key] / 100 * record.marketReturns[key], 0));
      }
    }
  }
});

test('campaign: timing keeps year-end wages out of investment returns and cash has no invented interest', () => {
  const state = newCampaign({ seed: 'cash-only' });
  const next = settleCampaign(state, cash), record = next.history[0].accounts.player;
  near(record.investmentProfit, 0);
  near(record.fees, 0);
  assert.equal(record.portfolioReturn, 0);
  near(record.endNetWorth, record.startNetWorth + next.history[0].cashflow.net);
  assert.equal(next.accounts.player.returnIndex, 1);
  const curves = campaignSummary(next).curves;
  assert.equal(curves[0].returnIndex.player, curves[0].returnIndex.indexA);
  assert.equal(curves[1].returnIndex.player, 1);
  near(curves[1].returnIndex.indexA, 1 + next.history[0].marketReturns.indexA);
});

test('campaign: bankruptcy includes unpaid obligations, is absorbing and ends the player immediately', () => {
  const initial = newCampaign({ seed: 'insolvency' });
  initial.household.income = 0;
  initial.household.expense = 10000000;
  const result = settleCampaign(initial, { cash: 0, indexA: 100, indexB: 0, gold: 0 });
  assert.equal(result.finished, true);
  assert.equal(result.endReason, 'bankruptcy');
  assert.equal(result.round, 1);
  assert.ok(result.accounts.player.shortfallDebt > 0);
  assert.ok(accountNetWorth(result.accounts.player) < 0);
  near(Object.values(result.accounts.player.assets).reduce((a, b) => a + b, 0), 0);
  assert.throws(() => settleCampaign(result, cash), /已结束/);
  assert.doesNotThrow(() => validateCampaignReview(fallbackCampaignReview(result), result));
});

test('campaign: out opponents never revive and their investment curves stop at exit', () => {
  let state = newCampaign({ seed: 'opponent-exit' });
  state.accounts.aggressive.assets = { cash: 0, indexA: 0, indexB: 0, gold: 0 };
  state.accounts.aggressive.shortfallDebt = 10;
  state.accounts.aggressive.bankrupt = true;
  state.accounts.aggressive.bankruptRound = 0;
  state = settleCampaign(state, cash);
  assert.equal(accountNetWorth(state.accounts.aggressive), -10);
  assert.equal(state.history[0].accounts.aggressive.inactive, true);
  assert.equal(state.history[0].accounts.aggressive.contribution, 0);
  assert.equal(campaignSummary(state).curves[1].returnIndex.aggressive, null);
});

test('campaign: portfolio choices never affect the seed, family event sequence or cash flow schedule', () => {
  let a = newCampaign({ country: 'jp', seed: 'family-seed' }), b = clone(a);
  for (let i = 0; i < 30 && !a.finished && !b.finished; i++) {
    a = settleCampaign(a, cash);
    b = settleCampaign(b, { cash: 0, indexA: 0, indexB: 0, gold: 100 });
    assert.deepEqual(a.household, b.household);
    assert.deepEqual(a.history.at(-1).events, b.history.at(-1).events);
    assert.deepEqual(a.history.at(-1).cashflow, b.history.at(-1).cashflow);
  }
  const events = a.history.flatMap(record => record.events.map(event => ({ ...event, age: record.age })));
  assert.ok(events.filter(event => event.id === 'marriage').length <= 1);
  assert.ok(events.filter(event => event.id === 'inheritance').length <= 1);
  assert.ok(events.filter(event => event.id === 'birth').length <= 2);
  assert.ok(events.filter(event => event.id === 'inheritance').every(event => event.age >= 42));
  assert.ok(events.filter(event => event.id === 'birth').every(event => event.age <= 43));
});

test('campaign: allocation constraints apply to actual opponent trades and restored records', () => {
  const initial = newCampaign(), pack = fallbackCampaignPack(initial);
  assert.throws(() => validateAllocation({ ...cash, cash: 99 }));
  assert.throws(() => validateAllocation({ ...cash, cash: 99.5, gold: 0.5 }));
  assert.throws(() => validateAllocation(cash, { style: 'aggressive' }));
  assert.throws(() => validateAllocation({ cash: 0, indexA: 100, indexB: 0, gold: 0 }, { style: 'conservative' }));
  const bad = clone(pack); bad.decisions.aggressive = cash;
  assert.throws(() => validateCampaignPack(bad, initial));
  const result = settleCampaign(initial, cash, pack);
  assert.deepEqual(result.history[0].accounts.aggressive.allocation, pack.decisions.aggressive);
  const tampered = clone(result); tampered.accounts.player.assets.cash += 1;
  assert.throws(() => restoreCampaign(tampered), /修改/);
  const tamperedRecord = clone(result); tamperedRecord.history[0].cashflow.income += 1;
  assert.throws(() => restoreCampaign(tamperedRecord), /修改/);
});

test('campaign: public state and decision pack do not contain outcomes or permit precise future claims', () => {
  const state = newCampaign(), visible = publicRound(state);
  assert.ok(visible.signals.length);
  assert.equal(visible.returns, undefined);
  assert.equal(visible.events, undefined);
  assert.equal(visible.reveal, undefined);
  for (const text of ['明年上涨50%', '2008年会崩盘', '收益率为百分之五十', '保证收益']) {
    const pack = fallbackCampaignPack(state); pack.source = 'model'; pack.analysis[0].reasoning = text;
    assert.throws(() => validateCampaignPack(pack, state));
  }
});

test('campaign AI: one bounded request creates both independent style decisions and player advice', async t => {
  const state = newCampaign(), expected = fallbackCampaignPack(state), calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const payload = JSON.parse(body.messages[1].content);
    assert.equal(payload.year, undefined); assert.equal(payload.returns, undefined); assert.equal(payload.reveal, undefined);
    assert.equal(body.max_tokens, 2500);
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      decisions: expected.decisions, analysis: expected.analysis.map(({ signalId, reasoning, risk }) => ({ signalId, reasoning, risk })), summary: expected.summary,
    }) } }] }));
  });
  const result = await requestCampaignDecision({ endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'fake-campaign-key' }, state, { maxAttempts: 1 });
  assert.equal(calls.length, 1); assert.equal(result.source, 'model');
  assert.deepEqual(result.decisions, ruleDecisions(state));
  assert.equal(result.analysis[0].observation, publicRound(state).signals[0].text);
});

test('campaign AI: a one-year early ending still produces canonical evidence and rejects invented IDs', async t => {
  const state = advance(newCampaign({ seed: 'review' }), cash, 1), fallback = fallbackCampaignReview(state);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++; assert.equal(JSON.parse(init.body).max_tokens, 3500);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...fallback,
      evidence: fallback.evidence.map(({ factId, interpretation }) => ({ factId, interpretation })),
    }) } }] }));
  });
  const result = await requestCampaignReview({ endpoint: 'https://api.deepseek.com', apiKey: 'fake-campaign-key' }, state);
  assert.equal(calls, 1); assert.equal(result.source, 'model');
  assert.equal(result.evidence.length, 1); assert.equal(result.evidence[0].year, state.history[0].year);
  assert.equal(result.evidence[0].quote, fallback.evidence[0].quote);
  const altered = clone(result); altered.evidence[0].factId = 'player-30';
  assert.throws(() => validateCampaignReview(altered, state));
});

test('campaign review selects actual weak-return, allocation-change and cashflow years with distinct explanations', () => {
  let state = newCampaign({ seed: 'key-years' });
  for (let round = 0; round < 8 && !state.finished; round++) state = settleCampaign(state,
    round === 0 ? cash : round === 1 ? { cash: 0, indexA: 100, indexB: 0, gold: 0 } : ruleDecisions(state).player);
  const facts = campaignReviewFacts(state), review = fallbackCampaignReview(state);
  const worst = [...facts].sort((a, b) => a.portfolioReturn - b.portfolioReturn)[0];
  assert.ok(review.evidence.some(item => item.factId === worst.factId));
  assert.ok(review.evidence.some(item => item.factId === 'player-2'), 'moving from cash into stocks is the largest actual allocation change');
  assert.equal(new Set(review.evidence.map(item => item.interpretation)).size, review.evidence.length);
  assert.doesNotThrow(() => validateCampaignReview(review, state));
  for (const [index, fact] of facts.entries()) for (const id of ['aggressive', 'conservative']) {
    const actual = state.history[index].accounts[id];
    assert.equal(fact.opponents[id].portfolioReturn, actual.portfolioReturn);
    assert.equal(fact.opponents[id].stockWeight, actual.inactive ? null : actual.allocation.indexA + actual.allocation.indexB);
    assert.deepEqual(fact.opponents[id].allocation, actual.inactive ? null : actual.allocation);
  }
});

test('campaign review sends recorded opponent exposures and annual returns to the model, including inactive markers', async t => {
  let state = advance(newCampaign({ seed: 'review-comparison' }), cash, 3);
  const expected = fallbackCampaignReview(state);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body), payload = JSON.parse(body.messages[1].content);
    assert.equal(payload.facts.length, 3);
    assert.deepEqual(payload.facts[1].opponents.aggressive, campaignReviewFacts(state)[1].opponents.aggressive);
    assert.match(body.messages[0].content, /inactive/);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(expected) } }] }));
  });
  const review = await requestCampaignReview({ endpoint: 'https://api.deepseek.com', apiKey: 'fake-campaign-key' }, state);
  assert.equal(review.source, 'model');
  assert.doesNotThrow(() => validateCampaignReview(review, state));
});

test('retrospective evidence may cite its own recorded return to the shown precision', () => {
  let state = newCampaign({ country:'us', seed:'settled-example' });
  state = settleCampaign(state, {cash:0,indexA:100,indexB:0,gold:0});
  const record = state.history[0].accounts.player;
  const answer = {...fallbackCampaignReview(state), source:'model', model:'example'};
  const number = (record.portfolioReturn * 100).toFixed(2);
  const actual = '当年组合回报为' + number + '%。';
  answer.evidence[0].interpretation = actual;
  assert.equal(validateCampaignReview(answer,state).evidence[0].interpretation,actual);
  for (const text of ['未来组合回报为'+number+'%。','当年组合回报为88.8%。','当年组合回报为'+number+'%，未来一定盈利。']) {
    answer.evidence[0].interpretation=text;
    assert.throws(()=>validateCampaignReview(answer,state));
  }
});

test('campaign review replaces only one unsupported numerical comment with a replayable, tamper-checked ledger explanation', async t => {
  const state = advance(newCampaign({ seed: 'single-comment-fallback' }), cash, 3);
  const answer = fallbackCampaignReview(state);
  assert.equal(answer.evidence.length, 3);
  const validOthers = clone(answer.evidence.slice(1));
  answer.evidence[0].interpretation = '当年亏损99%，因此你已经失去耐心。';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }));
  });
  const result = await requestCampaignReview({ endpoint: 'https://api.deepseek.com', apiKey: 'fake-campaign-key' }, state, { maxAttempts: 1 });
  assert.equal(calls, 1);
  assert.equal(result.source, 'model');
  assert.equal(result.evidence[0].interpretationSource, 'ledger');
  assert.doesNotMatch(result.evidence[0].interpretation, /99%|失去耐心/);
  assert.match(result.evidence[0].interpretation, /投资损益持平/);
  assert.deepEqual(result.evidence.slice(1), validOthers);
  assert.equal(result.evidence.filter(item => item.interpretationSource === 'ledger').length, 1);
  const restored = restoreCampaign(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(validateCampaignReview(JSON.parse(JSON.stringify(result)), restored), result);
  const tampered = clone(result); tampered.evidence[0].interpretation += '后来又出现亏损。';
  assert.throws(() => validateCampaignReview(tampered, restored), /账本点评/);
});
