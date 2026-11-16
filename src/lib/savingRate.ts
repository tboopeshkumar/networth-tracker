// How much of each month's income was saved, two ways:
//   net worth   the month's change on the Monthly Trend tab (what it calls
//               Savings). Includes market and exchange-rate moves.
//   put away    the month's rise in invested capital, from the nightly Daily
//               Log: cash, deposits and what was paid for investments. Holdings
//               in the UAE are valued at today's AED → INR rate on both days,
//               so a rate move isn't counted as saving. Leaves out market moves.
// Income is in AED and is converted at today's rate.

import { isNum, isoToSerial, n0, serialToIso, todaySerial } from './format';
import type { DaySnapshot } from './dailyLog';
import type { Model } from './model';

export interface SavingMonth {
  /** yyyy-mm */
  month: string;
  current: boolean;
  incomeAed: number | null;
  /** income in ₹ at today's rate */
  incomeInr: number | null;
  netWorth: number | null;
  putAway: number | null;
}

const monthOf = (day: number) => serialToIso(day).slice(0, 7);
const prevMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};

/** Total invested capital on a logged day, with UAE holdings at today's AED rate. */
function investedOn(model: Model, s: DaySnapshot, rateNow: number): number | null {
  const uae = new Set(model.rows.networth.filter((r) => r.location === 'UAE').map((r) => String(r.asset)));
  const rateThen = s.rates['AED → INR'];
  let total = 0;
  let any = false;
  for (const [asset, line] of Object.entries(s.lines)) {
    if (!isNum(line.invested)) continue;
    any = true;
    total += uae.has(asset) && isNum(rateThen) && rateThen > 0 && rateNow > 0 ? line.invested * (rateNow / rateThen) : line.invested;
  }
  return any ? total : null;
}

/** Newest month first; null when the sheet has no income. */
export function savingByMonth(model: Model, today = todaySerial()): SavingMonth[] | null {
  if (!model.income.size) return null;
  const rate = n0(model.cells.fxAedInr?.value);
  const thisMonth = monthOf(today);

  // Net worth change, from the trend; this month so far against the last recorded month
  const netWorth = new Map<string, number>();
  const trend = model.rows.trend.filter((t) => isNum(t.month) && isNum(t.networth));
  trend.forEach((t, i) => {
    const change = isNum(t.savings) ? t.savings : i > 0 ? (t.networth as number) - (trend[i - 1].networth as number) : null;
    if (change !== null) netWorth.set(monthOf(t.month as number), change);
  });
  const last = trend.at(-1);
  if (last && monthOf(last.month as number) === prevMonth(thisMonth)) netWorth.set(thisMonth, model.totals.current - (last.networth as number));

  // Money put away, from the log: end of the month before to end of the month (today, for this one)
  const putAway = new Map<string, number>();
  const log = model.daily.filter((s) => s.day < today);
  if (log.length) {
    const nowInvested = model.totals.invested;
    const months = [...new Set([...log.map((s) => monthOf(s.day)), thisMonth])];
    for (const m of months) {
      const start = isoToSerial(`${m}-01`);
      const base = log.filter((s) => s.day < start).at(-1);
      if (!base) continue; // the log began during this month: no full month to compare
      const endSnap = log.filter((s) => monthOf(s.day) === m).at(-1);
      const end = m === thisMonth ? nowInvested : endSnap ? investedOn(model, endSnap, rate) : null;
      const from = investedOn(model, base, rate);
      if (isNum(end) && isNum(from)) putAway.set(m, end - from);
    }
  }

  const keys = [...new Set([...netWorth.keys(), ...putAway.keys()])].sort().reverse();
  return keys.map((month) => {
    const aed = model.income.get(month) ?? null;
    return {
      month, current: month === thisMonth,
      incomeAed: aed, incomeInr: aed !== null && rate > 0 ? aed * rate : null,
      netWorth: netWorth.get(month) ?? null, putAway: putAway.get(month) ?? null,
    };
  });
}
