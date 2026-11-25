// Series share a time axis. A stopped account ends at its last recorded observation.
export const PALETTE = ['#08775e', '#c46137', '#426bb2', '#9d7625', '#86669c'];
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const cumulativePercent = new Intl.NumberFormat('zh-CN', {
  style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1,
});
export function lineChart(series, labels, hide = new Set(), focus = labels.length - 1, money = false, {cumulative = false, compact = false, description} = {}) {
  const visible = series.filter((s) => !hide.has(s.id));
  const values = visible.flatMap((s) => s.values.filter(Number.isFinite));
  const fmt = (n) =>
    n == null
      ? '—'
      : money
        ? new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
        : Number(n).toFixed(1);
  const w = compact ? 330 : 760,
    h = compact ? 195 : 230,
    left = compact ? 44 : 62,
    right = w - (compact ? 38 : 60),
    top = 20,
    bottom = h - 32;
  let min = Math.min(...values, money ? 0 : 100),
    max = Math.max(...values, money ? 1 : 100);
  const pad = Math.max(1, (max - min) * 0.08);
  min = money && min < 0 ? min - pad : Math.max(0, min - pad);
  max += pad;
  const x = (i) => left + (i * (right - left)) / Math.max(1, labels.length - 1);
  const y = (v) => bottom - ((v - min) * (bottom - top)) / (max - min);
  const ticks = [0, 1, 2, 3]
    .map((i) => {
      const v = min + ((max - min) * i) / 3;
      return `<path d="M${left} ${y(v)}H${right}" class="gridline"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    })
    .join('');
  const xTicks = [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])]
    .map((i) => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle">${esc(labels[i])}</text>`)
    .join('');
  const paths = visible
    .map((s) => {
      let d = '',
        start = true;
      for (const [i, v] of s.values.entries()) {
        if (!Number.isFinite(v)) {
          start = true;
          continue;
        }
        d += `${start ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
        start = false;
      }
      const v = s.values[focus];
      const dash = s.id === 'cpi' ? 'stroke-dasharray="2 5" stroke-linecap="round"' : s.benchmark ? 'stroke-dasharray="6 4"' : '';
      return `<path data-line="${esc(s.id)}" d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.id === 'player' ? 3.8 : 2.4}" ${dash}/>${Number.isFinite(v) ? `<circle cx="${x(focus)}" cy="${y(v)}" r="3.8" fill="${s.color}" stroke="white" stroke-width="1.3"/>` : ''}`;
    })
    .join('');
  const readouts = visible.map(s => {
    const value = (s.readoutValues || s.values)[focus];
    const formatted = cumulative && Number.isFinite(value) ? cumulativePercent.format(value / 100 - 1) : fmt(value);
    return `<span data-result="${esc(s.id)}"><i style="background:${s.color}"></i>${esc(s.readoutName || s.name)} <b${s.id === 'cpi' ? ' data-cpi-change' : ''}>${formatted}</b></span>`;
  }).join('');
  const selectedDate = cumulative ? ` aria-valuetext="${esc(labels[focus])}"` : '';
  const chartLabel = description || (money ? '账户资产变化' : '投资组合与指数表现，起点100');
  return `<div class="legend">${series.map((s) => `<button data-series="${esc(s.id)}" aria-pressed="${!hide.has(s.id)}" style="--sw:${s.color}"><i></i>${esc(s.name)}</button>`).join('')}</div><svg class="plot${compact ? ' compact-plot' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(chartLabel)}">${ticks}${xTicks}<path d="M${x(focus)} ${top}V${bottom}" class="focusline"/>${paths}</svg><label class="scrub">查看年份 <b>${esc(labels[focus])}</b><input aria-label="查看曲线年份" type="range" data-scrub${selectedDate} min="0" max="${labels.length - 1}" value="${focus}"></label><div class="readouts">${readouts}</div>`;
}
export function cashBridge(items, format) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return `<div class="bridge">${items.map((i) => `<div class="bridge-row"><span>${esc(i.name)}</span><div class="bridge-track"><i class="${i.value < 0 ? 'negative' : ''}" style="width:${(Math.abs(i.value) * 50) / max}%;${i.value < 0 ? 'right' : 'left'}:50%"></i></div><b>${esc(format(i.value))}</b></div>`).join('')}</div>`;
}
