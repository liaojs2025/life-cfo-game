import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ASSET_KEYS,ACCOUNT_IDS,newCampaign,settleCampaign,ruleDecisions,fallbackCampaignPack,restoreCampaign,campaignSummary,accountNetWorth,campaignDecisionContext,publicRound} from '../dist/atlas-engine.js';
import {getCampaignYears} from '../dist/atlas-scenarios.js';
import {MARKET_DATA,MARKET_META,getMarketAssets} from '../dist/atlas-market-data.js';
import {riskDashboard} from '../dist/atlas-risk-view.js';
const mix=k=>Object.fromEntries(ASSET_KEYS.map(x=>[x,x===k?100:0]));
const near=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1e-6,Math.abs(b)*1e-10),`${a} != ${b}`);
const clone=x=>JSON.parse(JSON.stringify(x));
const finish=(s,choose=()=>mix('cash'))=>{while(!s.finished)s=settleCampaign(s,choose(s));return s;};

test('independent atlas audit: all-stock purchase and next-year complete sale pay exactly both sides',()=>{
 const start=newCampaign({country:'us',edition:'short',seed:'independent-fee'});
 const bought=settleCampaign(start,mix('tech')), first=bought.history[0].accounts.player;
 const initial=100000, invested=initial/1.001;
 near(first.investedCapital,invested); near(first.tradingFees,invested*.001);
 near(first.portfolioReturn,MARKET_DATA.us[2017].returns.tech);
 const holding=bought.accounts.player.assets.tech;
 const sold=settleCampaign(bought,mix('cash')), second=sold.history[1].accounts.player;
 near(second.tradingFees,holding*.001); near(second.portfolioReturn,0);
 near(second.endNetWorth,second.startNetWorth-second.tradingFees+sold.history[1].cashflow.net);
 assert.deepEqual(start,newCampaign({country:'us',edition:'short',seed:'independent-fee'}));
});

test('independent atlas audit: same seed has same family shocks despite opposite portfolio decisions',()=>{
 for(const country of ['us','jp'])for(const edition of ['full','short']){
  let a=newCampaign({country,edition,seed:'family-coupling'}), b=clone(a);
  while(!a.finished&&!b.finished){
   a=settleCampaign(a,mix('cash')); b=settleCampaign(b,mix(a.round%2?'tech':'gold'));
   const x=a.history.at(-1),y=b.history.at(-1);
   assert.deepEqual(x.events,y.events);assert.deepEqual(x.cashflow,y.cashflow);assert.deepEqual(a.household,b.household);
   for(const id of ACCOUNT_IDS){const r=x.accounts[id];if(!r.inactive)near(r.contribution,x.cashflow.net);}
  }
 }
});

test('independent atlas audit: both countries and editions replay every persisted boundary and reject altered history',()=>{
 for(const country of ['us','jp'])for(const edition of ['full','short']){
  let s=newCampaign({country,edition,seed:'independent-completion'});
  while(!s.finished){s=settleCampaign(s,mix('cash'));assert.deepEqual(restoreCampaign(clone(s)),s);}
  assert.equal(s.round,edition==='full'?40:10);assert.equal(s.endReason,'completed');
  const summary=campaignSummary(s);assert.equal(summary.completeYears,s.round-1);
  const all=s.history.reduce((v,r)=>v*(1+r.accounts.player.portfolioReturn),1)-1;near(summary.accounts.player.investmentReturn,all);
  for(const alter of [x=>x.edition=x.edition==='full'?'short':'full',x=>x.version=4,x=>x.history.at(-1).accounts.player.endAssets.cash+=1,x=>x.history[0].cashflow.net+=1,x=>x.history[0].pack.decisions.conservative.cash+=1]){
   const bad=clone(s);alter(bad);assert.throws(()=>restoreCampaign(bad));
  }
 }
});

test('independent atlas audit: validation is atomic across all three accounts and benchmark indices stay nontradable',()=>{
 const s=newCampaign({edition:'short'}), saved=clone(s), p=fallbackCampaignPack(s);p.source='model';p.decisions.conservative=mix('tech');
 assert.throws(()=>settleCampaign(s,mix('bond'),p));assert.deepEqual(s,saved);
 const invalid={...mix('cash'),indexA:0};assert.throws(()=>settleCampaign(s,invalid));assert.deepEqual(s,saved);
 for(const country of ['us','jp'])for(const edition of ['full','short']){
  const state=newCampaign({country,edition});const years=getCampaignYears(country,edition),row=years[0];
  const keys=['returns','benchmarks','inflation','wageGrowth','eventIds','reveal'];const old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(row,k)]));
  try{for(const k of keys)Object.defineProperty(row,k,{configurable:true,get(){throw Error('hidden read '+k)}});
   publicRound(state);ruleDecisions(state);const context=JSON.stringify(campaignDecisionContext(state));
   assert.doesNotMatch(context,/"(?:year|asOf|eventIds|returns|benchmarks|reveal)"/);
  }finally{for(const k of keys)if(old[k])Object.defineProperty(row,k,old[k]);else delete row[k];}
 }
});

test('independent atlas audit: YTD event cutoff censors cost and state changes while ordinary budgets use exact days',()=>{
 const row=getCampaignYears('us','short').at(-1),original={asOf:row.asOf,isPartial:row.isPartial,periodFraction:row.periodFraction};
 let censored=0,paid=0;
 try{for(let i=0;i<70;i++){
  const s=newCampaign({country:'us',edition:'short',seed:'cutoff-proof-'+i});s.round=9;s.age=30;
  Object.assign(row,original);const september=settleCampaign(s,mix('cash'));
  Object.assign(row,{asOf:'2026-01-01',isPartial:true,periodFraction:1/365});const january=settleCampaign(s,mix('cash'));
  near(january.history[0].cashflow.recurringIncome,72000/365);near(january.history[0].cashflow.recurringExpense,36000/365);
  for(const e of january.history[0].events)if(e.dayOfYear!==undefined)assert.equal(e.dayOfYear,1);
  for(const e of september.history[0].events)if(e.dayOfYear>1){censored++;assert.ok(!january.history[0].events.some(x=>x.id===e.id));
   if(e.id==='marriage'){assert.equal(january.household.married,false);near(e.amount,-36000*.45);paid++;}
   if(e.id==='promotion')assert.equal(january.household.income,72000);
  }
 }assert.ok(censored>0&&paid>0);}finally{Object.assign(row,original);}
});

test('independent atlas audit: liquidation bankruptcy records unpaid liabilities and exited opponents stop investing',()=>{
 const s=newCampaign({edition:'short',seed:'independent-insolvent'});s.household.income=0;s.household.expense=400000;
 const next=settleCampaign(s,mix('tech')),r=next.history[0].accounts.player;
 assert.equal(next.endReason,'bankruptcy');assert.ok(r.shortfallDebt>0);assert.ok(r.liquidationFees>0);
 near(accountNetWorth(next.accounts.player),-r.shortfallDebt);near(r.endNetWorth,r.startNetWorth+r.investmentProfit-r.fees+next.history[0].cashflow.net);
 assert.throws(()=>settleCampaign(next,mix('cash')));
 const alive=newCampaign({edition:'short'});alive.accounts.aggressive.bankrupt=true;alive.accounts.aggressive.shortfallDebt=123;
 const frozen=clone(alive.accounts.aggressive),n=settleCampaign(alive,mix('cash'));
 assert.deepEqual(n.accounts.aggressive,frozen);assert.equal(n.history[0].accounts.aggressive.contribution,0);
 assert.equal(campaignSummary(n).curves.at(-1).returnIndex.aggressive,null);
});

test('independent atlas audit: market extracts use compound FX, separate price indices, and exact nine-month industry returns',()=>{
 const raw=JSON.parse(readFileSync(new URL('../scripts/atlas-sources/observations.json',import.meta.url)));
 for(const y of [1987,2000,2008,2024,2026]){
  const fx=raw.yenPerUSD[y].value/raw.yenPerUSD[y-1].value;
  for(const key of (y<2009?['bond','gold','tech','consumer','health']:['bond','gold']))near(MARKET_DATA.jp[y].returns[key],(1+MARKET_DATA.us[y].returns[key])*fx-1);
  near(MARKET_DATA.jp[y].returns.broad,raw.topixLevels[y]/raw.topixLevels[y-1]-1);
  near(MARKET_DATA.us[y].returns.bond,raw.fundAdjustedNAV.FBNDX[y].value/raw.fundAdjustedNAV.FBNDX[y-1].value-1);
 }
 assert.equal(Object.keys(raw.frenchMonthly2026TotalReturns).length,9);
 for(const key of ['tech','consumer','health'])near(MARKET_DATA.us[2026].returns[key],Object.values(raw.frenchMonthly2026TotalReturns).reduce((p,r)=>p*(1+r[key]),1)-1);
 assert.notEqual(MARKET_DATA.us[2024].returns.broad,MARKET_DATA.us[2024].benchmarks.indexA);
 assert.equal(MARKET_META.us.indices[0].returnType,'price-return');assert.match(getMarketAssets('jp',2008).find(a=>a.key==='tech').label,/海外/);assert.match(getMarketAssets('jp',2009).find(a=>a.key==='tech').label,/日本电机/);
 assert.equal(MARKET_DATA.us[2026].asOf,'2026-09-30');assert.equal(MARKET_DATA.us[2026].periodFraction,273/365);
});

test('independent atlas audit: YTD is shown in curve but never supplied to annual risk metrics',()=>{
 const s=finish(newCampaign({edition:'short',seed:'risk-exclusion'}));
 const html=riskDashboard(s.history,[{id:'player',name:'玩家'},{id:'indexA',name:'指数',benchmark:true}]);
 assert.match(html,/完整年度统计至 2025 年/);assert.match(html,/<td>9<\/td>/);
 const altered=clone(s.history);altered.at(-1).accounts.player.portfolioReturn=-.999;altered.at(-1).benchmarkReturns.indexA=100;
 assert.equal(riskDashboard(altered,[{id:'player',name:'玩家'},{id:'indexA',name:'指数',benchmark:true}]),html);
});


test('independent atlas audit: Japanese sector switch uses domestic total NAV and freezes each historical label',()=>{
 const raw=JSON.parse(readFileSync(new URL('../scripts/atlas-sources/jp-domestic-sectors.json',import.meta.url)));
 for(const [key,series] of Object.entries(raw.series)){
  assert.equal(series.currency,'JPY');assert.equal(series.observations.length,18);
  for(const r of series.observations){
   near(MARKET_DATA.jp[r.year].returns[key],r.endTotalReturnNAV/r.startTotalReturnNAV-1);
   assert.ok(r.endObservation<=r.asOf);assert.ok(r.startObservation.startsWith(String(r.year-1)));
  }
 }
 let state=newCampaign({country:'jp',edition:'full',seed:'label-freeze'});
 while(state.round<23&&!state.finished)state=settleCampaign(state,mix('cash'));
 const a=state.history.find(r=>r.year===2008),b=state.history.find(r=>r.year===2009);
 assert.match(a.assetLabels.tech,/海外/);assert.match(b.assetLabels.tech,/日本电机/);
 assert.deepEqual(restoreCampaign(clone(state)),state);
 const changed=clone(state);changed.history.find(r=>r.year===2008).assetLabels.tech=b.assetLabels.tech;
 assert.throws(()=>restoreCampaign(changed));
});

test('independent atlas audit: replacing a Japanese sector charges sale plus purchase rather than netted turnover',()=>{
 for(const key of ['tech','consumer','health']){
  let state=newCampaign({country:'jp',edition:'full',seed:'replacement-fee-proof'});
  while(state.round<21)state=settleCampaign(state,mix('cash'));
  state=settleCampaign(state,mix(key));
  const wealth=accountNetWorth(state.accounts.player),oldHolding=state.accounts.player.assets[key];
  const next=settleCampaign(state,mix(key)),record=next.history.at(-1).accounts.player;
  const expectedCapital=(wealth-.001*oldHolding)/1.001,expectedFee=.001*(oldHolding+expectedCapital);
  near(record.investedCapital,expectedCapital);near(record.tradingFees,expectedFee);near(record.replacementFees,expectedFee);
  near(record.fees,record.tradingFees+record.liquidationFees);
  assert.deepEqual(next.history.at(-1).assetChanges.map(x=>x.key).sort(),['consumer','health','tech']);
  assert.deepEqual(restoreCampaign(clone(next)),next);
 }
});

test('independent atlas audit: every model briefing omits calendar identity and named historical headlines',()=>{
 const forbidden=/(?:19|20)\d{2}|https?:|美联储|日本银行|东京|软银|关西|NAFTA|FIRREA|LTCM|格林斯潘|科威特|伊拉克|克林顿|黑田|日经|标普|雷曼|道琼斯|世界杯|Comirnaty/;
 for(const country of ['us','jp'])for(const year of getCampaignYears(country,'full')){
  assert.equal(year.aiContext.length,3);
  for(const signal of year.aiContext)assert.doesNotMatch(signal.text,forbidden,`${country} ${year.year}`);
 }
});
