import test from 'node:test';
import assert from 'node:assert/strict';
import { lineChart } from '../dist/atlas-charts.js';

test('the real break-even line is level while its date-specific readout reports inflation', () => {
  const labels = [2024, 2025, '2026-09-30'];
  const series = [
    {id:'player', name:'你', color:'#08775e', values:[100, 95, null]},
    {id:'cpi', name:'购买力持平线', color:'#356b70', values:[100, 100, 100],
      readoutName:'同期累计通胀', readoutValues:[100, 109, 112]},
  ];
  const render = (point, hidden=new Set()) => lineChart(series, labels, hidden, point, false, {cumulative:true});
  const atEnd = render(2);
  assert.match(atEnd, /data-result="player"[^<]*<i[^>]*><\/i>你 <b>—<\/b>/);
  assert.match(atEnd, /同期累计通胀 <b data-cpi-change>\+12\.0%/);
  assert.match(atEnd, /aria-valuetext="2026-09-30"/);
  const coordinates = /data-line="cpi" d="([^"]+)"/.exec(atEnd)[1].match(/,[\d.]+/g);
  assert.equal(coordinates.length, labels.length);
  assert.equal(new Set(coordinates).size, 1);
  assert.match(render(1), /你 <b>-5\.0%/);
  assert.match(render(1), /同期累计通胀 <b data-cpi-change>\+9\.0%/);
  assert.doesNotMatch(render(1, new Set(['cpi'])), /data-line="cpi"|data-cpi-change/);
  assert.match(lineChart(series.slice(0,1), labels, new Set(), 1), /你 <b>95\.0<\/b>/);
});
