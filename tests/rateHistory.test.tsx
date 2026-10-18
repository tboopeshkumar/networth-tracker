// The Rates History tab and the price charts drawn from it. Made-up data.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'vitest';

import { PriceMovements } from '../src/components/dashboard/PriceMovements';
import { isoToSerial, todaySerial } from '../src/lib/format';
import { buildModel } from '../src/lib/model';
import { HISTORY_TAB, lastDays, readRateHistory } from '../src/lib/rateHistory';
import type { Fixture } from '../src/lib/demoSheets';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const HEAD = ['Date', 'AED → INR', 'Gold 22C (₹/g)', 'Gold 999 (₹/g)'];

test('each rate column becomes its own series, blanks skipped, oldest first', () => {
  const h = readRateHistory([
    HEAD,
    ['2026-10-02', 26.1, 13600, ''],
    ['2026-10-01', 26.0, 13650, 14800],
    ['not a date', 1, 1, 1],
  ]);
  assert.deepEqual(h['AED → INR'].map((p) => p.value), [26.0, 26.1]);
  assert.deepEqual(h['Gold 999 (₹/g)'], [{ day: isoToSerial('2026-10-01'), value: 14800 }]);
  assert.deepEqual(readRateHistory(undefined), {});
  const today = isoToSerial('2026-10-31');
  assert.deepEqual(lastDays(h['AED → INR'], 30, today).map((p) => p.value), [26.1], 'the 1st is 30 days back: outside');
});

test.skipIf(!existsSync(FIX))('the card appears with two days of history and not before', () => {
  const f = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  const day = (n: number) => { const d = new Date(Date.UTC(1899, 11, 30) + (todaySerial() - n) * 864e5); return d.toISOString().slice(0, 10); };
  const render = (rows: (string | number)[][]) => {
    f.values[HISTORY_TAB] = [HEAD, ...rows];
    f.formulas[HISTORY_TAB] = [HEAD, ...rows];
    return renderToStaticMarkup(<PriceMovements model={buildModel(f.values, f.formulas)} />);
  };
  assert.equal(render([[day(0), 26.1, 13600, '']]), '', 'one day is not a movement');
  const html = render([[day(2), 26.0, 13700, ''], [day(1), 26.05, 13650, ''], [day(0), 26.1, 13600, '']]);
  assert.ok(html.includes('Price movements'));
  assert.ok(html.includes('AED → INR'));
  assert.ok(/since/.test(html));
  assert.ok(html.includes('Daily values'), 'a table view of the same numbers');
});
