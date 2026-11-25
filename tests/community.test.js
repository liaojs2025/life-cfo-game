import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  assert.deepEqual(await send(null),{views:2,completions:0,recent:[]});
  assert.equal((await community(request({...result,allocations:event.allocations.slice(0,2)}),db)).status,422);
  await Promise.all([result,{...result,visit:second}].map(send));
  const summary=await send(null);
  assert.equal(summary.completions,1);assert.equal(summary.recent.length,1);
  assert.equal(summary.recent[0].wealth,Math.round(accountNetWorth(state.accounts.player)));
  assert.deepEqual(Object.keys(summary.recent[0]).sort(),['country','edition','investmentReturn','outcome','wealth','year']);
  const loss={type:'finish',visit:second,country:'jp',edition:'full',seed:'6c4e8e33-9f30-41c7-9628-00000000009e',
    allocations:[ASSET_KEYS.map(k=>k==='tech'?100:0)]};
  await send(loss);
  const ended=await send(null);
  assert.equal(ended.completions,1);
  assert.equal(ended.recent.filter(row=>row.outcome==='bankruptcy').length,1);
  assert.equal((await community(request({...result,wealth:999}),db)).status,400);
  assert.equal((await community(request({type:'view',visit:first},'https://outside.example'),db)).status,403);
});
