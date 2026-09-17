// Turns raw sheet grids into structured data.
//
// Tables are located by their header text, never by fixed addresses, and rows
// are identified by a content key (e.g. fund + holder) rather than a row
// number. That way hand edits in the sheet - inserted rows, moved sections -
// don't break the app, and a write always lands on the row the user meant.

import { a1, isNum } from './util.js';

export const TABS = [
  'Net Worth', 'Monthly Trend', 'Mutual Funds', 'Equity', 'Gold (India SGB)',
  'Fixed Deposits', 'Bank Balances', 'Gold (UAE)', 'Silver (UAE)', 'NPS', 'Receivables',
];

// Ledger tabs aren't named here: each family-loan row in Receivables names its
// own ledger in the "Detail Sheet" column, and those tabs are read on demand.
export const LEDGER = {
  anchor: 'description', key: ['description', 'date', 'amount'], end: /net balance|^total/i,
  headers: { description: 'Description', date: 'Date', amount: 'Amount' },
  optionalHeaders: { note: 'Note', detail: 'Detail', interest: 'Interest Note' },
};

// headers: field -> header text. anchor: a field whose header is unique in its
// row, used to disambiguate repeated headers (e.g. two "Account" columns).
// key: fields that identify a row. end: regex marking the total row; null means
// the table ends at the first row where every key field is blank.
export const SPECS = {
  networth: {
    tab: 'Net Worth', anchor: 'current', key: ['asset'], end: /grand total/i,
    headers: {
      asset: 'Asset', holder: 'Holder', category: 'Category', location: 'Location',
      maturity: 'Maturity', invested: 'Invested (INR)', current: 'Current Value (INR)', pnl: 'P&L (INR)',
    },
  },
  trend: {
    tab: 'Monthly Trend', anchor: 'savings', key: ['month'], end: null,
    headers: { month: 'Month', networth: 'Net Worth', savings: 'Savings (MoM)', note: 'Note' },
  },
  mf: {
    tab: 'Mutual Funds', anchor: 'fund', key: ['fund', 'holder'], end: /^total/i,
    headers: {
      fund: 'Fund', holder: 'Holder', category: 'Category', platform: 'Platform / AMC', folio: 'Folio',
      invested: 'Invested', current: 'Current', pnl: 'P&L', navDate: 'NAV Date',
    },
  },
  equity: {
    tab: 'Equity', anchor: 'account', key: ['account', 'details'], end: /^total/i,
    headers: {
      account: 'Account / Holding', details: 'Platform / Details', investedInr: 'Invested (INR)',
      currentInr: 'Current (INR)', pnl: 'P&L (INR)', currency: 'Local Cur.',
      investedLocal: 'Invested (Local)', currentLocal: 'Current (Local)', navDate: 'NAV Date',
    },
  },
  sgb: {
    tab: 'Gold (India SGB)', anchor: 'holding', key: ['holding', 'holder', 'date'], end: /^total/i,
    headers: {
      date: 'Purchase Date', holding: 'Holding', holder: 'Holder', qty: 'Qty (g)', cost: 'Cost Value',
      market: 'Market Value', maturity: 'Maturity', valueDate: 'Value Date',
    },
  },
  fd: {
    tab: 'Fixed Deposits', anchor: 'institution', key: ['institution', 'holder', 'date'], end: /^total/i,
    headers: {
      date: 'Invested Date', institution: 'Institution', holder: 'Holder', amount: 'Amount',
      maturityAmount: 'Maturity Amount', maturityDate: 'Maturity Date', duration: 'Duration',
      rate: 'Rate %', ref: 'Reference',
    },
  },
  bankInr: {
    tab: 'Bank Balances', anchor: 'balance', key: ['account', 'holder'], end: /total/i,
    headers: { account: 'Account', holder: 'Holder', balance: 'Balance (INR)' },
  },
  bankAed: {
    tab: 'Bank Balances', anchor: 'balance', key: ['account', 'holder'], end: /total/i,
    headers: { account: 'Account', holder: 'Holder/Notes', balance: 'Balance (AED)' },
  },
  goldUae: {
    tab: 'Gold (UAE)', anchor: 'perUnit', key: ['date', 'source', 'cost'], end: null,
    headers: { date: 'Date', source: 'Source', perUnit: 'Cost / gram', cost: 'Cost Value', qty: 'Qty (g)' },
  },
  silverUae: {
    tab: 'Silver (UAE)', anchor: 'qty', key: ['date', 'source', 'cost'], end: null,
    headers: { date: 'Date', source: 'Source', perUnit: 'Ounce', cost: 'Value', qty: 'Qty (oz)' },
  },
  // optional: a sheet without these sections still loads
  givenOut: {
    tab: 'Receivables', anchor: 'status', key: ['person', 'date'], end: /total/i, optional: true,
    headers: { person: 'Person', date: 'Date', amount: 'Amount', status: 'Status' },
  },
  familyLoans: {
    tab: 'Receivables', anchor: 'detailSheet', key: ['account'], end: null, optional: true,
    headers: { account: 'Account', reference: 'Reference', balance: 'Balance', detailSheet: 'Detail Sheet' },
  },
};

const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (v) => v === '' || v === null || v === undefined;
const cellAt = (grid, r, c) => (grid[r] || [])[c];

export function rowKey(spec, rec) {
  return spec.key.map((f) => {
    const v = rec[f];
    return isNum(v) ? String(Math.round(v * 100) / 100) : norm(v);
  }).join('␟');
}

export function locateTable(grid, spec) {
  const want = Object.fromEntries(Object.entries(spec.headers).map(([f, h]) => [f, norm(h)]));
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const anchorCol = row.findIndex((v) => norm(v) === want[spec.anchor]);
    if (anchorCol < 0) continue;

    const nearest = (h) => {
      let best = -1;
      row.forEach((v, c) => {
        if (norm(v) === h && (best < 0 || Math.abs(c - anchorCol) < Math.abs(best - anchorCol))) best = c;
      });
      return best;
    };
    const cols = {};
    let ok = true;
    for (const [field, h] of Object.entries(want)) {
      const c = nearest(h);
      if (c < 0) { ok = false; break; }
      cols[field] = c;
    }
    if (!ok) continue;
    for (const [field, h] of Object.entries(spec.optionalHeaders || {})) {
      const c = nearest(norm(h));
      if (c >= 0) cols[field] = c;
    }

    // Only the first matching header row counts: later repeats are
    // "closed / matured" record sections, which are not active holdings.
    const minCol = Math.min(...Object.values(cols));
    const maxCol = Math.max(...Object.values(cols));
    let last = r;
    let totalRow = null;
    for (let i = r + 1; i < grid.length; i++) {
      const span = (grid[i] || []).slice(minCol, maxCol + 1);
      if (spec.end && span.some((v) => spec.end.test(String(v ?? '')))) { totalRow = i; break; }
      if (spec.key.every((f) => blank(cellAt(grid, i, cols[f])))) {
        if (!spec.end) break;
        continue; // spacer row above a total
      }
      last = i;
    }
    return { spec, headerRow: r, cols, firstRow: r + 1, lastRow: last, totalRow, minCol, maxCol };
  }
  throw new Error(`Couldn't find the "${spec.tab}" table — expected headers: ${Object.values(spec.headers).join(', ')}`);
}

export function readRows(grid, table) {
  const out = [];
  const seen = {};
  for (let r = table.firstRow; r <= table.lastRow; r++) {
    const rec = { _row: r };
    for (const [f, c] of Object.entries(table.cols)) {
      const v = cellAt(grid, r, c);
      rec[f] = typeof v === 'string' ? v.trim() : (v ?? '');
    }
    if (table.spec.key.every((f) => blank(rec[f]))) continue;
    // Identical rows (e.g. two equal purchases on one day) are told apart by
    // order of appearance, so a write never lands on the wrong twin.
    const base = rowKey(table.spec, rec);
    seen[base] = (seen[base] || 0) + 1;
    rec._key = seen[base] > 1 ? `${base}␟#${seen[base]}` : base;
    out.push(rec);
  }
  return out;
}

// Finds a label anywhere in a grid; returns {row, col} or null.
export function findLabel(grid, re, fromRow = 0) {
  for (let r = fromRow; r < grid.length; r++) {
    const c = (grid[r] || []).findIndex((v) => typeof v === 'string' && re.test(v));
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

// A "summary block" (Gold/Silver UAE): a row labelled "Summary" whose cells
// name the columns, followed by labelled rows.
function summaryBlock(grid) {
  const head = findLabel(grid, /^summary$/i);
  if (!head) return null;
  const headRow = grid[head.row];
  const colOf = (name) => headRow.findIndex((v) => norm(v) === norm(name));
  const rowOf = (re) => findLabel(grid, re, head.row + 1)?.row ?? null;
  return { head, colOf, rowOf };
}

const isFormula = (v) => typeof v === 'string' && v.startsWith('=');

// ='Some Tab'!$C$13  ->  { tab: 'Some Tab', row: 12, col: 2 }
export function parseRef(formula) {
  const m = /^=\s*(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!\$?([A-Z]{1,3})\$?(\d+)\s*$/.exec(String(formula ?? ''));
  if (!m) return null;
  const col = [...m[3]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { tab: (m[1] ?? m[2]).replace(/''/g, "'"), row: Number(m[4]) - 1, col };
}

// Tabs named in the family-loan table's "Detail Sheet" column.
export function detailSheets(values) {
  const spec = SPECS.familyLoans;
  const grid = values[spec.tab];
  if (!grid) return [];
  try {
    return [...new Set(readRows(grid, locateTable(grid, spec)).map((r) => r.detailSheet).filter(Boolean))];
  } catch {
    return [];
  }
}

export function buildModel(values, formulas) {
  const t = {};
  const rows = {};
  for (const [id, spec] of Object.entries(SPECS)) {
    try {
      t[id] = locateTable(values[spec.tab] || [], spec);
      rows[id] = readRows(values[spec.tab], t[id]);
    } catch (e) {
      if (!spec.optional) throw e;
      t[id] = null;
      rows[id] = [];
    }
  }

  // Where each Net Worth line gets its value, e.g. =Receivables!$C$13
  for (const r of rows.networth) {
    r._src = parseRef(cellAt(formulas['Net Worth'], r._row, t.networth.cols.current));
  }

  // Family-loan ledgers, from the tabs the Receivables table points at
  const ledgers = {};
  for (const f of rows.familyLoans) {
    const grid = values[f.detailSheet];
    if (!grid || ledgers[f.detailSheet]) continue;
    try {
      const spec = { ...LEDGER, tab: f.detailSheet };
      const lt = locateTable(grid, spec);
      ledgers[f.detailSheet] = {
        sheet: f.detailSheet,
        title: f.account,
        rows: readRows(grid, lt),
        balance: lt.totalRow === null ? null : cellAt(grid, lt.totalRow, lt.cols.amount),
        balanceRef: lt.totalRow === null ? null : a1(f.detailSheet, lt.totalRow, lt.cols.amount),
        familyKey: f._key,
        recorded: f.balance,
        recordedFormula: isFormula(cellAt(formulas[f.tab || SPECS.familyLoans.tab], f._row, t.familyLoans.cols.balance)),
      };
    } catch { /* not a ledger-shaped tab: skip it */ }
  }

  // Grand total row on Net Worth
  const nwGrid = values['Net Worth'];
  const totalRow = t.networth.totalRow;
  const totals = totalRow === null ? null : {
    invested: cellAt(nwGrid, totalRow, t.networth.cols.invested),
    current: cellAt(nwGrid, totalRow, t.networth.cols.current),
    pnl: cellAt(nwGrid, totalRow, t.networth.cols.pnl),
  };

  // Standalone input cells, located by their labels
  const cells = {};
  const labelled = (id, tab, re, dc = 1) => {
    const hit = findLabel(values[tab], re);
    if (hit) cells[id] = { tab, row: hit.row, col: hit.col + dc, label: values[tab][hit.row][hit.col] };
  };
  labelled('fxAedInr', 'Bank Balances', /AED\s*→\s*INR/i);
  labelled('fxUsdAed', 'Equity', /USD\s*→\s*AED/i);

  const nps = values.NPS;
  const npsHead = findLabel(nps, /^value$/i);
  const npsAsOf = findLabel(nps, /^as of$/i);
  if (npsHead) {
    const add = (id, re) => {
      const hit = findLabel(nps, re);
      if (hit) cells[id] = { tab: 'NPS', row: hit.row, col: npsHead.col, label: nps[hit.row][hit.col] };
    };
    add('npsInvested', /^invested/i);
    add('npsGain', /^gain/i);
    if (npsAsOf && cells.npsInvested) {
      cells.npsAsOf = { tab: 'NPS', row: cells.npsInvested.row, col: npsAsOf.col, label: 'As of' };
    }
  }

  const summaries = {};
  for (const [id, tab] of [['goldUae', 'Gold (UAE)'], ['silverUae', 'Silver (UAE)']]) {
    const g = values[tab];
    const s = summaryBlock(g);
    if (!s) continue;
    const aed = s.colOf('AED');
    const qty = s.colOf('Qty');
    const inv = s.rowOf(/^invested$/i);
    const cur = s.rowOf(/^current value$/i);
    summaries[id] = {
      tab,
      investedAed: { tab, row: inv, col: aed, label: 'Invested (AED)' },
      qty: { tab, row: inv, col: qty, label: 'Quantity' },
      currentAed: { tab, row: cur, col: aed, label: 'Current value (AED)' },
    };
    const sell = s.rowOf(/sell price/i);
    if (sell !== null) summaries[id].sellPrice = { tab, row: sell, col: aed, label: values[tab][sell][1] };
  }

  for (const c of [...Object.values(cells), ...Object.values(summaries).flatMap((s) => Object.values(s).filter((x) => x && x.row !== undefined))]) {
    c.value = cellAt(values[c.tab], c.row, c.col);
    c.formula = isFormula(cellAt(formulas[c.tab], c.row, c.col)) ? cellAt(formulas[c.tab], c.row, c.col) : null;
  }

  return { tables: t, rows, totals, cells, summaries, ledgers };
}

// Compare a table's total row against the sum of its rows. The sheet's totals
// are self-extending SUM(INDIRECT(...)) formulas today; this catches drift if
// one is ever overwritten or a row lands below its range.
export function totalDrift(model, values, id, field) {
  const tbl = model.tables[id];
  if (tbl.totalRow === null) return null;
  const sheet = cellAt(values[tbl.spec.tab], tbl.totalRow, tbl.cols[field]);
  const sum = model.rows[id].reduce((a, r) => a + (isNum(r[field]) ? r[field] : 0), 0);
  return isNum(sheet) && Math.abs(sheet - sum) > 1 ? { sheet, sum } : null;
}
