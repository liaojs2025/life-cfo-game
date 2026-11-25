import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign,campaignHash,fallbackCampaignPack,settleCampaign,validateCampaignPack,restoreCampaign,campaignDecisionContext,publicRound } from '../dist/atlas-engine.js';
import { getCampaignYears } from '../dist/atlas-scenarios.js';
import { getEraNote } from '../dist/era-notes.js';

test('v1 saved balances and pre-sealed decisions resume between v2 decisions',()=>{
  const state=newCampaign({country:'jp',edition:'short',seed:'v1-release-replay'});
  const old=fallbackCampaignPack(state,1);
  // Public v1.0 commit da036d4, captured before the news desk was added.
  assert.equal(old.contextId,'atlas5-c07a78af8f995fab');
  const next=settleCampaign(state,old.decisions.player,old);
  assert.equal(campaignHash(next),'4807f2fb48ffaaeb');
  const sealed={...fallbackCampaignPack(next,1),model:'test-sealed-v1',source:'model'};
  assert.equal(sealed.contextId,'atlas5-61b0abcf927a1fe9');
  assert.deepEqual(validateCampaignPack(sealed,next),sealed);
  const mixed=settleCampaign(next,sealed.decisions.player,sealed);
  const v2=fallbackCampaignPack(mixed);
  assert.match(v2.contextId,/^desk2-/);
  const updated=settleCampaign(mixed,v2.decisions.player,v2);
  assert.deepEqual(restoreCampaign(JSON.parse(JSON.stringify(updated))),updated);
});
test('opening desk never exposes the closing verdict or a later revision in the model decision',()=>{
  for(const country of ['us','jp']) {
    let state=newCampaign({country,edition:'full',seed:'decades-qa-0'});
    for(const scenario of getCampaignYears(country)) {
      const year=publicRound(state);
      const context=campaignDecisionContext(state);
      assert.equal(year.year,scenario.year);
      const serialized=JSON.stringify(context);
      assert.ok(!serialized.includes(getEraNote(country,year.year).settlement.text));
      assert.ok(!JSON.stringify(year).includes(getEraNote(country,year.year).settlement.text));
      assert.ok(!serialized.includes('https://'));
      for(const metric of year.indicators) assert.equal(context.signals.some(s=>s.id==='macro-'+metric.key),metric.decisionSafe);
      const fx=context.signals.find(signal=>signal.id==='macro-fx');
      if(fx) assert.doesNotMatch(fx.title+fx.text,/日元|美元|日本|美国/);
      const pack=fallbackCampaignPack(state);
      state=settleCampaign(state,pack.decisions.player,pack);
      if(state.finished)break;
    }
    assert.equal(state.round,40);
  }
});
