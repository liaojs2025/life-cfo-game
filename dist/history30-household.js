// Generated offline by scripts/build-history30-household.py; source responses and hashes are archived.
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
export const CPI_ANNUAL_PERCENT = {
  "us": [
    {
      "year": 1994,
      "value": 2.60744159215452
    },
    {
      "year": 1995,
      "value": 2.80541968853661
    },
    {
      "year": 1996,
      "value": 2.93120419993441
    },
    {
      "year": 1997,
      "value": 2.33768993730735
    },
    {
      "year": 1998,
      "value": 1.55227909874363
    },
    {
      "year": 1999,
      "value": 2.18802719697357
    },
    {
      "year": 2000,
      "value": 3.37685727149929
    },
    {
      "year": 2001,
      "value": 2.82617111885407
    },
    {
      "year": 2002,
      "value": 1.58603162650601
    },
    {
      "year": 2003,
      "value": 2.27009497336114
    },
    {
      "year": 2004,
      "value": 2.67723669309171
    },
    {
      "year": 2005,
      "value": 3.3927468454955
    },
    {
      "year": 2006,
      "value": 3.22594410070404
    },
    {
      "year": 2007,
      "value": 2.85267248150138
    },
    {
      "year": 2008,
      "value": 3.83910029665099
    },
    {
      "year": 2009,
      "value": -0.355546266299747
    },
    {
      "year": 2010,
      "value": 1.6400434423899
    },
    {
      "year": 2011,
      "value": 3.156841568622
    },
    {
      "year": 2012,
      "value": 2.06933726526066
    },
    {
      "year": 2013,
      "value": 1.46483265562716
    },
    {
      "year": 2014,
      "value": 1.62222297740817
    },
    {
      "year": 2015,
      "value": 0.11862713555245
    },
    {
      "year": 2016,
      "value": 1.26158320570535
    },
    {
      "year": 2017,
      "value": 2.13011000365961
    },
    {
      "year": 2018,
      "value": 2.44258329692816
    },
    {
      "year": 2019,
      "value": 1.8122100752602
    },
    {
      "year": 2020,
      "value": 1.23358439630629
    },
    {
      "year": 2021,
      "value": 4.69785886363742
    },
    {
      "year": 2022,
      "value": 8.00279982052121
    },
    {
      "year": 2023,
      "value": 4.11633838374487
    },
    {
      "year": 2024,
      "value": 2.94952520485207
    }
  ],
  "jp": [
    {
      "year": 1994,
      "value": 0.695458057869003
    },
    {
      "year": 1995,
      "value": -0.127899045020446
    },
    {
      "year": 1996,
      "value": 0.136600358575909
    },
    {
      "year": 1997,
      "value": 1.74780458692133
    },
    {
      "year": 1998,
      "value": 0.66197419138591
    },
    {
      "year": 1999,
      "value": -0.341296928327553
    },
    {
      "year": 2000,
      "value": -0.676578683595175
    },
    {
      "year": 2001,
      "value": -0.740055504162737
    },
    {
      "year": 2002,
      "value": -0.92349402694232
    },
    {
      "year": 2003,
      "value": -0.256541816316024
    },
    {
      "year": 2004,
      "value": -0.00857338820310271
    },
    {
      "year": 2005,
      "value": -0.28294606876439
    },
    {
      "year": 2006,
      "value": 0.249355116079084
    },
    {
      "year": 2007,
      "value": 0.0600394544986689
    },
    {
      "year": 2008,
      "value": 1.3800788616492
    },
    {
      "year": 2009,
      "value": -1.35283672951718
    },
    {
      "year": 2010,
      "value": -0.728243207517778
    },
    {
      "year": 2011,
      "value": -0.27245561610124
    },
    {
      "year": 2012,
      "value": -0.0440645104432601
    },
    {
      "year": 2013,
      "value": 0.335037912184741
    },
    {
      "year": 2014,
      "value": 2.75922671353253
    },
    {
      "year": 2015,
      "value": 0.795279630579839
    },
    {
      "year": 2016,
      "value": -0.127258844489753
    },
    {
      "year": 2017,
      "value": 0.484199796126385
    },
    {
      "year": 2018,
      "value": 0.989094598021848
    },
    {
      "year": 2019,
      "value": 0.468776159383949
    },
    {
      "year": 2020,
      "value": -0.024995834027731
    },
    {
      "year": 2021,
      "value": -0.233352779398263
    },
    {
      "year": 2022,
      "value": 2.49770278172254
    },
    {
      "year": 2023,
      "value": 3.26813365933163
    },
    {
      "year": 2024,
      "value": 2.7385368163524
    }
  ]
};
export const HOUSEHOLD_OBSERVATIONS = Object.fromEntries(Object.entries(CPI_ANNUAL_PERCENT).map(([country, rows]) =>
  [country, rows.map(row => ({ year: row.year, inflation: row.value / 100, wageGrowth: SIMULATED_WAGE_GROWTH }))]));
export function getHouseholdRates(country, year) {
  const row = HOUSEHOLD_OBSERVATIONS[country]?.find(item => item.year === year);
  if (!row) throw new Error('缺少对应国家和年份的家计指数。');
  return { inflation: row.inflation, wageGrowth: row.wageGrowth };
}
