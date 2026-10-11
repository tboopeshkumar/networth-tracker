// The "Daily Log" tab, filled each night by apps-script/DailyLog.gs: one row
// per Net Worth line per day (Date, Line, Invested, Current), plus the day's
// AED → INR rate as a line named "Rate: AED → INR". Comparing what the sheet
// says now with the last day before today shows what moved, and why a total did.

import { isNum, isoToSerial, n0, todaySerial, type Cell } from './format';
import type { Grid, Model, NetWorthRow } from './model';

export const DAILY_TAB = 'Daily Log';
const RATE = /^rate:\s*/i;

export interface DaySnapshot {
  /** date serial */
  day: number;
  lines: Record<string, { invested: number | null; current: number | null }>;
  rates: Record<string, number>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
/** The log writes its dates as text (yyyy-mm-dd); a cell someone reformatted as a date still reads. */
const dayOf = (v: Cell | undefined): number | null =>
  (isNum(v) ? Math.floor(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? isoToSerial(String(v).trim()) : null);

/** Every recorded day, oldest first. */
export function readDailyLog(grid: Grid | undefined): DaySnapshot[] {
  if (!grid?.length) return [];
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === 'date') && r.some((v) => norm(v) === 'line'));
  if (head < 0) return [];
  const col = (re: RegExp) => grid[head].findIndex((v) => re.test(norm(v)));
  const [date, line, invested, current] = [col(/^date$/), col(/^line$/), col(/^invested/), col(/^current/)];
  if (current < 0) return [];

  const days = new Map<number, DaySnapshot>();
  for (const r of grid.slice(head + 1)) {
    const day = dayOf(r?.[date]);
    const name = String(r?.[line] ?? '').trim();
    if (day === null || !name) continue;
    let snap = days.get(day);
    if (!snap) days.set(day, snap = { day, lines: {}, rates: {} });
    const cur = r[current];
    if (RATE.test(name)) {
      if (isNum(cur)) snap.rates[name.replace(RATE, '')] = cur;
    } else {
      const inv = invested >= 0 ? r[invested] : undefined;
      snap.lines[name] = { invested: isNum(inv) ? inv : null, current: isNum(cur) ? cur : null };
    }
  }
  return [...days.values()].sort((a, b) => a.day - b.day);
}

export interface LineChange {
  asset: string;
  /** the Net Worth line as it is now; null for one that has since been removed */
  row: NetWorthRow | null;
  /** new on the Net Worth tab since that day, or gone from it */
  status: 'changed' | 'new' | 'gone';
  invested: number;
  current: number;
}

export interface Changes {
  /** the day being compared against */
  since: number;
  invested: number;
  current: number;
  /** only the lines that moved, largest move first */
  lines: LineChange[];
  rates: { label: string; from: number; to: number }[];
}

/** Under a rupee is rounding, not a change. */
const moved = (n: number) => Math.abs(n) >= 1;

/**
 * What changed between the last recorded day before today and the sheet as it
 * is now. `null` when there is no log; `'first'` when the log has only today.
 */
export function changesSince(model: Model, today = todaySerial()): Changes | 'first' | null {
  const log = model.daily;
  if (!log.length) return null;
  const base = log.filter((d) => d.day < today).at(-1);
  if (!base) return 'first';

  const lines: LineChange[] = [];
  const seen = new Set<string>();
  for (const row of model.rows.networth) {
    const asset = String(row.asset);
    seen.add(asset);
    const was = base.lines[asset];
    lines.push({
      asset, row, status: was ? 'changed' : 'new',
      invested: n0(row.invested) - n0(was?.invested),
      current: n0(row.current) - n0(was?.current),
    });
  }
  for (const [asset, was] of Object.entries(base.lines)) {
    if (!seen.has(asset)) lines.push({ asset, row: null, status: 'gone', invested: -n0(was.invested), current: -n0(was.current) });
  }

  const rates: Changes['rates'] = [];
  const aed = model.cells.fxAedInr?.value;
  const aedWas = base.rates['AED → INR'];
  if (isNum(aed) && isNum(aedWas) && Math.abs(aed - aedWas) > 1e-6) rates.push({ label: 'AED → INR', from: aedWas, to: aed });

  const size = (c: LineChange) => Math.max(Math.abs(c.current), Math.abs(c.invested));
  return {
    since: base.day,
    invested: lines.reduce((a, c) => a + c.invested, 0),
    current: lines.reduce((a, c) => a + c.current, 0),
    lines: lines.filter((c) => moved(c.invested) || moved(c.current)).sort((a, b) => size(b) - size(a)),
    rates,
  };
}
