import { riskMetrics } from './atlas-risk.js';
import { esc, PALETTE } from './atlas-charts.js';

const percent = (number, signed = false) =>
  number === null ? '—' : (signed && number > 0 ? '+' : '') + (number * 100).toFixed(1) + '%';

export function riskDashboard(
  records,
  series,
  { reference = () => 0, selection = '', source = '本局无息现金 · 0%' } = {},
) {
  if (!records.length) return '';
  const fullYears = records.filter(record=>!record.isPartial);
  const partial = records.find(record=>record.isPartial);
  const measured = series.map((item, index) => {
    const observations = fullYears.map((record) => ({
      year: record.year,
      return: item.benchmark ? (record.benchmarkReturns || record.marketReturns)[item.id] : record.accounts[item.id].portfolioReturn,
      riskFree: reference(record.year),
    }));
    return {
      ...item,
      color: PALETTE[index],
      metrics: riskMetrics(observations, { baseYear: records[0].year - 1 }),
    };
  });
  const rows = measured
    .map(
      ({ id, name, color, metrics: m }) =>
        '<tr><th scope="row"><i class="swatch" style="--sw:' +
        color +
        '"></i>' +
        esc(name) +
        '</th><td><b>' +
        (m.sharpe === null ? '—' : m.sharpe.toFixed(2)) +
        '</b></td><td>' +
        percent(m.maxDrawdown === null ? null : -m.maxDrawdown) +
        '</td><td>' +
        percent(m.annualizedReturn, true) +
        '</td><td>' +
        percent(m.volatility) +
        '</td><td>' +
        m.count +
        '</td><td>' +
        (m.peakYear === null
          ? '—'
          : '<button class="action-link" data-curve="' +
            esc(id) +
            '" data-trough="' +
            m.troughYear +
            '" aria-label="在曲线查看' +
            esc(name) +
            '的回撤谷底">' +
            m.peakYear +
            ' → ' +
            m.troughYear +
            '</button>') +
        '</td><td>' +
        percent(m.worstReturn, true) +
        ' <small>' +
        (m.worstYear ?? '') +
        '</small></td></tr>',
    )
    .join('');
  return (
    '<section class="card" id="risk-performance"><div class="section-head"><h2>风险与收益</h2><small>年频 · 扣费前</small></div>' +
    '<div class="risk-settings">' +
    selection +
    '<small>' +
    esc(source) + (partial ? ' · 完整年度统计至 '+(partial.year-1)+' 年，'+partial.year+' 年内走势见曲线' : '') +
    '</small></div><p class="risk-scroll-hint">左右滑动查看全部指标</p><div class="table-wrap" tabindex="0" aria-label="风险收益比较表，可左右滚动">' +
    '<table class="data-table risk-table"><thead><tr>' +
    ['账户 / 指数', '夏普比率', '最大回撤', '年化收益', '年化波动率', '年数', '峰值 → 谷底', '最差年度']
      .map((t) => '<th scope="col">' + t + '</th>')
      .join('') +
    '</tr></thead><tbody>' +
    rows +
    '</tbody></table></div><details class="below"><summary>指标怎么算</summary>' +
    '<p class="hint">年化收益采用几何复利。年化波动率取年度收益的样本标准差。夏普比率用年度超额收益的算术均值除以这些超额收益的样本标准差。</p>' +
    '<p class="hint">最大回撤从期初和历年年末净值中找最大峰谷跌幅，年内波动未纳入。投资回报剔除家庭出入金。出局账户统计至出局年；少于两年时不计算波动率和夏普，超额收益无波动时夏普留空。</p></details></section>'
  );
}
