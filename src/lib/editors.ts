// What each edit/add dialog asks for, and how its answers become a write plan.
// Pure: the dialog component renders these and never builds plans itself.

import { a1, fmtDate, inr, isNum, isoToSerial, num, todaySerial, type Cell } from './format';
import { isFormula, type Model, type Row, type SpecId } from './model';
import type { SheetData } from './sheets';
import {
  V, planCellEdit, planInsert, planMetalPurchase, planRemove, planRowEdit,
  type CellRefLike, type CellValue, type Change, type Edit, type ExecContext, type Plan, type SetOp,
} from './writer';

export type FieldType = 'money' | 'number' | 'date' | 'text' | 'select';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  value?: Cell | null;
  required?: boolean;
  hint?: string;
  /** suggestions for a text field */
  list?: string[];
  /** [value, label] pairs for a select */
  options?: [string, string][];
  /** only show while the "mode" select has this value */
  showIf?: string;
  /** typing in this field moves that date field to today */
  bumps?: string;
  aed?: boolean;
  /** an identifier such as a scheme code: shown without grouping or decimals */
  plain?: boolean;
}

export type EditableRow = 'mf' | 'equity' | 'sgb' | 'fd' | 'bankInr' | 'bankAed' | 'nps' | 'duesInr' | 'duesAed';
export type AddableId = 'mf' | 'fd' | 'goldUae' | 'silverUae' | 'trend' | 'bankInr' | 'bankAed' | 'duesInr' | 'duesAed';
export type CellPath =
  | 'cells.fxAedInr' | 'cells.fxUsdAed' | 'cells.npsInvested' | 'cells.npsGain'
  | 'summaries.goldUae.currentAed' | 'summaries.silverUae.sellPrice';

export type EditRequest =
  | { kind: 'row'; id: EditableRow; key: string }
  | { kind: 'cell'; path: CellPath }
  | { kind: 'add'; id: AddableId }
  | { kind: 'link'; sheet: string }
  | { kind: 'remove'; id: RemovableRow; key: string };

/** Rows the app offers to delete: plain lists with nothing hanging off them. */
export type RemovableRow = 'bankInr' | 'bankAed' | 'duesInr' | 'duesAed';

export type Values = Record<string, string>;

export interface EditorDef {
  title: string;
  hint?: string;
  fields: Field[];
  /** a destructive change: the final button says so, in red */
  danger?: boolean;
  /** Throws an Error with a user-facing message when the input isn't valid. */
  build(vals: Values): { plan: Plan; warn: string[] };
}

export const LIVE_AED_INR = '=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725';

/* ---------- field helpers ---------- */

const money = (name: string, label: string, value: Cell | undefined, extra: Partial<Field> = {}): Field => ({ name, label, type: 'money', value, ...extra });
const number = (name: string, label: string, value: Cell | undefined, extra: Partial<Field> = {}): Field => ({ name, label, type: 'number', value, ...extra });
const date = (name: string, label: string, value: Cell | undefined, extra: Partial<Field> = {}): Field => ({ name, label, type: 'date', value, ...extra });
const text = (name: string, label: string, value: Cell | undefined, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', value, ...extra });

const uniq = (xs: unknown[]) => [...new Set(xs.filter((x) => x !== '' && x !== null && x !== undefined).map(String))].sort();

/** Form input → cell value; null when left blank. */
export function cellValue(field: Pick<Field, 'type' | 'label'>, raw: string | undefined): CellValue | null {
  if (field.type === 'date') return raw ? V.date(isoToSerial(raw)) : null;
  if (field.type === 'money' || field.type === 'number') {
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number(raw.replace(/[₹,\s]|AED/gi, ''));
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    return V.number(n);
  }
  return raw === undefined || raw.trim() === '' ? null : V.string(raw.trim());
}

export function display(field: Pick<Field, 'type' | 'aed' | 'plain'>, v: CellValue | null): string {
  if (!v || 'clear' in v) return '—';
  if ('formula' in v) return v.formula;
  if ('string' in v) return v.string;
  if (field.type === 'date') return fmtDate(v.number);
  if (field.type === 'money') return field.aed ? `AED ${num(v.number)}` : inr(v.number);
  if (field.plain) return String(v.number);
  return num(v.number, 4);
}

/** The current value of a field, formatted like its new value would be. */
function before(field: Field, v: Cell | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (isFormula(v)) return v;
  return display(field, isNum(v) ? V.number(v) : V.string(String(v)));
}

/* ---------- editing an existing row ---------- */

const schemeCode = (value: Cell | undefined, extra: Partial<Field> = {}): Field =>
  number('code', 'AMFI scheme code', value, { plain: true, hint: 'The fund’s code in AMFI’s NAV list; the NAV Feed looks its price up by this', ...extra });

/** A fund whose current value is a formula over its units, i.e. priced by the NAV Feed. */
function navFed(model: Model, data: SheetData, rec: Row): boolean {
  const t = model.tables.mf;
  return t.cols.units !== undefined && isFormula(data.formulas[t.spec.tab]?.[rec._row]?.[t.cols.current]);
}

function rowEditor(model: Model, data: SheetData, id: EditableRow, rec: Row | undefined): EditorDef {
  const tbl = model.tables[id];
  if (!rec || !tbl) throw new Error('That row is no longer in the sheet. Refresh and try again.');
  const bump = (f: string) => ({ bumps: f });
  let name: string;
  let fields: Field[];
  let hint: string | undefined;
  switch (id) {
    case 'mf':
      name = `${rec.fund} · ${rec.holder}`;
      // Priced by the NAV Feed: what you own is the input, its value follows
      if (navFed(model, data, rec)) {
        fields = [number('units', 'Units', rec.units), money('invested', 'Invested (₹)', rec.invested), schemeCode(rec.code)];
        hint = 'Current value is units × the latest NAV from the NAV Feed tab, so it updates as soon as you save.';
      } else {
        fields = [money('current', 'Current value (₹)', rec.current, bump('navDate')), money('invested', 'Invested (₹)', rec.invested), date('navDate', 'Valued on', rec.navDate)];
      }
      break;
    case 'equity': {
      name = `${rec.account} · ${rec.details || ''}`;
      const cur = rec.currency && rec.currency !== 'INR' ? String(rec.currency) : null;
      fields = cur
        ? [number('currentLocal', `Current (${cur})`, rec.currentLocal, bump('navDate')), number('investedLocal', `Invested (${cur})`, rec.investedLocal), date('navDate', 'Priced on', rec.navDate)]
        : [money('currentInr', 'Current (₹)', rec.currentInr, bump('navDate')), money('investedInr', 'Invested (₹)', rec.investedInr), date('navDate', 'Priced on', rec.navDate)];
      break;
    }
    case 'sgb':
      name = `${rec.holding} · ${rec.holder}`;
      fields = [money('market', 'Market value (₹)', rec.market, bump('valueDate')), date('valueDate', 'Valued on', rec.valueDate)];
      break;
    case 'fd':
      name = `${rec.institution} · ${rec.holder}`;
      fields = [money('amount', 'Amount (₹)', rec.amount), money('maturityAmount', 'Maturity amount (₹)', rec.maturityAmount), date('maturityDate', 'Maturity date', rec.maturityDate), number('rate', 'Rate %', rec.rate)];
      break;
    case 'duesInr':
    case 'duesAed': {
      const aed = id === 'duesAed';
      name = String(rec.item);
      fields = [text('item', 'Item', rec.item, { required: true }), date('dueDate', 'Due date', rec.dueDate), money('amount', aed ? 'Amount (AED)' : 'Amount (₹)', rec.amount, { aed })];
      break;
    }
    case 'nps':
      name = String(rec.scheme || rec.schemeId);
      fields = [number('units', 'Units', rec.units)];
      hint = 'Value is units × the latest NAV from the NPS Feed tab. After a contribution, also update NPS contributions under Rates & other inputs.';
      break;
    case 'bankInr':
      name = `${rec.account} · ${rec.holder}`;
      fields = [text('account', 'Account', rec.account, { required: true }), text('holder', 'Holder', rec.holder), money('balance', 'Balance (₹)', rec.balance)];
      break;
    case 'bankAed':
      name = `${rec.account} · ${rec.holder}`;
      fields = [text('account', 'Account', rec.account, { required: true }), text('holder', 'Holder / notes', rec.holder), money('balance', 'Balance (AED)', rec.balance, { aed: true })];
      break;
  }
  const title = `Edit ${name}`;
  return {
    title,
    hint,
    fields,
    build(vals) {
      const edits: Record<string, Edit> = {};
      const warn: string[] = [];
      for (const f of fields) {
        const v = cellValue(f, vals[f.name]);
        const was = rec[f.name];
        if (!v) continue;
        if ('number' in v && isNum(was) && Math.abs(v.number - was) < 0.005) continue;
        if ('string' in v && v.string === String(was ?? '').trim()) continue;
        edits[f.name] = { value: v, display: display(f, v), before: before(f, was), label: f.label };
        const fx = data.formulas[tbl.spec.tab]?.[rec._row]?.[tbl.cols[f.name]];
        if (isFormula(fx)) warn.push(`${f.label} is currently a formula (${fx}); this replaces it with a fixed value.`);
      }
      if (!Object.keys(edits).length) throw new Error('Nothing changed.');
      return { plan: planRowEdit(model, id, rec, edits, title), warn };
    },
  };
}

/* ---------- single cells ---------- */

function cellEditor(model: Model, path: CellPath): EditorDef {
  const parts = path.split('.');
  const ref = parts.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], model) as CellRefLike | undefined;
  if (!ref) throw new Error('That cell was not found in the sheet.');
  const replaces = ref.formula ? [`This replaces the formula ${ref.formula}.`] : [];

  const single = (field: Field, title: string, hint?: string): EditorDef => ({
    title, hint, fields: [field],
    build(vals) {
      const v = cellValue(field, vals[field.name]);
      if (!v) throw new Error('Enter a value.');
      return { plan: planCellEdit(parts, ref, v, display(field, v), title, before(field, ref.formula ?? ref.value)), warn: replaces };
    },
  });

  const withAsOf = (field: Field, title: string): EditorDef => {
    // When NPS is priced from scheme NAVs, "As of" is a formula over their dates: leave it alone
    const asOf = model.cells.npsAsOf?.formula ? undefined : model.cells.npsAsOf;
    return {
      title,
      fields: asOf || !model.cells.npsAsOf ? [field, date('asOf', 'As of', asOf?.value ?? todaySerial())] : [field],
      build(vals) {
        const v = cellValue(field, vals[field.name]);
        if (!v) throw new Error('Enter a value.');
        const plan = planCellEdit(parts, ref, v, display(field, v), title, before(field, ref.value));
        const d = cellValue({ type: 'date', label: 'As of' }, vals.asOf);
        if (asOf && d && 'number' in d && d.number !== asOf.value) {
          const q = planCellEdit(['cells', 'npsAsOf'], asOf, d, fmtDate(d.number), title, fmtDate(asOf.value));
          plan.changes.push(...q.changes);
          plan.ops.push(...q.ops);
        }
        return { plan, warn: [] };
      },
    };
  };

  switch (path) {
    case 'cells.fxAedInr': {
      const rate = number('rate', 'AED → INR rate', ref.value, { showIf: 'typed' });
      return {
        title: 'AED → INR rate',
        hint: `The live option writes ${LIVE_AED_INR}. AED is pegged to USD at 3.6725, so this tracks the market with no upkeep. Google Finance quotes can be up to 20 minutes old.`,
        fields: [
          { name: 'mode', label: 'Source', type: 'select', value: ref.formula ? 'live' : 'typed', options: [['typed', 'Type a rate'], ['live', 'Live rate from Google Finance']] },
          rate,
        ],
        build(vals) {
          if (vals.mode === 'live') {
            if (ref.formula === LIVE_AED_INR) throw new Error('Already using the live rate.');
            return { plan: planCellEdit(parts, ref, V.formula(LIVE_AED_INR), LIVE_AED_INR, 'AED → INR rate', before(rate, ref.formula ?? ref.value)), warn: [] };
          }
          const v = cellValue(rate, vals.rate);
          if (!v) throw new Error('Enter a rate.');
          return { plan: planCellEdit(parts, ref, v, display(rate, v), 'AED → INR rate', before(rate, ref.formula ?? ref.value)), warn: replaces };
        },
      };
    }
    case 'cells.fxUsdAed':
      return single(number('rate', 'USD → AED rate', ref.value), 'USD → AED rate', 'AED is officially pegged at 3.6725 per USD.');
    case 'cells.npsInvested':
      return withAsOf(money('v', 'NPS contributions (₹)', ref.value), 'NPS contributions');
    case 'cells.npsGain':
      return withAsOf(money('v', 'NPS gain (₹)', ref.value), 'NPS gain');
    case 'summaries.goldUae.currentAed':
      return single(money('v', 'Current value (AED)', ref.value, { aed: true }), 'Gold (UAE) current value', `You hold ${num(model.summaries.goldUae?.qty.value)} g.`);
    case 'summaries.silverUae.sellPrice':
      return single(number('v', 'Sell price (AED per oz)', ref.value), 'Silver sell price', `Current value is calculated from this × ${num(model.summaries.silverUae?.qty.value)} oz.`);
  }
}

/* ---------- adding rows ---------- */

/**
 * A plain =SUM(X5:X9) total doesn't grow when a row is added just below its
 * range, so rewrite it to run from the first row through the new one.
 * Totals written any other way (INDIRECT, custom) are left alone.
 */
function totalCovering(model: Model, data: SheetData, id: SpecId, field: string): { ops?: SetOp[]; changes?: Change[] } {
  const tbl = model.tables[id];
  if (!tbl || tbl.totalRow === null) return {};
  const col = tbl.cols[field];
  const f = data.formulas[tbl.spec.tab]?.[tbl.totalRow]?.[col];
  const m = /^=\s*SUM\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?\1\$?(\d+)\s*\)\s*$/i.exec(String(f ?? ''));
  if (!m) return {};
  const letters = m[1].toUpperCase();
  const first = Number(m[2]);
  return {
    changes: [{ where: 'Total', a1: a1(tbl.spec.tab, tbl.totalRow, col), before: String(f), after: `=SUM(${letters}${first}:${letters}<new row>)` }],
    ops: [{
      type: 'set', where: `${tbl.spec.tab} › total`, target: { kind: 'total', id, field }, expect: undefined,
      value: ({ insertAt }: ExecContext) => V.formula(`=SUM(${letters}${first}:${letters}${(insertAt ?? tbl.lastRow + 1) + 1})`),
    }],
  };
}

function addEditor(model: Model, data: SheetData, id: AddableId): EditorDef {
  const today = todaySerial();
  const holders = uniq([...model.rows.mf, ...model.rows.fd, ...model.rows.sgb, ...model.rows.networth].map((r) => r.holder))
    .filter((h) => h.length < 30);
  // Default to whoever holds the most rows in that table
  const usual = (rows: { holder: Cell }[]) => {
    const n: Record<string, number> = {};
    for (const r of rows) if (r.holder) n[String(r.holder)] = (n[String(r.holder)] ?? 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? holders[0] ?? '';
  };
  const holder = (rows: { holder: Cell }[]): Field =>
    ({ name: 'holder', label: 'Holder', type: 'select', value: usual(rows), options: holders.map((h) => [h, h]) });

  const collect = (fields: Field[], vals: Values) => {
    const cells: Record<string, CellValue> = {};
    const shown: Record<string, string> = {};
    for (const f of fields) {
      const v = cellValue(f, vals[f.name]);
      if (f.required && !v) throw new Error(`${f.label} is required.`);
      if (v) { cells[f.name] = v; shown[f.name] = display(f, v); }
    }
    return { cells, shown };
  };
  const simple = (tableId: SpecId, title: string, fields: Field[], hint?: string): EditorDef => ({
    title, hint, fields,
    build(vals) {
      const { cells, shown } = collect(fields, vals);
      return { plan: planInsert(model, tableId, cells, shown, title), warn: [] };
    },
  });

  switch (id) {
    case 'mf':
      if (model.tables.mf.cols.units !== undefined) {
        return simple('mf', 'Add mutual fund', [
          text('fund', 'Fund name', '', { required: true }), holder(model.rows.mf),
          text('category', 'Category', '', { list: uniq(model.rows.mf.map((r) => r.category)) }),
          text('platform', 'Platform / AMC', '', { list: uniq(model.rows.mf.map((r) => r.platform)) }),
          text('folio', 'Folio', ''),
          schemeCode('', { required: true }),
          number('units', 'Units', '', { required: true }),
          money('invested', 'Invested (₹)', '', { required: true }),
        ], 'Current value and NAV date are copied as formulas from the fund above. They fill in after the next NAV refresh; to see it now, use Net Worth → Refresh NAVs now in the sheet.');
      }
      return simple('mf', 'Add mutual fund', [
        text('fund', 'Fund name', '', { required: true }), holder(model.rows.mf),
        text('category', 'Category', '', { list: uniq(model.rows.mf.map((r) => r.category)) }),
        text('platform', 'Platform / AMC', '', { list: uniq(model.rows.mf.map((r) => r.platform)) }),
        text('folio', 'Folio', ''),
        money('invested', 'Invested (₹)', '', { required: true }),
        money('current', 'Current value (₹)', '', { required: true }),
        date('navDate', 'Valued on', today),
      ]);
    case 'bankInr':
    case 'bankAed': {
      const aed = id === 'bankAed';
      const rows = model.rows[id];
      return simple(id, aed ? 'Add AED bank account' : 'Add INR bank account', [
        text('account', 'Account', '', { required: true }),
        text('holder', aed ? 'Holder / notes' : 'Holder', '', { list: uniq(rows.map((r) => r.holder)) }),
        money('balance', aed ? 'Balance (AED)' : 'Balance (₹)', '', { required: true, aed }),
      ], 'Added at the end of the list, in this table only; the table beside it and everything below stay where they are.');
    }
    case 'duesInr':
    case 'duesAed': {
      const aed = id === 'duesAed';
      const tbl = model.tables[id];
      if (!tbl) throw new Error('That table is no longer in the sheet. Refresh and try again.');
      const fields = [
        text('item', 'Item', '', { required: true }),
        date('dueDate', 'Due date', ''),
        money('amount', aed ? 'Amount (AED)' : 'Amount (₹)', '', { required: true, aed }),
      ];
      const title = aed ? 'Add AED due' : 'Add INR due';
      return {
        title, fields,
        hint: 'Added at the end of the list, in this table only. Its total is widened to include it.',
        build(vals) {
          const { cells, shown } = collect(fields, vals);
          return { plan: planInsert(model, id, cells, shown, title, totalCovering(model, data, id, 'amount')), warn: [] };
        },
      };
    }
    case 'fd':
      return simple('fd', 'Add fixed deposit', [
        date('date', 'Invested on', today, { required: true }),
        text('institution', 'Institution', '', { required: true }), holder(model.rows.fd),
        money('amount', 'Amount (₹)', '', { required: true }),
        money('maturityAmount', 'Maturity amount (₹)', ''),
        date('maturityDate', 'Maturity date', ''),
        text('duration', 'Duration', ''),
        number('rate', 'Rate %', ''),
        text('ref', 'Reference', ''),
      ]);
    case 'trend':
      return simple('trend', 'Add monthly snapshot', [
        date('month', 'Month end', today, { required: true }),
        money('networth', 'Net worth (₹)', Math.round(model.totals.current), { required: true, hint: 'Prefilled with today’s total from the Net Worth tab' }),
        text('note', 'Note', ''),
      ]);
    case 'goldUae':
    case 'silverUae': {
      const gold = id === 'goldUae';
      const unit = gold ? 'g' : 'oz';
      const title = gold ? 'Add gold purchase (UAE)' : 'Add silver purchase (UAE)';
      const fields = [
        date('date', 'Bought on', today, { required: true }),
        text('source', 'Source', model.rows[id].at(-1)?.source ?? ''),
        number('perUnit', `Price (AED per ${unit})`, '', { required: true }),
        number('qty', `Quantity (${unit})`, '', { required: true }),
        number('cost', 'Total cost (AED)', '', { hint: 'Leave blank to use price × quantity' }),
      ];
      return {
        title, fields,
        hint: 'The summary’s Invested and Quantity cells are typed numbers today. This also turns them into SUM formulas over the purchase rows, so future purchases count automatically.',
        build(vals) {
          const v = { ...vals };
          if (!v.cost?.trim() && v.perUnit && v.qty) v.cost = String(Math.round(Number(v.perUnit) * Number(v.qty) * 100) / 100);
          const { cells, shown } = collect(fields, v);
          return { plan: planMetalPurchase(model, id, cells, shown, title), warn: [] };
        },
      };
    }
  }
}

/* ---------- removing a row ---------- */

function removeEditor(model: Model, id: RemovableRow, rec: Row | undefined): EditorDef {
  const tbl = model.tables[id];
  if (!rec || !tbl) throw new Error('That row is no longer in the sheet. Refresh and try again.');
  const due = id === 'duesInr' || id === 'duesAed';
  const aed = id === 'bankAed' || id === 'duesAed';
  const title = due ? `Delete ${String(rec.item)}` : `Delete ${String(rec.account)} · ${String(rec.holder)}`;
  const amount = due ? rec.amount : rec.balance;
  const shown = isNum(amount) && amount !== 0 ? (aed ? `AED ${num(amount)}` : inr(amount)) : null;
  return {
    title,
    danger: true,
    hint: `Removes this ${due ? 'item' : "account's row"} from ${tbl.spec.tab}. The rows below it move up; totals and everything else on the tab stay where they are.`,
    fields: [],
    build() {
      return {
        plan: planRemove(model, id, rec, title),
        warn: shown
          ? [due ? `${shown} stops being deducted, so your available cash and net worth go up by it.` : `Its balance of ${shown} drops out of your totals and net worth.`]
          : [],
      };
    },
  };
}

/* ---------- linking a family loan to its ledger ---------- */

function linkEditor(model: Model, sheet: string): EditorDef {
  const L = model.ledgers[sheet];
  const rec = L && model.rows.familyLoans.find((r) => r._key === L.familyKey);
  if (!L || !rec || !L.balanceRef) throw new Error('That ledger is no longer in the sheet. Refresh and try again.');
  const formula = `=${L.balanceRef}`;
  const title = `Link ${L.title} to its ledger`;
  const diff = Number(L.balance) - Number(rec.balance);
  return {
    title,
    hint: `Replaces the typed balance in Receivables with a formula pointing at the ledger’s Net Balance (${L.balanceRef}). Net Worth then follows the ledger automatically.`,
    fields: [],
    build() {
      const plan = planRowEdit(model, 'familyLoans', rec, {
        balance: { value: V.formula(formula), display: `${formula}  →  ${inr(L.balance)}`, before: inr(rec.balance), label: 'Balance' },
      }, title);
      return { plan, warn: [`Your net worth changes by ${diff > 0 ? '+' : '−'}${inr(Math.abs(diff))} once this is saved.`] };
    },
  };
}

export function editorFor(model: Model, data: SheetData, req: EditRequest): EditorDef {
  switch (req.kind) {
    case 'row': return rowEditor(model, data, req.id, (model.rows[req.id] as Row[]).find((r) => r._key === req.key));
    case 'cell': return cellEditor(model, req.path);
    case 'add': return addEditor(model, data, req.id);
    case 'link': return linkEditor(model, req.sheet);
    case 'remove': return removeEditor(model, req.id, (model.rows[req.id] as Row[]).find((r) => r._key === req.key));
  }
}
