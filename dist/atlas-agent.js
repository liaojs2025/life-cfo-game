import { requestStructuredJSON, validateApiConfig, getApiProviderHint } from './ai.js';
import { ASSET_KEYS, stockWeight, COUNTRIES, ACCOUNT_IDS, campaignDecisionContext, campaignContextId, campaignHash,
  fallbackCampaignPack, validateCampaignPack, validateAllocation, validateAtlasText, accountNetWorth } from './atlas-engine.js';

export { validateApiConfig, getApiProviderHint, fallbackCampaignPack, validateCampaignPack };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function prose(value, label, { max = 1000, years = null } = {}) {
  return validateAtlasText(value, label, { max, years: years || [], behavior: Boolean(years) });
}

const DECISION_SYSTEM = `你是投资教育游戏的两个独立对手兼玩家顾问。一次只输出一个 JSON 对象，不调用工具，不查外部历史。
输入是匿名年初案例，只能据 signals、当前家庭收支与资产判断，禁止猜对应历史年份或偷用已知历史收益。
先提出清楚判断，再引用 signalId 说明配置理由和推翻判断的具体条件；不要重复套话。金额必须使用输入 currency 对应币种。
输出 decisions.player、decisions.aggressive、decisions.conservative，每份仅 cash/broad/bond/gold/tech/consumer/health 七个整数百分比、总和100。
股票合计 broad+tech+consumer+health：aggressive 至少60，conservative 至多40。bond 是债券；indexA/indexB 只用于对标，禁止配置。每个账户独立配置，不复制玩家财富来计算对手。
资产 key 是程序标识，行业含义以输入 assets.label 为准，不能仅凭 tech/consumer/health 的英文名字假定国家对应行业。
analysis 只引用有效 signalId；不重写 observation，程序按 ID 绑定原文。analysis 有1至3条 {signalId,reasoning,risk}，risk 是具体风险触发条件。
资讯中的已知市场涨跌数字由程序在 observation 原文展示，reasoning 与 risk 解释机制、配置和触发条件，不重复精确涨跌数值。
输入 isPartial=true 时只评价截至期，不把期间回报当作全年，家庭经常收支已按 periodFraction 折算。
summary 用一句话说明两个对手对当前局面的分歧。不要承诺收益或预报精确期间涨跌。`;

export async function requestCampaignDecision(config, state, options = {}) {
  state = JSON.parse(JSON.stringify(state));
  const context = campaignDecisionContext(state);
  const { parsed, model } = await requestStructuredJSON(config, { system: DECISION_SYSTEM,
    payload: { ...context, outputSchema: { decisions: Object.fromEntries(ACCOUNT_IDS.map(id => [id, Object.fromEntries(ASSET_KEYS.map(key => [key, '整数']))])),
      analysis: [{ signalId: '输入的资讯 ID', reasoning: '判断与配置理由', risk: '具体推翻条件' }], summary: '双方分歧' } } }, options);
  if (!plain(parsed) || !plain(parsed.decisions) || !Array.isArray(parsed.analysis) || parsed.analysis.length < 1 || parsed.analysis.length > 4) throw new Error('模型没有完整返回两位对手及玩家建议。');
  const used = new Set();
  const analysis = parsed.analysis.map(item => {
    const signal = context.signals.find(signal => signal.id === item?.signalId);
    if (!signal || used.has(signal.id) || item.observation !== undefined && item.observation !== signal.text) throw new Error('模型资讯引用无效。');
    used.add(signal.id);
    return { signalId: signal.id, observation: signal.text, reasoning: prose(item.reasoning, '配置理由'), risk: prose(item.risk, '风险条件') };
  });
  return validateCampaignPack({ source: 'model', model, contextId: campaignContextId(state), round: state.round,
    decisions: Object.fromEntries(ACCOUNT_IDS.map(id => [id, validateAllocation(parsed.decisions[id], { style: id })])),
    analysis, summary: prose(parsed.summary, '对手判断') }, state);
}

export function campaignReviewFacts(state) {
  return state.history.map(record => ({ factId: `player-${record.round + 1}`, year: record.year, asOf: record.asOf, isPartial: record.isPartial, periodFraction: record.periodFraction,
    allocation: { ...record.accounts.player.allocation }, assetLabels: { ...record.assetLabels }, portfolioReturn: record.accounts.player.portfolioReturn,
    netWorth: record.accounts.player.endNetWorth, income: record.cashflow.income,
    expense: record.cashflow.expense, windfall: record.cashflow.windfall, cashflowNet: record.cashflow.net,
    investmentProfit: record.accounts.player.investmentProfit, fees: record.accounts.player.fees,
    replacementFees: record.accounts.player.replacementFees, assetChanges: record.assetChanges.map(change => ({ ...change })),
    liquidationFees: record.accounts.player.liquidationFees,
    opponents: Object.fromEntries(['aggressive', 'conservative'].map(id => [id, {
      inactive: record.accounts[id].inactive, bankrupt: record.accounts[id].bankrupt,
      allocation: record.accounts[id].inactive ? null : { ...record.accounts[id].allocation },
      stockWeight: record.accounts[id].inactive ? null : stockWeight(record.accounts[id].allocation),
      portfolioReturn: record.accounts[id].portfolioReturn, netWorth: record.accounts[id].endNetWorth,
      source: record.pack.source, model: record.pack.model,
    }])),
    events: record.events.map(event => event.title),
    quote: `${record.year} 年${record.isPartial ? '截至 ' + record.asOf + ' 的' : ''}实际配置：${COUNTRIES[state.country].assets.map(asset => (record.assetLabels[asset.key] || asset.label) + ' ' + record.accounts.player.allocation[asset.key] + '%').join('，')}。` }));
}
function reviewContext(state) {
  if (!state.history.length) throw new Error('至少结算一期后才能复盘。');
  return { edition: state.edition, country: state.country, currency: state.country === 'us' ? 'USD' : 'JPY', rounds: state.round,
    ended: state.finished, endReason: state.endReason, facts: campaignReviewFacts(state),
    accounts: Object.fromEntries(ACCOUNT_IDS.map(id => [id, { netWorth: accountNetWorth(state.accounts[id]),
      bankrupt: state.accounts[id].bankrupt, totalContribution: state.accounts[id].totalContribution,
      returnIndex: state.accounts[id].returnIndex, maxDrawdown: state.accounts[id].maxDrawdown,
      investmentProfit: state.accounts[id].totalInvestmentProfit, fees: state.accounts[id].totalFees }])) };
}
const reviewContextId = state => `atlas-review5-${campaignHash(reviewContext(state))}`;

export function fallbackCampaignReview(state) {
  const facts = campaignReviewFacts(state);
  if (!facts.length) throw new Error('至少结算一期后才能复盘。');
  const averageStocks = facts.reduce((sum, fact) => sum + stockWeight(fact.allocation), 0) / facts.length;
  const label = averageStocks >= 65 ? '敢于承受波动的远行者' : averageStocks <= 35 ? '把余地留在手里的守望者' : '在增长与退路间调配的掌舵人';
  const ranked = (score, descending = false) => facts.map((fact, index) => ({ index, score: score(fact, index) }))
    .sort((a, b) => (descending ? b.score - a.score : a.score - b.score) || a.index - b.index)[0].index;
  const changes = facts.map((fact, index) => index ? ASSET_KEYS.reduce((sum, key) => sum + Math.abs(fact.allocation[key] - facts[index - 1].allocation[key]), 0) / 2 : 0);
  const worst = ranked(fact => fact.portfolioReturn ?? Infinity);
  const pressure = ranked((fact, index) => fact.cashflowNet / Math.max(1, state.history[index].accounts.player.startNetWorth));
  const changed = ranked((_fact, index) => changes[index], true);
  const best = ranked(fact => fact.portfolioReturn ?? -Infinity, true);
  const selected = [];
  const select = (index, kind) => { if (!selected.some(item => item.index === index) && selected.length < Math.min(3, facts.length)) selected.push({ index, kind }); };
  select(worst, 'weakest');
  if (changes[changed] > 0) select(changed, 'change');
  select(pressure, 'cashflow'); select(best, 'strongest'); select(facts.length - 1, 'ending');
  for (let index = 0; selected.length < Math.min(3, facts.length); index++) select(index, 'path');
  const explain = ({ index, kind }) => {
    const fact = facts[index], stocks = stockWeight(fact.allocation);
    if (kind === 'weakest') return `${fact.portfolioReturn < 0 ? '这是本局配置回报最低的一期，持仓在市场中缩水。' : '本局没有负的单期配置回报；这是配置增长最慢的一期。'}当时股票资产占 ${stocks}%。${fact.cashflowNet < 0 ? '家庭收支同时出现缺口，生活付款继续消耗资产。' : '家庭收支保持结余，净资产还得到工资等外部资金补充。'}`;
    if (kind === 'change') return `这是七类资产目标比例调整幅度最大的一期。股票资产从此前的 ${stockWeight(facts[index - 1].allocation)}% 调整为 ${stocks}%。${fact.portfolioReturn < 0 ? '调整后的组合仍遇到期间亏损，改变配置并不能消除市场风险。' : '调整后的组合没有期间投资亏损，但单次结果不足以证明择时有效。'}`;
    if (kind === 'cashflow') return fact.cashflowNet < 0
      ? `这是相对年初资产而言家庭支付压力最大的一期。收入和遗产不足以覆盖支出。${fact.liquidationFees > 0 ? '现金不够付款，账户实际卖出投资并支付额外费用。' : '账户用已有现金承担了缺口。'}${fact.portfolioReturn < 0 ? '投资亏损与家庭缺口在这一期叠加。' : fact.portfolioReturn > 0 ? '即使投资取得正回报，也不能把生活付款从预算中省略。' : '这一期没有投资收益可以抵消家庭支出。'}`
      : '这一期的家庭净结余相对年初资产最薄，但仍没有形成支付缺口。财富增长中包含这笔外部结余，不能全部算作投资成绩。';
    if (kind === 'strongest') return `${fact.portfolioReturn > 0 ? '这是本局配置回报最好的一期。' : '这是配置回报相对最稳的一期。'}现金占 ${fact.allocation.cash}%，股票资产占 ${stocks}%，黄金占 ${fact.allocation.gold}%；这份实际结构决定了市场涨跌如何传到账户。`;
    if (kind === 'ending') return `${state.endReason === 'bankruptcy' ? '旅程在这一期的家庭付款之后终止。' : '这是目前旅程的最后一份实际配置。'}${fact.liquidationFees > 0 ? '期间账本留下了为付款出售资产的记录。' : '本期没有因为现金不足而强制卖出投资。'}`;
    return `这一期股票资产占 ${stocks}%，黄金占 ${fact.allocation.gold}%。${fact.portfolioReturn < 0 ? '组合经历了期间下跌。' : '组合没有发生期间投资亏损。'}${fact.cashflowNet >= 0 ? '家庭结余为账户增加资金。' : '家庭支出缺口从资产中提取资金。'}`;
  };
  const stockWeights = facts.map(fact => stockWeight(fact.allocation));
  const ahead = ['aggressive', 'conservative'].filter(id => accountNetWorth(state.accounts.player) > accountNetWorth(state.accounts[id])).length;
  const forcedSales = facts.filter(fact => fact.liquidationFees > 0).length;
  return { source: 'rules', model: 'atlas-review-rules-5', contextId: reviewContextId(state), title: label,
    description: `这段旅程实际完成了 ${facts.length} 期${facts.some(fact => fact.isPartial) ? '，最后一期为截至期' : ''}。你的配置平均把 ${Math.round(averageStocks)}% 放在股票资产。${state.endReason === 'bankruptcy' ? '家庭支付缺口终止了旅程，下面从实际配置与支出回看原因。' : '配置与家庭收支共同决定了留下的资产。'}`,
    riskPreference: { label: averageStocks >= 65 ? '积极承担股票波动' : averageStocks <= 35 ? '保留较多流动空间' : '在风险和缓冲间取舍', description: '依据本局实际执行的股票资产配置归纳。' },
    traits: [{ label: Math.max(...changes) ? '改变过自己的出牌方式' : '把同一份配置执行到底',
      description: `实际股票资产配置在 ${Math.min(...stockWeights)}% 至 ${Math.max(...stockWeights)}% 之间；配置调整与市场结果分别留在期间账本中。` },
    { label: forcedSales ? '生活曾经要求提前卖出' : '没有被付款迫使卖出',
      description: forcedSales ? `有 ${forcedSales} 年因现金不足而卖出非现金资产，说明生活预算确实参与了投资结果。` : '本局没有现金缺口强制卖出记录；已有现金和家庭收入承担了生活付款。' }],
    evidence: selected.map(item => ({ factId: facts[item.index].factId, year: facts[item.index].year, quote: facts[item.index].quote, interpretation: explain(item) })),
    summary: `${state.endReason === 'bankruptcy' ? '出局发生在家庭付款后的余额检查。' : '旅程的净资产同时包含投资、家庭结余与交易费用。'}目前净资产高于 ${ahead} 位对手。收益曲线另行剔除家庭出入金，不能用财富排名替代投资回报比较。` };
}

// A finished ledger can substantiate a past portfolio return to the precision printed by the model.
function historicalComment(value, fact, years) {
  if (typeof value !== 'string') return prose(value, '行为解释', { years });
  if (value.length > 1000) throw new Error('行为解释过长。');
  if (fact.isPartial && /(?:全年|完整年度)(?:投资|组合|实现|的|\s)*(?:收益|回报|亏损|盈利)/.test(value)) throw new Error('截至期不能表述为全年回报。');
  const phrases = value.split(/(?<=[。！？；;])/u);
  const verified = phrases.map(phrase => {
    if (/(?:未来|明年|下一|预计|预测|预期|有望|将(?:会|达|涨|跌)|保证|必然|一定|可能|如果|若|会涨|会跌|forecast|next|will)/i.test(phrase)) return phrase;
    const dated = [...phrase.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)];
    if (dated.some(match => Number(match[1]) !== fact.year) ||
      /(?:一九|二[零〇])[零〇一二三四五六七八九]{2}|上一年|前一年|去年|上年|翌年|次年|历年|往年|同期其他/.test(phrase)) return phrase;
    if (!/(?:当年|这一期|该年|最终|实际|本期|当期|录得|取得|实现|回看|曾|当时|[12]\d{3}年)/.test(phrase)) return phrase;
    if (/(?:对手|稳健|激进|进取|指数回报|指数收益|大盘|黄金回报|现金收益)/.test(phrase)) return phrase;
    return phrase.replace(/(收益率|回报率|投资收益|组合收益|组合回报|收益|回报|亏损|盈利)(?:是|为|达|约|了|为负|达到|录得|仅有|接近|只有|高达|低至|\s)*([+−–-]?\d+(?:\.\d+)?)\s*[%％]/gu, (term, label, number) => {
      if (!Number.isFinite(fact.portfolioReturn)) return term;
      let amount = Number(number.replace(/[−–]/gu,'-'));
      if (label === '亏损' || term.includes('为负')) amount = -Math.abs(amount);
      const precision = number.split('.')[1]?.length || 0;
      return Math.abs(fact.portfolioReturn * 100 - amount) <= 0.5 * 10 ** -precision + 1e-9
        ? '账本记录的组合表现' : term;
    });
  }).join('');
  prose(verified, '行为解释', { years });
  // The player sees the original, verified wording and percentage.
  return value.trim();
}

function evidenceFromLedger(fact) {
  const stocks = stockWeight(fact.allocation);
  const market = fact.portfolioReturn < 0 ? '录得投资亏损' : fact.portfolioReturn > 0 ? '取得正回报' : '投资损益持平';
  const household = fact.cashflowNet >= 0 ? '家庭收支带来净流入' : fact.liquidationFees > 0 ? '为支付家庭缺口卖出了投资' : '家庭开支动用了现金';
  return `股票仓位 ${stocks}%，本期组合${market}；同期${household}。`;
}

export function validateCampaignReview(result, state) {
  const facts = campaignReviewFacts(state), years = facts.map(fact => fact.year);
  if (!plain(result) || !['rules', 'model'].includes(result.source) || result.contextId !== reviewContextId(state)) throw new Error('复盘与实际旅程不匹配。');
  if (!Array.isArray(result.evidence) || result.evidence.length < Math.min(3, facts.length) || result.evidence.length > Math.min(6, facts.length)) throw new Error('复盘需要引用实际经历。');
  const used = new Set();
  const evidence = result.evidence.map(item => {
    const fact = facts.find(fact => fact.factId === item?.factId);
    if (!fact || used.has(fact.factId) || item.year !== undefined && item.year !== fact.year || item.quote !== undefined && item.quote !== fact.quote) throw new Error('复盘引用了不存在或被改写的选择。');
    used.add(fact.factId);
    if (item.interpretationSource === 'ledger') {
      if (result.source !== 'model' || item.interpretation !== evidenceFromLedger(fact)) throw new Error('账本点评与当年事实不符。');
      return {factId:fact.factId, year:fact.year, quote:fact.quote, interpretation:item.interpretation, interpretationSource:'ledger'};
    }
    return { factId: fact.factId, year: fact.year, quote: fact.quote, interpretation: historicalComment(item.interpretation, fact, years) };
  });
  if (!plain(result.riskPreference) || !Array.isArray(result.traits) || result.traits.length < 1 || result.traits.length > 3) throw new Error('复盘画像字段不完整。');
  const normalized = { source: result.source, model: prose(result.model, '模型', { max: 200, years }), contextId: result.contextId,
    title: prose(result.title, '画像标题', { max: 100, years }), description: prose(result.description, '画像说明', { years }),
    riskPreference: { label: prose(result.riskPreference.label, '风险偏好', { max: 100, years }), description: prose(result.riskPreference.description, '风险说明', { years }) },
    traits: result.traits.map(item => ({ label: prose(item.label, '特征标题', { max: 100, years }), description: prose(item.description, '特征说明', { years }) })), evidence,
    summary: prose(result.summary, '复盘结论', { years }) };
  if (result.source === 'rules' && JSON.stringify(normalized) !== JSON.stringify(fallbackCampaignReview(state))) throw new Error('规则复盘被修改。');
  return normalized;
}

export async function requestCampaignReview(config, state, options = {}) {
  state = JSON.parse(JSON.stringify(state));
  const context = reviewContext(state);
  const system = `用实际已执行记录，为玩家写鲜明有趣的投资行为画像和复盘。不是心理诊断，不推测不存在的选择，不承诺未来收益。
先给判断，再用 facts 中的真实选择解释。可以对照已完成年份，不能引用尚未发生的年份。金额按 currency 使用美元或日元。
提前破产也要解释实际经历，不能责备玩家；区分投资回报和家庭工资、遗产、支出。
facts.isPartial=true 的记录只包含截至日期间，不是完整年度；对比必须保留这个区别，不把该期回报年化。
每期 assetLabels 绑定实际投资标的；同一程序 key 在历史代理切换前后可能代表不同市场，按当期名字说明，不能把早期海外行业写成本国行业。
facts.opponents 提供两位对手每期实际股票仓位和回报；用它们比较已执行行为，不编造对手动机。inactive 的年份不能说对手仍在投资。
重点选配置回报较弱、调整幅度较大、现金流紧张的实际年份，避免三条相同模板。收益、具体金额和比例由界面自动补齐。所有自由文字用定性比较写出仓位与结果之间的联系，例如“留在现金里的资金缓冲了那次股市回落”。
只输出一个 JSON 对象：title,description,riskPreference:{label,description},traits:[{label,description}],evidence:[{factId,interpretation}],summary。
evidence 引用不同 factId，至少 min(3,事实条数) 条，最多6条。只引用 ID，不复写年份和 quote；程序绑定原始记录。traits 为1至3条。
写具体行为，不复制 schema 提示。禁止临床诊断或人格定论。`;
  const { parsed, model } = await requestStructuredJSON(config, { system, payload: context, purpose: 'persona' }, options);
  // Preserve a valid persona when a single comment includes an unverified number.
  // Replaced comments are calculated locally, labeled in the UI, and checked again on reload.
  const years = context.facts.map(fact => fact.year);
  const evidence = parsed?.evidence?.map?.(entry => {
    const fact = context.facts.find(fact => fact.factId === entry?.factId);
    if (!fact) return entry;
    const {interpretationSource: ignored, ...item} = entry;
    try { historicalComment(item.interpretation, fact, years); }
    catch (error) {
      if (!String(error.message).includes('数值预测或确定性表述')) throw error;
      return {...item, interpretation:evidenceFromLedger(fact), interpretationSource:'ledger'};
    }
    return item;
  });
  return validateCampaignReview({ ...parsed, evidence, source:'model', model, contextId:reviewContextId(state) }, state);
}
