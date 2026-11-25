import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_IDS, ASSET_KEYS, campaignSummary, newCampaign, replayPlayerFinish, settleCampaign } from '../dist/atlas-engine.js';
import { getPricePath, toStartPurchasingPower } from '../dist/atlas-inflation.js';

// BLS unadjusted all-items releases and Japan e-Stat's linked, national all-items series.
// The four source tables and observation months are documented in V2.1-AUDIT.md.
const cpi = {
  us: {1986:110.5, 1987:115.4, 2016:241.432, 2025:324.054, 2026:336.940},
  jp: {1986:75.0, 1987:75.6, 2008:86.1, 2009:84.7, 2016:87.9, 2025:100.9, 2026:102.2},
};
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-8, `${actual} vs ${expected}`);
const balanced = {cash:15, broad:35, bond:20, gold:10, tech:10, consumer:5, health:5};
const pure = key => Object.fromEntries(ASSET_KEYS.map(id=>[id, id===key?100:0]));
function finish(country,edition,seed,allocation) {
  let state = newCampaign({country,edition,seed});
  while (!state.finished) state = settleCampaign(state,allocation);
  return state;
}

test('four final CPI paths reconcile to official base and September levels and independent return products', () => {
  for (const country of ['us','jp']) for (const edition of ['full','short']) {
    const state = finish(country,edition,'v21-independent-comparison',balanced);
    assert.equal(state.endReason,'completed');
    const before = JSON.stringify(state);
    const prices = getPricePath(country,state.history);
    const summary = campaignSummary(state);
    const base = edition==='full'?1986:2016;
    assert.equal(prices.length, summary.curves.length);
    assert.equal(prices[0].month, base+'-12');
    assert.equal(prices[0].index,100);
    for (const [year, value] of Object.entries(cpi[country])) {
      if (+year<base) continue;
      const point = prices[year-base];
      assert.equal(point.month, year+(+year===2026?'-09':'-12'));
      assert.equal(point.cpi, value);
      near(point.index,100*value/cpi[country][base]);
    }
    const nineMonthRatio = cpi[country][2026]/cpi[country][2025];
    near(prices.at(-1).index/prices.at(-2).index,nineMonthRatio);
    for (const id of ACCOUNT_IDS) {
      const compound = state.history.reduce((growth,record)=>growth*(1+record.accounts[id].portfolioReturn),1);
      const nominal = summary.curves.at(-1).returnIndex[id];
      near(nominal,compound);
      near(toStartPurchasingPower(nominal*100,prices.at(-1).index),100*compound*cpi[country][base]/cpi[country][2026]);
    }
    const score = replayPlayerFinish({country,edition,seed:state.seed,
      allocations:state.history.map(row=>ASSET_KEYS.map(key=>row.playerAllocation[key]))});
    near(score.investmentReturn, summary.curves.at(-1).returnIndex.player-1);
    assert.equal(JSON.stringify(state),before);
  }
});

test('the CPI path stops at bankruptcy and cash gains buying power during Japanese deflation', () => {
  const failed = finish('jp','full','6c4e8e33-9f30-41c7-9628-00000000009e',pure('tech'));
  assert.equal(failed.endReason,'bankruptcy');
  const prefix = getPricePath('jp',failed.history);
  assert.deepEqual(prefix.map(row=>row.month),['1986-12','1987-12']);
  near(prefix.at(-1).index,100*75.6/75.0);
  const state = finish('jp','full','v21-independent-comparison',pure('cash'));
  const full = getPricePath('jp',state.history);
  const realCash = year => toStartPurchasingPower(100,full[year-1986].index);
  assert.ok(realCash(2009)>realCash(2008));
  near(realCash(2009)/realCash(2008),86.1/84.7);
  assert.equal(toStartPurchasingPower(null,full.at(-1).index),null);
});
