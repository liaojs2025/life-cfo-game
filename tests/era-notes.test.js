import test from 'node:test';
import assert from 'node:assert/strict';
import { ERA_NOTES, getEraNote } from '../dist/era-notes.js';
import { MARKET_DATA } from '../dist/atlas-market-data.js';

const countries = ['us', 'jp'];
const allYears = Array.from({length: 40}, (_, index) => index + 1987);

test('every opening desk has a distinct sourced period fact and a player-visible anonymized mechanism', () => {
  const titles = new Set();
  for (const country of countries) {
    assert.deepEqual(Object.keys(ERA_NOTES[country]).map(Number), allYears);
    for (const year of allYears) {
      const { opening } = getEraNote(country, year);
      assert.equal(titles.has(opening.title), false, opening.title);
      titles.add(opening.title);
      assert.equal(opening.knownBy.slice(0, 4), String(year - 1));
      assert.ok(opening.knownBy < year + '-01-01');
      assert.match(opening.knownBy, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(new Date(opening.knownBy + 'T00:00:00Z').toISOString().slice(0, 10), opening.knownBy);
      assert.equal(new URL(opening.sourceUrl).protocol, 'https:');
      assert.ok(opening.sourceTitle.length > 3);
      assert.ok(opening.text.includes(opening.modelSignal));
      assert.ok(opening.modelSignal.length >= 17);
      assert.ok(Object.isFrozen(opening));
      assert.doesNotMatch(opening.modelSignal, /\d{4}|[a-zA-Z]+|https?:|\d(?:\.\d+)?%|美联储|美国|日本|任天堂|索尼|丰田|美光|广岛|台积电|海力士|英伟达|微软|谷歌/);
      assert.ok(!Object.hasOwn(opening, 'textAfter') && !Object.hasOwn(opening, 'settlement'));
    }
  }
});

test('each closing quip is unique, remains one sentence, and its market figures can be reproduced', () => {
  const unique = new Set();
  for (const country of countries) {
    for (const year of allYears) {
      const { opening, settlement } = getEraNote(country, year);
      const market = MARKET_DATA[country][year];
      assert.equal(settlement.asOf, market.asOf);
      assert.equal(unique.has(settlement.text), false);
      unique.add(settlement.text);
      assert.equal((settlement.text.match(/[。！？]/g) || []).length, 1);
      assert.match(settlement.text, /。$/);
      assert.doesNotMatch(settlement.text, /[{}]|NaN|undefined/);
      assert.ok(settlement.returnKeys.length > 0);
      const quotes = {...market.returns, ...market.benchmarks};
      for (const key of settlement.returnKeys) {
        assert.ok(Number.isFinite(quotes[key]));
        const displayed = (Math.abs(quotes[key]) * 100).toFixed(1) + '%';
        assert.ok(settlement.text.includes(displayed), country + year + ' ' + key);
      }
      assert.notEqual(opening.text, settlement.text);
      if (year === 2026) {
        assert.equal(settlement.asOf, '2026-09-30');
        assert.match(settlement.text, /九月底/);
      }
    }
  }
});

test('recent themes enter the decision year only after their real announcements', () => {
  assert.doesNotMatch(getEraNote('us', 2022).opening.text, /ChatGPT|GPT-4/);
  assert.match(getEraNote('us', 2023).opening.text, /ChatGPT/);
  assert.match(getEraNote('us', 2024).opening.text, /GPT-4/);
  assert.match(getEraNote('us', 2025).opening.text, /HBM3E/);
  assert.match(getEraNote('us', 2026).opening.text, /海力士.*HBM4/);
  assert.match(getEraNote('jp', 2024).opening.text, /广岛.*DRAM/);
  assert.match(getEraNote('jp', 2026).opening.text, /北海道.*两纳米/);
  for (const args of [['uk', 2025], ['us', 1986], ['jp', 2027], ['constructor', 'name']]) {
    assert.throws(() => getEraNote(...args), RangeError);
  }
});
