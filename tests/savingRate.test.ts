// Saving against income. Made-up income and log; the fixture's other tabs.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { DAILY_TAB } from '../src/lib/dailyLog';
import { isoToSerial, n0, type Cell } from '../src/lib/format';
import { INCOME_TAB, readIncome } from '../src/lib/income';
import { buildModel } from '../src/lib/model';
import { savingByMonth } from '../src/lib/savingRate';
import type { Fixture } from '../src/lib/demoSheets';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));

test('income is read by month: extra lines add to their month, a blank year carries on', () => {
  const income = readIncome([
    ['Monthly Income (AED)'], [],
    ['Year', 'Month / Note', 'Amount (AED)'],
    ['2026', 'Feb', 1000],
    ['', 'Mar', 1000],
    ['2026', 'Mar - Bonus', 500],
    ['', 'Joining Bonus', 200], // no month named: the month of the row above
    [2026, 'Apr', 1100],
    ['', 'Apr — Final Sett.', 50],
    ['', 'TOTAL (all periods)', 3850],
    ['2027', 'Jan', 999], // below the total: not part of the list
  ]);
  assert.deepEqual([...income], [['2026-02', 1000], ['2026-03', 1700], ['2026-04', 1150]]);
  assert.equal(readIncome(undefined).size, 0);
});

withFixture('each month compares its net worth change and money put away with its income', () => {
  const f = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  const set = (tab: string, rows: Cell[][]) => { f.values[tab] = rows; f.formulas[tab] = rows; };
  const m0 = buildModel(f.values, f.formulas);
  const rate = n0(m0.cells.fxAedInr?.value);
  set(INCOME_TAB, [['Year', 'Month / Note', 'Amount (AED)'], ['2026', 'Sep', 10000], ['', 'Oct', 10000]]);
  // Put away: invested on 30 Sep and 31 Oct; UAE holdings are revalued at today's rate
  const india = m0.rows.networth.find((r) => r.location === 'India')!;
  const uae = m0.rows.networth.find((r) => r.location === 'UAE')!;
  set(DAILY_TAB, [
    ['Date', 'Line', 'Invested (INR)', 'Current (INR)'],
    ['2026-09-30', String(india.asset), 100000, 1], ['2026-09-30', String(uae.asset), 50 * rate, 1], ['2026-09-30', 'Rate: AED → INR', '', rate],
    // October: 20,000 more in India; the UAE holding unchanged in AED, though the rate rose 10%
    ['2026-10-31', String(india.asset), 120000, 1], ['2026-10-31', String(uae.asset), 50 * rate * 1.1, 1], ['2026-10-31', 'Rate: AED → INR', '', rate * 1.1],
  ]);
  const months = savingByMonth(buildModel(f.values, f.formulas), isoToSerial('2026-11-03'))!;
  const oct = months.find((m) => m.month === '2026-10')!;
  assert.equal(Math.round(oct.putAway!), 20000, 'the rate rise is not counted as saving');
  assert.equal(oct.incomeAed, 10000);
  assert.ok(Math.abs(oct.incomeInr! - 10000 * rate) < 0.01);
  assert.equal(months.find((m) => m.month === '2026-09')?.putAway ?? null, null, 'no day before September to start from');
  assert.equal(months[0].month, '2026-11', 'newest first, this month included');
  assert.ok(months.some((m) => m.netWorth !== null), 'net worth change from the trend');
});

withFixture('without an Income tab there is no card', () => {
  const f = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  delete f.values[INCOME_TAB];
  assert.equal(savingByMonth(buildModel(f.values, f.formulas)), null);
});

test('the Year | Month | Type | Description | Amount layout, with TOTAL in any column', () => {
  const head = ['Year', 'Month', 'Type', 'Description', 'Amount (AED)'];
  const rows: (string | number)[][] = [
    ['Monthly Income (AED)'],
    ['Income log — add new entries above the TOTAL row. Type: Salary / Bonus / Other'],
    [],
    head,
    [2026, 'Feb', 'Salary', '', 1000],
    [2026, 'Mar', 'Salary', '', 1000],
    [2026, 'Mar', 'Bonus', 'Annual bonus', 500],
    [2026, 'Apr', 'Other', 'Total settlement from old job', 50], // a month's own row, though it says total
  ];
  for (const [label, total] of [['TOTAL in Year', ['TOTAL', '', '', '', 2550]], ['TOTAL in Description', ['', '', '', 'TOTAL (all periods)', 2550]], ['TOTAL in Month', ['', 'TOTAL', '', '', 2550]]] as const) {
    const income = readIncome([...rows, [...total], [2027, 'Jan', 'Salary', '', 999]]);
    assert.deepEqual([...income], [['2026-02', 1000], ['2026-03', 1500], ['2026-04', 50]], label);
  }
});
