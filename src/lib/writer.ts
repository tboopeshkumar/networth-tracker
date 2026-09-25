// Write plans: describe a change, show it to the user, then apply it safely.
//
// A plan is position-independent. At execution time the sheet is re-read,
// every target is re-located by its content key, and each "before" value is
// compared with what the user saw. If anything moved or changed, nothing is
// written and a ConflictError explains why. Otherwise all changes go out in
// ONE spreadsheets.batchUpdate, which Google applies atomically.

import { a1, colLetter, isNum, n0, type Cell } from './format';
import { OPTIONAL_TABS, TABS, buildModel, detailSheets, type Model, type Row, type SpecId } from './model';
import type { BatchRequest, SheetData, SheetMeta, SheetsBackend, UserEnteredValue } from './sheets';

export class ConflictError extends Error {
  constructor(message: string, readonly details: string[] = []) { super(message); }
}

/* ---------- values ---------- */

export type CellValue = { number: number } | { string: string } | { formula: string } | { clear: true };

export const V = {
  number: (n: number): CellValue => ({ number: n }),
  string: (s: string): CellValue => ({ string: s }),
  date: (serial: number): CellValue => ({ number: serial }),
  formula: (f: string): CellValue => ({ formula: f }),
  clear: (): CellValue => ({ clear: true }),
};

function toEntered(v: CellValue): UserEnteredValue | undefined {
  if ('formula' in v) return { formulaValue: v.formula };
  if ('number' in v) return { numberValue: v.number };
  if ('string' in v && v.string !== '') return { stringValue: v.string };
  return undefined;
}

const same = (a: unknown, b: unknown) => {
  const blank = (x: unknown) => x === '' || x === null || x === undefined;
  if (blank(a) && blank(b)) return true;
  if (isNum(a) && isNum(b)) return Math.abs(a - b) < 0.005;
  return String(a ?? '').trim() === String(b ?? '').trim();
};

const fmtRaw = (v: unknown) =>
  (v === '' || v === null || v === undefined ? '(blank)' : isNum(v) ? v.toLocaleString('en-IN') : `"${String(v)}"`);

/* ---------- plans ---------- */

export type Target =
  | { kind: 'row'; id: SpecId; key: string; field: string }
  | { kind: 'cell'; path: string[] };

export interface ExecContext { insertAt: number | null; model: Model }

export interface SetOp {
  type: 'set';
  where: string;
  target: Target;
  expect: Cell | undefined;
  value: CellValue | ((ctx: ExecContext) => CellValue);
}

export interface InsertOp {
  type: 'insertRow';
  id: SpecId;
  cells: Record<string, CellValue>;
  expectLastKey?: string;
}

/**
 * Remove one row of a table: its cells shift up within the table's columns
 * only (other tables side by side are untouched), then a blank row of cells
 * is inserted above the table's end so everything below returns to where it
 * was. Sheets re-points references on both steps, so they end up unchanged.
 */
export interface RemoveOp {
  type: 'removeRow';
  id: SpecId;
  key: string;
  /** keys from the removed row to the table's end, as the user saw them */
  expectKeys: string[];
}

export interface Change {
  where: string;
  a1: string;
  before: string;
  after: string;
}

export interface Plan {
  title: string;
  changes: Change[];
  ops: (SetOp | InsertOp | RemoveOp)[];
}

const shown = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : isNum(v) ? v.toLocaleString('en-IN') : String(v));

/* ---------- loading ---------- */

export interface Loaded { meta: SheetMeta[]; data: SheetData; model: Model }

export async function loadAll(backend: SheetsBackend): Promise<Loaded> {
  const [meta, data] = await Promise.all([backend.meta(), backend.read(TABS)]);
  // Second pass: ledger tabs referenced from Receivables, and optional tabs
  // such as the jewellery register — only those that exist in this sheet
  const extra = [...new Set([...detailSheets(data.values), ...OPTIONAL_TABS])]
    .filter((t) => !(TABS as readonly string[]).includes(t) && meta.some((m) => m.title === t));
  if (extra.length) {
    const more = await backend.read(extra);
    Object.assign(data.values, more.values);
    Object.assign(data.formulas, more.formulas);
  }
  return { meta, data, model: buildModel(data.values, data.formulas) };
}

/* ---------- execution ---------- */

interface Resolved { tab: string; row: number; col: number; value: Cell | undefined }

function resolve(model: Model, target: Target): Resolved | null {
  if (target.kind === 'row') {
    const rec = (model.rows[target.id] as Row[]).find((r) => r._key === target.key);
    const tbl = model.tables[target.id];
    if (!rec || !tbl) return null;
    return { tab: tbl.spec.tab, row: rec._row, col: tbl.cols[target.field], value: rec[target.field] };
  }
  const ref = target.path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], model) as
    { tab: string; row: number | null; col: number; value?: Cell } | undefined;
  if (!ref || ref.row === null || ref.row === undefined) return null;
  return { tab: ref.tab, row: ref.row, col: ref.col, value: ref.value };
}

const cellReq = (sheetId: number, rowIndex: number, columnIndex: number, v: CellValue): BatchRequest => ({
  updateCells: {
    start: { sheetId, rowIndex, columnIndex },
    rows: [{ values: [{ userEnteredValue: toEntered(v) }] }],
    fields: 'userEnteredValue',
  },
});

export async function execute(backend: SheetsBackend, plan: Plan): Promise<{ requests: BatchRequest[] }> {
  const { meta, data, model } = await loadAll(backend);
  const sheetId = (tab: string) => {
    const s = meta.find((m) => m.title === tab);
    if (!s) throw new ConflictError(`Tab "${tab}" no longer exists`);
    return s.sheetId;
  };

  const problems: string[] = [];
  const sets: (SetOp & { at: Resolved })[] = [];
  for (const op of plan.ops) {
    if (op.type !== 'set') continue;
    const at = resolve(model, op.target);
    if (!at) { problems.push(`${op.where}: row or cell not found any more`); continue; }
    if (!same(at.value, op.expect)) {
      problems.push(`${op.where}: you saw ${fmtRaw(op.expect)}, the sheet now has ${fmtRaw(at.value)}`);
      continue;
    }
    sets.push({ ...op, at });
  }

  const insert = plan.ops.find((o): o is InsertOp => o.type === 'insertRow');
  const insertTable = insert ? model.tables[insert.id] : null;
  if (insert) {
    if (!insertTable) {
      problems.push('That section is no longer in the sheet');
    } else if (insert.expectLastKey) {
      const last = (model.rows[insert.id] as Row[]).at(-1);
      if (last?._key !== insert.expectLastKey) problems.push(`${insertTable.spec.tab}: rows were added or removed since you loaded it`);
    }
  }
  const remove = plan.ops.find((o): o is RemoveOp => o.type === 'removeRow');
  if (remove && plan.ops.length > 1) throw new Error('A removal must be the only change in its plan');
  const removeAt = remove ? locateRemoval(model, remove, problems) : null;

  if (problems.length) throw new ConflictError('The sheet changed since you loaded it. Nothing was written.', problems);

  const requests: BatchRequest[] = [];
  if (remove && removeAt) {
    const sid = sheetId(removeAt.tab);
    const cols = { startColumnIndex: removeAt.minCol, endColumnIndex: removeAt.maxCol + 1 };
    requests.push({ deleteRange: { range: { sheetId: sid, startRowIndex: removeAt.row, endRowIndex: removeAt.row + 1, ...cols }, shiftDimension: 'ROWS' } });
    requests.push({ insertRange: { range: { sheetId: sid, startRowIndex: removeAt.lastRow, endRowIndex: removeAt.lastRow + 1, ...cols }, shiftDimension: 'ROWS' } });
    await backend.batchUpdate(requests);
    return { requests };
  }
  const insertAt = insertTable ? insertTable.lastRow + 1 : null;
  // Which cells move down when the row goes in: whole row, only this table's columns, or none
  let shifted: { from: number; to: number } | null = null;

  if (insert && insertTable && insertAt !== null) {
    const tab = insertTable.spec.tab;
    const sid = sheetId(tab);
    const above = insertAt - 1;
    const prevF = data.formulas[tab][above] ?? [];
    const scoped = !!insertTable.spec.sideBySide;
    const from = scoped ? insertTable.minCol : 0;
    const width = scoped ? insertTable.maxCol + 1 : Math.max(prevF.length, insertTable.maxCol + 1);
    const span = { sheetId: sid, startColumnIndex: from, endColumnIndex: width };
    const nextF = data.formulas[tab][insertAt] ?? [];
    // A blank row just below the table (left by a delete) is reused rather than pushing everything down
    const reuse = scoped && insertAt !== insertTable.totalRow
      && Array.from({ length: width - from }, (_, i) => nextF[from + i]).every((v) => v === '' || v === undefined);

    if (scoped && !reuse) {
      requests.push({ insertRange: { range: { ...span, startRowIndex: insertAt, endRowIndex: insertAt + 1 }, shiftDimension: 'ROWS' } });
    } else if (!scoped) {
      requests.push({ insertDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: insertAt, endIndex: insertAt + 1 }, inheritFromBefore: true } });
    }
    if (!reuse) shifted = { from, to: width };
    requests.push({
      copyPaste: {
        source: { ...span, startRowIndex: above, endRowIndex: above + 1 },
        destination: { ...span, startRowIndex: insertAt, endRowIndex: insertAt + 1 },
        pasteType: 'PASTE_NORMAL',
      },
    });

    const fieldAt = Object.fromEntries(Object.entries(insertTable.cols).map(([f, c]) => [c, f]));
    for (let c = from; c < width; c++) {
      const field = fieldAt[c];
      const prev = prevF[c];
      let v: CellValue | null = null;
      if (field && field in insert.cells) v = insert.cells[field];
      else if (typeof prev === 'string' && prev.startsWith('=')) continue; // keep the copied formula
      else if (prev !== '' && prev !== undefined) v = V.clear(); // don't inherit the old row's inputs
      if (v) requests.push(cellReq(sid, insertAt, c, v));
    }
  }

  for (const s of sets) {
    const moved = !!shifted && insertAt !== null && s.at.tab === insertTable?.spec.tab && s.at.row >= insertAt
      && s.at.col >= shifted.from && s.at.col < shifted.to;
    const value = typeof s.value === 'function' ? s.value({ insertAt, model }) : s.value;
    requests.push(cellReq(sheetId(s.at.tab), moved ? s.at.row + 1 : s.at.row, s.at.col, value));
  }

  await backend.batchUpdate(requests);
  return { requests };
}

/** Where a removal lands now, or why it can't: the rows from it to the table's end must be as the user saw them. */
function locateRemoval(model: Model, op: RemoveOp, problems: string[]) {
  const tbl = model.tables[op.id];
  const rows = model.rows[op.id] as Row[];
  const i = rows.findIndex((r) => r._key === op.key);
  if (!tbl || i < 0) { problems.push('That row is no longer in the sheet'); return null; }
  const now = rows.slice(i).map((r) => r._key);
  if (now.join('\n') !== op.expectKeys.join('\n')) {
    problems.push(`${tbl.spec.tab}: rows were added, removed or changed below it since you loaded it`);
    return null;
  }
  return { tab: tbl.spec.tab, row: rows[i]._row, lastRow: tbl.lastRow, minCol: tbl.minCol, maxCol: tbl.maxCol };
}

/* ---------- plan builders ---------- */

/** Remove a table row; the review lists each of its cells as removed. */
export function planRemove(model: Model, id: SpecId, rec: Row, title: string): Plan {
  const tbl = model.tables[id]!;
  const headers = { ...tbl.spec.optionalHeaders, ...tbl.spec.headers } as Record<string, string>;
  const rows = model.rows[id] as Row[];
  const at = rows.findIndex((r) => r._key === rec._key);
  return {
    title,
    changes: Object.entries(tbl.cols)
      .filter(([f]) => headers[f])
      .sort((a, b) => a[1] - b[1])
      .map(([f, c]) => ({ where: headers[f], a1: a1(tbl.spec.tab, rec._row, c), before: shown(rec[f]), after: '(removed)' })),
    ops: [{ type: 'removeRow', id, key: rec._key, expectKeys: rows.slice(at).map((r) => r._key) }],
  };
}

export interface Edit { value: CellValue; display: string; before?: string; label?: string }

/** Update fields of an existing table row. */
export function planRowEdit(model: Model, id: SpecId, rec: Row, edits: Record<string, Edit>, title: string): Plan {
  const tbl = model.tables[id]!;
  const headers = { ...tbl.spec.optionalHeaders, ...tbl.spec.headers } as Record<string, string>;
  return {
    title,
    changes: Object.entries(edits).map(([field, e]) => ({
      where: e.label ?? headers[field],
      a1: a1(tbl.spec.tab, rec._row, tbl.cols[field]),
      before: e.before ?? shown(rec[field]),
      after: e.display,
    })),
    ops: Object.entries(edits).map(([field, e]) => ({
      type: 'set' as const,
      where: `${tbl.spec.tab} › ${headers[field]}`,
      target: { kind: 'row' as const, id, key: rec._key, field },
      expect: rec[field],
      value: e.value,
    })),
  };
}

export interface CellRefLike { tab: string; row: number | null; col: number; label: string; value?: Cell; formula?: string | null }

/** Update a standalone labelled cell (FX rate, NPS, summaries). */
export function planCellEdit(path: string[], ref: CellRefLike, value: CellValue, display: string, title: string, before?: string): Plan {
  return {
    title,
    changes: [{ where: ref.label, a1: a1(ref.tab, ref.row ?? 0, ref.col), before: before ?? shown(ref.formula ?? ref.value), after: display }],
    ops: [{ type: 'set', where: `${ref.tab} › ${ref.label}`, target: { kind: 'cell', path }, expect: ref.value, value }],
  };
}

/** Append a row to a table, directly under its last row. */
export function planInsert(
  model: Model, id: SpecId, cells: Record<string, CellValue>, display: Record<string, string>, title: string,
  extra: { ops?: SetOp[]; changes?: Change[] } = {},
): Plan {
  const tbl = model.tables[id]!;
  const headers = { ...tbl.spec.optionalHeaders, ...tbl.spec.headers } as Record<string, string>;
  const last = (model.rows[id] as Row[]).at(-1);
  const newRow = tbl.lastRow + 1;
  return {
    title,
    changes: [
      ...Object.entries(display).map(([field, after]) => ({
        where: headers[field], a1: a1(tbl.spec.tab, newRow, tbl.cols[field]), before: '—', after,
      })),
      { where: 'Formula columns', a1: `${tbl.spec.tab} row ${newRow + 1}`, before: '—', after: 'copied from the row above' },
      ...(extra.changes ?? []),
    ],
    ops: [{ type: 'insertRow', id, cells, expectLastKey: last?._key }, ...(extra.ops ?? [])],
  };
}

/**
 * Gold/Silver (UAE) purchase: insert the row, and turn the summary's typed
 * invested/qty cells into SUM formulas that include it. The range runs through
 * the spacer row, so later purchases extend it automatically.
 */
export function planMetalPurchase(
  model: Model, id: 'goldUae' | 'silverUae', cells: Record<string, CellValue>, display: Record<string, string>, title: string,
): Plan {
  const tbl = model.tables[id];
  const sum = model.summaries[id];
  if (!sum) throw new Error(`No summary block found on ${tbl.spec.tab}`);
  const first = tbl.firstRow + 1; // 1-based
  const f = (col: string) => ({ insertAt }: ExecContext) => V.formula(`=SUM(${col}${first}:${col}${n0(insertAt) + 2})`);
  const added = (field: string) => ('number' in cells[field] ? (cells[field] as { number: number }).number : 0);
  const after = (v: unknown, add: number, dp: number) => `${isNum(v) ? (v + add).toFixed(dp) : '—'} (now a SUM formula)`;

  return planInsert(model, id, cells, display, title, {
    ops: [
      { type: 'set', where: `${sum.tab} › Invested (AED)`, target: { kind: 'cell', path: ['summaries', id, 'investedAed'] }, expect: sum.investedAed.value, value: f(colLetter(tbl.cols.cost)) },
      { type: 'set', where: `${sum.tab} › Quantity`, target: { kind: 'cell', path: ['summaries', id, 'qty'] }, expect: sum.qty.value, value: f(colLetter(tbl.cols.qty)) },
    ],
    changes: [
      { where: 'Summary · Invested (AED)', a1: a1(sum.tab, sum.investedAed.row ?? 0, sum.investedAed.col), before: shown(sum.investedAed.value), after: after(sum.investedAed.value, added('cost'), 2) },
      { where: 'Summary · Quantity', a1: a1(sum.tab, sum.qty.row ?? 0, sum.qty.col), before: shown(sum.qty.value), after: after(sum.qty.value, added('qty'), 2) },
    ],
  });
}
