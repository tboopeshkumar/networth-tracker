// In-memory backend for local development and tests. Loaded only by the dev
// build (see App.tsx), so it never ships to the live site.
//
// Emulates the request types the app sends. Formulas are shifted like a
// Sheets copy-paste, and simple arithmetic ones (=G5-F5) are evaluated so a
// demo write shows sensible numbers.

import { colIndex, type Cell } from './format';
import type { Grid, Grids } from './model';
import type { BatchRequest, SheetData, SheetMeta, SheetsBackend } from './sheets';

export interface Fixture { sheets: SheetMeta[]; values: Grids; formulas: Grids }

const clone = <T>(x: T): T => structuredClone(x);
const isFormula = (v: unknown): v is string => typeof v === 'string' && v.startsWith('=');

/** Shift relative row references, leaving string literals and $-rows alone. */
export function shiftRows(formula: string, delta: number): string {
  return formula.replace(/("[^"]*")|(?<![A-Za-z0-9_$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
    (_m, str: string | undefined, cAbs: string, col: string, rAbs: string, row: string) =>
      (str ?? `${cAbs}${col}${rAbs}${rAbs ? row : Number(row) + delta}`));
}

/** + - * / ( ) over numbers and same-sheet refs. No eval. */
function evalSimple(formula: string, grid: Grid): Cell {
  const toks = formula.slice(1).match(/\$?[A-Z]{1,3}\$?\d+|\d+(?:\.\d+)?|[+\-*/()]|\S/g) ?? [];
  let i = 0;
  const fail = () => { throw new Error('unsupported'); };
  const atom = (): number => {
    const t = toks[i++];
    if (t === '(') { const v = sum(); if (toks[i++] !== ')') fail(); return v; }
    if (t === '-') return -atom();
    if (t !== undefined && /^\d/.test(t)) return Number(t);
    const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(t ?? '');
    if (!m) return fail();
    const v = grid[Number(m[2]) - 1]?.[colIndex(m[1])];
    return typeof v === 'number' ? v : 0;
  };
  const prod = (): number => { let v = atom(); while (toks[i] === '*' || toks[i] === '/') v = toks[i++] === '*' ? v * atom() : v / atom(); return v; };
  const sum = (): number => { let v = prod(); while (toks[i] === '+' || toks[i] === '-') v = toks[i++] === '+' ? v + prod() : v - prod(); return v; };
  try {
    const v = sum();
    return i === toks.length && Number.isFinite(v) ? v : '';
  } catch {
    return '';
  }
}

export class DemoSheets implements SheetsBackend {
  readonly title = 'Demo (local fixture)';
  f: Fixture;

  constructor(fixture: Fixture) { this.f = clone(fixture); }

  static async load(url: string): Promise<DemoSheets> {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No demo fixture. Run: npm run fixture -- <your.xlsx>');
    return new DemoSheets(await res.json() as Fixture);
  }

  async meta() { return clone(this.f.sheets); }

  async read(tabs: readonly string[]): Promise<SheetData> {
    return {
      values: Object.fromEntries(tabs.map((t) => [t, clone(this.f.values[t] ?? [])])),
      formulas: Object.fromEntries(tabs.map((t) => [t, clone(this.f.formulas[t] ?? [])])),
    };
  }

  private tabOf(sheetId: number): string {
    const s = this.f.sheets.find((x) => x.sheetId === sheetId);
    if (!s) throw new Error(`demo: unknown sheetId ${sheetId}`);
    return s.title;
  }

  async batchUpdate(requests: BatchRequest[]) {
    const snapshot = clone(this.f); // all-or-nothing, like the real API
    try {
      requests.forEach((r) => this.apply(r));
    } catch (e) {
      this.f = snapshot;
      throw e;
    }
    return { replies: requests.map(() => ({})) };
  }

  private apply(req: BatchRequest) {
    // Cells in a column span move up (delete) or down (insert); columns outside it stay put.
    // Unlike Sheets, formulas elsewhere aren't re-pointed; the demo only needs the cells to move.
    if ('deleteRange' in req || 'insertRange' in req) {
      const del = 'deleteRange' in req;
      const range = del ? req.deleteRange.range : req.insertRange.range;
      const t = this.tabOf(range.sheetId);
      const n = range.endRowIndex - range.startRowIndex;
      for (const g of [this.f.values[t], this.f.formulas[t]]) {
        const height = Math.max(g.length, range.endRowIndex) + (del ? 0 : n);
        while (g.length < height) g.push([]);
        for (let c = range.startColumnIndex; c < range.endColumnIndex; c++) {
          const col = g.map((row) => row[c] ?? '');
          const moved = del
            ? [...col.slice(0, range.startRowIndex), ...col.slice(range.endRowIndex), ...Array(n).fill('')]
            : [...col.slice(0, range.startRowIndex), ...Array(n).fill(''), ...col.slice(range.startRowIndex, height - n)];
          g.forEach((row, r) => { while (row.length <= c) row.push(''); row[c] = moved[r]; });
        }
      }
      return;
    }
    if ('insertDimension' in req) {
      const { sheetId, startIndex: at } = req.insertDimension.range;
      const t = this.tabOf(sheetId);
      for (const g of [this.f.values[t], this.f.formulas[t]]) {
        while (g.length < at) g.push([]);
        g.splice(at, 0, []);
      }
      return;
    }
    if ('copyPaste' in req) {
      const { source, destination } = req.copyPaste;
      const t = this.tabOf(source.sheetId);
      const src = source.startRowIndex;
      const dst = destination.startRowIndex;
      const fg = this.f.formulas[t];
      const vg = this.f.values[t];
      for (const g of [fg, vg]) { while (g.length <= dst) g.push([]); }
      // Only the columns in the range, as Sheets does
      for (let c = source.startColumnIndex; c < source.endColumnIndex; c++) {
        const v = fg[src]?.[c] ?? '';
        for (const row of [fg[dst], vg[dst]]) { while (row.length <= c) row.push(''); }
        fg[dst][c] = isFormula(v) ? shiftRows(v, dst - src) : v;
        vg[dst][c] = isFormula(v) ? '' : v;
      }
      return;
    }
    const { start, rows } = req.updateCells;
    const t = this.tabOf(start.sheetId);
    const { rowIndex: r, columnIndex: c } = start;
    const u = rows[0].values[0].userEnteredValue ?? {};
    const fg = this.f.formulas[t];
    const vg = this.f.values[t];
    for (const g of [fg, vg]) {
      while (g.length <= r) g.push([]);
      while (g[r].length <= c) g[r].push('');
    }
    if (u.formulaValue !== undefined) {
      fg[r][c] = u.formulaValue;
      vg[r][c] = '';
    } else {
      const v = u.numberValue ?? u.stringValue ?? u.boolValue ?? '';
      fg[r][c] = v;
      vg[r][c] = v;
    }
    fg[r].forEach((v, i) => { if (isFormula(v)) vg[r][i] = evalSimple(v, vg); });
  }
}
