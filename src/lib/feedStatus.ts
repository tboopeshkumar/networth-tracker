// The "Feed Status" tab: each sheet script records how its last run went
// (apps-script/NavFeed.gs, runFeed_). One row per feed:
//   Feed | Status (OK, Warning, Error) | Message | Last run | Last success
// A feed that fails keeps its previous values, so the app would otherwise
// look fine; this is how "Worth a look" finds out.

import { isNum } from './format';
import type { Grid } from './model';

export const STATUS_TAB = 'Feed Status';

export interface FeedRun {
  feed: string;
  status: 'OK' | 'Warning' | 'Error';
  message: string;
  /** date-time serials */
  lastRun: number | null;
  lastSuccess: number | null;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

export function readFeedStatus(grid: Grid | undefined): FeedRun[] {
  if (!grid?.length) return [];
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === 'feed') && r.some((v) => norm(v) === 'status'));
  if (head < 0) return [];
  const col = (name: string) => grid[head].findIndex((v) => norm(v) === name);
  const [feed, status, message, lastRun, lastSuccess] = ['feed', 'status', 'message', 'last run', 'last success'].map(col);

  const out: FeedRun[] = [];
  for (const r of grid.slice(head + 1)) {
    const name = String(r?.[feed] ?? '').trim();
    const s = norm(r?.[status]);
    if (!name || !['ok', 'warning', 'error'].includes(s)) continue;
    out.push({
      feed: name,
      status: s === 'ok' ? 'OK' : s === 'warning' ? 'Warning' : 'Error',
      message: String(r[message] ?? '').trim(),
      lastRun: isNum(r[lastRun]) ? r[lastRun] : null,
      lastSuccess: isNum(r[lastSuccess]) ? r[lastSuccess] : null,
    });
  }
  return out;
}
