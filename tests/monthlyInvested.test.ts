// Invested each month, from the daily log. The fixture plus a made-up log.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { DAILY_TAB, changesSince, isPending } from '../src/lib/dailyLog';
import { isoToSerial, n0, type Cell } from '../src/lib/format';
import { buildModel } from '../src/lib/model';
import { monthlyInvested } from '../src/lib/monthlyInvested';
import type { Fixture } from '../src/lib/demoSheets';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const withFixture = test.skipIf(!existsSync(FIX));
const HEAD = ['Date', 'Line', 'Invested (INR)', 'Current (INR)'];

function model(rows: Cell[][]) {
  const f = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  for (const t of ['eToro Feed', 'IBKR Feed']) { delete f.values[t]; delete f.formulas[t]; }
  f.values[DAILY_TAB] = [HEAD, ...rows];
  f.formulas[DAILY_TAB] = [HEAD, ...rows];
  return buildModel(f.values, f.formulas);
}

withFixture('each month is the rise from the end of the month before; the current month runs to today', () => {
  const m0 = model([]);
  const mf = m0.rows.networth.find((r) => /mutual fund/i.test(String(r.asset)))!;
  const live = n0(mf.invested);
  const m = model([
    ['2026-10-11', String(mf.asset), live - 160000, 1],
    ['2026-10-31', String(mf.asset), live - 110000, 1],
    ['2026-11-02', String(mf.asset), live - 10000, 1],
    ['2026-11-01', 'Invested: eToro (USD)', 1000, ''],
    ['2026-11-02', 'Invested: eToro (USD)', 1250, ''],
  ]);
  const out = monthlyInvested(m, isoToSerial('2026-11-03'))!;
  assert.deepEqual(out.series.map((s) => [s.key, s.currency]), [['mf', 'INR'], ['eToro', 'USD']]);
  assert.deepEqual(out.months.map((r) => r.month), ['2026-11', '2026-10'], 'newest first');

  const [nov, oct] = out.months;
  assert.equal(nov.current, true);
  assert.equal(nov.values.mf, 110000, 'from the end of October to today\'s live figure');
  assert.equal(nov.values.eToro, 250, 'the log began in November: from its first day');
  assert.equal(oct.values.mf, 50000);
  assert.equal(oct.from.mf, isoToSerial('2026-10-11'), 'October counts from when the log began');
  assert.equal(oct.values.eToro, null, 'no eToro figures in October');
});

withFixture('broker totals in the log are not Net Worth lines', () => {
  const m0 = model([]);
  const rows = m0.rows.networth.map((r) => ['2026-05-09', String(r.asset), r.invested, r.current] as Cell[]);
  const m = model([...rows, ['2026-05-09', 'Invested: IBKR (USD)', 5000, '']]);
  assert.deepEqual(m.daily[0].brokers, { IBKR: { amount: 5000, currency: 'USD' } });
  const ch = changesSince(m, isoToSerial('2026-05-10'));
  assert.ok(ch && !isPending(ch));
  assert.ok(!ch.lines.some((l) => /invested:/i.test(l.asset)), 'not listed as a removed line');
});

withFixture('without a log there is no card', () => {
  const f = JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
  delete f.values[DAILY_TAB];
  assert.equal(monthlyInvested(buildModel(f.values, f.formulas)), null);
});
