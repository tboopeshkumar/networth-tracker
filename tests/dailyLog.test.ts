// "What changed since the last daily record". Pure parts use made-up data;
// the rest derives its expectations from the fixture at run time.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { runChecks } from '../src/lib/checks';
import { DAILY_TAB, changesSince, readDailyLog } from '../src/lib/dailyLog';
import { isoToSerial, n0, type Cell } from '../src/lib/format';
import { buildModel } from '../src/lib/model';
import type { Fixture } from '../src/lib/demoSheets';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));
const fixture = (): Fixture => JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
const HEAD = ['Date', 'Line', 'Invested (INR)', 'Current (INR)'];

test('the log is read day by day, rates apart from lines', () => {
  const days = readDailyLog([
    HEAD,
    ['2026-03-02', 'Line A', 100, 130],
    ['2026-03-01', 'Line A', 100, 120],
    ['2026-03-01', 'Line B', '', 500],
    ['2026-03-01', 'Rate: AED → INR', '', 25.5],
    ['not a date', 'Line C', 1, 1],
    [isoToSerial('2026-03-03') + 0.5, 'Line A', 100, 140], // a cell reformatted as a date-time still reads
  ]);
  assert.deepEqual(days.map((d) => d.day), ['2026-03-01', '2026-03-02', '2026-03-03'].map(isoToSerial), 'oldest first');
  assert.deepEqual(days[0].lines, { 'Line A': { invested: 100, current: 120 }, 'Line B': { invested: null, current: 500 } });
  assert.deepEqual(days[0].rates, { 'AED → INR': 25.5 });
  assert.deepEqual(readDailyLog(undefined), []);
  assert.deepEqual(readDailyLog([['Something else']]), []);
});

/** The fixture as a sheet that keeps no log, whether or not the local copy has one. */
function noLog() {
  const f = fixture();
  delete f.values[DAILY_TAB];
  delete f.formulas[DAILY_TAB];
  return f;
}
const plainModel = () => buildModel(noLog().values, noLog().formulas);

/** The fixture with a Daily Log tab holding the given rows. */
function withLog(rows: Cell[][]) {
  const f = fixture();
  f.values[DAILY_TAB] = [HEAD, ...rows];
  f.formulas[DAILY_TAB] = [HEAD, ...rows];
  return buildModel(f.values, f.formulas);
}

withFixture('without a log there is nothing to compare; with only today there is nothing yet', () => {
  const plain = plainModel();
  assert.deepEqual(plain.daily, []);
  assert.equal(changesSince(plain), null);

  const today = isoToSerial('2026-05-10');
  const m = withLog(plain.rows.networth.map((r) => ['2026-05-10', String(r.asset), r.invested, r.current]));
  assert.equal(changesSince(m, today), 'first');
  // The same rows read the next day are yesterday's: nothing has moved
  const next = changesSince(m, today + 1);
  assert.ok(next && next !== 'first');
  assert.deepEqual([next.lines.length, Math.round(next.invested), Math.round(next.current), next.rates.length], [0, 0, 0, 0]);
});

withFixture('each moved line is reported, and the parts add up to the change in the totals', () => {
  const plain = plainModel();
  const [a, b, c, ...rest] = plain.rows.networth;
  const rate = n0(plain.cells.fxAedInr?.value);
  const day = '2026-05-09';
  const m = withLog([
    ['2026-05-01', String(a.asset), 1, 1], // an older day is not the one compared against
    [day, String(a.asset), a.invested, n0(a.current) - 1000], // worth 1,000 more today
    [day, String(b.asset), n0(b.invested) + 500, n0(b.current) + 500], // 500 taken out
    // c is missing from that day: a new line since
    ...rest.map((r) => [day, String(r.asset), r.invested, n0(r.current) + 0.4] as Cell[]), // under a rupee: not a change
    [day, 'A line that was removed', 700, 900],
    [day, 'Rate: AED → INR', '', rate - 0.05],
  ]);
  const ch = changesSince(m, isoToSerial('2026-05-10'));
  assert.ok(ch && ch !== 'first');
  assert.equal(ch.since, isoToSerial(day));

  const by = Object.fromEntries(ch.lines.map((x) => [x.asset, x]));
  assert.deepEqual(Object.keys(by).sort(), [String(a.asset), String(b.asset), String(c.asset), 'A line that was removed'].sort());
  assert.deepEqual([by[String(a.asset)].status, Math.round(by[String(a.asset)].invested), Math.round(by[String(a.asset)].current)], ['changed', 0, 1000]);
  assert.deepEqual([Math.round(by[String(b.asset)].invested), Math.round(by[String(b.asset)].current)], [-500, -500]);
  assert.deepEqual([by[String(c.asset)].status, by[String(c.asset)].current], ['new', n0(c.current)]);
  assert.deepEqual([by['A line that was removed'].status, by['A line that was removed'].row, by['A line that was removed'].current], ['gone', null, -900]);

  // Largest move first
  const sizes = ch.lines.map((x) => Math.max(Math.abs(x.current), Math.abs(x.invested)));
  assert.deepEqual(sizes, [...sizes].sort((x, y) => y - x));

  const sum = (f: 'invested' | 'current') => plain.rows.networth.reduce((t, r) => t + n0(r[f]), 0);
  assert.ok(Math.abs(ch.current - (sum('current') - (sum('current') - n0(c.current) - 1000 + 500 + rest.length * 0.4 + 900))) < 0.01, 'current');
  assert.ok(Math.abs(ch.invested - (sum('invested') - (sum('invested') - n0(c.invested) + 500 + 700))) < 0.01, 'invested');

  assert.equal(ch.rates.length, 1);
  assert.ok(Math.abs(ch.rates[0].to - ch.rates[0].from - 0.05) < 1e-9);
});

withFixture('a log that stopped recording is flagged', () => {
  const plain = plainModel();
  const m = withLog([['2020-01-01', String(plain.rows.networth[0].asset), 1, 1]]);
  assert.ok(runChecks(m, fixture().values, true).some((c) => c.id === 'daily-log'));
  assert.ok(!runChecks(plain, noLog().values, true).some((c) => c.id === 'daily-log'), 'no log, no nag');
});
