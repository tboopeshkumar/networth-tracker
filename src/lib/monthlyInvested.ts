// What went into each platform each month, from the nightly Daily Log: the
// rise in its total invested from the end of one month to the end of the
// next. Mutual funds come from the Net Worth line (rupees); eToro and IBKR
// from their feeds' totals (their own currency, usually USD). The current
// month runs to today's live figures.
//
// It's the change in "invested", not a ledger of transfers: for a broker it
// also moves with profit from a sale left in the account, and for funds it
// moves when the Mutual Funds tab's Invested column is updated. Where the
// sheet has IBKR's actual deposits (the IBKR Deposits tab), IBKR's months are
// those instead: money in minus money out, nothing else.

import { isoToSerial, n0, serialToIso, todaySerial } from './format';
import type { Model } from './model';

export interface Series {
  key: string; label: string; currency: string; since: number;
  /** 'change' in the invested total, or actual 'deposits' added up by month */
  kind: 'change' | 'deposits';
}
export interface MonthRow {
  /** yyyy-mm */
  month: string;
  current: boolean;
  /** series key → the month's change; null where the series has no data yet */
  values: Record<string, number | null>;
  /** series key → the day its figure starts from, when that's inside the month (the log began then) */
  from: Record<string, number>;
}

interface Point { day: number; value: number }

const monthOf = (day: number) => serialToIso(day).slice(0, 7);
const firstOf = (month: string) => isoToSerial(`${month}-01`);
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** Each series' recorded days, plus today's live figure. */
function points(model: Model, today: number): { series: Series; pts: Point[] }[] {
  const out: { series: Series; pts: Point[] }[] = [];
  const deposits = model.ibkrDeposits;
  const add = (key: string, label: string, currency: string, logged: (s: Model['daily'][number]) => number | null | undefined, live: number | null | undefined) => {
    const pts: Point[] = [];
    for (const s of model.daily) {
      const v = logged(s);
      if (typeof v === 'number' && s.day < today) pts.push({ day: s.day, value: v });
    }
    if (typeof live === 'number') pts.push({ day: today, value: live });
    if (pts.length) out.push({ series: { key, label, currency, since: pts[0].day, kind: 'change' }, pts });
  };

  const mf = model.rows.networth.find((r) => /mutual fund/i.test(String(r.asset)));
  if (mf) add('mf', 'Mutual funds', 'INR', (s) => s.lines[String(mf.asset)]?.invested, n0(mf.invested));
  for (const [name, feed] of [['eToro', model.etoro], ['IBKR', model.ibkr]] as const) {
    if (name === 'IBKR' && deposits.length) {
      // Each deposit is a point; the month's figure is their sum (see monthlyInvested)
      out.push({ series: { key: name, label: name, currency: feed?.currency ?? 'USD', since: deposits[0].day, kind: 'deposits' }, pts: deposits.map((d) => ({ day: d.day, value: d.amount })) });
      continue;
    }
    const logged = model.daily.some((s) => s.brokers[name]);
    if (!feed && !logged) continue;
    const currency = feed?.currency ?? model.daily.findLast((s) => s.brokers[name])?.brokers[name].currency ?? 'USD';
    add(name, name, currency, (s) => s.brokers[name]?.amount, feed?.total?.invested ?? null);
  }
  return out;
}

/** Month by month, newest first, from the first month the log has any figure for. Null without a log. */
export function monthlyInvested(model: Model, today = todaySerial()): { series: Series[]; months: MonthRow[] } | null {
  if (!model.daily.length) return null;
  const all = points(model, today);
  if (!all.length) return null;

  const months: MonthRow[] = [];
  const thisMonth = monthOf(today);
  for (let m = monthOf(Math.min(...all.map((a) => a.series.since))); m <= thisMonth; m = nextMonth(m)) {
    const start = firstOf(m);
    const end = m === thisMonth ? today : firstOf(nextMonth(m)) - 1;
    const row: MonthRow = { month: m, current: m === thisMonth, values: {}, from: {} };
    for (const { series, pts } of all) {
      if (series.kind === 'deposits') {
        const inMonth = pts.filter((p) => p.day >= start && p.day <= end);
        row.values[series.key] = series.since <= end ? inMonth.reduce((a, p) => a + p.value, 0) : null;
        continue;
      }
      const last = pts.filter((p) => p.day <= end).at(-1);
      // From the end of the month before, or, in the month the log began, from its first day
      const base = pts.filter((p) => p.day < start).at(-1) ?? pts.find((p) => p.day >= start && p.day <= end);
      row.values[series.key] = last && base && last.day > base.day ? last.value - base.value : null;
      if (base && base.day >= start) row.from[series.key] = base.day;
    }
    // A past month with nothing to show (the log's first day was its last) is left out
    if (row.current || Object.values(row.values).some((v) => v !== null && Math.abs(v) >= 1)) months.push(row);
  }
  return { series: all.map((a) => a.series), months: months.reverse() };
}
