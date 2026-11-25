import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { riskMetrics } from '../dist/atlas-risk.js';
import { RISK_FREE_RATES } from '../dist/history30-rates.js';

const observations = (values, riskFree = []) => values.map((value, i) => ({ year: 1995 + i, return: value,
  ...(riskFree[i] === undefined ? {} : { riskFree: riskFree[i] }) }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} != ${expected}`);
const empty = { count: 0, cumulativeReturn: null, annualizedReturn: null, volatility: null, sharpe: null,
  maxDrawdown: null, peakYear: null, troughYear: null, worstYear: null, worstReturn: null };

test('risk audit: three annual observations match independent compounding, sample volatility and Sharpe arithmetic', () => {
  const result = riskMetrics(observations([0.1, -0.2, 0.25]), { baseYear: 1994, riskFreeRate: 0.02 });
  assert.equal(result.count, 3);
  // 100 -> 110 -> 88 -> 110. Mean raw return = .05; squared deviations total .105.
  near(result.cumulativeReturn, 0.1);
  near(result.annualizedReturn, Math.cbrt(1.1) - 1);
  near(result.volatility, Math.sqrt(0.105 / 2));
  near(result.sharpe, 0.03 / Math.sqrt(0.105 / 2));
  near(result.maxDrawdown, 0.2);
  assert.equal(result.peakYear, 1995); assert.equal(result.troughYear, 1996);
  assert.equal(result.worstYear, 1996); assert.equal(result.worstReturn, -0.2);
});

test('risk audit: time-varying annual risk-free rates affect excess-return deviation, not raw portfolio volatility', () => {
  const result = riskMetrics(observations([0.1, -0.2, 0.25], [0.01, 0.03, 0.02]), { riskFreeRate: 0.9 });
  // Excess returns .09, -.23, .23; mean .03; squared deviations .0036+.0676+.04=.1112.
  near(result.volatility, Math.sqrt(0.0525));
  near(result.sharpe, 0.03 / Math.sqrt(0.0556));
  const mixed = riskMetrics(observations([0.1, -0.2, 0.25], [undefined, 0.03, 0.02]), { riskFreeRate: 0.01 });
  near(mixed.sharpe, result.sharpe);
});

test('risk audit: the initial capital is a real drawdown peak and a total loss cannot compound into a recovery', () => {
  const declining = riskMetrics(observations([-0.1, -0.2]), { baseYear: 1994 });
  near(declining.cumulativeReturn, -0.28); near(declining.annualizedReturn, Math.sqrt(0.72) - 1);
  near(declining.maxDrawdown, 0.28); assert.equal(declining.peakYear, 1994); assert.equal(declining.troughYear, 1996);
  const loss = riskMetrics(observations([0.5, -1, 0.2]), { baseYear: 1994 });
  assert.equal(loss.cumulativeReturn, -1); assert.equal(loss.annualizedReturn, -1);
  assert.equal(loss.maxDrawdown, 1); assert.equal(loss.peakYear, 1995); assert.equal(loss.troughYear, 1996);
});

test('risk audit: empty, one-year and zero-dispersion observations use explicit unavailable metrics', () => {
  assert.deepEqual(riskMetrics([]), empty);
  assert.deepEqual(riskMetrics(observations([null, null])), empty);
  const one = riskMetrics(observations([0.1]));
  assert.equal(one.count, 1); near(one.cumulativeReturn, 0.1); near(one.annualizedReturn, 0.1);
  assert.equal(one.volatility, null); assert.equal(one.sharpe, null);
  assert.equal(one.maxDrawdown, 0); assert.equal(one.peakYear, null); assert.equal(one.troughYear, null);
  assert.equal(one.worstYear, 1995); assert.equal(one.worstReturn, 0.1);
  const flat = riskMetrics(observations([0.02, 0.02, 0.02]));
  near(flat.volatility, 0); assert.equal(flat.sharpe, null);
  assert.equal(flat.maxDrawdown, 0); assert.equal(flat.peakYear, null); assert.equal(flat.troughYear, null);
  const flatExcess = riskMetrics(observations([0.01, 0.02, 0.03], [0, 0.01, 0.02]));
  near(flatExcess.volatility, 0.01); assert.equal(flatExcess.sharpe, null);
});

test('risk audit: exiting observations are truncated without counting frozen years as investment returns', () => {
  const data = observations([0.1, -0.2, null, null]);
  const frozen = Object.freeze(data.map(row => Object.freeze(row)));
  assert.deepEqual(riskMetrics(frozen, { baseYear: 1994 }), riskMetrics(observations([0.1, -0.2]), { baseYear: 1994 }));
  assert.equal(frozen.length, 4);
  assert.throws(() => riskMetrics(observations([0.1, null, 0.2])));
  assert.throws(() => riskMetrics(observations([null, 0.2])));
});

test('risk audit: malformed rates or a noncontinuous calendar are rejected rather than silently changing the comparison period', () => {
  for (const value of [NaN, Infinity, -Infinity, -1.01, '0.1', undefined])
    assert.throws(() => riskMetrics([{ year: 1995, return: value }]));
  for (const data of [
    [{ year: 1995, return: 0.1 }, { year: 1995, return: 0.2 }],
    [{ year: 1995, return: 0.1 }, { year: 1997, return: 0.2 }],
    [{ year: 1995, return: 0.1 }, { year: 1994, return: 0.2 }],
    [{ year: '1995', return: 0.1 }],
  ]) assert.throws(() => riskMetrics(data));
  assert.throws(() => riskMetrics(observations([0.1]), { riskFreeRate: NaN }));
  assert.throws(() => riskMetrics(observations([0.1], [Infinity])));
});

test('risk audit: the historical reference is the arithmetic mean of twelve quoted monthly annual rates, with negative rates retained', () => {
  for (const country of ['us', 'jp']) {
    const source = JSON.parse(readFileSync(new URL(`../scripts/history30-sources/rates-${country}.json`, import.meta.url)));
    assert.equal(source.observations.length, 360);
    assert.equal(new Set(source.observations.map(row => row.date)).size, 360);
    for (let year = 1995; year <= 2024; year++) {
      const months = source.observations.filter(row => row.date.startsWith(`${year}-`));
      assert.deepEqual(months.map(row => row.date), Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`));
      near(RISK_FREE_RATES[country][year], months.reduce((sum, row) => sum + row.percent, 0) / 1200);
    }
  }
  // Independently opened FRED source-table checkpoints, not the annual generated values.
  const us2008 = [3.94,2.98,2.61,2.28,1.98,2,2.01,2,1.81,.97,.39,.16];
  const jp2016 = [.07,.03,-.003,-.036,-.059,-.055,-.043,-.043,-.052,-.037,-.049,-.044];
  near(RISK_FREE_RATES.us[2008], us2008.reduce((a,b) => a+b, 0) / 1200);
  near(RISK_FREE_RATES.jp[2016], jp2016.reduce((a,b) => a+b, 0) / 1200);
  assert.ok(RISK_FREE_RATES.jp[2016] < 0);
});
