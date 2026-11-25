import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CPI_ANNUAL_PERCENT, HOUSEHOLD_OBSERVATIONS, HOUSEHOLD_ASSUMPTIONS, getHouseholdRates } from '../dist/history30-household.js';
import { getCampaignYears, COUNTRIES, HISTORY30_ASSUMPTIONS } from '../dist/history30.js';
import { newCampaign, publicRound, campaignDecisionContext, fallbackCampaignPack, settleCampaign, restoreCampaign } from '../dist/campaign.js';

const source = new URL('../scripts/history30-sources/household/', import.meta.url);
const cash = { cash: 100, indexA: 0, indexB: 0, gold: 0 };
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-12), `${a} != ${b}`);

test('household history: archived official responses match hashes and all 62 CPI observations preserve source precision', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', source)));
  for (const [filename, entry] of Object.entries(manifest.files)) {
    const raw = readFileSync(new URL(filename, source));
    assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sha256);
    assert.equal(new URL(entry.url).hostname, 'api.worldbank.org');
  }
  for (const [country, code] of [['us', 'USA'], ['jp', 'JPN']]) {
    const [metadata, rows] = JSON.parse(readFileSync(new URL(`worldbank-cpi-${code.toLowerCase()}.json`, source)));
    assert.equal(metadata.pages, 1); assert.equal(metadata.total, 31);
    assert.equal(metadata.lastupdated, '2026-11-11');
    assert.deepEqual(CPI_ANNUAL_PERCENT[country].map(row => row.year), Array.from({ length: 31 }, (_, index) => 1994 + index));
    for (const row of rows) {
      assert.equal(row.indicator.id, 'FP.CPI.TOTL.ZG'); assert.equal(row.countryiso3code, code);
      const output = HOUSEHOLD_OBSERVATIONS[country].find(item => item.year === Number(row.date));
      assert.equal(output.inflation, row.value / 100);
      assert.equal(output.wageGrowth, 0.025, 'wages retain the explicit simulated nominal trend');
      if (output.year >= 1995) assert.equal(getCampaignYears(country).find(item => item.year === output.year).inflation, output.inflation);
    }
  }
  assert.equal(getHouseholdRates('us', 2022).inflation, 0.0800279982052121);
  assert.equal(getHouseholdRates('jp', 1995).inflation, -0.00127899045020446);
  assert.ok(getHouseholdRates('jp', 2009).inflation < 0);
  assert.throws(() => getHouseholdRates('us', 2025));
});

test('household history: yearly CPI changes next-year bases without changing the current household bill', () => {
  for (const country of ['us', 'jp']) {
    const state = newCampaign({ country, seed: 'cpi-timing' });
    const year = getCampaignYears(country)[0], actual = year.inflation;
    const expected = settleCampaign(state, cash);
    near(expected.history[0].cashflow.items.find(item => item.id === 'living').amount, -state.household.expense);
    near(expected.household.expense, state.household.expense * (1 + actual));
    near(expected.household.priceIndex, 1 + actual);
    try {
      year.inflation = 0.5;
      const different = settleCampaign(state, cash);
      assert.deepEqual(different.history[0].cashflow, expected.history[0].cashflow);
      assert.deepEqual(different.history[0].events, expected.history[0].events);
      near(different.household.expense, state.household.expense * 1.5);
    } finally { year.inflation = actual; }
    assert.deepEqual(restoreCampaign(expected), expected);
  }
});

test('household history: current CPI and wage outcomes are not read by preview, rules or model context', () => {
  for (const country of ['us', 'jp']) {
    assert.equal(COUNTRIES[country].inflation, undefined, 'no obsolete fixed inflation metadata');
    const state = newCampaign({ country });
    for (let round = 0; round < 30; round++) {
      state.round = round; state.age = state.startAge + round;
      const year = getCampaignYears(country)[round];
      const descriptors = Object.fromEntries(['inflation', 'wageGrowth'].map(key => [key, Object.getOwnPropertyDescriptor(year, key)]));
      try {
        for (const key of Object.keys(descriptors)) Object.defineProperty(year, key, { configurable: true, get() { throw new Error(`future ${key} read`); } });
        assert.ok(publicRound(state)); assert.ok(fallbackCampaignPack(state));
        const serialized = JSON.stringify(campaignDecisionContext(state));
        assert.equal(/"inflation"\s*:/.test(serialized), false);
      } finally {
        for (const [key, descriptor] of Object.entries(descriptors)) Object.defineProperty(year, key, descriptor);
      }
    }
  }
  for (const text of HOUSEHOLD_ASSUMPTIONS) assert.ok(HISTORY30_ASSUMPTIONS.includes(text));
  assert.ok(HOUSEHOLD_ASSUMPTIONS.some(text => text.includes('模拟名义趋势')));
  assert.ok(HOUSEHOLD_ASSUMPTIONS.some(text => text.includes('最后一天')));
});
