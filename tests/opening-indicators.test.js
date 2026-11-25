import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getHistoricalEmployment, getOpeningIndicators } from '../dist/opening-indicators.js';

test('all 240 opening readings use observations available before the playable year', () => {
  let count = 0;
  for (const country of ['us', 'jp']) {
    for (let year = 1987; year <= 2026; year += 1) {
      const items = getOpeningIndicators(country, year);
      const hasFx = country === 'jp' && year <= 2003;
      assert.deepEqual(items.map(item => item.key), ['rate', 'cpi', hasFx ? 'fx' : 'unemployment']);
      for (const item of items) {
        assert.ok(item.period.startsWith((year - 1) + '-'));
        assert.ok(item.period + '-01' <= item.availableBy && item.availableBy < year + '-01-01');
        assert.equal(item.decisionSafe, true);
        assert.equal(item.unit, item.key === 'fx' ? '日元' : '%');
        assert.ok(Number.isFinite(item.value) && item.basis && item.vintage);
        assert.match(item.sourceUrl, /^https:\/\//);
        count += 1;
      }
      assert.equal(Boolean(getHistoricalEmployment(country, year)), hasFx);
    }
  }
  assert.equal(count, 240);
});

test('Japanese archival unemployment stays in the recap and contemporaneous quotes replace it at opening', () => {
  const first = getOpeningIndicators('jp', 1987)[2];
  assert.deepEqual([first.value, first.observationDate, first.unit], [162.05, '1986-11-28', '日元']);
  const labor = getHistoricalEmployment('jp', 1987);
  assert.deepEqual([labor.decisionSafe, labor.value, labor.period], [false, 2.6, '1986-10']);
  assert.match(labor.basis, /未季调/);
  assert.deepEqual(getOpeningIndicators('jp', 2004).map(r => r.key), ['rate', 'cpi', 'unemployment']);
  assert.equal(getHistoricalEmployment('jp', 2004), null);
});

test('rate regimes preserve actual traded rates, target midpoints and negative values', () => {
  assert.equal(getOpeningIndicators('us', 1994)[0].label, '隔夜利率');
  assert.equal(getOpeningIndicators('us', 1995)[0].label, '政策利率');
  assert.equal(getOpeningIndicators('jp', 1997)[0].label, '官方贴现率');
  const low = getOpeningIndicators('jp', 2005)[0];
  assert.deepEqual([low.label, low.value], ['隔夜利率', 0.001]);
  assert.equal(getOpeningIndicators('jp', 2011)[0].value, 0.05);
  assert.equal(getOpeningIndicators('jp', 2017)[0].value, -0.1);
  assert.equal(getOpeningIndicators('us', 2026)[0].value, 3.625);
});

test('late employment releases, the CPI reporting lag and early real-time vintages survive regeneration', () => {
  const us = getOpeningIndicators('us', 2026);
  assert.deepEqual(us.slice(1).map(r => [r.period, r.availableBy, r.value]), [
    ['2025-11', '2025-12-18', 2.7], ['2025-11', '2025-12-16', 4.6],
  ]);
  const jp = getOpeningIndicators('jp', 2026);
  assert.deepEqual(jp.map(r => r.value), [0.75, 2.9, 2.6]);
  assert.equal(jp[2].availableBy, '2025-12-26');
  assert.deepEqual(getOpeningIndicators('us', 1987).slice(1).map(r => [r.availableBy, r.value]), [
    ['1986-12-19', 1.3], ['1986-11-15', 7],
  ]);
  assert.throws(() => getOpeningIndicators('jp', 2027), RangeError);
  assert.throws(() => getOpeningIndicators('constructor', 2000), RangeError);
  const raw = readFileSync(new URL('../scripts/opening-sources/observations.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL('../scripts/opening-sources/provenance.json', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.observationsSha256);
  execFileSync('python3', [fileURLToPath(new URL('../scripts/build-opening-indicators.py', import.meta.url)), '--check']);
});
