#!/usr/bin/env python3
"""Extract the 1986–2026 observation window from downloaded public sources.

Raw files remain research inputs, not copies redistributed by the game.
Exact URLs, source hashes, compact numeric observations and the offline builder
are retained in scripts/atlas-sources. See docs/ATLAS-DATA.md.
"""
import argparse
import csv
from datetime import datetime
from html.parser import HTMLParser
import hashlib
import io
import json
from pathlib import Path
from zoneinfo import ZoneInfo
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--nyu-file', type=Path, required=True)
args = parser.parse_args()
SRC = args.source_dir
OUT = ROOT / 'scripts/atlas-sources'
OUT.mkdir(exist_ok=True)
CUTOFF = '2026-09-30'
YEAR_RANGE = range(1985, 2027)
manifest = []


def read(name, url, note='', path=None):
    p = path or SRC / name
    b = p.read_bytes()
    manifest.append({'localResearchFile': name, 'url': url, 'retrievedAt': '2026-11-25',
                     'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'note': note})
    return b


class Rows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.row = None; self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th'): self.cell = ''
    def handle_data(self, data):
        if self.cell is not None: self.cell += data
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            if self.row is not None: self.row.append(' '.join(self.cell.split()))
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None


funds = {}
indices = {}
for symbol, filename, daily, adjusted in [
    ('FBNDX', 'FBNDX-daily.raw', True, True),
    ('^GSPC', 'GSPC.raw', False, False), ('^IXIC', 'IXIC.raw', False, False),
    ('^N225', 'N225.raw', False, False),
]:
    interval = '1d' if daily else '1mo'
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol.replace("^", "%5E")}?period1=473385600&period2=1790812800&interval={interval}'
    x = json.loads(read(filename, url, 'Adjusted NAV for funds; unadjusted closing levels for price indices.'))['chart']['result'][0]
    values = x['indicators']['adjclose'][0]['adjclose'] if adjusted else x['indicators']['quote'][0]['close']
    endpoints = {}
    for timestamp, value in zip(x['timestamp'], values):
        d = datetime.fromtimestamp(timestamp, ZoneInfo(x['meta']['exchangeTimezoneName']))
        if value is None or d.year not in YEAR_RANGE or d.strftime('%Y-%m-%d') > CUTOFF: continue
        if not daily and not (d.month == 12 or (d.year == 2026 and d.month == 9)): continue
        endpoints[d.year] = {'value': value if adjusted else round(value, 2),
                             'observationDate': d.strftime('%Y-%m-%d') if daily else None,
                             'month': d.strftime('%Y-%m'),
                             'timestampMeaning': 'trading-session' if daily else 'month-start timestamp, month-end closing level'}
    assert set(endpoints) == set(YEAR_RANGE), (symbol, sorted(endpoints))
    (funds if adjusted else indices)[symbol] = endpoints


def estat(cycle, name):
    url = f'https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=0702020590000090010&Cycle={cycle}&RegionCode=00000&Limit=0'
    x = json.loads(read(name, url, 'TOPIX closing level, price index.'))
    return {r['VALUE']['@time']: float(r['VALUE']['$']) for r in x['GET_STATS']['STATISTICAL_DATA']['DATA_INF']['DATA_OBJ']}


ta = estat(3, 'topix-annual.raw')
tm = estat(1, 'topix-monthly.raw')
topix = {y: ta[f'{y}CY00'] for y in range(1985, 2026)}
topix[2026] = tm['20260900']

fx = {}
for filename, suffix in [('fx-89.raw', '89'), ('fx-96.raw', '96'), ('fx-00.raw', '00')]:
    url = f'https://www.federalreserve.gov/releases/h10/hist/dat{suffix}_ja.htm'
    p = Rows(); p.feed(read(filename, url, 'New York noon buying rates; Japanese yen per US dollar.').decode(errors='replace'))
    for r in p.rows:
        if len(r) < 2: continue
        try: d = datetime.strptime(r[0], '%d-%b-%y'); value = float(r[1])
        except ValueError: continue
        if d.year in YEAR_RANGE and d.strftime('%Y-%m-%d') <= CUTOFF:
            if d.strftime('%Y-%m-%d') > fx.get(d.year, {}).get('observationDate', ''):
                fx[d.year] = {'value': value, 'observationDate': d.strftime('%Y-%m-%d')}
assert set(fx) == set(YEAR_RANGE)

french_zip = read('french.raw', 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/5_Industry_Portfolios_CSV.zip',
                  'Official September 2026 CRSP vintage; value-weighted, not equal-weighted.')
with zipfile.ZipFile(io.BytesIO(french_zip)) as z:
    french_text = z.read(z.namelist()[0]).decode('utf-8-sig')
assert '202609 CRSP' in french_text
french_annual = {}; french_monthly_2026 = {}; mode = None
for row in csv.reader(io.StringIO(french_text)):
    if not row: continue
    title = row[0].strip()
    if title.startswith('Average Value Weighted Returns -- Monthly'): mode = 'monthly'; continue
    if title.startswith('Average Value Weighted Returns -- Annual'): mode = 'annual'; continue
    if title.startswith('Average Equal Weighted') or title.startswith('Number of Firms'): mode = None
    if mode is None or not title.isdigit() or len(row) != 6: continue
    date = int(title)
    values = {'consumer': float(row[1]) / 100, 'tech': float(row[3]) / 100, 'health': float(row[4]) / 100}
    assert all(v > -0.999 for v in values.values()), (date, values)
    if mode == 'annual' and 1986 <= date <= 2025: french_annual[date] = values
    if mode == 'monthly' and 202601 <= date <= 202609: french_monthly_2026[date] = values
assert len(french_annual) == 40 and len(french_monthly_2026) == 9

p = Rows(); p.feed(read('nyu.txt', 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html',
                        'Gold annual US-dollar price returns, not gold-miner shares.', args.nyu_file).decode(errors='replace'))
gold = {int(r[0]): float(r[7].rstrip('%')) / 100 for r in p.rows
        if len(r) > 7 and r[0].isdigit() and 1986 <= int(r[0]) <= 2025}
assert len(gold) == 40
sp500 = {int(r[0]): float(r[1].rstrip('%')) / 100 for r in p.rows
         if len(r) > 7 and r[0].isdigit() and 1986 <= int(r[0]) <= 2025}
assert len(sp500) == 40
read('vanguard-202609.pdf', 'https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0040.pdf',
     'Official 2026-09-30 factsheet, page 1: S&P 500 Benchmark YTD 12.75%; fund row is not used.')
read('fidelity-202608.pdf', 'https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/SHDOCS/FBNDX/hosts/sh_comm_pmqa.000026.RETAIL_pdf.pdf',
     'Independent recent-return check: FBNDX trailing year through 2026-08-31 = 1.54%, net of fees.')

# The official archive has removed licensed LBMA prices. Use the published GLD
# NAV itself, and explicitly label the 2026 change to a net-of-fees fund proxy.
gld_bytes = read('gld-official.xlsx', 'https://api.spdrgoldshares.com/api/v1/historical-archive?exchange=NYSE&lang=en&product=gld',
                 'Only two NAV/share facts retained; the original workbook is not redistributed. LBMA gold prices are not present.')
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
gld = {}
with zipfile.ZipFile(io.BytesIO(gld_bytes)) as z:
    strings = [''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
    for row in ET.fromstring(z.read('xl/worksheets/sheet2.xml')).findall('.//s:row', ns):
        cells = {}
        for c in row.findall('s:c', ns):
            v = c.find('s:v', ns)
            if v is not None:
                cells[''.join(filter(str.isalpha, c.get('r')))] = strings[int(v.text)] if c.get('t') == 's' else v.text
        if cells.get('A') in ['31-Dec-2025', '30-Sep-2026']:
            gld[datetime.strptime(cells['A'], '%d-%b-%Y').strftime('%Y-%m-%d')] = float(cells['D'])
assert len(gld) == 2

extract = {'retrievedAt': '2026-11-25', 'cutoff': CUTOFF,
           'fundAdjustedNAV': funds, 'priceIndexLevels': indices, 'topixLevels': topix,
           'yenPerUSD': fx, 'goldAnnualPriceReturns': gold, 'gold2026GLDNetNAV': gld,
           'sp500AnnualTotalReturns': sp500,
           'sp5002026TotalReturn': {'value': 0.1275, 'asOf': CUTOFF,
               'sourceUrl': 'https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0040.pdf',
               'location': 'Page 1, Total returns, Benchmark, Year to date (September 30, 2026)',
               'note': 'S&P 500 benchmark total return, not the VFINX fund return.'},
           'frenchVintage': '202609 CRSP', 'frenchAnnualTotalReturns': french_annual,
           'frenchMonthly2026TotalReturns': french_monthly_2026}
(OUT / 'observations.json').write_text(json.dumps(extract, ensure_ascii=False, indent=2) + '\n')
(OUT / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print('Extracted 42 endpoint years, 40 complete annual returns and nine months of 2026; no missing values filled.')
