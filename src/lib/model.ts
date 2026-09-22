// Turns raw sheet grids into structured data.
//
// Tables are located by their header text, never by fixed addresses, and rows
// are identified by a content key (e.g. fund + holder) rather than a row
// number. Hand edits in the sheet — inserted rows, moved sections — don't break
// the app, and a write always lands on the row the user meant.

import { a1, colIndex, isNum, n0, type Cell } from './format';
import { JEWELLERY_TAB, readJewellery, type Jewellery } from './jewellery';
import { RATES_TAB, readRatesFeed, type FeedRate } from './ratesFeed';
import { ETORO_TAB, readEtoroFeed, type EtoroFeed } from './etoroFeed';

export type Grid = Cell[][];
export type Grids = Record<string, Grid>;

export const TABS = [
  'Net Worth', 'Monthly Trend', 'Mutual Funds', 'Equity', 'Gold (India SGB)',
  'Fixed Deposits', 'Bank Balances', 'Gold (UAE)', 'Silver (UAE)', 'NPS', 'Receivables',
] as const;

/* ---------- table specs ---------- */

export interface Spec<F extends string = string> {
  tab: string;
  /** a field whose header is unique in its row; disambiguates repeated headers */
  anchor: F;
  /** fields that identify a row */
  key: readonly F[];
  /** marks the total row; null means the table ends at the first blank key row */
  end: RegExp | null;
  headers: Record<F, string>;
  optionalHeaders?: Record<string, string>;
  /** a sheet without this section still loads */
  optional?: boolean;
}

// Field names are inferred from `headers` only; anchor and key must be among them.
const spec = <F extends string>(
  s: Omit<Spec<F>, 'anchor' | 'key'> & { anchor: NoInfer<F>; key: readonly NoInfer<F>[] },
): Spec<F> => s;

export const SPECS = {
  networth: spec({
    tab: 'Net Worth', anchor: 'current', key: ['asset'], end: /grand total/i,
    headers: {
      asset: 'Asset', holder: 'Holder', category: 'Category', location: 'Location',
      maturity: 'Maturity', invested: 'Invested (INR)', current: 'Current Value (INR)', pnl: 'P&L (INR)',
    },
  }),
  trend: spec({
    tab: 'Monthly Trend', anchor: 'savings', key: ['month'], end: null,
    headers: { month: 'Month', networth: 'Net Worth', savings: 'Savings (MoM)', note: 'Note' },
  }),
  mf: spec({
    tab: 'Mutual Funds', anchor: 'fund', key: ['fund', 'holder'], end: /^total/i,
    headers: {
      fund: 'Fund', holder: 'Holder', category: 'Category', platform: 'Platform / AMC', folio: 'Folio',
      invested: 'Invested', current: 'Current', pnl: 'P&L', navDate: 'NAV Date',
    },
    // present once units live on this tab and Current is units × the NAV Feed price
    optionalHeaders: { code: 'AMFI code', units: 'Units' },
  }),
  equity: spec({
    tab: 'Equity', anchor: 'account', key: ['account', 'details'], end: /^total/i,
    headers: {
      account: 'Account / Holding', details: 'Platform / Details', investedInr: 'Invested (INR)',
      currentInr: 'Current (INR)', pnl: 'P&L (INR)', currency: 'Local Cur.',
      investedLocal: 'Invested (Local)', currentLocal: 'Current (Local)', navDate: 'NAV Date',
    },
  }),
  sgb: spec({
    tab: 'Gold (India SGB)', anchor: 'holding', key: ['holding', 'holder', 'date'], end: /^total/i,
    headers: {
      date: 'Purchase Date', holding: 'Holding', holder: 'Holder', qty: 'Qty (g)', cost: 'Cost Value',
      market: 'Market Value', maturity: 'Maturity', valueDate: 'Value Date',
    },
  }),
  fd: spec({
    tab: 'Fixed Deposits', anchor: 'institution', key: ['institution', 'holder', 'date'], end: /^total/i,
    headers: {
      date: 'Invested Date', institution: 'Institution', holder: 'Holder', amount: 'Amount',
      maturityAmount: 'Maturity Amount', maturityDate: 'Maturity Date', duration: 'Duration',
      rate: 'Rate %', ref: 'Reference',
    },
  }),
  bankInr: spec({
    tab: 'Bank Balances', anchor: 'balance', key: ['account', 'holder'], end: /total/i,
    headers: { account: 'Account', holder: 'Holder', balance: 'Balance (INR)' },
  }),
  bankAed: spec({
    tab: 'Bank Balances', anchor: 'balance', key: ['account', 'holder'], end: /total/i,
    headers: { account: 'Account', holder: 'Holder/Notes', balance: 'Balance (AED)' },
  }),
  goldUae: spec({
    tab: 'Gold (UAE)', anchor: 'perUnit', key: ['date', 'source', 'cost'], end: null,
    headers: { date: 'Date', source: 'Source', perUnit: 'Cost / gram', cost: 'Cost Value', qty: 'Qty (g)' },
  }),
  silverUae: spec({
    tab: 'Silver (UAE)', anchor: 'qty', key: ['date', 'source', 'cost'], end: null,
    headers: { date: 'Date', source: 'Source', perUnit: 'Ounce', cost: 'Value', qty: 'Qty (oz)' },
  }),
  givenOut: spec({
    tab: 'Receivables', anchor: 'status', key: ['person', 'date'], end: /total/i, optional: true,
    headers: { person: 'Person', date: 'Date', amount: 'Amount', status: 'Status' },
  }),
  familyLoans: spec({
    tab: 'Receivables', anchor: 'detailSheet', key: ['account'], end: null, optional: true,
    headers: { account: 'Account', reference: 'Reference', balance: 'Balance', detailSheet: 'Detail Sheet' },
  }),
};

/** Read when present; a sheet without them still loads. */
export const OPTIONAL_TABS = [JEWELLERY_TAB, RATES_TAB, ETORO_TAB] as const;

// Ledger tabs aren't named here: each family-loan row in Receivables names its
// own ledger in the "Detail Sheet" column, and those tabs are read on demand.
export const LEDGER = spec({
  tab: '', anchor: 'description', key: ['description', 'date', 'amount'], end: /net balance|^total/i,
  headers: { description: 'Description', date: 'Date', amount: 'Amount' },
  optionalHeaders: { note: 'Note', detail: 'Detail', interest: 'Interest Note' },
});

export type SpecId = keyof typeof SPECS;
type FieldsOf<S> = S extends Spec<infer F> ? F : never;

export interface CellSource { tab: string; row: number; col: number }

export type Row<F extends string = string> = Record<F, Cell> & {
  /** zero-based sheet row */
  _row: number;
  /** content key; stable across inserted rows */
  _key: string;
};

export type RowOf<I extends SpecId> = Row<FieldsOf<(typeof SPECS)[I]>>;
export type NetWorthRow = RowOf<'networth'> & { _src: CellSource | null };
export type LedgerRow = Row<FieldsOf<typeof LEDGER>> & Partial<Record<'note' | 'detail' | 'interest', Cell>>;

export interface Table {
  spec: Spec;
  headerRow: number;
  cols: Record<string, number>;
  firstRow: number;
  lastRow: number;
  totalRow: number | null;
  minCol: number;
  maxCol: number;
}

export interface CellRef {
  tab: string;
  row: number | null;
  col: number;
  label: string;
  value?: Cell;
  formula?: string | null;
}

export interface Summary {
  tab: string;
  investedAed: CellRef;
  qty: CellRef;
  currentAed: CellRef;
  sellPrice?: CellRef;
}

export interface Ledger {
  sheet: string;
  title: string;
  rows: LedgerRow[];
  balance: Cell | null;
  balanceRef: string | null;
  familyKey: string;
  recorded: Cell;
  recordedFormula: boolean;
}

export type CellId = 'fxAedInr' | 'fxUsdAed' | 'npsInvested' | 'npsGain' | 'npsAsOf';
export type SummaryId = 'goldUae' | 'silverUae';

type OptionalId = 'givenOut' | 'familyLoans';

export interface Model {
  tables: { [I in Exclude<SpecId, OptionalId>]: Table } & { [I in OptionalId]: Table | null };
  rows: { [I in Exclude<SpecId, 'networth'>]: RowOf<I>[] } & { networth: NetWorthRow[] };
  totals: { invested: number; current: number; pnl: number };
  cells: Partial<Record<CellId, CellRef>>;
  summaries: Partial<Record<SummaryId, Summary>>;
  ledgers: Record<string, Ledger>;
  /** Reference only: never part of any total. */
  jewellery: Jewellery | null;
  /** Daily rates written by the Rates Feed script, if the sheet has that tab. */
  ratesFeed: FeedRate[];
  /** Positions written by the eToro Feed script, if the sheet has that tab. */
  etoro: EtoroFeed | null;
}

/* ---------- parsing ---------- */

const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (v: unknown) => v === '' || v === null || v === undefined;
const cellAt = (grid: Grid | undefined, r: number | null, c: number): Cell | undefined =>
  (r === null ? undefined : grid?.[r]?.[c]);
export const isFormula = (v: unknown): v is string => typeof v === 'string' && v.startsWith('=');

export function rowKey(s: Spec, rec: Record<string, unknown>): string {
  return s.key.map((f) => {
    const v = rec[f];
    return isNum(v) ? String(Math.round(v * 100) / 100) : norm(v);
  }).join('␟');
}

export function locateTable(grid: Grid, s: Spec): Table {
  const want = Object.fromEntries(Object.entries(s.headers).map(([f, h]) => [f, norm(h)])) as Record<string, string>;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const anchorCol = row.findIndex((v) => norm(v) === want[s.anchor]);
    if (anchorCol < 0) continue;

    const nearest = (h: string) => {
      let best = -1;
      row.forEach((v, c) => {
        if (norm(v) === h && (best < 0 || Math.abs(c - anchorCol) < Math.abs(best - anchorCol))) best = c;
      });
      return best;
    };
    const cols: Record<string, number> = {};
    let ok = true;
    for (const [field, h] of Object.entries(want)) {
      const c = nearest(h);
      if (c < 0) { ok = false; break; }
      cols[field] = c;
    }
    if (!ok) continue;
    for (const [field, h] of Object.entries(s.optionalHeaders ?? {})) {
      const c = nearest(norm(h));
      if (c >= 0) cols[field] = c;
    }

    // Only the first matching header row counts: later repeats are
    // "closed / matured" record sections, which are not active holdings.
    const minCol = Math.min(...Object.values(cols));
    const maxCol = Math.max(...Object.values(cols));
    let last = r;
    let totalRow: number | null = null;
    for (let i = r + 1; i < grid.length; i++) {
      const span = (grid[i] ?? []).slice(minCol, maxCol + 1);
      if (s.end && span.some((v) => s.end!.test(String(v ?? '')))) { totalRow = i; break; }
      if (s.key.every((f) => blank(cellAt(grid, i, cols[f])))) {
        if (!s.end) break;
        continue; // spacer row above a total
      }
      last = i;
    }
    return { spec: s, headerRow: r, cols, firstRow: r + 1, lastRow: last, totalRow, minCol, maxCol };
  }
  throw new Error(`Couldn't find the "${s.tab}" table — expected headers: ${Object.values(s.headers).join(', ')}`);
}

export function readRows<R extends Row>(grid: Grid, table: Table): R[] {
  const out: R[] = [];
  const seen: Record<string, number> = {};
  for (let r = table.firstRow; r <= table.lastRow; r++) {
    const rec: Record<string, unknown> = { _row: r };
    for (const [f, c] of Object.entries(table.cols)) {
      const v = cellAt(grid, r, c);
      rec[f] = typeof v === 'string' ? v.trim() : (v ?? '');
    }
    if (table.spec.key.every((f) => blank(rec[f]))) continue;
    // Identical rows (e.g. two equal purchases on one day) are told apart by
    // order of appearance, so a write never lands on the wrong twin.
    const base = rowKey(table.spec, rec);
    seen[base] = (seen[base] ?? 0) + 1;
    rec._key = seen[base] > 1 ? `${base}␟#${seen[base]}` : base;
    out.push(rec as R);
  }
  return out;
}

/** Finds a label anywhere in a grid. */
export function findLabel(grid: Grid | undefined, re: RegExp, fromRow = 0): { row: number; col: number } | null {
  for (let r = fromRow; r < (grid?.length ?? 0); r++) {
    const c = (grid![r] ?? []).findIndex((v) => typeof v === 'string' && re.test(v));
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

/** ='Some Tab'!$C$13 → { tab: 'Some Tab', row: 12, col: 2 } */
export function parseRef(formula: unknown): CellSource | null {
  const m = /^=\s*(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!\$?([A-Z]{1,3})\$?(\d+)\s*$/.exec(String(formula ?? ''));
  if (!m) return null;
  return { tab: (m[1] ?? m[2]).replace(/''/g, "'"), row: Number(m[4]) - 1, col: colIndex(m[3]) };
}

/** Tabs named in the family-loan table's "Detail Sheet" column. */
export function detailSheets(values: Grids): string[] {
  const grid = values[SPECS.familyLoans.tab];
  if (!grid) return [];
  try {
    const rows = readRows<RowOf<'familyLoans'>>(grid, locateTable(grid, SPECS.familyLoans));
    return [...new Set(rows.map((r) => String(r.detailSheet)).filter(Boolean))];
  } catch {
    return [];
  }
}

export function buildModel(values: Grids, formulas: Grids): Model {
  const tables: Record<string, Table | null> = {};
  const rows: Record<string, Row[]> = {};
  for (const [id, s] of Object.entries(SPECS) as [SpecId, Spec][]) {
    try {
      tables[id] = locateTable(values[s.tab] ?? [], s);
      rows[id] = readRows(values[s.tab], tables[id]!);
    } catch (e) {
      if (!s.optional) throw e;
      tables[id] = null;
      rows[id] = [];
    }
  }
  const t = tables as Model['tables'];
  const R = rows as unknown as Model['rows'];

  // Where each Net Worth line gets its value, e.g. =Receivables!$C$13
  for (const r of R.networth) {
    r._src = parseRef(cellAt(formulas['Net Worth'], r._row, t.networth.cols.current));
  }

  // Family-loan ledgers, from the tabs the Receivables table points at
  const ledgers: Record<string, Ledger> = {};
  for (const f of R.familyLoans) {
    const sheet = String(f.detailSheet);
    const grid = values[sheet];
    if (!grid || ledgers[sheet] || !t.familyLoans) continue;
    try {
      const lt = locateTable(grid, { ...LEDGER, tab: sheet });
      ledgers[sheet] = {
        sheet,
        title: String(f.account),
        rows: readRows<LedgerRow>(grid, lt),
        balance: lt.totalRow === null ? null : cellAt(grid, lt.totalRow, lt.cols.amount) ?? null,
        balanceRef: lt.totalRow === null ? null : a1(sheet, lt.totalRow, lt.cols.amount),
        familyKey: f._key,
        recorded: f.balance,
        recordedFormula: isFormula(cellAt(formulas[SPECS.familyLoans.tab], f._row, t.familyLoans.cols.balance)),
      };
    } catch { /* not a ledger-shaped tab: skip it */ }
  }

  // Grand total row on Net Worth
  const nwGrid = values['Net Worth'];
  const total = (field: string) => n0(cellAt(nwGrid, t.networth.totalRow, t.networth.cols[field]));
  const totals = { invested: total('invested'), current: total('current'), pnl: total('pnl') };

  // Standalone input cells, located by their labels
  const cells: Model['cells'] = {};
  const labelled = (id: CellId, tab: string, re: RegExp) => {
    const hit = findLabel(values[tab], re);
    if (hit) cells[id] = { tab, row: hit.row, col: hit.col + 1, label: String(values[tab][hit.row][hit.col]) };
  };
  labelled('fxAedInr', 'Bank Balances', /AED\s*→\s*INR/i);
  labelled('fxUsdAed', 'Equity', /USD\s*→\s*AED/i);

  const nps = values.NPS;
  const npsHead = findLabel(nps, /^value$/i);
  const npsAsOf = findLabel(nps, /^as of$/i);
  if (npsHead) {
    const add = (id: CellId, re: RegExp) => {
      const hit = findLabel(nps, re);
      if (hit) cells[id] = { tab: 'NPS', row: hit.row, col: npsHead.col, label: String(nps[hit.row][hit.col]) };
    };
    add('npsInvested', /^invested/i);
    add('npsGain', /^gain/i);
    if (npsAsOf && cells.npsInvested) {
      cells.npsAsOf = { tab: 'NPS', row: cells.npsInvested.row, col: npsAsOf.col, label: 'As of' };
    }
  }

  // "Summary" blocks under the Gold/Silver (UAE) purchase logs
  const summaries: Model['summaries'] = {};
  for (const [id, tab] of [['goldUae', 'Gold (UAE)'], ['silverUae', 'Silver (UAE)']] as const) {
    const g = values[tab];
    const head = findLabel(g, /^summary$/i);
    if (!head) continue;
    const colOf = (name: string) => g[head.row].findIndex((v) => norm(v) === norm(name));
    const rowOf = (re: RegExp) => findLabel(g, re, head.row + 1)?.row ?? null;
    const aed = colOf('AED');
    const inv = rowOf(/^invested$/i);
    const cur = rowOf(/^current value$/i);
    const sell = rowOf(/sell price/i);
    summaries[id] = {
      tab,
      investedAed: { tab, row: inv, col: aed, label: 'Invested (AED)' },
      qty: { tab, row: inv, col: colOf('Qty'), label: 'Quantity' },
      currentAed: { tab, row: cur, col: aed, label: 'Current value (AED)' },
      ...(sell !== null ? { sellPrice: { tab, row: sell, col: aed, label: String(g[sell][1] ?? 'Sell price') } } : {}),
    };
  }

  const refs = [
    ...Object.values(cells),
    ...Object.values(summaries).flatMap((s) => [s.investedAed, s.qty, s.currentAed, s.sellPrice].filter((x): x is CellRef => !!x)),
  ];
  for (const c of refs) {
    c.value = cellAt(values[c.tab], c.row, c.col);
    const f = cellAt(formulas[c.tab], c.row, c.col);
    c.formula = isFormula(f) ? f : null;
  }

  return { tables: t, rows: R, totals, cells, summaries, ledgers, jewellery: readJewellery(values[JEWELLERY_TAB], formulas[JEWELLERY_TAB]), ratesFeed: readRatesFeed(values[RATES_TAB]), etoro: readEtoroFeed(values[ETORO_TAB]) };
}

/**
 * Compare a table's total row against the sum of its rows. The sheet's totals
 * are self-extending SUM(INDIRECT(...)) formulas; this catches drift if one is
 * ever overwritten or a row lands below its range.
 */
export function totalDrift(model: Model, values: Grids, id: 'mf' | 'equity' | 'sgb' | 'fd', field: string) {
  const tbl = model.tables[id];
  if (tbl.totalRow === null) return null;
  const sheet = cellAt(values[tbl.spec.tab], tbl.totalRow, tbl.cols[field]);
  const sum = (model.rows[id] as Row[]).reduce((a, r) => a + n0(r[field]), 0);
  return isNum(sheet) && Math.abs(sheet - sum) > 1 ? { sheet, sum } : null;
}
