import { MARKET_OBSERVATIONS } from './history30-markets.js';
import { HISTORY30_EVENTS } from './history30-events.js';
import { HOUSEHOLD_SOURCES, HOUSEHOLD_ASSUMPTIONS, getHouseholdRates } from './history30-household.js';
export { HISTORY30_EVENTS, HISTORY30_EVENTS as EVENTS, HISTORY30_CHANNELS, HISTORY30_EDGES } from './history30-events.js';

export const HISTORY30_VERSION = 'us-jp-1995-2024-v1';
export const ASSET_KEYS = Object.freeze(['cash', 'indexA', 'indexB', 'gold']);
export const START_YEAR = 1995, END_YEAR = 2024;
export const HISTORY30_SOURCES = [
  ...HOUSEHOLD_SOURCES,
  { id:'nyu', title:'NYU Damodaran · Historical Returns', url:'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html', sourceVintage:'January 2026; retrieved 2026-11-25', note:'S&P 500 includes dividends; Gold is USD price return. Published annual percentages are used at source precision.' },
  { id:'nasdaq', title:'Yahoo Finance · Nasdaq Composite monthly closes', url:'https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?period1=725846400&period2=1735689600&interval=1mo', sourceVintage:'retrieved 2026-11-25', note:'December monthly close, rounded to published index precision of 0.01. Price return, excludes dividends.' },
  { id:'nikkei', title:'Yahoo Finance · Nikkei 225 monthly closes', url:'https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?period1=725846400&period2=1735689600&interval=1mo', sourceVintage:'retrieved 2026-11-25', note:'December monthly close in JPY index units; price return, excludes dividends.' },
  { id:'topix', title:'日本统计局 e-Stat · TOPIX 年末值（JPX 月报）', url:'https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=0702020590000090010&Cycle=3&RegionCode=00000&Limit=0', sourceVintage:'retrieved 2026-11-25', note:'Annual end-of-calendar-year TOPIX; price index, excludes dividends. Source: Japan Exchange Group statistics monthly report.' },
  { id:'fx', title:'日本内阁府 · 2024 国民经济核算 Table 8.2', url:'https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/2024/pdf/point_stock_en20260120.pdf', sourceVintage:'2026-01-20; Table 8.2, printed p.15/PDF p.17', note:'Year-end Tokyo interbank spot at 17:00 JST, JPY per USD. Repeated 2021/115.12 column deduplicated after visual check.' },
];
export const SOURCES = HISTORY30_SOURCES;
const base = { wageGrowth:0.025, benchmarkKey:'indexA', years:30, startYear:START_YEAR, endYear:END_YEAR };
const asset = (key,label,shortLabel,returnType,currency,description,sourceIds)=>({key,label,shortLabel,returnType,currency,description,sourceIds});
export const COUNTRIES = {
  us:{...base,id:'us',label:'美国',name:'美国',currency:'USD',currencySymbol:'$',initialWealth:100000,annualIncome:72000,annualExpense:36000,
    assets:[asset('cash','现金','现金','cash','USD','无息现金余额：名义收益设为 0，并非历史存款或短债利率。',[]),asset('indexA','标普 500','标普 500','total','USD','含分红总回报；不再额外加发股息。',['nyu']),asset('indexB','纳斯达克综合','纳指综合','price','USD','价格回报，不含分红；指数覆盖多个行业，并非单一科技基金。',['nasdaq']),asset('gold','黄金（美元）','黄金','price','USD','美元金价年度变动，不含保管费或交易产品费用。',['nyu'])]},
  jp:{...base,id:'jp',label:'日本',name:'日本',currency:'JPY',currencySymbol:'¥',initialWealth:10000000,annualIncome:4800000,annualExpense:3000000,
    assets:[asset('cash','现金','现金','cash','JPY','无息现金余额：名义收益设为 0，并非历史存款或短债利率。',[]),asset('indexA','TOPIX 东证指数','TOPIX','price','JPY','日元价格指数，按相邻年末点位计算，不含股息。',['topix']),asset('indexB','日经 225','日经 225','price','JPY','日元价格指数，按相邻年末点位计算，不含股息。',['nikkei']),asset('gold','黄金（日元换算）','黄金','price','JPY','美元黄金价格回报乘年末日元/美元汇率变化；未对冲的合成日元黄金基准，不是日本零售金价。',['nyu','fx'])]},
};
export const HISTORY30_COUNTRIES = COUNTRIES;
export const HISTORY30_ASSUMPTIONS = [
  '1995–2024 共三十个完整历史年度；1994 仅用于首年已知信息和收益计算基期。',
  '现金为无息余额，回报 0；不把现金余额当作历史存款或短债收益。',
  ...HOUSEHOLD_ASSUMPTIONS,
  '美国标普 500 为含分红总回报，其余三条股指为价格回报；各资产牌分别标注，不把价格指数冒充含息收益。',
  '日本黄金以 (1 + 美元黄金回报) × (本年末JPY/USD ÷ 上年末JPY/USD) − 1 计算，未重复汇兑。',
  '年度回报由当前可核验历史版本重建，不是当时数据库的实时快照。年初只显示上一年已经结束的市场信息。',
  'このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。',
];
const observations = new Map(MARKET_OBSERVATIONS.map(row=>[row.year,row]));
const pct = value => `${value>=0?'+':''}${(value*100).toFixed(2)}%`;
const sourceUrl = key => HISTORY30_SOURCES.find(item=>item.id===key).url;
function openingInformation(id, country, year) {
  const last=observations.get(year-1), before=observations.get(year-2);
  const aKey=id==='us'?'sp500TotalReturn':'topixPriceReturn';
  const bKey=id==='us'?'nasdaqPriceReturn':'nikkeiPriceReturn';
  const a=last[aKey], b=last[bKey], gold=id==='us'?last.goldUSDPriceReturn:last.goldJPYPriceReturn;
  const window=MARKET_OBSERVATIONS.filter(row=>row.year>=Math.max(1994,year-3)&&row.year<year);
  const compound=key=>window.reduce((value,row)=>value*(1+row[key]),1)-1;
  const previousEvent=HISTORY30_EVENTS.filter(item=>item.country===id&&item.year<year&&item.publicKnownAt<`${year}-01-01`).sort((x,y)=>y.date.localeCompare(x.date))[0];
  const stockText=`上一年，第一条指数 ${pct(a)}，第二条指数 ${pct(b)}；第二条相对第一条的回报差为 ${((b-a)*100).toFixed(2)} 个百分点（各指数口径见资产牌）。`;
  const fxText=before?`每美元兑换本币的年末报价变化 ${pct(last.jpyPerUSD/before.jpyPerUSD-1)}；正值表示本币对美元贬值。`:`期初汇率参照为每美元 ${last.jpyPerUSD.toFixed(2)} 单位本币；缺少更早同口径汇率时不推算上一年本币黄金回报。`;
  const goldText=id==='us'
    ?`上一年美元黄金 ${pct(last.goldUSDPriceReturn)}，相对主指数的回报差为 ${((last.goldUSDPriceReturn-a)*100).toFixed(2)} 个百分点。黄金没有利息，价格与股票可能同涨也可能分化。`
    :`${gold===undefined?'上一年美元黄金 '+pct(last.goldUSDPriceReturn):'上一年本币黄金 '+pct(gold)+'，美元黄金 '+pct(last.goldUSDPriceReturn)}。${fxText}`;
  const trendText=`截至上年末，最近 ${window.length} 个已知年度累计：第一条指数 ${pct(compound(aKey))}，第二条指数 ${pct(compound(bKey))}。`;
  const macroText=previousEvent?`${year-previousEvent.year} 年前已发生的背景：${previousEvent.publicBrief}`:'观察起点仅包含已结束市场年度；短期两指数表现不同，尚不能从一个年度确认长期趋势。';
  const anonymousMacro=previousEvent?`${year-previousEvent.year} 年前已发生的背景：${previousEvent.anonymousBrief}`:macroText;
  const briefing=[
    {title:'两条指数，谁在领跑',text:stockText.replace('第一条指数',country.assets[1].label).replace('第二条指数',country.assets[2].label),asOf:`${year-1}-12-31`,sourceUrl:sourceUrl(country.assets[1].sourceIds[0]),sourceUrls:[sourceUrl(country.assets[1].sourceIds[0]),sourceUrl(country.assets[2].sourceIds[0])]},
    {title:id==='us'?'黄金与股票的距离':'黄金里的汇率账',text:goldText,asOf:`${year-1}-12-31`,sourceUrl:sourceUrl(id==='us'?'nyu':'fx'),sourceUrls:[sourceUrl('nyu'),...(id==='jp'?[sourceUrl('fx')]:[])]},
    {title:previousEvent?'历史余波与市场轨迹':'观察窗口刚刚打开',text:`${trendText}${macroText}`,asOf:`${year-1}-12-31`,sourceUrl:previousEvent?.sources[0].url||sourceUrl(country.assets[1].sourceIds[0]),contextEventId:previousEvent?.id||null},
  ];
  const aiContext=[
    {topic:'market',title:'两条指数的已知表现',text:stockText},
    {topic:'assets',title:id==='us'?'黄金与股票':'黄金和外币折算',text:goldText.replaceAll('美元',id==='us'?'本币':'外币')},
    {topic:'macro',title:'已发生背景与已知趋势',text:`${trendText}${anonymousMacro}`},
  ];
  return {briefing,aiContext};
}
const campaigns = Object.fromEntries(Object.entries(COUNTRIES).map(([id,country])=>[id,Array.from({length:30},(_,index)=>{
  const year=START_YEAR+index, current=observations.get(year);
  const returns=id==='us'?{cash:0,indexA:current.sp500TotalReturn,indexB:current.nasdaqPriceReturn,gold:current.goldUSDPriceReturn}:{cash:0,indexA:current.topixPriceReturn,indexB:current.nikkeiPriceReturn,gold:current.goldJPYPriceReturn};
  const events=HISTORY30_EVENTS.filter(event=>event.country===id&&event.year===year);
  return {year,dataKind:'historical',currency:country.currency,returns,benchmarkReturn:returns.indexA,...getHouseholdRates(id,year),
    ...openingInformation(id,country,year),
    reveal:{title:events[0]?.title||`${year} 年度市场结算`,text:`${country.assets[1].label} ${pct(returns.indexA)}；${country.assets[2].label} ${pct(returns.indexB)}；${country.assets[3].label} ${pct(returns.gold)}。${events.map(event=>event.summary).join(' ')}`},
    eventIds:events.map(event=>event.id),
  };
})]));
export const HISTORY30_YEARS = campaigns;
export function getCampaignYears(country){const id=typeof country==='string'?country:country?.id;if(!campaigns[id])throw new Error('未知国家');return campaigns[id];}
export function getCountryEvents(country){return HISTORY30_EVENTS.filter(event=>event.country===country);}
