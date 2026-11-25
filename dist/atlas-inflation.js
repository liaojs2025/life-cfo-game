import { CPI_LEVELS } from './atlas-cpi-levels.js';

export const CPI_SOURCES = {
  us: {name: '美国劳工统计局 · CPI-U', url: 'https://data.bls.gov/timeseries/CUUR0000SA0'},
  jp: {name: '日本总务省统计局 · 全国综合 CPI', url: 'https://www.stat.go.jp/data/cpi/1.html'},
};

// Only settled rounds enter this retrospective. The initial portfolio is valued
// in the purchasing power of the December immediately before its first round.
export function getPricePath(country, history) {
  if (!history.length) return [];
  const baseMonth = `${history[0].year - 1}-12`;
  const months = [baseMonth, ...history.map(record => record.asOf.slice(0, 7))];
  const levels = CPI_LEVELS[country];
  return months.map(month => {
    const cpi = levels?.[month];
    if (!Number.isFinite(cpi)) throw new RangeError(`缺少 ${country} ${month} 的月度 CPI`);
    return {month, cpi, index: 100 * (cpi / levels[baseMonth])};
  });
}

export function toStartPurchasingPower(nominalValue, priceIndex) {
  if (nominalValue == null) return null;
  if (!Number.isFinite(nominalValue) || !Number.isFinite(priceIndex) || priceIndex <= 0)
    throw new RangeError('实际购买力需要有效的金额或净值，以及正的物价指数。');
  return 100 * (nominalValue / priceIndex);
}
