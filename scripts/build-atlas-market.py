#!/usr/bin/env python3
"""Rebuild the public seven-asset market module from the checked numeric extract."""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'scripts/atlas-sources/observations.json').read_text())
domestic = json.loads((ROOT / 'scripts/atlas-sources/jp-domestic-sectors.json').read_text())
assert domestic['firstCompleteYear'] == 2009
ASSET_KEYS = ['cash', 'broad', 'bond', 'gold', 'tech', 'consumer', 'health']
CUTOFF = source['cutoff']
DATA_VERSION = 'atlas-market-1987-2026-20260930-v1'
SOURCES = [
    {'id': 'fund-nav', 'title': 'Yahoo Finance · 债券基金复权净值与比较指数', 'url': 'https://finance.yahoo.com/quote/FBNDX/history/',
     'note': 'FBNDX 使用每日 adjusted close；^GSPC、^IXIC、^N225 使用月末 close。精确下载地址与哈希见来源摘录。'},
    {'id': 'vanguard', 'title': 'Vanguard · 2026 年标普 500 基准回报', 'url': 'https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0040.pdf',
     'note': '读取官方 2026-09-30 资料中 Benchmark 的 Year to date 12.75%，是标普 500 含息指数，不是基金净值收益。'},
    {'id': 'fidelity', 'title': 'Fidelity · 投资级债券基金 FBNDX', 'url': 'https://fundresearch.fidelity.com/mutual-funds/summary/316146109',
     'note': '美元投资级债券组合，包含政府债、公司债和抵押支持证券，并非纯国债。'},
    {'id': 'french', 'title': 'Kenneth French · 五行业研究组合方法', 'url': 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/det_5_ind_port.html',
     'note': '官方 202609 CRSP 版本；价值加权 Cnsmr、HiTec、Hlth 总回报。研究组合并非 ETF。'},
    {'id': 'french-data', 'title': 'Kenneth French · 官方行业回报原表', 'url': 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/5_Industry_Portfolios_CSV.zip',
     'note': '1986–2025 读取 Annual Value Weighted；2026 连乘 1–9 月 Monthly Value Weighted。'},
    {'id': 'topix', 'title': '日本统计局 · TOPIX 历史收盘指数', 'url': 'https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=0702020590000090010&Cycle=3&RegionCode=00000&Limit=0',
     'note': 'TOPIX 价格指数；完整年取年度期末，2026 取同一指标 9 月月末。'},
    {'id': 'nyu-gold', 'title': 'NYU Damodaran · 黄金历史年度回报', 'url': 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
     'note': '1986–2025 年美元黄金价格变动，无储存费与交易费。'},
    {'id': 'nyu-sp500', 'title': 'NYU Damodaran · 标普 500 含息年度回报', 'url': 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
     'note': '1986–2025 读取 S&P 500 (includes dividends) 列，保留该研究数据版本与舍入精度。'},
    {'id': 'gld-nav', 'title': 'SPDR Gold Shares · 官方历史净值', 'url': 'https://www.spdrgoldshares.com/usa/gld/',
     'note': '2026 单独使用 GLD NAV/share，已含基金费用。官方原表已移除 LBMA 金价，不把基金净值称作现货报价。'},
    {'id': 'fx', 'title': '美联储 H.10 · 日元兑美元历史汇率', 'url': 'https://www.federalreserve.gov/releases/h10/hist/',
     'note': '全段使用纽约午间买入汇率（每美元日元数），海外资产统一换算为未对冲日元回报。'},
]
for key, series in domestic['series'].items():
    SOURCES.append({'id': 'nomura-' + key, 'title': '野村 NEXT FUNDS · ' + series['label'],
                    'url': series['sourceUrl'], 'note': f"{series['ticker']} 日元含分红再投资净值；2009–2026 使用日本本土行业，2026 截至 9 月 30 日。"})
URL = {s['id']: s['url'] for s in SOURCES}


def asset(key, label, short, return_type, description, source_ids, **extra):
    return {'key': key, 'label': label, 'shortLabel': short, 'returnType': return_type,
            'description': description, 'sourceIds': source_ids,
            'sourceUrl': URL[source_ids[0]] if source_ids else None, **extra}


us_assets = [
    asset('cash', '现金', '现金', 'zero-interest-cash', '无息现金余额，回报固定为 0%；不是历史银行存款利率。', []),
    asset('broad', '美国宽基', '美国宽基', 'total-return', '标普 500 含息指数：1986–2025 为 NYU 年度序列，2026 为 Vanguard 官方披露的同期标普基准回报。', ['nyu-sp500', 'vanguard'], proxy='S&P 500 total return', underlyingCurrency='USD'),
    asset('bond', '投资级债券', '投资级债券', 'total-return', 'FBNDX 美国投资级债券基金复权净值；包含政府、公司及抵押债券，并非纯国债。', ['fidelity', 'fund-nav'], proxy='FBNDX', underlyingCurrency='USD'),
    asset('gold', '黄金', '黄金', 'price-return / 2026 fund-total-return', '1986–2025 黄金美元价格回报；2026 改用 GLD 黄金 ETF 官方净值回报，已扣基金费用。', ['nyu-gold', 'gld-nav'], proxy='Gold price; 2026 GLD NAV', underlyingCurrency='USD'),
    asset('tech', '科技股', '科技股', 'total-return', 'French HiTec 美国科技研究组合，价值加权含息回报；不是单只可交易基金。', ['french', 'french-data'], proxy='French HiTec VW', underlyingCurrency='USD'),
    asset('consumer', '消费股', '消费股', 'total-return', 'French Cnsmr 美国消费研究组合，包含耐用品、非耐用品及零售，价值加权含息回报。', ['french', 'french-data'], proxy='French Cnsmr VW', underlyingCurrency='USD'),
    asset('health', '医疗股', '医疗股', 'total-return', 'French Hlth 美国医疗研究组合，价值加权含息回报；不是单只可交易基金。', ['french', 'french-data'], proxy='French Hlth VW', underlyingCurrency='USD'),
]
jp_assets = [
    asset('cash', '现金', '现金', 'zero-interest-cash', '无息日元现金余额，回报固定为 0%；不是历史银行存款利率。', []),
    asset('broad', '日本宽基', '日本宽基', 'price-return', '本土 TOPIX 价格指数代理，不含分红；与含息资产回报口径不同。', ['topix'], proxy='TOPIX', underlyingCurrency='JPY'),
]
for key in ['bond', 'gold', 'tech', 'consumer', 'health']:
    original = next(a for a in us_assets if a['key'] == key)
    labels = {'bond': '海外债券', 'gold': '黄金（日元）', 'tech': '海外科技股', 'consumer': '海外消费股', 'health': '海外医疗股'}
    jp_assets.append({**original, 'label': labels[key], 'shortLabel': labels[key],
                      'description': original['description'] + ' 全段以同一美联储汇率换算为日元，美元敞口未对冲；不是日本本土行业或债券指数。' if key != 'gold' else original['description'] + ' 按同一美元兑日元汇率换算，包含汇率变动。',
                      'sourceIds': original['sourceIds'] + ['fx'], 'fxHedged': False, 'overseas': key != 'gold'})
jp_assets.sort(key=lambda a: ASSET_KEYS.index(a['key']))
for a in jp_assets:
    if a['key'] not in domestic['series']: continue
    series = domestic['series'][a['key']]
    domestic_description = f"NEXT FUNDS {series['ticker']} 日本本土 TOPIX-17 行业 ETF 的日元含息净值，已包含基金费用，不进行外汇换算。"
    domestic_description += {'tech': '覆盖电机与精密仪器，并非美国科技行业的同口径替代。', 'consumer': '覆盖食品行业，并非全消费行业。', 'health': '覆盖医药品行业，并非所有医疗服务。'}[a['key']]
    a['segments'] = [
        {'from': 1986, 'to': 2008, 'label': a['label'], 'shortLabel': a['shortLabel'],
         'description': a['description'], 'proxy': a['proxy'], 'underlyingCurrency': 'USD',
         'overseas': True, 'fxHedged': False, 'returnType': 'total-return',
         'sourceIds': a['sourceIds'], 'sourceUrl': a['sourceUrl']},
        {'from': 2009, 'to': 2026, 'label': series['label'], 'shortLabel': series['label'],
         'description': domestic_description, 'proxy': f"NEXT FUNDS {series['ticker']}",
         'underlyingCurrency': 'JPY', 'overseas': False, 'fxHedged': None,
         'returnType': 'total-return', 'sourceIds': ['nomura-' + a['key']], 'sourceUrl': series['productUrl']},
    ]
META = {
    'us': {'id': 'us', 'label': '美国', 'name': '美国', 'currency': 'USD', 'currencySymbol': '$',
           'assets': us_assets, 'indices': [
               asset('indexA', '标普 500 价格指数', '标普500', 'price-return', 'S&P 500 收盘价格指数，不含分红；与配置卡标普含息收益分开比较。', ['fund-nav'], proxy='^GSPC'),
               asset('indexB', '纳斯达克综合指数', '纳斯达克', 'price-return', 'NASDAQ Composite 收盘价格指数，不含分红；不是纳斯达克 100。', ['fund-nav'], proxy='^IXIC'),
           ]},
    'jp': {'id': 'jp', 'label': '日本', 'name': '日本', 'currency': 'JPY', 'currencySymbol': '¥',
           'assets': jp_assets, 'indices': [
               asset('indexA', 'TOPIX 价格指数', 'TOPIX', 'price-return', '东京证券交易所 TOPIX 价格指数，不含分红。', ['topix'], proxy='TOPIX'),
               asset('indexB', '日经 225 价格指数', '日经225', 'price-return', 'Nikkei 225 收盘价格指数，不含分红。', ['fund-nav'], proxy='^N225'),
           ]},
}


def ratio(table, year):
    return table[str(year)]['value'] / table[str(year - 1)]['value'] - 1


def price_ratio(table, year):
    return table[str(year)] / table[str(year - 1)] - 1


market = {'us': {}, 'jp': {}}
for year in range(1986, 2027):
    is_partial = year == 2026
    sectors = source['frenchAnnualTotalReturns'].get(str(year))
    if is_partial:
        sectors = {key: math.prod(1 + month[key] for month in source['frenchMonthly2026TotalReturns'].values()) - 1
                   for key in ['tech', 'consumer', 'health']}
    gold = (source['gold2026GLDNetNAV'][CUTOFF] / source['gold2026GLDNetNAV']['2025-12-31'] - 1
            if is_partial else source['goldAnnualPriceReturns'][str(year)])
    us_returns = {'cash': 0, 'broad': source['sp5002026TotalReturn']['value'] if is_partial else source['sp500AnnualTotalReturns'][str(year)],
                  'bond': ratio(source['fundAdjustedNAV']['FBNDX'], year), 'gold': gold, **sectors}
    fx_change = ratio(source['yenPerUSD'], year)
    jp_returns = {key: ((1 + us_returns[key]) * (1 + fx_change) - 1) for key in ['bond', 'gold', 'tech', 'consumer', 'health']}
    jp_returns.update({'cash': 0, 'broad': price_ratio(source['topixLevels'], year)})
    domestic_periods = {}
    if year >= 2009:
        for key, series in domestic['series'].items():
            row = next(r for r in series['observations'] if r['year'] == year)
            assert row['asOf'] == (CUTOFF if is_partial else f'{year}-12-31')
            jp_returns[key] = row['endTotalReturnNAV'] / row['startTotalReturnNAV'] - 1
            assert abs(jp_returns[key] - row['return']) < 1e-12
            domestic_periods[key] = row['endObservation']
    benchmarks = {
        'us': {'indexA': ratio(source['priceIndexLevels']['^GSPC'], year), 'indexB': ratio(source['priceIndexLevels']['^IXIC'], year)},
        'jp': {'indexA': jp_returns['broad'], 'indexB': ratio(source['priceIndexLevels']['^N225'], year)},
    }
    for country, values in [('us', us_returns), ('jp', jp_returns)]:
        assert set(values) == set(ASSET_KEYS)
        assert all(math.isfinite(v) and v > -1 for v in list(values.values()) + list(benchmarks[country].values()))
        market[country][year] = {
            'year': year, 'currency': META[country]['currency'],
            'returns': {key: round(values[key], 12) for key in ASSET_KEYS},
            'benchmarks': {key: round(value, 12) for key, value in benchmarks[country].items()},
            'asOf': CUTOFF if is_partial else f'{year}-12-31',
            'isPartial': is_partial, 'periodFraction': 273 / 365 if is_partial else 1,
            'dataKind': 'historical-ytd' if is_partial else 'historical',
            'goldProxy': 'GLD official NAV, net of fund expenses' if is_partial else 'NYU USD gold price return',
            'sectorProxy': ('Nomura domestic TOPIX-17 ETFs 1625/1617/1621 / JPY total return' if country == 'jp' and year >= 2009
                            else 'French 5 Industry VW / 202609 CRSP' + (' / JPY unhedged' if country == 'jp' else '')),
            'sourceAsOf': {'broadPeriod': CUTOFF if is_partial else f'{year}-12-31',
                           'bond': source['fundAdjustedNAV']['FBNDX'][str(year)]['observationDate'],
                           'indicesPeriod': f'{year}-09' if is_partial else f'{year}-12',
                           'fx': source['yenPerUSD'][str(year)]['observationDate']},
        }
        if country == 'jp' and domestic_periods:
            market[country][year]['sourceAsOf']['domesticSectors'] = domestic_periods

output = '// Generated by scripts/build-atlas-market.py from the checked numeric source extract.\n'
output += '// 1986 supplies prior-year briefing only; playable years are 1987–2026. 2026 is real YTD through September 30.\n'
for name, value in [('DATA_VERSION', DATA_VERSION), ('MARKET_META', META), ('MARKET_SOURCES', SOURCES), ('MARKET_DATA', market)]:
    output += f'export const {name} = ' + json.dumps(value, ensure_ascii=False, indent=2) + ';\n'
output += '''
// Use the instrument available for this period in cards, model materials and ledgers.
export function getMarketAssets(country, year) {
  const id = typeof country === 'string' ? country : country?.id;
  if (!MARKET_META[id] || !Number.isInteger(year) || year < 1986 || year > 2026) throw new Error('无效市场或年份。');
  return MARKET_META[id].assets.map(asset => {
    const { segments, ...base } = asset;
    const segment = segments?.find(s => year >= s.from && year <= s.to);
    return segment ? { ...base, ...segment } : { ...base };
  });
}
'''
(ROOT / 'dist/atlas-market-data.js').write_text(output)
print(f'Wrote {len(market["us"])} observations per country; cutoff {CUTOFF}; all seven assets and two benchmarks complete.')
print('2026 US:', market['us'][2026]['returns'])
print('2026 JP:', market['jp'][2026]['returns'])
