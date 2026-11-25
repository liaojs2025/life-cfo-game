"""Offline, byte-reproducible CPI module from the archived World Bank responses."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'scripts/history30-sources/household'
manifest = json.loads((SOURCE / 'manifest.json').read_text())
for filename, item in manifest['files'].items():
    assert hashlib.sha256((SOURCE / filename).read_bytes()).hexdigest() == item['sha256'], filename

observations = {}
for country, code in [('us', 'USA'), ('jp', 'JPN')]:
    metadata, rows = json.loads((SOURCE / f'worldbank-cpi-{code.lower()}.json').read_text())
    assert metadata['pages'] == 1 and metadata['total'] == 31
    assert metadata['lastupdated'] == manifest['worldBankLastUpdated']
    rows.sort(key=lambda row: int(row['date']))
    assert [int(row['date']) for row in rows] == list(range(1994, 2025))
    assert all(row['countryiso3code'] == code and row['indicator']['id'] == 'FP.CPI.TOTL.ZG'
               and isinstance(row['value'], (int, float)) for row in rows)
    observations[country] = [{'year': int(row['date']), 'value': row['value']} for row in rows]

prefix = """// Generated offline by scripts/build-history30-household.py; source responses and hashes are archived.
export const HOUSEHOLD_DATA_VERSION = 'worldbank-cpi-1994-2024-20261111';
export const SIMULATED_WAGE_GROWTH = 0.025;
export const HOUSEHOLD_SOURCES = [{
  id: 'cpi', title: 'World Bank WDI / IMF IFS · 消费价格通胀',
  url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG',
  sourceVintage: 'WDI updated 2026-11-11; retrieved 2026-11-25',
  note: 'FP.CPI.TOTL.ZG, annual percent; USA/JPN 1994–2024, 31 observations each. Raw JSON archived with SHA256; only divide by 100 for game decimals.',
}];
export const HOUSEHOLD_ASSUMPTIONS = [
  '生活费调整采用世界银行 WDI 的美日年度 CPI 通胀历史值，包含通缩；完整年份在年度结算后应用于下一年的生活费基数与价格指数。年初不提供当年通胀。',
  '此处是年度步进的家计规则，不声称全年 CPI 在当年最后一天已由统计机构发布，也不是逐月家庭账单复原；历史值采用当前可得版本。',
  '工资基数仍按每年 2.5% 的模拟名义趋势增长，婚育、职业和退休另按游戏规则调整；家计起点与个人事件均为教学模拟，不是实际税后平均工资。',
];
export const CPI_ANNUAL_PERCENT = """
suffix = """;
export const HOUSEHOLD_OBSERVATIONS = Object.fromEntries(Object.entries(CPI_ANNUAL_PERCENT).map(([country, rows]) =>
  [country, rows.map(row => ({ year: row.year, inflation: row.value / 100, wageGrowth: SIMULATED_WAGE_GROWTH }))]));
export function getHouseholdRates(country, year) {
  const row = HOUSEHOLD_OBSERVATIONS[country]?.find(item => item.year === year);
  if (!row) throw new Error('缺少对应国家和年份的家计指数。');
  return { inflation: row.inflation, wageGrowth: row.wageGrowth };
}
"""
(ROOT / 'dist/history30-household.js').write_text(prefix + json.dumps(observations, ensure_ascii=False, indent=2) + suffix)
print('Rebuilt US/JP 1994–2024 CPI from 62 archived observations; wages remain explicitly simulated.')
