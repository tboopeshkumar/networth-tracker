// The "eToro Feed" tab, filled daily by apps-script/EtoroFeed.gs: one row per
// holding, copy portfolio, pending orders and cash, then a Total row. Found by
// its header text, so columns can be moved.

import { isNum, type Cell } from './format';
import type { Grid } from './model';

export const ETORO_TAB = 'eToro Feed';

export interface EtoroRow {
  _row: number;
  _key: string;
  symbol: string;
  name: string;
  type: string;
  units: Cell;
  invested: number | null;
  value: number | null;
  pnl: number | null;
}

export interface EtoroFeed {
  rows: EtoroRow[];
  total: { invested: number | null; value: number | null } | null;
  /** when the script last fetched it (date-time serial) */
  refreshed: number | null;
}

const COLS = { symbol: 'symbol', name: 'name', type: 'type', units: 'units', invested: 'invested ($)', value: 'value ($)', pnl: 'p&l ($)', refreshed: 'refreshed' } as const;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const n = (v: Cell | undefined) => (isNum(v) ? v : null);

export function readEtoroFeed(grid: Grid | undefined): EtoroFeed | null {
  if (!grid?.length) return null;
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === COLS.symbol) && r.some((v) => norm(v) === COLS.value));
  if (head < 0) return null;
  const col = Object.fromEntries(Object.entries(COLS).map(([k, h]) => [k, grid[head].findIndex((v) => norm(v) === h)])) as Record<keyof typeof COLS, number>;
  const at = (r: Cell[], k: keyof typeof COLS) => (col[k] >= 0 ? r[col[k]] : undefined);

  const rows: EtoroRow[] = [];
  let total: EtoroFeed['total'] = null;
  let refreshed: number | null = null;
  for (let i = head + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const symbol = String(at(r, 'symbol') ?? '').trim();
    if (!symbol) continue;
    const ts = n(at(r, 'refreshed'));
    if (ts !== null) refreshed = Math.max(refreshed ?? ts, ts);
    if (/^total$/i.test(symbol)) { total = { invested: n(at(r, 'invested')), value: n(at(r, 'value')) }; continue; }
    rows.push({
      _row: i, _key: symbol,
      symbol, name: String(at(r, 'name') ?? '').trim(), type: String(at(r, 'type') ?? '').trim(),
      units: at(r, 'units') ?? '', invested: n(at(r, 'invested')), value: n(at(r, 'value')), pnl: n(at(r, 'pnl')),
    });
  }
  return { rows, total, refreshed };
}
