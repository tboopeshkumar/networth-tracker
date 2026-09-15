// Write plans: describe a change, show it to the user, then apply it safely.
//
// A plan is position-independent. At execution time the sheet is re-read, every
// target is re-located by its content key, and each "before" value is compared
// with what the user saw. If anything moved or changed, nothing is written and
// a ConflictError explains why. Otherwise all changes go out in ONE
// spreadsheets.batchUpdate, which Google applies atomically.

import { TABS, buildModel } from './model.js';
import { a1, colLetter, isNum } from './util.js';

export class ConflictError extends Error {
  constructor(message, details = []) { super(message); this.details = details; }
}

/* ---------- cell values ---------- */

export const V = {
  number: (n) => ({ number: n }),
  string: (s) => ({ string: s }),
  date: (serial) => ({ number: serial }),
  formula: (f) => ({ formula: f }),
  clear: () => ({}),
};

function toCellData(v) {
  if ('formula' in v) return { userEnteredValue: { formulaValue: v.formula } };
  if ('number' in v) return { userEnteredValue: { numberValue: v.number } };
  if ('string' in v) return v.string === '' ? {} : { userEnteredValue: { stringValue: v.string } };
  return {};
}

const same = (a, b) => {
  const blank = (x) => x === '' || x === null || x === undefined;
  if (blank(a) && blank(b)) return true;
  if (isNum(a) && isNum(b)) return Math.abs(a - b) < 0.005;
  return String(a ?? '').trim() === String(b ?? '').trim();
};

/* ---------- target resolution ---------- */

// Targets:
//   { kind: 'row',  id: 'mf', key, field }
//   { kind: 'cell', path: ['cells', 'fxAedInr'] }  or  ['summaries', 'goldUae', 'qty']
function resolve(model, target) {
  if (target.kind === 'row') {
    const rec = model.rows[target.id].find((r) => r._key === target.key);
    if (!rec) return null;
    const tbl = model.tables[target.id];
    return { tab: tbl.spec.tab, row: rec._row, col: tbl.cols[target.field], value: rec[target.field] };
  }
  const ref = target.path.reduce((o, k) => (o ? o[k] : undefined), model);
  if (!ref || ref.row === null || ref.row === undefined) return null;
  return { tab: ref.tab, row: ref.row, col: ref.col, value: ref.value };
}

export async function loadAll(adapter) {
  const [meta, data] = await Promise.all([adapter.meta(), adapter.read(TABS)]);
  return { meta, data, model: buildModel(data.values, data.formulas) };
}

/* ---------- execution ---------- */

export async function execute(adapter, plan) {
  const { meta, data, model } = await loadAll(adapter);
  const sheetId = (tab) => {
    const s = meta.find((m) => m.title === tab);
    if (!s) throw new ConflictError(`Tab "${tab}" no longer exists`);
    return s.sheetId;
  };

  const problems = [];
  const sets = [];
  for (const op of plan.ops.filter((o) => o.type === 'set')) {
    const at = resolve(model, op.target);
    if (!at) { problems.push(`${op.where}: row or cell not found any more`); continue; }
    if (!same(at.value, op.expect)) {
      problems.push(`${op.where}: you saw ${fmtRaw(op.expect)}, the sheet now has ${fmtRaw(at.value)}`);
      continue;
    }
    sets.push({ ...op, at });
  }

  const insert = plan.ops.find((o) => o.type === 'insertRow');
  let insertAt = null;
  if (insert) {
    const tbl = model.tables[insert.id];
    if (insert.expectLastKey) {
      const lastRec = model.rows[insert.id].at(-1);
      if (!lastRec || lastRec._key !== insert.expectLastKey) {
        problems.push(`${tbl.spec.tab}: rows were added or removed since you loaded it`);
      }
    }
    insertAt = tbl.lastRow + 1;
  }
  if (problems.length) {
    throw new ConflictError('The sheet changed since you loaded it. Nothing was written.', problems);
  }

  const requests = [];

  if (insert) {
    const tbl = model.tables[insert.id];
    const tab = tbl.spec.tab;
    const sid = sheetId(tab);
    const above = insertAt - 1;
    const prevF = data.formulas[tab][above] || [];
    const width = Math.max(prevF.length, tbl.maxCol + 1);

    requests.push({ insertDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: insertAt, endIndex: insertAt + 1 }, inheritFromBefore: true } });
    requests.push({
      copyPaste: {
        source: { sheetId: sid, startRowIndex: above, endRowIndex: above + 1, startColumnIndex: 0, endColumnIndex: width },
        destination: { sheetId: sid, startRowIndex: insertAt, endRowIndex: insertAt + 1, startColumnIndex: 0, endColumnIndex: width },
        pasteType: 'PASTE_NORMAL',
      },
    });

    const fieldAt = Object.fromEntries(Object.entries(tbl.cols).map(([f, c]) => [c, f]));
    for (let c = 0; c < width; c++) {
      const field = fieldAt[c];
      let v = null;
      if (field && field in insert.cells) v = insert.cells[field];
      else if (typeof prevF[c] === 'string' && prevF[c].startsWith('=')) continue; // keep copied formula
      else if (prevF[c] !== '' && prevF[c] !== undefined) v = V.clear(); // don't inherit the old row's inputs
      if (v) requests.push(cellReq(sid, insertAt, c, v));
    }
  }

  for (const s of sets) {
    const row = insertAt !== null && s.at.tab === model.tables[insert.id].spec.tab && s.at.row >= insertAt ? s.at.row + 1 : s.at.row;
    const value = typeof s.value === 'function' ? s.value({ insertAt, model }) : s.value;
    requests.push(cellReq(sheetId(s.at.tab), row, s.at.col, value));
  }

  await adapter.batchUpdate(requests);
  return { requests };
}

const cellReq = (sheetId, rowIndex, columnIndex, v) => ({
  updateCells: { start: { sheetId, rowIndex, columnIndex }, rows: [{ values: [toCellData(v)] }], fields: 'userEnteredValue' },
});

const fmtRaw = (v) => (v === '' || v === null || v === undefined ? '(blank)' : isNum(v) ? v.toLocaleString('en-IN') : `"${v}"`);

/* ---------- plan builders ---------- */

// Update one field of an existing table row.
export function planRowEdit(model, id, rec, edits, title) {
  const tbl = model.tables[id];
  return {
    title,
    changes: Object.entries(edits).map(([field, { value, display }]) => ({
      where: `${tbl.spec.headers[field]}`,
      a1: a1(tbl.spec.tab, rec._row, tbl.cols[field]),
      before: rec[field],
      after: display,
    })),
    ops: Object.entries(edits).map(([field, { value }]) => ({
      type: 'set',
      where: `${tbl.spec.tab} › ${tbl.spec.headers[field]}`,
      target: { kind: 'row', id, key: rec._key, field },
      expect: rec[field],
      value,
    })),
  };
}

// Update a standalone labelled cell (FX rate, NPS, summaries).
export function planCellEdit(path, ref, value, display, title) {
  return {
    title,
    changes: [{ where: ref.label, a1: a1(ref.tab, ref.row, ref.col), before: ref.formula || ref.value, after: display }],
    ops: [{ type: 'set', where: `${ref.tab} › ${ref.label}`, target: { kind: 'cell', path }, expect: ref.value, value }],
  };
}

// Append a row to a table, directly under its last row.
export function planInsert(model, id, cells, display, title, extraOps = [], extraChanges = []) {
  const tbl = model.tables[id];
  const last = model.rows[id].at(-1);
  const newRow = tbl.lastRow + 1;
  return {
    title,
    changes: [
      ...Object.entries(display).map(([field, after]) => ({
        where: tbl.spec.headers[field], a1: a1(tbl.spec.tab, newRow, tbl.cols[field]), before: null, after,
      })),
      { where: 'Formula columns', a1: `${tbl.spec.tab} row ${newRow + 1}`, before: null, after: 'copied from the row above' },
      ...extraChanges,
    ],
    ops: [{ type: 'insertRow', id, cells, expectLastKey: last?._key }, ...extraOps],
  };
}

// Gold/Silver (UAE) purchase: insert the row, and turn the summary's typed
// invested/qty cells into SUM formulas that include the new row. The range
// runs through the spacer row so future purchases extend it automatically.
export function planMetalPurchase(model, id, cells, display, title) {
  const tbl = model.tables[id];
  const sum = model.summaries[id];
  const first = tbl.firstRow + 1; // 1-based
  const costCol = colLetter(tbl.cols.cost);
  const qtyCol = colLetter(tbl.cols.qty);
  const f = (col) => ({ insertAt }) => V.formula(`=SUM(${col}${first}:${col}${insertAt + 2})`);
  const newCost = cells.cost.number;
  const newQty = cells.qty.number;

  const extraOps = [
    { type: 'set', where: `${sum.tab} › Invested (AED)`, target: { kind: 'cell', path: ['summaries', id, 'investedAed'] }, expect: sum.investedAed.value, value: f(costCol) },
    { type: 'set', where: `${sum.tab} › Quantity`, target: { kind: 'cell', path: ['summaries', id, 'qty'] }, expect: sum.qty.value, value: f(qtyCol) },
  ];
  const extraChanges = [
    { where: 'Summary · Invested (AED)', a1: a1(sum.tab, sum.investedAed.row, sum.investedAed.col), before: sum.investedAed.value, after: `${(sum.investedAed.value + newCost).toFixed(2)} (now a SUM formula)` },
    { where: 'Summary · Quantity', a1: a1(sum.tab, sum.qty.row, sum.qty.col), before: sum.qty.value, after: `${sum.qty.value + newQty} (now a SUM formula)` },
  ];
  return planInsert(model, id, cells, display, title, extraOps, extraChanges);
}
