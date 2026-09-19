// The "Rates Feed" tab, filled daily by apps-script/RatesFeed.gs. Cells that
// use a rate point at it (a VLOOKUP by label, or a direct 'Rates Feed'!B2
// reference); this finds the feed row behind such a formula so the app can
// say how fresh the rate is.

import { isNum, type Cell } from './format';
import type { Grid } from './model';

export const RATES_TAB = 'Rates Feed';

export interface FeedRate {
  label: string;
  value: number | null;
  source: string;
  /** the day the rate applies to (date serial) */
  rateDate: Cell;
  /** when the script last fetched it (date-time serial) */
  refreshed: Cell;
  row: number;
}

export function readRatesFeed(grid: Grid | undefined): FeedRate[] {
  if (!grid) return [];
  return grid.slice(1).flatMap((r, i) => {
    const label = String(r?.[0] ?? '').trim();
    if (!label) return [];
    return [{
      label,
      value: isNum(r[1]) ? r[1] : null,
      source: String(r[2] ?? '').trim(),
      rateDate: r[3] ?? null,
      refreshed: r[4] ?? null,
      row: i + 1,
    }];
  });
}

/** The feed row a formula reads from, if it reads from the feed at all. */
export function feedRateFor(feed: FeedRate[], formula: string | null | undefined): FeedRate | null {
  if (!formula || !/'?rates feed'?!/i.test(formula)) return null;
  const ref = /'?rates feed'?!\$?[A-Z]+\$?(\d+)\b(?!\s*:)/i.exec(formula);
  if (ref) return feed.find((f) => f.row === Number(ref[1]) - 1) ?? null;
  const quoted = [...formula.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim().toLowerCase());
  return feed.find((f) => quoted.includes(f.label.toLowerCase())) ?? null;
}
