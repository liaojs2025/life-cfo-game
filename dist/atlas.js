import { startCommunity } from './community.js';
import { getEraNote } from './era-notes.js';
import { getHistoricalEmployment } from './opening-indicators.js';
import {
  ASSET_KEYS,
  ACCOUNT_IDS,
  COUNTRIES,
  newCampaign,
  publicRound,
  validateAllocation,
  fallbackCampaignPack,
  validateCampaignPack,
  settleCampaign,
  campaignSummary,
  restoreCampaign,
  accountNetWorth,
} from './atlas-engine.js';
import {
  validateApiConfig,
  fallbackCampaignReview,
  validateCampaignReview,
  requestCampaignDecision,
  requestCampaignReview,
} from './atlas-agent.js';
import { getCampaignYears, EDITIONS, NEWS, EVENTS, historicalAssetReturns, getMarketAssets, MARKET_SOURCES, REFERENCE_RATES, STOCK_KEYS } from './atlas-scenarios.js';
import { DEFAULT_API_CONFIG, PROVIDERS } from './providers.js';
import { RISK_FREE_SOURCE } from './history30-rates.js';
import { riskDashboard } from './atlas-risk-view.js';
import { lineChart, cashBridge, PALETTE, esc } from './atlas-charts.js';

const root = document.querySelector('#atlas'),
  mast = document.querySelector('#mast'),
  dialog = document.querySelector('#dialog');
const ids = ACCOUNT_IDS,
  names = { player: '你', aggressive: '进取对手', conservative: '稳健对手' },
  assetColors = ['#789594', '#08775e', '#6281ad', '#c39740', '#5c72a0', '#b66e50', '#92759d'];
const countryNames = { us: '美国', jp: '日本' },
  savePrefix = 'life-cfo-editions-1-',
  activeKey = savePrefix + 'active';
let sharedStats = null, statsOffline = false;
let state = null,
  draft = null,
  pack = null,
  review = null,
  pending = false,
  mode = 'board',
  ledgerIndex = 0,
  chartKind = 'performance',
  focus = null,
  hidden = new Set(),
  channel = '',
  storageOK = true;
let config = { ...DEFAULT_API_CONFIG, apiKey: '' },
  enabled = false,
  busy = '',
  err = '',
  controller = null,
  epoch = 0,
  toastTimer;
let selectedEdition = stored(savePrefix+'edition') === 'full' ? 'full' : 'short';
const slot = (country,edition=selectedEdition) => country+'-'+edition;
const invalidSaves = new Set();
function stored(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    storageOK = false;
    return false;
  }
}
function prefs() {
  try {
    const p = JSON.parse(stored(savePrefix + 'pref'));
    if (p && PROVIDERS.some((x) => x.endpoint === p.endpoint) && typeof p.model === 'string')
      config = { endpoint: p.endpoint, model: p.model, apiKey: '' };
  } catch {}
}
prefs();
function persist() {
  if (!state) return;
  write(savePrefix + slot(state.country,state.edition), JSON.stringify({ state, draft, pack, review, pending, enabled }));
  write(activeKey, slot(state.country,state.edition));
}
function loadGame(country) {
  const raw = stored(savePrefix + slot(country));
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    state = restoreCampaign(s.state);
    if (state.country !== country || state.edition !== selectedEdition) throw Error('国家不符');
    draft = validateAllocation(s.draft);
    pack = s.pack && !state.finished ? validateCampaignPack(s.pack, state) : null;
    review = s.review && state.finished ? validateCampaignReview(s.review, state) : null;
    enabled = s.enabled === true;
    pending = !!s.pending && state.round > 0;
    return true;
  } catch {
    state = null;
    invalidSaves.add(slot(country));
    return false;
  }
}
const nfmt = (v, cur = state?.country === 'jp' ? 'JPY' : 'USD') =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: cur,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(v);
const pct = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + (100 * v).toFixed(1) + '%');
const signed = (v) => (v > 0 ? '+' : '') + nfmt(v);
const visibleYear = () => Math.min(2026, EDITIONS[state.edition].start + state.round);
const assets = (year=visibleYear()) => getMarketAssets(state.country, year);
const assetName = (key, year) => assets(year).find(a=>a.key===key)?.label || key;
const instrument = k => [...assets(),...COUNTRIES[state.country].indices].find(x=>x.key===k);
const label = k => instrument(k)?.label || k;
const yearsInPlay = () => getCampaignYears(state?.country || 'us', state?.edition || selectedEdition);
const periodLabel = r => r.isPartial ? '截至 '+r.asOf : r.year+' 年末';
const mix = (a, year=visibleYear()) =>
  ASSET_KEYS.filter((k) => a[k] > 0)
    .map((k) => `${assetName(k,year)} ${a[k]}%`)
    .join(' · ');
const limits = () => {
  const y = yearsInPlay();
  return [y[0].year, y.at(-1).year];
};
function notify(t) {
  clearTimeout(toastTimer);
  document.querySelector('#notice').textContent = t;
  toastTimer = setTimeout(() => (document.querySelector('#notice').textContent = ''), 3000);
}
function modal(title, body) {
  dialog.innerHTML = `<div class="inside"><div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="close" data-act="close" aria-label="关闭">×</button></div>${body}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function close() {
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
}
dialog.addEventListener('close', () => {
  if (!dialog.open) dialog.replaceChildren();
});
function cancel() {
  epoch++;
  controller?.abort();
  controller = null;
  busy = '';
  err = '';
}
function initial(country) {
  cancel();
  state = newCampaign({ country, edition:selectedEdition, seed: globalThis.crypto.randomUUID() });
  draft = {cash:15,broad:35,bond:20,gold:10,tech:10,consumer:5,health:5};
  pack = null;
  review = null;
  pending = false;
  enabled = !!config.apiKey;
  invalidSaves.delete(slot(country));
  resetView();
  persist();
  render();
  prepare();
}
function resetView() {
  riskMode = 'historical';
  customRate = 2;
  mode = 'board';
  ledgerIndex = state ? Math.max(0, state.round - 1) : 0;
  chartKind = 'performance';
  hidden.clear();
  focus = null;
  channel = '';
  close();
  window.scrollTo(0, 0);
}
function resume(country) {
  cancel();
  if (!loadGame(country)) {
    if (invalidSaves.has(slot(country))) {
      newPrompt(country, true);
      return;
    }
    initial(country);
    return;
  }
  resetView();
  persist();
  render();
  prepare();
}
function home() {
  cancel();
  state = null;
  pack = null;
  review = null;
  pending = false;
  enabled = false;
  write(activeKey, '');
  community.refresh();
  resetView();
  render();
}
function newPrompt(country, damaged = false) {
  modal(
    damaged ? '重新开始这份旅程？' : `重开${countryNames[country]}旅程？`,
    `<p>${damaged ? '当前存档未通过核账。开始新局将替换这份存档。' : '开始新局会替换当前国家和版本的进度，并生成新的家庭经历。'}</p><div class="actions" style="margin-top:18px"><button class="primary" data-new="${country}">开始新局</button><button class="secondary" data-act="close">返回</button></div>`,
  );
}
function prepare() {
  if (!state || !enabled || !config.apiKey || pending || busy || err) return;
  if (state.finished) {
    if (review?.source !== 'model') void ask('review');
  } else if (!pack) void ask('round');
}
async function ask(kind) {
  if (!state || busy || !config.apiKey) return;
  const token = ++epoch;
  controller = new AbortController();
  err = '';
  busy = kind;
  render();
  try {
    const data =
      kind === 'round'
        ? await requestCampaignDecision(config, state, { signal: controller.signal })
        : await requestCampaignReview(config, state, { signal: controller.signal });
    if (token !== epoch) return;
    if (kind === 'round') pack = data;
    else review = data;
    persist();
  } catch (e) {
    if (token !== epoch) return;
    err = e.message || '模型连接未完成。';
  } finally {
    if (token === epoch) {
      busy = '';
      controller = null;
      render();
    }
  }
}
function modelOptions(provider) {
  return [provider.defaultModel, provider.alternateModel]
    .filter(Boolean)
    .map((id) => '<option value="' + esc(id) + '"></option>')
    .join('');
}
function settings() {
  const current = PROVIDERS.find((p) => p.endpoint === config.endpoint) || PROVIDERS[0];
  modal(
    '连接 AI 对手',
    `<form id="ai-form"><label class="field">服务<select name="provider">${PROVIDERS.map((p) => `<option value="${p.id}" ${p === current ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label><label class="field">模型<input name="model" list="model-options" required maxlength="120" value="${esc(config.model)}"></label><datalist id="model-options">${modelOptions(current)}</datalist><label class="field">API Key<input name="key" type="password" autocomplete="off" spellcheck="false" required placeholder="填写所选服务的密钥"></label><p class="caption">一次分析生成两位对手的配仓和给你的建议。按服务商用量计费，密钥仅供当前页面使用。</p><div class="actions" style="margin-top:15px"><button class="primary" type="submit">启用模型</button><button type="button" class="secondary" data-act="rules">使用规则对手</button></div></form>`,
  );
}
function rules() {
  cancel();
  config.apiKey = '';
  enabled = false;
  if (state && !state.finished && pack?.source !== 'model') pack = null;
  persist();
  close();
  render();
}
function masthead() {
  mast.innerHTML = `<div class="wrap topbar"><button class="brand" data-act="home"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 25 12 13l7 6L29 5M4 29h25" fill="none" stroke="#ffda76" stroke-width="2.5"/></svg>人生 CFO</button><div class="mast-actions"><span class="edition">Portfolio Atlas · v2.0</span><button data-act="help">玩法</button><button data-act="settings">${config.apiKey ? 'AI 已配置' : '连接 AI'} ↗</button></div></div>`;
}
function foot() {
  const oldArchive = stored('life-cfo-atlas-1-us') || stored('life-cfo-atlas-1-jp');
  const position = state ? `${countryNames[state.country]} · ${EDITIONS[state.edition].name} · ${storageOK?'已保存':'本次进度未能写入浏览器'}` : '人生 CFO · 投资年代记';
  return `<footer class="foot"><span>${position}</span><span><button data-act="sources">数据来源</button>${state?'　<button data-act="home">国家与版本</button>　<button data-act="restart">重开本局</button>':''}${oldArchive?'　<a href="./atlas30.html">继续三十年旧存档</a>':''}${stored('life-cfo-save-v3')?'　<a href="./legacy.html">港湾城旧存档</a>':''}</span></footer>`;
}
function communityPanel() {
  const format = new Intl.NumberFormat('zh-CN');
  const count = key => sharedStats ? format.format(sharedStats[key]) : '—';
  const recent = sharedStats?.recent || [];
  const rows = recent.map(result => {
    const country = COUNTRIES[result.country];
    const route = EDITIONS[result.edition];
    if (!country || !route || !Number.isFinite(result.wealth) || !Number.isFinite(result.investmentReturn)) return '';
    const outcome = result.outcome==='completed' ? '通关' : '提前破产';
    return `<li><span>${esc(country.name)} · ${esc(route.name)} · ${esc(result.year)} ${outcome}</span>
      <b>${esc(nfmt(result.wealth,country.currency))}</b><span>组合 ${pct(result.investmentReturn)}</span></li>`;
  }).join('');
  const status = statsOffline ? '<button type="button" class="action-link" data-act="stats-retry">统计暂未同步 · 重试</button>' : '';
  return `<section class="community" data-community aria-label="玩家统计">
    <div class="community-top"><h2>玩家足迹</h2><p><strong>${count('views')}</strong> 次浏览</p><p><strong>${count('completions')}</strong> 次完整通关</p></div>
    ${status}<details><summary>近期匿名成绩</summary><p class="caption">自 v2.0 起统计。每次打开或刷新计一次浏览，走到所选路线终点计一次通关。成绩展示期末家庭净资产和扣费前组合累计回报。</p>
    ${rows ? '<ul>'+rows+'</ul>' : '<p class="caption">'+(sharedStats?'还没有已记录的终局。':statsOffline?'联网后可查看近期成绩。':'正在读取统计。')+'</p>'}</details></section>`;
}
function refreshCommunity(summary, offline) {
  sharedStats = summary; statsOffline = offline;
  const existing = root.querySelector('[data-community]');
  if (!existing) return;
  const expanded = existing.querySelector('details').open;
  existing.outerHTML = communityPanel();
  if (expanded) root.querySelector('[data-community] details').open = true;
}
function landing() {
  const buttons=Object.entries(EDITIONS).map(([id,e])=>`<button data-edition="${id}" aria-pressed="${id===selectedEdition}"><b>${e.name} · ${2027-e.start} 年</b><small>${e.start} — 2026</small></button>`).join('');
  return `<div class="intro journal-intro"><div><div class="overline">Portfolio Atlas / v2.0</div><h1>投资年代记</h1></div><p>翻开当年的新闻，为同一个家庭配仓。<br>与进取、稳健两位对手一起穿过市场周期。</p></div>
    <div class="edition-select" aria-label="旅程长度">${buttons}</div>
    <section class="country-grid" aria-label="选择国家">${['us','jp'].map(c=>`<button class="country ${c}" data-country="${c}"><span class="country-code">${c==='us'?'New York':'Tokyo'}</span><span><span class="country-name">${countryNames[c]}</span><span class="country-en">${c==='us'?'UNITED STATES · USD':'JAPAN · JPY'}</span><span class="country-detail">${EDITIONS[selectedEdition].name}　/　${stored(savePrefix+slot(c))?'继续旅程':'开启旅程'}</span></span><span class="country-arrow" aria-hidden="true">↗</span></button>`).join('')}</section>
    <div class="landing-foot"><article><em>01</em><b>读新闻</b><p>上一年头条、宏观读数与产业侧记。</p></article><article><em>02</em><b>配资产</b><p>四类基础资产与三个股票板块。</p></article><article><em>03</em><b>看结果</b><p>三份家庭账本，两条市场基准。</p></article></div>${communityPanel()}${foot()}`;
}
function scene() {
  const a = publicRound(state),
    [first, last] = limits();
  return `<section class="scene ${state.country}"><div><div class="overline">${countryNames[state.country]} / ${EDITIONS[state.edition].name} / ${COUNTRIES[state.country].currency}</div><h1>${a.year}<span style="font:500 .35em var(--serif)">　年初</span></h1><p>${a.age} 岁 · ${esc(a.stage)} · ${a.household.married ? '已婚' : '单身'}${a.household.children.length ? ' · ' + a.household.children.length + ' 名子女' : ''}</p></div><div class="scene-right"><b>${state.round + 1} / ${last-first+1}</b><div class="track"><i style="width:${((state.round + 1) / (last-first+1)) * 100}%"></i></div><small>${first} — ${last}</small></div></section>`;
}
function stats(entries) {
  return `<div class="stats">${entries.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
}
function bars(allocation) {
  return `<div class="bar-stack" aria-hidden="true">${ASSET_KEYS.map((k, i) => `<i style="background:${assetColors[i]};width:${allocation[k]}%"></i>`).join('')}</div>`;
}
function weightRow(k) {
 const i=ASSET_KEYS.indexOf(k);
 return `<label class="alloc-row"><span><i class="swatch" style="--sw:${assetColors[i]}"></i>${esc(label(k))}</span><input type="number" min="0" max="100" step="1" inputmode="numeric" data-weight-num="${k}" aria-label="${esc(label(k))}百分比" value="${draft[k]}"><input type="range" min="0" max="100" data-weight="${k}" aria-label="调整${esc(label(k))}" value="${draft[k]}"></label>`;
}
function allocationForm() {
 const round=publicRound(state);
 return `<section id="portfolio-order" class="card allocation-card"><div class="section-head"><h2>你的资产配置</h2><small>占比 %</small></div><div id="allocation-bar">${bars(draft)}</div>
 <div class="asset-group"><h3>基础资产</h3>${['broad','bond','gold','cash'].map(weightRow).join('')}</div>
 <div class="asset-group"><h3>行业股票${state.country==='jp'?' · '+(round.country.assets.find(a=>a.key==='tech').overseas?'海外持仓，日元计价':'日本本土 ETF'):''}</h3>${['tech','consumer','health'].map(weightRow).join('')}</div>
 <button class="primary wide" data-act="settle" ${blocked()?'disabled':''}>结算 ${round.year} 年</button><p class="caption">调整一项，其余按比例分配。非现金资产每次成交收费 0.1%。</p></section>`;
}
function blocked() {
  return busy === 'round' || (enabled && !pack);
}
function opponents() {
  const p = pack || fallbackCampaignPack(state);
  return `<section class="card"><div class="section-head"><h2>两位对手</h2><small>${pack?.source === 'model' ? esc(pack.model) : enabled && !pack ? '等待模型' : '规则策略'}</small></div>${
    blocked()
      ? `<p role="status">${busy ? '正在研读年初情报…' : esc(err || '重新连接模型，继续本年对局。')}</p><div class="actions">${!busy ? '<button class="action-link" data-act="retry">连接或重试</button>' : ''}<button class="action-link" data-act="round-rules">本年用规则策略</button></div>`
      : `${ids
          .slice(1)
          .map(
            (id) =>
              `<article class="rival"><span class="badge">${state.accounts[id].bankrupt ? '已出局' : id === 'aggressive' ? '股票 ≥ 60%' : '股票 ≤ 40%'}</span><strong>${names[id]}</strong><p>${esc(mix(p.decisions[id]))}</p></article>`,
          )
          .join(
            '',
          )}<details><summary>分析与配置建议</summary><p class="hint">${esc(p.summary)}</p>${p.analysis.map((a) => `<p class="signal"><b>${esc(a.observation)}</b><br>${esc(a.reasoning)}<br><small>${esc(a.risk)}</small></p>`).join('')}<p class="hint">建议配置　${esc(mix(p.decisions.player))}</p><button class="action-link" data-act="adopt">采用这份配置 →</button></details>`
  }</section>`;
}
function photo(n, large=false) {
 const caption = [n.imageCaption || n.imageAlt, n.imageDate].filter(Boolean).join(' · ');
 return `<figure class="press-photo ${large?'press-photo-large':''}"><img src="${esc(n.image)}" alt="${esc(n.imageAlt || n.imageCaption)}" decoding="async"><figcaption>${esc(caption)}</figcaption></figure>`;
}
function pressCard(n, openingText) {
 const lead = openingText && n.summary.endsWith(openingText) ? n.summary.slice(0,-openingText.length).trim() : n.summary;
 const summary = lead || n.summary;
 return `<article class="card press-card"><div class="press-heading"><span>年度新闻</span><time>${esc(n.date)}</time></div>${photo(n,true)}
   <div class="press-body"><h2>${esc(n.title)}</h2><p>${esc(summary)}</p><button class="action-link" data-press="${n.year}">市场影响与出处</button></div></article>`;
}
function photoCredit(n) {
 return `<small>${esc(n.imageCredit)} · <a href="${esc(n.imageSource)}" target="_blank" rel="noopener noreferrer">照片出处</a> · ${n.imageLicenseUrl?`<a href="${esc(n.imageLicenseUrl)}" target="_blank" rel="noopener noreferrer">${esc(n.imageLicense)}</a>`:esc(n.imageLicense)}</small>`;
}
function pressDetails(n) {
 if(!n)return;
 modal(n.title, `<div class="prose">${photo(n)}<p>${esc(n.summary)}</p><h3>市场影响</h3><p>${esc(n.impact)}</p><p><a href="${esc(n.sourceUrl)}" target="_blank" rel="noopener noreferrer">事件资料</a></p><div class="sep"></div>${photoCredit(n)}</div>`);
}
function indicatorTape(round) {
  const readings = round.indicators.map(item => {
    const value = item.value.toLocaleString('zh-CN',{maximumFractionDigits:5});
    return `<div class="macro-reading"><dt>${esc(item.label)}</dt><dd>${esc(value)}<small>${esc(item.unit)}</small></dd><span>${esc(item.observationDate || item.period)}${item.decisionSafe?'':' · 历史汇编'}</span></div>`;
  }).join('');
  const sources = round.indicators.map(item=>`<li><b>${esc(item.label)}</b> · ${esc(item.period)}<p>${esc(item.basis)} ${esc(item.vintage)}</p><a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">原始数据 ↗</a></li>`).join('');
  return `<section class="macro-tape" aria-label="开年宏观数据"><div class="tape-title"><h2>开年读数</h2>
    <details><summary>数据口径</summary><ul>${sources}</ul></details></div><dl>${readings}</dl></section>`;
}
function market(round) {
  const era = round.era;
  const briefs = round.briefing.map(item=>`<article class="signal"><b>${esc(item.title)}</b><p>${esc(item.text)}</p>
    ${item.sourceUrl?`<a class="brief-source" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">背景资料 ↗</a>`:''}</article>`).join('');
  return `<section class="card"><div class="section-head"><h2>开年简报</h2><small>${round.year} 年初</small></div>
    <article class="era-note"><small>时代侧记</small><h3>${esc(era.title)}</h3><p>${esc(era.text)}</p>
    <a class="brief-source" href="${esc(era.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(era.sourceTitle)} ↗</a></article>${briefs}</section>`;
}
function board() {
  const r=publicRound(state);
  return `${scene()}<div class="section-tabs" role="tablist"><button role="tab" data-tab="board" aria-selected="${mode==='board'}">投资台</button><button role="tab" data-tab="ledger" aria-selected="${mode==='ledger'}">家庭账本</button></div>
  ${mode==='ledger'?ledger():`${indicatorTape(r)}<div class="board journal-board"><div class="stack news-desk">${pressCard(NEWS[state.country][r.year-1], r.briefing[0]?.text)}<a class="mobile-order-link" href="#portfolio-order">去配仓 ↓</a>${market(r)}</div>
  <div class="stack portfolio-desk"><section class="card compact-budget"><div class="section-head"><h2>家庭账本</h2><small>${COUNTRIES[state.country].currency} · ${r.isPartial?'预算至 '+esc(r.asOf):'全年预算'}</small></div>${stats([['净资产',nfmt(accountNetWorth(state.accounts.player))],['预计收入',nfmt(r.household.periodIncome)],['日常开支',nfmt(r.household.periodExpense)]])}</section>${allocationForm()}${opponents()}</div></div>`}${foot()}`;
}
function setWeight(key, value) {
  if (!state || state.finished || pending || !Number.isFinite(value)) return;
  const n = Math.min(100, Math.max(0, Math.round(value))),
    others = ASSET_KEYS.filter((k) => k !== key),
    total = others.reduce((s, k) => s + draft[k], 0),
    shares = others.map((k) => ({ k, v: (100 - n) * (total ? draft[k] / total : 1 / others.length) }));
  draft[key] = n;
  for (const s of shares) draft[s.k] = Math.floor(s.v);
  let left = 100 - Object.values(draft).reduce((a, b) => a + b, 0);
  shares.sort((a, b) => (b.v % 1) - (a.v % 1));
  for (let i = 0; i < left; i++) draft[shares[i].k]++;
  for (const k of ASSET_KEYS) {
    root.querySelector(`[data-weight="${k}"]`).value = draft[k];
    root.querySelector(`[data-weight-num="${k}"]`).value = draft[k];
  }
  document.querySelector('#allocation-bar').innerHTML = bars(draft);
  persist();
}

let reportAccount = 'player';
const basis = a => ({
  'total-return':'含息总回报', 'price-return':'价格回报', 'zero-interest-cash':'无息现金',
  'price-return / 2026 fund-total-return':'金价／2026 基金净值'
})[a.returnType] || a.returnType;
const completedEvents = () => EVENTS.filter(e=>e.country===state.country && e.date<=state.history.at(-1)?.asOf &&
  (e.year>=state.history[0]?.year || (e.press && e.year===state.history[0]?.year-1)));
const totalAssets = (balances) => ASSET_KEYS.reduce((total, key) => total + balances[key], 0);

function miniTable(headings, rows) {
  return (
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    headings.map((heading) => '<th scope="col">' + esc(heading) + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows
      .map(
        (row) =>
          '<tr><th scope="row">' +
          esc(row[0]) +
          '</th>' +
          row
            .slice(1)
            .map((value) => '<td>' + esc(value) + '</td>')
            .join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table></div>'
  );
}

function chart() {
  const curves = campaignSummary(state).curves;
  const years = curves.map((point,i) => state.history[i-1]?.isPartial ? state.history[i-1].asOf : point.year);
  const money = chartKind === 'wealth';
  const keys = money ? ids : [...ids, 'indexA', 'indexB'];
  const series = keys.map((id, index) => ({
    id,
    color: PALETTE[index],
    benchmark: !ids.includes(id),
    name: names[id] || label(id) + ' · ' + basis(instrument(id)),
    values: curves.map((point, i) => {
      if (i && state.history[i - 1].accounts[id]?.inactive) return null;
      const value = money ? point.netWorth[id] : point.returnIndex[id];
      return value == null ? null : money ? value : 100 * value;
    }),
  }));
  return (
    '<section class="card chart-card"><div class="section-head"><h2>投资轨迹</h2><div class="chips">' +
    ['performance', 'wealth']
      .map(
        (key) =>
          '<button data-chart="' +
          key +
          '" aria-pressed="' +
          (key === chartKind) +
          '" class="' +
          (key === chartKind ? 'active' : '') +
          '">' +
          (key === 'wealth' ? '家庭净资产' : '组合与指数') +
          '</button>',
      )
      .join('') +
    '</div></div><p class="caption">' +
    (money
      ? '期末净资产 · ' + COUNTRIES[state.country].currency + ' · 含家庭收支与费用'
      : '起点 100 · 年度配置回报复利 · 扣费前，剔除工资及家庭收支') +
    '</p>' +
    lineChart(series, years, hidden, Math.min(focus ?? years.length - 1, years.length - 1), money) +
    '</section>'
  );
}

function financials(record) {
  const account = record.accounts[reportAccount];
  const rows = ASSET_KEYS.map((key) => [
    record.year===2009 && state.country==='jp' && ['tech','consumer','health'].includes(key) && record.round>0
      ? assetName(key,2008)+' → '+assetName(key,2009) : assetName(key,record.year),
    nfmt(account.startAssets[key]),
    nfmt(account.endAssets[key]),
  ]);
  rows.push(
    ['资产合计', nfmt(totalAssets(account.startAssets)), nfmt(totalAssets(account.endAssets))],
    [
      '未付负债',
      nfmt(Math.max(0, totalAssets(account.startAssets) - account.startNetWorth)),
      nfmt(account.shortfallDebt),
    ],
    ['净资产', nfmt(account.startNetWorth), nfmt(account.endNetWorth)],
  );
  const items = account.inactive
    ? []
    : [
        ...record.cashflow.items.map((item) => ({ name: item.label, value: item.amount })),
        { name: '投资损益', value: account.investmentProfit },
        { name: '交易与变现费', value: -account.fees },
      ];
  return (
    '<section class="card"><div class="section-head"><h2>资产负债表</h2><select aria-label="查看账户报表" data-account>' +
    ids
      .map(
        (id) =>
          '<option value="' +
          id +
          '" ' +
          (id === reportAccount ? 'selected' : '') +
          '>' +
          names[id] +
          '</option>',
      )
      .join('') +
    '</select></div>' +
    miniTable(['项目 · ' + COUNTRIES[state.country].currency, '年初', record.isPartial?record.asOf:'年末'], rows) +
    (account.replacementFees>0 ? '<p class="caption">行业标的切换为日本本土 ETF，卖出旧持仓、买入新持仓的费用 '+nfmt(account.replacementFees)+' 已计入本期交易费。</p>' : '') +
    (account.inactive
      ? '<p class="caption">该账户已出局，本年封账。</p>'
      : '<h3 class="below">净资产变动</h3>' +
        cashBridge(items, signed) +
        '<p class="caption">年初 ' +
        nfmt(account.startNetWorth) +
        ' ＋ 投资损益 ' +
        signed(account.investmentProfit) +
        ' ＋ 家庭净流入 ' +
        signed(account.contribution) +
        ' − 费用 ' +
        nfmt(account.fees) +
        ' ＝ 期末 ' +
        nfmt(account.endNetWorth) +
        '。金额四舍五入。</p>') +
    '</section>'
  );
}

function closingColumn(record) {
  const quote = getEraNote(state.country,record.year).settlement;
  const ordered = assets(record.year).filter(asset=>asset.key!=='cash')
    .sort((a,b)=>record.marketReturns[b.key]-record.marketReturns[a.key]);
  const example = (asset)=>esc(asset.label)+' '+pct(record.marketReturns[asset.key]);
  return `<aside class="closing-column" aria-label="收盘锐评"><div class="closing-date"><b>收盘锐评</b><time>${esc(record.isPartial?record.asOf:record.year+' 年')}</time></div>
    <div><blockquote>${esc(quote.text)}</blockquote><p>非现金资产首尾　${example(ordered[0])}　／　${example(ordered.at(-1))}</p></div></aside>`;
}
function annual(record) {
  const inflation = yearsInPlay()[record.round].inflation;
  const historicalEmployment = getHistoricalEmployment(state.country,record.year);
  const events = completedEvents().filter((event) => event.year === record.year);
  return (
    closingColumn(record) +
    '<div class="board"><div class="stack"><section class="card"><div class="section-head"><h2>三方交手</h2><small>'+(record.isPartial?'组合年内回报':'组合年回报')+'</small></div><div class="comparison">' +
    ids
      .map(
        (id) =>
          '<div><small>' +
          names[id] +
          '</small><b>' +
          pct(record.accounts[id].portfolioReturn) +
          '</b></div>',
      )
      .join('') +
    '</div>' +
    ids
      .map(
        (id) =>
          '<article class="signal"><b>' +
          names[id] +
          '</b>　' +
          (record.accounts[id].inactive ? '已出局' : esc(mix(record.accounts[id].allocation,record.year))) +
          '</article>',
      )
      .join('') +
    '<p class="caption">' +
    (record.pack.source === 'model' ? '模型决策 · ' + esc(record.pack.model) : '规则对手') +
    '</p></section>' +
    '<section class="card"><div class="section-head"><h2>家庭来信</h2><small>' +
    record.age +
    ' 岁</small></div>' +
    record.events
      .map(
        (event) =>
          '<article class="signal"><b>' +
          esc(event.title) +
          '</b><span class="money">' +
          (event.amount ? signed(event.amount) : '') +
          '</span><p>' +
          esc(event.text) +
          '</p></article>',
      )
      .join('') +
    '</section><section class="card"><div class="section-head"><h2>市场收盘</h2><small>' +
    record.year +
    '</small></div>' +
    miniTable(
      ['资产', '计价口径', record.isPartial?'年内回报':'年度回报'],
      assets(record.year).map((a) => [a.label, basis(a), pct(record.marketReturns[a.key])]),
    ) +
    (record.isPartial ? '<p class="caption">年内累计至 '+esc(record.asOf)+'，日常收支按观察期天数结算。</p>' : '<p class="caption">本年当地 CPI '+pct(inflation)+'，将用于下一年生活费预算。</p>') +
    (historicalEmployment ? `<p class="caption">开年数据回看 · ${esc(historicalEmployment.period)} 失业率 ${esc(historicalEmployment.value)}%（历史汇编）。<a class="brief-source" href="${esc(historicalEmployment.sourceUrl)}" target="_blank" rel="noopener noreferrer">来源 ↗</a></p>` : '') +
    events
      .map(
        (event) =>
          '<button class="action-link below" data-event="' +
          esc(event.id) +
          '">' +
          esc(event.title) +
          ' ↗</button>',
      )
      .join('') +
    '</section></div><div class="stack">' +
    financials(record) +
    '</div></div>'
  );
}

function yearSelect() {
  return (
    '<label class="review-controls">账本年份 <select data-year>' +
    state.history
      .map(
        (r, i) =>
          '<option value="' + i + '" ' + (i === ledgerIndex ? 'selected' : '') + '>' + r.year + '</option>',
      )
      .join('') +
    '</select></label>'
  );
}
function ledger() {
  return state.round
    ? yearSelect() + annual(state.history[ledgerIndex]) + '<div class="below">' + chart() + '</div>'
    : '<section class="card"><h2>期初账户</h2><p class="hint">起始现金 ' +
        nfmt(COUNTRIES[state.country].initialWealth) +
        '。完成首年结算即可查看报表和曲线。</p></section>';
}
function recap() {
  const r = state.history.at(-1);
  const next = state.finished ? '查看终局复盘' : '进入 ' + (r.year + 1) + ' 年';
  return (
    '<section class="endhead"><div class="overline">' +
    countryNames[state.country] +
    ' / '+(r.isPartial?'阶段结算 · '+esc(r.asOf):'年末结算')+'</div><div class="section-head"><h1>' +
    r.year +
    ' 年账单</h1><button class="primary" data-act="continue">' +
    next +
    ' →</button></div>' +
    stats([
      ['期末净资产', nfmt(r.accounts.player.endNetWorth)],
      ['投资损益', signed(r.accounts.player.investmentProfit)],
      ['家庭净流入', signed(r.cashflow.net)],
    ]) +
    '</section>' +
    annual(r) +
    foot()
  );
}

function graph() {
  const events = completedEvents();
  if (!events.length)
    return '<section class="card"><h2>历史事件图谱</h2><p class="hint">这段旅程尚未抵达收录的历史事件。</p></section>';
  const channels = [...new Set(events.flatMap((event) => event.channels))];
  const selected = events.filter((event) => !channel || event.channels.includes(channel));
  const buttons = ['', ...channels]
    .map(
      (c) =>
        '<button class="secondary ' +
        (channel === c ? 'active' : '') +
        '" data-channel="' +
        esc(c) +
        '" aria-pressed="' +
        (channel === c) +
        '">' +
        esc(c || '全部') +
        '</button>',
    )
    .join('');
  return (
    '<section class="card"><div class="section-head"><h2>历史事件图谱</h2><small>' +
    events.length +
    ' 个事件</small></div><p class="caption">按传导路径探索，点开事件查看背景、市场反应和相连事件。</p><div class="graph-channel below">' +
    buttons +
    '</div>' +
    eventConnections(selected) +
    '<div class="event-network">' +
    selected
      .map(
        (event) =>
          '<button class="network-node" data-event="' +
          esc(event.id) +
          '"><time>' +
          event.year +
          '</time><i></i><span><b>' +
          esc(event.title) +
          '</b><small>' +
          esc(event.channels.join('　·　')) +
          '</small></span><span aria-hidden="true">↗</span></button>',
      )
      .join('') +
    '</div></section>'
  );
}

function openEvent(id) {
  const events = completedEvents(),
    event = events.find((e) => e.id === id);
  if (!event) return;
  const market = historicalAssetReturns(state.country, event.year);
  const related = events.filter((e) => event.relatedIds.includes(e.id) || e.relatedIds.includes(event.id));
  modal(
    event.title,
    '<div class="prose"><div class="overline">' +
      esc(event.date) +
      ' / ' +
      esc(event.type) +
      '</div><p class="lead">' +
      esc(event.summary) + (event.press?'</p>'+photo(event.press)+photoCredit(event.press)+'<p>':'') +
      (event.background!==event.summary?'</p><h3>事件背景</h3><p>'+esc(event.background):'') +
      '</p><h3>如何传到市场</h3>' +
      transmissionMap(event) +
      event.transmission
        .map(
          (t) =>
            '<article class="signal"><b>' +
            esc(t.channel) +
            ' → ' +
            esc(t.assets.map(key=>assetName(key,event.year)).join('、')) +
            '</b><p>' +
            esc(t.mechanism) +
            '</p></article>',
        )
        .join('') +
      '<h3>当年市场全景</h3>' +
      miniTable(
        ['资产', '全年回报'],
        assets(event.year)
          .filter((a) => a.key !== 'cash')
          .map((a) => [a.label, pct(market[a.key])]),
      ) +
      '<p class="caption">全年涨跌包含同期其他因素。</p>' +
      (related.length
        ? '<h3>关联事件</h3>' +
          related
            .map(
              (e) =>
                '<button class="action-link" data-event="' +
                esc(e.id) +
                '">' +
                e.year +
                ' · ' +
                esc(e.title) +
                ' ↗</button>',
            )
            .join('　')
        : '') +
      '<h3>进一步阅读</h3>' +
      event.sources
        .map(
          (s) =>
            '<p><a target="_blank" rel="noopener noreferrer" href="' +
            esc(s.url) +
            '">' +
            esc(s.title) +
            ' ↗</a></p>',
        )
        .join('') +
      '</div>',
  );
}

function persona() {
  const p = review || fallbackCampaignReview(state);
  return (
    '<section class="card"><div class="section-head"><h2>投资者画像</h2><small>' +
    (p.source === 'model' ? esc(p.model) : '账本复盘') +
    '</small></div><h3 class="persona-title">' +
    esc(p.title) +
    '</h3><p>' +
    esc(p.description) +
    '</p><article class="signal"><b>' +
    esc(p.riskPreference.label) +
    '</b><p>' +
    esc(p.riskPreference.description) +
    '</p></article>' +
    p.traits
      .map(
        (t) =>
          '<article class="signal"><b>' + esc(t.label) + '</b><p>' + esc(t.description) + '</p></article>',
      )
      .join('') +
    '<h3 class="below">关键决策</h3>' +
    p.evidence
      .map(
        (e) =>
          '<article class="signal"><button class="action-link" data-fact="' +
          e.year +
          '">' +
          e.year +
          ' · 看当年账本 ↗</button><p>' +
          esc(e.quote) +
          '</p><p>' +
          (e.interpretationSource === 'ledger' ? '<small>账本点评　</small>' : '') +
          esc(e.interpretation) +
          '</p></article>',
      )
      .join('') +
    '<p class="hint">' +
    esc(p.summary) +
    '</p>' +
    (p.source === 'model'
      ? ''
      : busy === 'review'
        ? '<p role="status">模型正在翻阅账本…</p>'
        : '<button class="secondary" data-act="persona">用我的模型点评</button>' +
          (err ? '<p role="status">' + esc(err) + '</p>' : '')) +
    '</section>'
  );
}

let riskMode = 'historical',
  customRate = 2;
function riskPanel() {
  const series = [...ids, 'indexA', 'indexB'].map((id) => ({
    id,
    name: names[id] || label(id) + ' · ' + basis(instrument(id)),
    benchmark: !ids.includes(id),
  }));
  const choices = [
    ['historical', '本国历史短端利率'],
    ['cash', '游戏现金 0%'],
    ['custom', '自定年利率'],
  ];
  const select =
    '<label>夏普参考 <select data-risk-mode>' +
    choices
      .map(
        ([id, name]) =>
          '<option value="' + id + '" ' + (riskMode === id ? 'selected' : '') + '>' + name + '</option>',
      )
      .join('') +
    '</select></label>' +
    '<label data-rate-field ' +
    (riskMode === 'custom' ? '' : 'hidden') +
    '>年利率 % <input type="number" min="-10" max="30" step="0.1" data-risk-rate value="' +
    customRate +
    '"></label>';
  const historical = riskMode === 'historical',
    fixed = riskMode === 'custom' ? customRate : 0;
  return riskDashboard(state.history, series, {
    reference: (year) => (historical ? REFERENCE_RATES[state.country][year] : fixed / 100),
    selection: select,
    source: historical ? 'OECD 隔夜银行间报价 · 按年取 12 个月均值' : '固定年利率 ' + fixed + '%',
  });
}
function ending() {
  const summary = campaignSummary(state),
    records = state.history,
    player = summary.accounts.player;
  const modelYears = records.filter((r) => r.pack.source === 'model').length;
  const rows = ids.map((id) => {
    const active = records.filter((r) => !r.accounts[id].inactive),
      account = summary.accounts[id];
    const allocation =
      active.reduce((s, r) => s + STOCK_KEYS.reduce((total,k)=>total+r.accounts[id].allocation[k],0), 0) /
      active.length;
    return [
      names[id],
      allocation.toFixed(0) + '%',
      signed(account.totalInvestmentProfit),
      nfmt(account.totalFees),
      nfmt(account.netWorth),
    ];
  });
  return (
    '<section class="endhead"><div class="overline">' +
    countryNames[state.country] +
    ' / ' +
    records[0].year +
    ' — ' +
    records.at(-1).year +
    '</div><h1>' +
    (state.endReason === 'bankruptcy' ? '家庭破产，旅程结束' : EDITIONS[state.edition].name+' · 合上这本手记') +
    '</h1><p>' +
    (state.endReason === 'bankruptcy'
      ? '出售可用资产后，家庭净资产已耗尽。'
      : '从第一份年初预算，到最后一张年末账单。') +
    '</p></section><div class="section-tabs" role="tablist">' +
    [
      ['board', '终局复盘'],
      ['graph', '历史图谱'],
      ['ledger', '历年账本'],
    ]
      .map(
        ([k, t]) =>
          '<button role="tab" data-tab="' + k + '" aria-selected="' + (mode === k) + '">' + t + '</button>',
      )
      .join('') +
    '</div>' +
    (mode === 'ledger'
      ? ledger()
      : mode === 'graph'
        ? graph()
        : '<div class="stack"><section class="card">' +
          stats([
            ['最终净资产', nfmt(player.netWorth)],
            ['完整年度年化', pct(player.annualizedReturn)],
            ['已结算', records.length + ' 期'],
          ]) +
          '</section>' +
          chart() +
          riskPanel() +
          '<section class="card"><div class="section-head"><h2>你与两位对手</h2><small>模型 ' +
          modelYears +
          ' 年 · 规则 ' +
          (records.length - modelYears) +
          ' 年</small></div>' +
          miniTable(['账户', '平均股票仓位', '累计投资损益', '累计费用', '最终净资产'], rows) +
          '</section>' +
          persona() +
          communityPanel() +
          graph() +
          '</div>') +
    foot()
  );
}

function sources() {
  const countries = state ? [COUNTRIES[state.country]] : Object.values(COUNTRIES);
  modal(
    '数据与计价口径',
    '<div class="prose">' +
      countries
        .map(
          (c) =>
            '<h3>' +
            esc(c.label) +
            ' · ' +
            c.currency +
            '</h3>' +
            miniTable(
              ['资产', '计算口径'],
              [...c.assets,...c.indices].flatMap(a=> a.segments ? a.segments.map(seg=>[seg.label+' · '+seg.from+'–'+seg.to, seg.description]) : [[a.label,a.description]]),
            ),
        )
        .join('') +
      '<p>生活费按本国历史 CPI 调整，年末确认后进入下一年预算。工资基数按每年 2.5% 的模拟趋势增长。起始家计和个人事件为游戏设定。</p><h3>历史数据</h3>' +
      [
        ...MARKET_SOURCES,
        ...Object.values(RISK_FREE_SOURCE.byCountry).map((s) => ({ title: s.label + ' · FRED', url: s.url })),
      ]
        .map(
          (s) =>
            '<p><a href="' +
            esc(s.url) +
            '" target="_blank" rel="noopener noreferrer">' +
            esc(s.title) +
            ' ↗</a></p>',
        )
        .join('') +
      '<small>このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。</small></div>',
  );
}
function help() {
  modal(
    '怎么玩',
    '<div class="prose"><h3>年初 · 配仓</h3><p>读年初情报，调整基础资产与行业股票的比例，总计 100%。打开「两位对手」可查看理由或采用建议。</p><h3>年末 · 对账</h3><p>先计算投资回报，再将工资、生活费和随机家庭事件记入现金。现金不足时按比例变现。三方使用同一起点和家庭经历，计收相同的交易费。</p><h3>终局 · 复盘</h3><p>玩家净资产耗尽或走到 2026 年观察期末时结束。看画像、重读关键决策，沿事件卡探索历史。收益曲线以 100 为起点，家庭净资产以美元或日元计价。</p><h3>AI 对手</h3><p>连接自己的模型后，两位对手同时提交配仓。也可以直接用规则对手完成全程。四条路线分别保存进度。</p></div>',
  );
}
function render() {
  masthead();
  root.innerHTML = !state ? landing() : pending ? recap() : state.finished ? ending() : board();
}

function redrawChart() {
  const old = root.querySelector('.chart-card');
  if (old) old.outerHTML = chart();
}
function settle() {
  if (!state || state.finished || pending || blocked()) return;
  state = settleCampaign(state, draft, pack);
  if (state.finished) community.finish(state);
  pending = true;
  review = pack = null;
  reportAccount = 'player';
  ledgerIndex = state.round - 1;
  focus = null;
  persist();
  render();
  window.scrollTo(0, 0);
}
function advance() {
  if (!pending) return;
  pending = false;
  mode = 'board';
  persist();
  render();
  window.scrollTo(0, 0);
  prepare();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, g[data-map-event]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.act === 'stats-retry') return void community.retry();
  if (d.edition && !state && Object.hasOwn(EDITIONS,d.edition)) {selectedEdition=d.edition;write(savePrefix+'edition',selectedEdition);render();return;}
  if (d.press && state && !state.finished && Number(d.press)===publicRound(state)?.year-1) return pressDetails(NEWS[state.country][d.press]);
  if (d.country) return resume(d.country);
  if (d.new) return initial(d.new);
  if ((d.event || d.mapEvent) && state) return openEvent(d.event || d.mapEvent);
  if (d.fact && state) {
    mode = 'ledger';
    ledgerIndex = state.history.findIndex((record) => record.year === Number(d.fact));
    reportAccount = 'player';
    render();
    window.scrollTo(0, 0);
    return;
  }
  if ('channel' in d) {
    channel = d.channel;
    const pos = window.scrollY;
    render();
    window.scrollTo(0, pos);
    return;
  }
  if (d.tab && state) {
    mode = d.tab;
    render();
    return;
  }
  if (d.trough && state?.finished) {
    chartKind = 'performance';
    hidden.delete(d.curve);
    focus = state.history.findIndex((record) => record.year === Number(d.trough)) + 1;
    redrawChart();
    root.querySelector('.chart-card').scrollIntoView({ block: 'center' });
    root.querySelector('[data-scrub]').focus({ preventScroll: true });
    return;
  }
  if (d.chart) {
    chartKind = d.chart;
    redrawChart();
    return;
  }
  if (d.series) {
    if (hidden.has(d.series)) hidden.delete(d.series);
    else hidden.add(d.series);
    redrawChart();
    root.querySelector('[data-series="' + d.series + '"]')?.focus({ preventScroll: true });
    return;
  }
  switch (d.act) {
    case 'settings':
      settings();
      break;
    case 'home':
      home();
      break;
    case 'help':
      help();
      break;
    case 'sources':
      sources();
      break;
    case 'close':
      close();
      break;
    case 'rules':
      rules();
      break;
    case 'restart':
      if (state) newPrompt(state.country);
      break;
    case 'retry':
    case 'persona':
      if (!config.apiKey) settings();
      else {
        err = '';
        enabled = true;
        void ask(state.finished ? 'review' : 'round');
      }
      break;
    case 'round-rules':
      if (!state || state.finished || pending) break;
      cancel();
      pack = fallbackCampaignPack(state);
      persist();
      render();
      break;
    case 'adopt':
      if (!state || state.finished || pending || blocked()) break;
      draft = { ...(pack || fallbackCampaignPack(state)).decisions.player };
      persist();
      render();
      notify('已应用建议配置');
      break;
    case 'settle':
      settle();
      break;
    case 'continue':
      advance();
      break;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-weight]')) setWeight(e.target.dataset.weight, e.target.valueAsNumber);
  if (e.target.matches('[data-scrub]')) {
    focus = e.target.valueAsNumber;
    const card = e.target.closest('.chart-card'),
      replacement = document.createElement('div');
    replacement.innerHTML = chart();
    for (const selector of ['.plot', '.scrub b', '.readouts'])
      card.querySelector(selector).replaceWith(replacement.querySelector(selector));
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-weight-num]')) {
    if (Number.isFinite(e.target.valueAsNumber))
      setWeight(e.target.dataset.weightNum, e.target.valueAsNumber);
    else e.target.value = draft[e.target.dataset.weightNum];
  }
  if (e.target.matches('[data-risk-mode],[data-risk-rate]')) {
    if (e.target.matches('[data-risk-mode]')) riskMode = e.target.value;
    else if (e.target.value !== '' && e.target.validity.valid) customRate = e.target.valueAsNumber;
    else {
      e.target.value = customRate;
      return;
    }
    const panel = root.querySelector('#risk-performance');
    const fresh = document.createElement('div');
    fresh.innerHTML = riskPanel();
    panel.querySelector('[data-rate-field]').hidden = riskMode !== 'custom';
    panel.querySelector('.risk-settings small').textContent =
      fresh.querySelector('.risk-settings small').textContent;
    panel.querySelector('tbody').replaceWith(fresh.querySelector('tbody'));
    return;
  }
  if (e.target.matches('[data-year]')) {
    ledgerIndex = Number(e.target.value);
    render();
  }
  if (e.target.matches('[data-account]')) {
    reportAccount = e.target.value;
    render();
  }
  if (e.target.matches('#ai-form [name=provider]')) {
    const provider = PROVIDERS.find((p) => p.id === e.target.value);
    cancel();
    config = { endpoint: provider.endpoint, model: provider.defaultModel, apiKey: '' };
    if (state && enabled && !pending && !state.finished && !pack) err = '填写新服务的密钥以继续本年对局。';
    render();
    e.target.form.elements.model.value = provider.defaultModel;
    dialog.querySelector('#model-options').innerHTML = modelOptions(provider);
    e.target.form.elements.key.value = '';
    e.target.form.querySelector('[role=status]')?.remove();
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'ai-form') return;
  e.preventDefault();
  const form = e.target,
    fields = form.elements;
  const provider = PROVIDERS.find((p) => p.id === fields.provider.value);
  let next;
  try {
    next = validateApiConfig({
      endpoint: provider.endpoint,
      model: fields.model.value,
      apiKey: fields.key.value,
    });
  } catch (error) {
    let line = form.querySelector('[role=status]');
    if (!line) {
      line = document.createElement('p');
      line.setAttribute('role', 'status');
      line.className = 'error';
      form.append(line);
    }
    line.textContent = error.message;
    return;
  }
  cancel();
  config = next;
  enabled = true;
  write(savePrefix + 'pref', JSON.stringify({ endpoint: config.endpoint, model: config.model }));
  if (state && !pending && pack?.source === 'rules') pack = null;
  persist();
  close();
  render();
  prepare();
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) close();
});
root.addEventListener('load', event=>{
  const img = event.target;
  if (img instanceof HTMLImageElement && img.matches('.press-photo-large img') && img.naturalHeight>img.naturalWidth)
    img.classList.add('archive-portrait');
},true);
const previousSlot=stored(activeKey);
if (/^(us|jp)-(short|full)$/.test(previousSlot||'')) {
  const [country,edition]=previousSlot.split('-'); selectedEdition=edition;loadGame(country);
}
render();
const community = startCommunity(refreshCommunity);
root.addEventListener('click',event=>{
  const summary = event.target.closest('[data-community] summary');
  if (summary && !summary.parentElement.open) community.refresh();
});
prepare();

function transmissionMap(event) {
  const steps = event.transmission;
  if (!steps.length) return '';
  const indexKeys = [...new Set(steps.flatMap((step) => step.assets))];
  const rows = Math.max(steps.length, indexKeys.length);
  const height = 34 + 42 * rows;
  const position = (i, n) => 10 + ((height - 20) * (i + 0.5)) / n;
  const midY = height / 2;
  let paths = '',
    nodes = '';
  steps.forEach((step, i) => {
    const y = position(i, steps.length);
    paths += '<path d="M85 ' + midY + ' C115 ' + midY + ' 123 ' + y + ' 153 ' + y + '"/>';
    for (const key of step.assets) {
      const dest = position(indexKeys.indexOf(key), indexKeys.length);
      paths += '<path d="M292 ' + y + ' C329 ' + y + ' 339 ' + dest + ' 372 ' + dest + '"/>';
    }
    nodes +=
      '<rect x="153" y="' +
      (y - 13) +
      '" width="139" height="26" rx="4"/><text x="222" y="' +
      (y + 4) +
      '">' +
      esc(step.channel) +
      '</text>';
  });
  for (const [i, key] of indexKeys.entries()) {
    const y = position(i, indexKeys.length);
    nodes +=
      '<rect class="market-target" x="372" y="' +
      (y - 13) +
      '" width="119" height="26" rx="4"/><text x="431" y="' +
      (y + 4) +
      '">' +
      esc(assetName(key,event.year)) +
      '</text>';
  }
  return (
    '<svg class="transmission" viewBox="0 0 500 ' +
    height +
    '" aria-hidden="true">' +
    paths +
    '<rect class="origin-node" x="0" y="' +
    (midY - 14) +
    '" width="85" height="28" rx="4"/><text class="origin-label" x="42" y="' +
    (midY + 4) +
    '">历史冲击</text>' +
    nodes +
    '</svg>'
  );
}

function eventConnections(events) {
  if (events.length < 2) return '';
  const inset = 32,
    width = Math.max(410, events.length * 62);
  const x = (i) => inset + (i * (width - inset * 2)) / (events.length - 1);
  let arcs = '';
  events.forEach((event, i) => {
    events.forEach((other, j) => {
      if (j <= i || !(event.relatedIds.includes(other.id) || other.relatedIds.includes(event.id))) return;
      const apex = Math.max(-60, 76 - 11 * (j - i));
      arcs += '<path d="M' + x(i) + ' 96 Q' + (x(i) + x(j)) / 2 + ' ' + apex + ' ' + x(j) + ' 96"/>';
    });
  });
  const nodes = events
    .map(
      (event, i) =>
        '<g data-map-event="' +
        esc(event.id) +
        '" role="button" tabindex="0" aria-label="' +
        esc(event.title) +
        '"><title>' +
        esc(event.title) +
        '</title><rect x="' +
        (x(i) - 22) +
        '" y="78" width="44" height="54" fill="transparent"/><circle cx="' +
        x(i) +
        '" cy="96" r="6"/><text x="' +
        x(i) +
        '" y="121">' +
        event.year +
        '</text></g>',
    )
    .join('');
  return (
    '<div class="map-scroll"><svg class="connections" style="min-width:' +
    width +
    'px" viewBox="0 0 ' +
    width +
    ' 135" role="group" aria-label="历史事件关联图">' +
    arcs +
    nodes +
    '</svg></div>'
  );
}
document.addEventListener('keydown', (event) => {
  const node = event.target.closest('g[data-map-event]');
  if (node && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    openEvent(node.dataset.mapEvent);
  }
});
