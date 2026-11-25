#!/usr/bin/env python3
"""Reproduce the short-rate comparison proxy; never change investment returns."""
from pathlib import Path
import json, hashlib, math
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'scripts/history30-sources'
manifest=json.loads((SRC/'rates-manifest.json').read_text())
rates={}
for country in ['us','jp']:
    path=SRC/f'rates-{country}.json'
    assert hashlib.sha256(path.read_bytes()).hexdigest()==manifest['files'][path.name]['sha256']
    data=json.loads(path.read_text())
    rows=data['observations']
    assert len(rows)==360 and len({r['date'] for r in rows})==360
    annual={}
    for year in range(1995,2025):
        group=[r for r in rows if r['date'].startswith(str(year)+'-')]
        assert [r['date'] for r in group]==[f'{year}-{month:02}-01' for month in range(1,13)]
        assert all(math.isfinite(r['percent']) for r in group)
        annual[year]=round(sum(r['percent'] for r in group)/1200,12)
    rates[country]=annual
(ROOT/'dist/history30-rates.js').write_text('// Annual mean of 12 OECD/FRED monthly quoted overnight rates; not investable total returns.\n'
    +'export const RISK_FREE_RATES = '+json.dumps(rates,ensure_ascii=False,indent=2)+';\n'
    +'export const RISK_FREE_SOURCE = '+json.dumps(manifest['metadata'],ensure_ascii=False,indent=2)+';\n')
print('Verified 720 monthly observations and snapshot hashes; rebuilt 60 annual reference rates.')
