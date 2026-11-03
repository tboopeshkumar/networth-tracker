// Broker feed tabs, filled daily by apps-script/EtoroFeed.gs ("eToro Feed")
// and apps-script/IbkrFeed.gs ("IBKR Feed"): one row per holding, then cash
// and a Total row. Found by header text, so columns can be moved; the amount
// headers carry the currency, "Value ($)" or "Value (USD)".

import { isNum, isoToSerial, type Cell } from './format';
import type { Grid } from './model';

export const ETORO_TAB = 'eToro Feed';
export const IBKR_TAB = 'IBKR Feed';

export interface BrokerRow {
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

export interface BrokerFeed {
  /** ISO code of the amounts, from the headers ("$" is USD) */
  currency: string;
  rows: BrokerRow[];
  total: { invested: number | null; value: number | null } | null;
  /** when the script last fetched it (date-time serial) */
  refreshed: number | null;
}

// Amount columns match by prefix: "Invested ($)", "Invested (USD)"...
const COLS = { symbol: 'symbol', name: 'name', type: 'type', units: 'units', invested: 'invested', value: 'value', pnl: 'p&l', refreshed: 'refreshed' } as const;
const PREFIXED = new Set(['invested', 'value', 'pnl']);
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const matches = (cell: unknown, k: string, h: string) => (PREFIXED.has(k) ? norm(cell) === h || norm(cell).startsWith(`${h} (`) : norm(cell) === h);
const n = (v: Cell | undefined) => (isNum(v) ? v : null);

export function readBrokerFeed(grid: Grid | undefined): BrokerFeed | null {
  if (!grid?.length) return null;
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === COLS.symbol) && r.some((v) => matches(v, 'value', COLS.value)));
  if (head < 0) return null;
  const col = Object.fromEntries(Object.entries(COLS).map(([k, h]) => [k, grid[head].findIndex((v) => matches(v, k, h))])) as Record<keyof typeof COLS, number>;
  const code = /\(([^)]+)\)/.exec(String(grid[head][col.value] ?? ''))?.[1]?.trim() ?? 'USD';
  const currency = code === '$' ? 'USD' : code.toUpperCase();
  const at = (r: Cell[], k: keyof typeof COLS) => (col[k] >= 0 ? r[col[k]] : undefined);

  const rows: BrokerRow[] = [];
  let total: BrokerFeed['total'] = null;
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
  return { currency, rows, total, refreshed };
}

/* ---------- IBKR deposits ---------- */

// "IBKR Deposits", kept by apps-script/IbkrFeed.gs when the Flex Query has a
// Cash Transactions section: Date (yyyy-mm-dd) | Amount (base currency,
// withdrawals negative) | Currency | Description | Transaction ID.
export const IBKR_DEPOSITS_TAB = 'IBKR Deposits';

export interface Deposit { day: number; amount: number }

export function readDeposits(grid: Grid | undefined): Deposit[] {
  if (!grid?.length) return [];
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === 'date') && r.some((v) => norm(v) === 'amount'));
  if (head < 0) return [];
  const date = grid[head].findIndex((v) => norm(v) === 'date');
  const amount = grid[head].findIndex((v) => norm(v) === 'amount');
  const out: Deposit[] = [];
  for (const r of grid.slice(head + 1)) {
    const d = String(r?.[date] ?? '').trim();
    const a = r?.[amount];
    const day = isNum(r?.[date]) ? Math.floor(r[date] as number) : /^\d{4}-\d{2}-\d{2}$/.test(d) ? isoToSerial(d) : null;
    if (day !== null && isNum(a) && a !== 0) out.push({ day, amount: a });
  }
  return out.sort((x, y) => x.day - y.day);
}
