// The "Rates History" tab, kept by apps-script/RatesFeed.gs: one row per day,
//   Date (text, yyyy-mm-dd) | AED → INR | Gold 22C (₹/g) | Gold 999 (₹/g)
// A rate missing on a day is a blank cell. Columns are found by header, so a
// new rate column simply shows up as another series.

import { isNum, isoToSerial } from './format';
import type { Grid } from './model';

export const HISTORY_TAB = 'Rates History';

export interface RatePoint { day: number; value: number }

const dayOf = (v: unknown): number | null =>
  (isNum(v) ? Math.floor(v) : /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? isoToSerial(String(v).trim()) : null);

/** label → its days, oldest first. */
export function readRateHistory(grid: Grid | undefined): Record<string, RatePoint[]> {
  if (!grid?.length) return {};
  const head = grid.findIndex((r) => r?.some((v) => String(v ?? '').trim().toLowerCase() === 'date'));
  if (head < 0) return {};
  const labels = grid[head].map((v) => String(v ?? '').trim());
  const dateCol = labels.findIndex((l) => l.toLowerCase() === 'date');

  const out: Record<string, RatePoint[]> = {};
  for (const r of grid.slice(head + 1)) {
    const day = dayOf(r?.[dateCol]);
    if (day === null) continue;
    labels.forEach((label, c) => {
      const v = r[c];
      if (c === dateCol || !label || !isNum(v) || !(v > 0)) return;
      (out[label] ??= []).push({ day, value: v });
    });
  }
  for (const pts of Object.values(out)) pts.sort((a, b) => a.day - b.day);
  return out;
}

/** The points within the last `days` days, counting today. */
export const lastDays = (pts: RatePoint[] | undefined, days: number, today: number) =>
  (pts ?? []).filter((p) => p.day > today - days);
