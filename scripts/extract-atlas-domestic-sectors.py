#!/usr/bin/env python3
"""Extract checked Japanese sector ETF returns from official Nomura CSVs."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = {'retrievedAt': '2026-11-25', 'firstCompleteYear': 2009,
       'method': 'Issuer dividend-included NAV; previous year-end to year-end, 2026 to September 30; JPY, no FX conversion.', 'series': {}}
for key, ticker, label in [('tech', '1625', '日本电机精密'), ('consumer', '1617', '日本食品股'), ('health', '1621', '日本医药股')]:
    name = f'ETF_{ticker}.csv'
    raw = (args.source_dir / name).read_bytes()
    rows = list(csv.reader(io.StringIO(raw.decode('cp932'))))
    header = next(i for i, r in enumerate(rows) if r and r[0] == 'Date')
    assert rows[header][6] == 'ETF Net Asset Value (per Share) (Dividend-included)'
    observations = []; endpoints = {}; prev = None; max_error = 0; daily_factors = {}
    for r in rows[header + 1:]:
        if not r or len(r) < 7 or not r[0].isdigit(): continue
        d = f'{r[0][:4]}-{r[0][4:6]}-{r[0][6:8]}'; year = int(d[:4]); nav = float(r[6])
        if prev is not None and r[5]:
            daily = float(r[5]); error = abs(nav / prev - 1 - daily); max_error = max(max_error, error)
            assert error < 1e-10, (ticker, d, error)
            if d <= '2026-09-30': daily_factors.setdefault(year, []).append(1 + daily)
        prev = nav
        if d <= '2026-09-30': endpoints[year] = {'date': d, 'nav': nav}
    assert set(endpoints) == set(range(2008, 2027))
    for year in range(2009, 2027):
        start, end = endpoints[year-1], endpoints[year]
        value = end['nav'] / start['nav'] - 1
        assert abs(math.prod(daily_factors[year]) - 1 - value) < 1e-10
        observations.append({'year': year, 'asOf': '2026-09-30' if year == 2026 else f'{year}-12-31',
                             'startObservation': start['date'], 'endObservation': end['date'],
                             'startTotalReturnNAV': start['nav'], 'endTotalReturnNAV': end['nav'], 'return': value})
    out['series'][key] = {'ticker': ticker, 'label': label, 'productUrl': f'https://nextfunds.jp/lineup/{ticker}/',
                          'sourceUrl': f'https://www.nomura-am.co.jp/fund/etf/history/{name}',
                          'sourceFile': name, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                          'returnType': 'total-return', 'currency': 'JPY', 'maxDailyIdentityError': max_error,
                          'observations': observations}
(root / 'scripts/atlas-sources/jp-domestic-sectors.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print('Verified 54 domestic ETF periods (2009–2026), daily-return identities and annual compounding; no synthetic 2008 full year.')
