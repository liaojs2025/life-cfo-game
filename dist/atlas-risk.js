// One observation per completed calendar year. All rates are fractions.
function sampleDeviation(values, mean) {
  const sumSquares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

export function riskMetrics(observations, { baseYear, riskFreeRate = 0 } = {}) {
  if (!Array.isArray(observations) || !Number.isFinite(riskFreeRate))
    throw new TypeError('年度样本和参考利率无效。');
  const result = {
    count: 0,
    cumulativeReturn: null,
    annualizedReturn: null,
    volatility: null,
    sharpe: null,
    maxDrawdown: null,
    peakYear: null,
    troughYear: null,
    worstYear: null,
    worstReturn: null,
  };
  if (!observations.length) return result;
  const start = baseYear ?? observations[0].year - 1;
  if (!Number.isInteger(start)) throw new TypeError('期初年份无效。');
  const values = [],
    excess = [];
  let index = 1,
    high = 1,
    highYear = start,
    stopped = false;
  for (const [i, observation] of observations.entries()) {
    if (!observation || observation.year !== start + i + 1) throw new RangeError('年度须自期初起连续递增。');
    const value = observation.return;
    if (value === null) {
      stopped = true;
      continue;
    }
    const reference = observation.riskFree ?? riskFreeRate;
    if (stopped || !Number.isFinite(value) || value < -1 || !Number.isFinite(reference))
      throw new RangeError('年度回报样本无效。');
    values.push(value);
    excess.push(value - reference);
    index *= 1 + value;
    if (index > high) {
      high = index;
      highYear = observation.year;
    }
    const drawdown = Math.max(0, 1 - index / high);
    if (drawdown > (result.maxDrawdown ?? 0)) {
      result.maxDrawdown = drawdown;
      result.peakYear = highYear;
      result.troughYear = observation.year;
    }
    if (result.worstReturn === null || value < result.worstReturn) {
      result.worstReturn = value;
      result.worstYear = observation.year;
    }
  }
  result.count = values.length;
  if (!result.count) return result;
  result.maxDrawdown ??= 0;
  result.cumulativeReturn = index - 1;
  result.annualizedReturn = index ** (1 / result.count) - 1;
  if (result.count >= 2) {
    const average = (numbers) => numbers.reduce((total, value) => total + value, 0) / numbers.length;
    result.volatility = sampleDeviation(values, average(values));
    const meanExcess = average(excess);
    const risk = sampleDeviation(excess, meanExcess);
    if (risk > 1e-12) result.sharpe = meanExcess / risk;
  }
  return result;
}
