import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getCampaignYears } from '../dist/atlas-scenarios.js';
import { getPricePath, toStartPurchasingPower } from '../dist/atlas-inflation.js';

const snapshot = readFileSync(new URL('../scripts/atlas-sources/cpi-close.csv', import.meta.url), 'utf8');
const endpoints = new Map(snapshot.trim().split('\n').slice(1).map(line => {
  const [month, us, jp] = line.split(',');
  return [month, {us: Number(us), jp: Number(jp)}];
}));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} vs ${expected}`);

test('both route lengths rebase the archived monthly closes and stop in September 2026', () => {
  assert.equal(createHash('sha256').update(snapshot).digest('hex'), '148c78ad16004c6f8cdf0f7b392f696867a17630bffda325b06e53679a1811b3');
  assert.equal(endpoints.size, 41);
  for (const country of ['us', 'jp']) {
    for (const edition of ['short', 'full']) {
      const history = getCampaignYears(country, edition);
      const path = getPricePath(country, history);
      const baseMonth = edition === 'short' ? '2016-12' : '1986-12';
      assert.equal(path.length, history.length + 1);
      assert.equal(path[0].index, 100);
      assert.deepEqual(path.map(p => p.month), [baseMonth, ...history.map(r => r.asOf.slice(0, 7))]);
      for (const p of path) {
        assert.equal(p.cpi, endpoints.get(p.month)[country]);
        near(p.index, 100 * endpoints.get(p.month)[country] / endpoints.get(baseMonth)[country]);
      }
      assert.equal(path.at(-1).month, '2026-09');
      assert.deepEqual(getPricePath(country, history.slice(0, 2)), path.slice(0, 3));
    }
  }
});

test('real returns divide by domestic price growth, including deflation and the partial year', () => {
  const us = getPricePath('us', getCampaignYears('us', 'short'));
  const jp = getPricePath('jp', getCampaignYears('jp', 'short'));
  near(us.at(-1).index / us.at(-2).index, 336.940 / 324.054);
  near(jp.at(-1).index / jp.at(-2).index, 102.2 / 100.9);
  near(toStartPurchasingPower(140, us.at(-1).index), 140 * 241.432 / 336.940);
  const deflation = getPricePath('jp', [{year: 2009, asOf: '2009-12-31'}]);
  assert.ok(deflation[1].index < 100);
  near(toStartPurchasingPower(100, deflation[1].index), 100 * 86.1 / 84.7);
  near(toStartPurchasingPower(-10, deflation[1].index), -10 * 86.1 / 84.7);
  assert.equal(toStartPurchasingPower(null, 100), null);
  assert.equal(toStartPurchasingPower(0, 110), 0);
  assert.deepEqual(getPricePath('us', []), []);
  assert.throws(() => getPricePath('us', [{year: 2026, asOf: '2026-12-31'}]), /2026-12/);
  assert.throws(() => toStartPurchasingPower(100, 0), RangeError);
});
