// "Worth a look" hears about sheet scripts that failed, and about holdings
// left without a price, whatever the cause. Made-up data, plus the fixture.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { runChecks } from '../src/lib/checks';
import { STATUS_TAB, readFeedStatus } from '../src/lib/feedStatus';
import { todaySerial } from '../src/lib/format';
import { buildModel } from '../src/lib/model';
import type { Fixture } from '../src/lib/demoSheets';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));
const fixture = (): Fixture => JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
const HEAD = ['Feed', 'Status', 'Message', 'Last run', 'Last success'];

test('the Feed Status tab is read row by row', () => {
  const runs = readFeedStatus([
    HEAD,
    ['NPS NAVs', 'Error', 'NPS Trust returned HTTP 503', 46300.2, 46299.2],
    ['Gold & AED rates', 'OK', '', 46300.4, 46300.4],
    ['eToro', 'warning', 'No live price for BBB', 46300.1, 46300.1],
    ['', 'OK', '', 1, 1],
    ['Something', 'Unknown', '', 1, 1],
  ]);
  assert.deepEqual(runs.map((r) => [r.feed, r.status]), [['NPS NAVs', 'Error'], ['Gold & AED rates', 'OK'], ['eToro', 'Warning']]);
  assert.equal(runs[0].lastSuccess, 46299.2);
  assert.deepEqual(readFeedStatus(undefined), []);
});

/** The fixture with a Feed Status tab, and a made-up NPS scheme table whose values are given. */
function model(rows: (string | number)[][], npsValues: number[] = [1000, 2000]) {
  const f = fixture();
  f.values[STATUS_TAB] = [HEAD, ...rows];
  f.formulas[STATUS_TAB] = [HEAD, ...rows];
  const start = f.values.NPS.length + 2;
  const table = [
    ['Scheme ID', 'Scheme', 'Units', 'NAV', 'Value', 'NAV date'],
    ...npsValues.map((v, i) => [`SM00000${i + 1}`, `Example Scheme ${i + 1}`, 100, v / 100, v, 46288]),
  ];
  table.forEach((r, i) => { f.values.NPS[start + i] = r; f.formulas.NPS[start + i] = r; });
  return { m: buildModel(f.values, f.formulas), values: f.values };
}

withFixture('a failed or partly failed feed is flagged; a healthy one is not', () => {
  const today = todaySerial();
  const { m, values } = model([
    ['NPS NAVs', 'Error', 'NPS Trust returned HTTP 503', today, today - 2],
    ['eToro', 'Warning', 'No live price for BBB', today, today],
    ['Gold & AED rates', 'OK', '', today, today],
    ['IBKR', 'OK', '', today - 6, today - 6],
  ]);
  const ids = runChecks(m, values, true).map((c) => c.id);
  assert.ok(ids.includes('feed-NPS NAVs'));
  assert.ok(ids.includes('feed-eToro'));
  assert.ok(!ids.includes('feed-Gold & AED rates'));
  assert.ok(ids.includes('feed-stopped-IBKR'), 'a feed that stopped running');
  const nps = runChecks(m, values, true).find((c) => c.id === 'feed-NPS NAVs')!;
  assert.match(nps.detail, /HTTP 503.*are kept/);
});

withFixture('NPS schemes with units but no value are flagged, with or without a Feed Status tab', () => {
  const { m, values } = model([], [0, 2000]);
  const check = runChecks(m, values, true).find((c) => c.id === 'nps-unpriced');
  assert.ok(check, 'flagged');
  assert.match(check.title, /1 scheme that has units/);
  assert.match(check.detail, /Example Scheme 1/);
  const priced = model([]);
  assert.ok(!runChecks(priced.m, priced.values, true).some((c) => c.id === 'nps-unpriced'), 'not when priced');
});
