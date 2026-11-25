import { MARKET_DATA, MARKET_META, MARKET_SOURCES as quoteSources, getMarketAssets } from './atlas-market-data.js';
import { NEWS, OPENING } from './atlas-news.js';
import { EDITION_MACRO } from './edition-macro.js';
import { RISK_FREE_RATES } from './history30-rates.js';
import { HISTORY30_EVENTS } from './history30-events.js';
import { getEraNote } from './era-notes.js';
import { getOpeningIndicators } from './opening-indicators.js';
import { anonymize } from './ai.js';

export const ASSET_KEYS = ['cash', 'broad', 'bond', 'gold', 'tech', 'consumer', 'health'];
export const STOCK_KEYS = ['broad', 'tech', 'consumer', 'health'];
export const EDITIONS = { short: {name:'简要版', start:2017}, full:{name:'完整版',start:1987} };
export const END_YEAR = 2026;
const families = {
  us:{name:'美国',currency:'USD',currencySymbol:'$',initialWealth:100000,annualIncome:72000,annualExpense:36000},
  jp:{name:'日本',currency:'JPY',currencySymbol:'¥',initialWealth:10000000,annualIncome:4800000,annualExpense:3000000},
};
export const COUNTRIES = Object.fromEntries(Object.entries(families).map(([id,family])=>[id,{
  ...family,id,label:family.name,benchmarkKey:'indexA',assets:MARKET_META[id].assets,indices:MARKET_META[id].indices,
}]));
export const REFERENCE_RATES = Object.fromEntries(Object.keys(families).map(id=>[id,{...RISK_FREE_RATES[id],...EDITION_MACRO[id].extraRates}]));
export {NEWS, OPENING, getMarketAssets};
export const MARKET_SOURCES = [
  ...quoteSources,
  {title:'世界银行 · 两国消费价格',url:'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG'},
  {title:'美国劳工统计局 · 2025 年 12 月 CPI-U',url:'https://www.bls.gov/news.release/archives/cpi_01132026.htm'},
];
const knownTopic = new Map([
  ['信用',['bond','broad']],['流动性',['cash','bond','broad']],['能源',['broad','consumer']],['科技',['tech','broad']],['贸易',['consumer','tech']],['通胀',['gold','bond']],['货币政策',['bond','gold','broad']],['汇率',['gold','broad']], ['政策利率',['cash','bond','broad']], ['估值',['broad','tech']],
  ['财政税收',['broad','consumer']], ['财政政策',['bond','consumer']], ['金融制度',['broad','bond']],
  ['跨境资本',['bond','broad','gold']], ['支付结算',['cash','broad']], ['公司治理',['broad','tech']],
  ['能源与物流',['consumer','broad']], ['政策预期',['bond','broad']], ['企业盈利',['broad','tech']],
  ['基础设施',['broad','consumer']], ['国际协调',['broad','bond']], ['供应链',['tech','consumer']],
  ['消费与服务',['consumer','broad']], ['科技与消费',['tech','consumer']], ['家庭支出',['cash','consumer']],
  ['科技融资',['tech','bond']],
]);

// The press desk chooses one lead per country and year. The graph also keeps the
// previously researched long-form case studies. Both are unlocked by the ledger.
export const EVENTS = Object.entries(NEWS).flatMap(([id,years])=>Object.values(years).map(n=>{
  const mechanism = n.channel || '市场定价';
  return {id:'press-'+id+'-'+n.year,country:id,year:n.year,date:n.date,title:n.title,type:'年度新闻',summary:n.summary,
    background:n.background || n.summary,channels:[mechanism],transmission:[{channel:mechanism,mechanism:n.impact,assets:knownTopic.get(mechanism)||['broad','bond']}],
    relatedIds:[],press:n,sources:[{title:'事件资料',url:n.sourceUrl}]};
}));
for(const event of EVENTS) {
  const peers=EVENTS.filter(e=>e.country===event.country && e.id!==event.id && e.channels[0]===event.channels[0])
    .sort((a,b)=>Math.abs(a.year-event.year)-Math.abs(b.year-event.year));
  event.relatedIds=peers.slice(0,2).map(e=>e.id);
}
const graphIds = new Map();
for (const original of HISTORY30_EVENTS) {
  const lead = EVENTS.find(e=>e.country===original.country && e.date===original.date && e.title===original.title);
  const feature = {...original, transmission:original.transmission.map(t=>({...t,
    assets:[...new Set(t.assets.map(k=>k==='indexA'||k==='indexB'?'broad':k))]}))};
  if (lead) {
    graphIds.set(original.id,lead.id);
    Object.assign(lead,feature,{id:lead.id, press:lead.press,
      relatedIds:[...lead.relatedIds,...original.relatedIds]});
  } else EVENTS.push(feature);
}
for (const event of EVENTS) {
  event.relatedIds=[...new Set(event.relatedIds.map(id=>graphIds.get(id) || id))].filter(id=>id!==event.id);
}
EVENTS.sort((a,b)=>a.date.localeCompare(b.date));
export const historicalAssetReturns = (country,year) => MARKET_DATA[country]?.[year]?.returns;
function modelBrief(text) {
  return anonymize(text).replace(/海湾冲突/g,'产油地区冲突').replace(/亚洲市场/g,'海外市场')
    .replace(/关西地区/g,'当地').replace(/日元/g,'本币').replace(/美元/g,'外币')
    .replace(/公定步合/g,'政策贴现率');
}
const yearCache = new Map();
const percent = x => (x<0?'':'+')+(100*x).toFixed(1)+'%';
function makeYear(id,year) {
  const country=COUNTRIES[id], row=MARKET_DATA[id][year], prior=MARKET_DATA[id][year-1], lead=NEWS[id][year-1], opening=OPENING[id][year];
  if(!row||!lead||!opening) throw Error('缺少年份资料 '+id+' '+year);
  const priorDate=(year-1)+'-12-31', fiscalStart=year+'-01-01';
  if(lead.date>priorDate||opening.asOf>fiscalStart)throw Error('年初资料时间不符。');
  const asOf=row.asOf, isPartial=asOf < year+'-12-31' && year===END_YEAR;
  const periodFraction=isPartial?(Date.parse(asOf+'T00:00:00Z')-Date.UTC(year,0,1)+86400000)/(Date.UTC(year+1,0,1)-Date.UTC(year,0,1)):1;
  const briefing=[{title:'开年背景',text:opening.text,asOf:opening.asOf,sourceUrl:opening.sourceUrl}];
  if(prior && country.indices.every(k=>Number.isFinite(prior.benchmarks?.[k.key])))briefing.push({
    title:'上年市场',text:country.indices.map(k=>k.shortLabel+' '+percent(prior.benchmarks[k.key])).join('，')+'。',asOf:priorDate,sourceUrl:null});
  const aiContext=[{topic:'macro',title:'已公布的市场背景',text:modelBrief(opening.text)}, {topic:'event',title:'上一期事件的市场传导',text:modelBrief(lead.impact)}];
  if(briefing[1]) aiContext.push({topic:'market',title:'上一期市场',text:country.indices.map((k,i)=>(i?'第二股指':'第一股指')+' '+percent(prior.benchmarks[k.key])).join('，')+'。'});
  const era = getEraNote(id,year).opening;
  if (era.knownBy > priorDate) throw Error('时代侧记的日期超过开年边界');
  const indicators = getOpeningIndicators(id,year);
  const deskSignals = [{id:'era',topic:'industry',title:'时代侧记',text:era.modelSignal}];
  for (const indicator of indicators.filter(item=>item.decisionSafe)) {
    const isExchangeRate = indicator.key==='fx';
    deskSignals.push({id:'macro-'+indicator.key,topic:'macro',title:isExchangeRate?'外汇报价':indicator.label,
      text:isExchangeRate ? '一单位外币可兑换 '+indicator.value+' 单位本币。'
        : '此前公开的'+indicator.label+'为 '+indicator.value+indicator.unit+'。'});
  }
  return {year,asOf,isPartial,periodFraction,era,indicators,deskSignals,assets:getMarketAssets(id,year),currency:country.currency,dataKind:'historical',returns:row.returns,benchmarks:row.benchmarks,
    benchmarkReturn:row.benchmarks.indexA, wageGrowth:.025,inflation:EDITION_MACRO[id].inflation[year]??null,
    briefing, aiContext, reveal:{title:year+' 年市场结算',text:''},eventIds:EVENTS.filter(e=>e.country===id&&e.year===year&&e.date<=asOf).map(e=>e.id)};
}
export function getCampaignYears(country,edition='full') {
  const id=typeof country==='string'?country:country.id;
  if(!Object.hasOwn(COUNTRIES,id)||!Object.hasOwn(EDITIONS,edition))throw Error('请选择国家与版本。');
  const key=id+'-'+edition;
  if(!yearCache.has(key)) yearCache.set(key,Array.from({length:END_YEAR-EDITIONS[edition].start+1},(_,i)=>makeYear(id,EDITIONS[edition].start+i)));
  return yearCache.get(key);
}
