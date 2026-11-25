import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { ASSET_KEYS, COUNTRIES, newCampaign, replayPlayerFinish, settleCampaign } from '../dist/atlas-engine.js';
import { startCommunity } from '../dist/community.js';
import { openCommunityDb } from '../scripts/local-community-db.mjs';
import { community } from '../worker/handler.js';

const seed = 'ad29c54b-8a25-483f-ad7f-87264b5e093c';
const cash = Object.fromEntries(ASSET_KEYS.map(key => [key, key === 'cash' ? 100 : 0]));
function cashJourney(country, edition) {
  let state = newCampaign({ country, edition, seed });
  while (!state.finished) state = settleCampaign(state, cash);
  return state;
}

test('all-cash public scores reconcile to the opening balance plus the net family cash flows', () => {
  for (const country of ['us', 'jp']) {
    for (const edition of ['short', 'full']) {
      const state = cashJourney(country, edition);
      const { history } = state;
      const netIncome = history.reduce((sum, { cashflow }) =>
        sum + cashflow.income + cashflow.windfall - cashflow.expense, 0);
      const wealth = Math.round(COUNTRIES[country].initialWealth + netIncome);
      const score = replayPlayerFinish({
        country, edition, seed, allocations: history.map(() => ASSET_KEYS.map(key => cash[key])),
      });
      assert.equal(score.wealth, wealth);
      assert.equal(score.investmentReturn, 0);
      assert.equal(score.outcome, wealth <= 0 ? 'bankruptcy' : 'completed');
      assert.equal(history.length, edition === 'short' ? 10 : 40);
      assert.equal(history.at(-1).asOf, '2026-09-30');
    }
  }
});

function memoryStorage() {
  const storage = Object.create(null);
  return Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = String(value); } },
    removeItem: { value: key => { delete storage[key]; } },
  });
}

async function waitFor(predicate) {
  for (let i = 0; i < 200 && !predicate(); i++) await tick();
  assert.ok(predicate(), 'the local request should have settled');
}

test('finish times survive lost acknowledgements and old offline saves keep their registration time', async t => {
  const origin = 'https://liaojs2025.github.io';
  const endpoint = 'https://local.test/api/community';
  const db = openCommunityDb(':memory:');
  t.after(() => db.close());
  const storage = memoryStorage();
  const globals = { localStorage: storage, location: new URL(origin), window: new EventTarget() };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  const browserHeaders = headers => ({ ...headers, Origin: origin });
  const writes = [];
  let failAfterCommit = true;
  const completedAt = Date.UTC(2026, 10, 25, 3, 30);
  let now = completedAt;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    const body = options.body && JSON.parse(options.body);
    if (body) writes.push(body);
    const response = await community(new Request(endpoint, {
      ...options, headers: browserHeaders(options.headers),
    }), db);
    if (body?.type === 'finish' && failAfterCommit) {
      failAfterCommit = false;
      throw new TypeError('offline after write');
    }
    return response;
  });
  let summary, offline;
  const client = startCommunity((next, failed) => { summary = next; offline = failed; });
  await waitFor(() => summary?.views === 1);
  client.finish(cashJourney('us', 'short'));
  await waitFor(() => offline);
  const [key] = Object.keys(storage);
  const queued = JSON.parse(storage[key]);
  assert.deepEqual(Object.keys(queued).sort(), ['allocations', 'country', 'edition', 'finishedAt', 'seed']);
  assert.equal(queued.finishedAt, completedAt);
  now += 3 * 60 * 60 * 1000;
  await client.retry();
  assert.equal(offline, false);
  assert.deepEqual(Object.keys(storage), []);
  assert.deepEqual(writes.map(event => event.type), ['view', 'finish', 'finish']);
  assert.deepEqual(writes[1], writes[2]);
  assert.equal(summary.completions, 1);
  assert.equal(summary.recent.length, 1);
  assert.equal(summary.recent[0].investmentReturn, 0);
  assert.equal(summary.recent[0].finishedAt, completedAt);
  assert.equal(summary.recent[0].recordedAt, completedAt);
  const recordView = visit => community(new Request(endpoint, {
    method: 'POST', headers: browserHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ type: 'view', visit }),
  }), db);
  const visitor = 'a17a03c8-4962-4cd7-9b54-d2e244b5ea24';
  assert.equal((await recordView(visitor)).status, 200);
  assert.equal((await recordView(visitor.toUpperCase())).status, 400);
  await client.retry();
  assert.equal(summary.views, 2);
  assert.equal(summary.completions, 1);
  assert.equal(writes.length, 3);

  // An older offline client had already queued its final move before the
  // completion-time field shipped. Opening the new client must still deliver it.
  const legacy = { seed, country: 'jp', edition: 'short', allocations: queued.allocations };
  storage.setItem(key, JSON.stringify(legacy));
  startCommunity(next => { summary = next; });
  await waitFor(() => summary?.completions === 2);
  const imported = summary.recent.find(row => row.country === 'jp');
  assert.equal(imported.finishedAt, null);
  assert.equal(imported.recordedAt, now);
  assert.equal(summary.leaderboard.filter(row => row.country === 'jp').length, 1);
  assert.deepEqual(Object.keys(storage), []);
});
