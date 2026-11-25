import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCommunityDb } from '../scripts/local-community-db.mjs';
import { community } from '../worker/handler.js';
import { ASSET_KEYS, newCampaign, ruleDecisions, settleCampaign, accountNetWorth, replayPlayerFinish } from '../dist/atlas-engine.js';

const origin = 'https://liaojs2025.github.io';
const request = (body, headerOrigin=origin) => new Request('https://site.example/api/community', {
  method: body ? 'POST':'GET', headers: { Origin:headerOrigin, 'Content-Type':'application/json' },
  ...(body ? {body:JSON.stringify(body)} : {}),
});
function simulate(country,edition,seed,choose=state=>ruleDecisions(state).player) {
  let state = newCampaign({country,edition,seed});
  const allocations = [];
  while (!state.finished) {
    const weights=choose(state);
    allocations.push(ASSET_KEYS.map(key=>weights[key]));
    state=settleCampaign(state,weights);
  }
  return { event:{country,edition,seed,allocations}, state };
}
test('server scorekeeper follows the player ledger through all routes and early bankruptcy',()=>{
  for (const country of ['us','jp']) for (const edition of ['short','full']) {
    const {event,state}=simulate(country,edition,'server-compare');
    const score=replayPlayerFinish(event);
    assert.equal(score.outcome,state.endReason);
    assert.equal(score.wealth,Math.round(accountNetWorth(state.accounts.player)));
    assert.equal(score.investmentReturn,state.accounts.player.returnIndex-1);
  }
  const weights=Object.fromEntries(ASSET_KEYS.map(k=>[k,k==='tech'?100:0]));
  const {event,state}=simulate('jp','full','audit-v5-bank-262',()=>weights);
  assert.equal(state.endReason,'bankruptcy');
  assert.equal(replayPlayerFinish(event).outcome,'bankruptcy');
  assert.throws(()=>replayPlayerFinish({...event,allocations:[...event.allocations,event.allocations[0]]}));
});
test('separate anonymous visits share totals, and concurrent result retries publish one verified finish',async t=>{
  const db=openCommunityDb(':memory:');t.after(()=>db.close());
  const send=async body=>(await community(request(body),db)).json();
  const first=randomUUID(), second=randomUUID();
  const {event,state}=simulate('jp','short',randomUUID());
  const result={type:'finish',visit:first,...event};
  assert.equal((await community(request(result),db)).status,409);
  await Promise.all([first,first,second].map(visit=>send({type:'view',visit})));
  assert.deepEqual(await send(null),{views:2,completions:0,recent:[],leaderboard:[]});
  assert.equal((await community(request({...result,allocations:event.allocations.slice(0,2)}),db)).status,422);
  await Promise.all([result,{...result,visit:second}].map(send));
  const summary=await send(null);
  assert.equal(summary.completions,1);assert.equal(summary.recent.length,1);
  assert.equal(summary.recent[0].wealth,Math.round(accountNetWorth(state.accounts.player)));
  assert.deepEqual(Object.keys(summary.recent[0]).sort(),['country','edition','finishedAt','investmentReturn','outcome','recordedAt','wealth','year']);
  assert.equal(summary.recent[0].finishedAt,null);
  assert.ok(Number.isSafeInteger(summary.recent[0].recordedAt));
  assert.deepEqual(summary.leaderboard,summary.recent);
  const loss={type:'finish',visit:second,country:'jp',edition:'full',seed:'6c4e8e33-9f30-41c7-9628-00000000009e',
    allocations:[ASSET_KEYS.map(k=>k==='tech'?100:0)]};
  await send(loss);
  const ended=await send(null);
  assert.equal(ended.completions,1);
  assert.equal(ended.recent.filter(row=>row.outcome==='bankruptcy').length,1);
  assert.deepEqual(ended.leaderboard,summary.leaderboard);
  assert.equal((await community(request({...result,wealth:999}),db)).status,400);
  assert.equal((await community(request({type:'view',visit:first},'https://outside.example'),db)).status,403);
});

test('leaderboard selects ten completed runs across routes by raw return and stable ties',async t=>{
  const db=openCommunityDb(':memory:'); t.after(()=>db.close());
  const add=db.prepare('INSERT INTO finishes (run,country,edition,outcome,year,wealth,investment_return,recorded_at) VALUES (?,?,?,?,2026,?,?,?)');
  function seed(run,country,edition,wealth,rate,received,outcome='completed') {
    add.bind(run,country,edition,outcome,wealth,rate,received).run();
  }
  for (let i=1;i<=9;i++) seed('lower-'+i,'us','full',i,-i/100,500+i);
  seed('early','us','short',11,.04002,100);
  seed('tie-z','jp','full',12,.04002,101);
  seed('tie-a','us','full',13,.04002,101);
  seed('slightly-higher','jp','short',14,.04003,300);
  seed('wealthiest','jp','full',9_000_000,.04001,510);
  seed('uncompleted','us','full',-80,1.2,511,'bankruptcy');
  const {recent,leaderboard,completions}=await (await community(request(null),db)).json();
  assert.equal(completions,14);
  assert.deepEqual(leaderboard.map(row=>row.wealth),[14,11,13,12,9_000_000,1,2,3,4,5]);
  assert.deepEqual(recent.map(row=>row.recordedAt),[511,510,509,508]);
  assert.ok(leaderboard.every(row=>row.outcome==='completed'));
  assert.equal(recent[0].outcome,'bankruptcy');
});

test('offline finish time is preserved once; missing and implausible device times fall back to receipt',async t=>{
  const db=openCommunityDb(':memory:'); t.after(()=>db.close());
  let now=Date.UTC(2026,11,2,12);
  t.mock.method(Date,'now',()=>now);
  const visit=randomUUID();
  const send=async body=>{ const response=await community(request(body),db); assert.equal(response.status,200); return response.json(); };
  await send({type:'view',visit});
  const finishEvent=()=>({type:'finish',visit,...simulate('us','short',randomUUID()).event});
  const offlineFinish=now-2*24*60*60*1000;
  const result={...finishEvent(),finishedAt:offlineFinish};
  const first=(await send(result)).recent[0];
  assert.equal(first.finishedAt,offlineFinish);
  assert.equal(first.recordedAt,now);
  now+=60*60*1000;
  assert.deepEqual((await send({...result,finishedAt:now})).recent[0],first);
  for (const value of [undefined,null,Date.UTC(2020,0,1),now+6*60*1000,'yesterday',3.5]) {
    const next=finishEvent();
    if (value!==undefined) next.finishedAt=value;
    const row=(await send(next)).recent[0];
    assert.equal(row.finishedAt,null);
    assert.equal(row.recordedAt,now);
    now++;
  }
});

test('an existing v2 database upgrades once without changing its recorded finishes',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'life-cfo-ranks-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'old.sqlite');
  const old=new DatabaseSync(file);
  old.exec(readFileSync(new URL('../drizzle/0000_community_stats.sql',import.meta.url),'utf8'));
  old.exec("CREATE TABLE local_migrations (name TEXT PRIMARY KEY); INSERT INTO local_migrations VALUES ('0000_community_stats.sql')");
  old.exec("INSERT INTO finishes VALUES ('old','us','full','completed',2026,893,.0812,1795582800000)");
  old.close();
  for (let open=0;open<2;open++) {
    const upgraded=openCommunityDb(file);
    try {
      const summary=await (await community(request(null),upgraded)).json();
      assert.equal(summary.completions,1);
      assert.deepEqual(summary.leaderboard,summary.recent);
      assert.deepEqual(summary.recent[0],{country:'us',edition:'full',outcome:'completed',year:2026,wealth:893,investmentReturn:.0812,recordedAt:1795582800000,finishedAt:null});
    } finally { upgraded.close(); }
  }
});
