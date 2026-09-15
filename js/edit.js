// Edit / add dialogs. Flow: form -> review (exact cells, before -> after) ->
// write. Nothing reaches the sheet without the review step.

import { ConflictError, V, planCellEdit, planInsert, planMetalPurchase, planRowEdit } from './writer.js';
import { AuthError, AccessError } from './sheets.js';
import { fmtDate, html, inr, isNum, isoToSerial, mount, num, serialToIso, todaySerial } from './util.js';

const LIVE_AEDINR = '=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725';

/* ---------- field helpers ---------- */

const money = (name, label, value, extra = {}) => ({ name, label, type: 'money', value, ...extra });
const number = (name, label, value, extra = {}) => ({ name, label, type: 'number', value, ...extra });
const date = (name, label, value, extra = {}) => ({ name, label, type: 'date', value, ...extra });
const text = (name, label, value, extra = {}) => ({ name, label, type: 'text', value, ...extra });

const uniq = (xs) => [...new Set(xs.filter((x) => x !== '' && x !== null && x !== undefined))].sort();

function holders(model) {
  return uniq(Object.values(model.rows).flat().map((r) => r.holder)).filter((h) => h.length < 30);
}

function cellValue(field, raw) {
  if (field.type === 'date') return raw ? V.date(isoToSerial(raw)) : null;
  if (field.type === 'money' || field.type === 'number') {
    if (raw === '' || raw === undefined) return null;
    const n = Number(String(raw).replace(/[₹,\s]|AED/gi, ''));
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number.`);
    return V.number(n);
  }
  if (field.type === 'select' && field.name === 'mode') return raw;
  return raw.trim() === '' ? null : V.string(raw.trim());
}

function display(field, v) {
  if (!v) return '—';
  if ('formula' in v) return v.formula;
  if (field.type === 'date') return fmtDate(v.number);
  if (field.type === 'money') return field.aed ? `AED ${num(v.number)}` : inr(v.number);
  if ('number' in v) return num(v.number, 4);
  return v.string;
}

const shown = (v) => (v === null || v === undefined || v === '' ? '—' : isNum(v) ? num(v, 4) : String(v));

// The current value of a field, formatted the same way as its new value.
function before(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && v.startsWith('=')) return v;
  return display(field, isNum(v) ? V.number(v) : V.string(String(v)));
}

/* ---------- definitions ---------- */

function rowEditDef(model, data, id, rec) {
  if (!rec) throw new Error('That row is no longer in the sheet. Refresh and try again.');
  const tbl = model.tables[id];
  const bump = (f) => ({ bumps: f });
  let title;
  let fields;
  switch (id) {
    case 'mf':
      title = `${rec.fund} · ${rec.holder}`;
      fields = [money('current', 'Current value (₹)', rec.current, bump('navDate')), money('invested', 'Invested (₹)', rec.invested), date('navDate', 'Valued on', rec.navDate)];
      break;
    case 'equity': {
      title = `${rec.account} · ${rec.details || ''}`;
      const cur = rec.currency && rec.currency !== 'INR' ? rec.currency : null;
      fields = cur
        ? [number('currentLocal', `Current (${cur})`, rec.currentLocal, bump('navDate')), number('investedLocal', `Invested (${cur})`, rec.investedLocal), date('navDate', 'Priced on', rec.navDate)]
        : [money('currentInr', 'Current (₹)', rec.currentInr, bump('navDate')), money('investedInr', 'Invested (₹)', rec.investedInr), date('navDate', 'Priced on', rec.navDate)];
      break;
    }
    case 'sgb':
      title = `${rec.holding} · ${rec.holder}`;
      fields = [money('market', 'Market value (₹)', rec.market, bump('valueDate')), date('valueDate', 'Valued on', rec.valueDate)];
      break;
    case 'fd':
      title = `${rec.institution} · ${rec.holder}`;
      fields = [money('amount', 'Amount (₹)', rec.amount), money('maturityAmount', 'Maturity amount (₹)', rec.maturityAmount), date('maturityDate', 'Maturity date', rec.maturityDate), number('rate', 'Rate %', rec.rate)];
      break;
    case 'bankInr':
      title = `${rec.account} · ${rec.holder}`;
      fields = [money('balance', 'Balance (₹)', rec.balance)];
      break;
    case 'bankAed':
      title = `${rec.account} · ${rec.holder}`;
      fields = [money('balance', 'Balance (AED)', rec.balance, { aed: true })];
      break;
    default:
      throw new Error(`No editor for ${id}`);
  }
  return {
    title: `Edit ${title}`,
    fields,
    build(vals) {
      const edits = {};
      const warn = [];
      for (const f of fields) {
        const v = cellValue(f, vals[f.name]);
        const before = rec[f.name];
        if (!v) continue;
        if (isNum(v.number) && isNum(before) && Math.abs(v.number - before) < 0.005) continue;
        edits[f.name] = { value: v, display: display(f, v) };
        const fx = data.formulas[tbl.spec.tab]?.[rec._row]?.[tbl.cols[f.name]];
        if (typeof fx === 'string' && fx.startsWith('=')) warn.push(`${f.label} is currently a formula (${fx}); this replaces it with a fixed value.`);
      }
      if (!Object.keys(edits).length) throw new Error('Nothing changed.');
      const plan = planRowEdit(model, id, rec, edits, `Edit ${title}`);
      Object.keys(edits).forEach((name, i) => {
        plan.changes[i].where = fields.find((f) => f.name === name).label;
        plan.changes[i].before = before(fields.find((f) => f.name === name), rec[name]);
      });
      return { plan, warn };
    },
  };
}

function cellEditDef(model, path) {
  const ref = path.reduce((o, k) => o?.[k], model);
  if (!ref) throw new Error('That cell was not found in the sheet');
  const single = (field, title, hint) => ({
    title, hint, fields: [field],
    build(vals) {
      const v = cellValue(field, vals[field.name]);
      if (!v) throw new Error('Enter a value.');
      const plan = planCellEdit(path, ref, v, display(field, v), title);
      plan.changes[0].before = before(field, ref.formula || ref.value);
      return { plan, warn: ref.formula ? [`This replaces the formula ${ref.formula}.`] : [] };
    },
  });
  const withAsOf = (field, title) => ({
    title,
    fields: [field, date('asOf', 'As of', model.cells.npsAsOf?.value ?? todaySerial())],
    build(vals) {
      const v = cellValue(field, vals[field.name]);
      if (!v) throw new Error('Enter a value.');
      const p = planCellEdit(path, ref, v, display(field, v), title);
      p.changes[0].before = before(field, ref.value);
      const asOf = model.cells.npsAsOf;
      const d = cellValue({ type: 'date' }, vals.asOf);
      if (asOf && d && d.number !== asOf.value) {
        const q = planCellEdit(['cells', 'npsAsOf'], asOf, d, fmtDate(d.number), title);
        q.changes[0].before = fmtDate(asOf.value);
        p.changes.push(...q.changes);
        p.ops.push(...q.ops);
      }
      return { plan: p, warn: [] };
    },
  });

  switch (path.join('.')) {
    case 'cells.fxAedInr': {
      const fields = [
        { name: 'mode', label: 'Source', type: 'select', value: ref.formula ? 'live' : 'typed', options: [['typed', 'Type a rate'], ['live', 'Live rate from Google Finance']] },
        number('rate', 'AED → INR rate', ref.value, { showIf: 'typed' }),
      ];
      return {
        title: 'AED → INR rate',
        hint: 'The live option writes =GOOGLEFINANCE("CURRENCY:USDINR")/3.6725 — AED is pegged to USD at 3.6725, so this tracks the market with no upkeep. Google Finance data can be delayed by up to 20 minutes.',
        fields,
        build(vals) {
          if (vals.mode === 'live') {
            if (ref.formula === LIVE_AEDINR) throw new Error('Already using the live rate.');
            return { plan: planCellEdit(path, ref, V.formula(LIVE_AEDINR), LIVE_AEDINR, 'AED → INR rate'), warn: [] };
          }
          const v = cellValue(fields[1], vals.rate);
          if (!v) throw new Error('Enter a rate.');
          return { plan: planCellEdit(path, ref, v, num(v.number, 4), 'AED → INR rate'), warn: ref.formula ? [`This replaces the formula ${ref.formula}.`] : [] };
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
      return single(money('v', 'Current value (AED)', ref.value, { aed: true }), 'Gold (UAE) current value', `You hold ${num(model.summaries.goldUae.qty.value)} g.`);
    case 'summaries.silverUae.sellPrice':
      return single(number('v', 'Sell price (AED per oz)', ref.value), 'Silver sell price', `Current value is calculated from this × ${num(model.summaries.silverUae.qty.value)} oz.`);
    default:
      throw new Error(`No editor for ${path.join('.')}`);
  }
}

function addDef(model, id) {
  const today = todaySerial();
  const hs = holders(model);
  // Default to whoever holds the most rows in that table.
  const usual = (table) => {
    const n = {};
    for (const r of model.rows[table]) if (r.holder) n[r.holder] = (n[r.holder] || 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || hs[0];
  };
  const holderField = (table) => ({ name: 'holder', label: 'Holder', type: 'select', value: usual(table), options: hs.map((h) => [h, h]) });
  const collect = (fields, vals) => {
    const cells = {};
    const disp = {};
    for (const f of fields) {
      const v = cellValue(f, vals[f.name]);
      if (f.required && !v) throw new Error(`${f.label} is required.`);
      if (v) { cells[f.name] = v; disp[f.name] = display(f, v); }
    }
    return { cells, disp };
  };

  if (id === 'mf') {
    const fields = [
      text('fund', 'Fund name', '', { required: true }), holderField('mf'),
      text('category', 'Category', '', { list: uniq(model.rows.mf.map((r) => r.category)) }),
      text('platform', 'Platform / AMC', '', { list: uniq(model.rows.mf.map((r) => r.platform)) }), text('folio', 'Folio', ''),
      money('invested', 'Invested (₹)', '', { required: true }), money('current', 'Current value (₹)', '', { required: true }),
      date('navDate', 'Valued on', today),
    ];
    return { title: 'Add mutual fund', fields, build: (v) => { const c = collect(fields, v); return { plan: planInsert(model, 'mf', c.cells, c.disp, 'Add mutual fund'), warn: [] }; } };
  }
  if (id === 'fd') {
    const fields = [
      date('date', 'Invested on', today, { required: true }), text('institution', 'Institution', '', { required: true }), holderField('fd'),
      money('amount', 'Amount (₹)', '', { required: true }), money('maturityAmount', 'Maturity amount (₹)', ''),
      date('maturityDate', 'Maturity date', ''), text('duration', 'Duration', ''), number('rate', 'Rate %', ''), text('ref', 'Reference', ''),
    ];
    return { title: 'Add fixed deposit', fields, build: (v) => { const c = collect(fields, v); return { plan: planInsert(model, 'fd', c.cells, c.disp, 'Add fixed deposit'), warn: [] }; } };
  }
  if (id === 'goldUae' || id === 'silverUae') {
    const gold = id === 'goldUae';
    const unit = gold ? 'g' : 'oz';
    const lastSrc = model.rows[id].at(-1)?.source || '';
    const fields = [
      date('date', 'Bought on', today, { required: true }), text('source', 'Source', lastSrc),
      number('perUnit', `Price (AED per ${unit})`, '', { required: true }), number('qty', `Quantity (${unit})`, '', { required: true }),
      number('cost', 'Total cost (AED)', '', { hint: 'Leave blank to use price × quantity' }),
    ];
    const title = gold ? 'Add gold purchase (UAE)' : 'Add silver purchase (UAE)';
    return {
      title, fields,
      hint: 'The summary’s Invested and Quantity cells are typed numbers today. This also turns them into SUM formulas over the purchase rows, so future purchases count automatically.',
      build(v) {
        if (v.cost === '' && v.perUnit && v.qty) v = { ...v, cost: String(Math.round(Number(v.perUnit) * Number(v.qty) * 100) / 100) };
        const c = collect(fields, v);
        return { plan: planMetalPurchase(model, id, c.cells, c.disp, title), warn: [] };
      },
    };
  }
  if (id === 'trend') {
    const fields = [
      date('month', 'Month end', today, { required: true }),
      money('networth', 'Net worth (₹)', Math.round(model.totals.current), { required: true, hint: 'Prefilled with today’s total from the Net Worth tab' }),
      text('note', 'Note', ''),
    ];
    return { title: 'Add monthly snapshot', fields, build: (v) => { const c = collect(fields, v); return { plan: planInsert(model, 'trend', c.cells, c.disp, 'Add monthly snapshot'), warn: [] }; } };
  }
  throw new Error(`Nothing to add for ${id}`);
}

/* ---------- dialog ---------- */

function inputFor(f) {
  const id = `f-${f.name}`;
  const common = { id, name: f.name };
  let control;
  if (f.type === 'select') {
    control = html`<select id="${common.id}" name="${common.name}">${f.options.map(([v, l]) => html`<option value="${v}" ${v === f.value ? 'selected' : ''}>${l}</option>`)}</select>`;
  } else {
    const value = f.type === 'date' ? serialToIso(f.value) : f.value ?? '';
    const type = f.type === 'date' ? 'date' : 'text';
    const mode = f.type === 'money' || f.type === 'number' ? 'decimal' : 'text';
    control = html`<input id="${common.id}" name="${common.name}" type="${type}" inputmode="${mode}" value="${value}" ${f.required ? 'required' : ''} ${f.list ? html`list="${id}-l"` : ''} autocomplete="off">
      ${f.list ? html`<datalist id="${id}-l">${f.list.map((o) => html`<option value="${o}">`)}</datalist>` : ''}`;
  }
  return html`<label class="field" data-show-if="${f.showIf || ''}"><span>${f.label}${f.required ? ' *' : ''}</span>${control}${f.hint ? html`<small>${f.hint}</small>` : ''}</label>`;
}

export function openEditor(dialog, state, request, { onWrite }) {
  const { model, data } = state;
  let def;
  try {
    def = request.add ? addDef(model, request.add)
      : request.path ? cellEditDef(model, request.path)
        : rowEditDef(model, data, request.id, model.rows[request.id].find((r) => r._key === request.key));
  } catch (e) {
    alert(e.message);
    return;
  }

  const body = dialog.querySelector('.dlg-body');
  let vals = null;

  const showForm = (err) => {
    mount(body, html`
      <form class="dlg-form" novalidate>
        <h3>${def.title}</h3>
        ${def.hint ? html`<p class="hint">${def.hint}</p>` : ''}
        ${def.fields.map(inputFor)}
        ${err ? html`<p class="err" role="alert">${err}</p>` : ''}
        <div class="dlg-actions"><button type="button" class="btn" data-act="cancel">Cancel</button><button type="submit" class="btn primary">Review changes</button></div>
      </form>`);
    const form = body.querySelector('form');
    if (vals) for (const [k, v] of Object.entries(vals)) if (form.elements[k]) form.elements[k].value = v;

    const sync = () => {
      const mode = form.elements.mode?.value;
      form.querySelectorAll('[data-show-if]').forEach((el) => { el.hidden = !!el.dataset.showIf && el.dataset.showIf !== mode; });
    };
    sync();
    form.addEventListener('change', sync);
    for (const f of def.fields.filter((x) => x.bumps)) {
      const target = form.elements[f.bumps];
      form.elements[f.name].addEventListener('input', () => { if (!target.dataset.touched) target.value = serialToIso(todaySerial()); });
      target.addEventListener('input', () => { target.dataset.touched = '1'; });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      vals = Object.fromEntries(new FormData(form).entries());
      try {
        showReview(def.build({ ...vals }));
      } catch (err2) {
        showForm(err2.message);
      }
    });
    form.elements[0]?.focus();
  };

  const showReview = ({ plan, warn }, err, errDetails = []) => {
    mount(body, html`
      <div class="dlg-review">
        <h3>Review: ${plan.title}</h3>
        <p class="hint">These cells in <b>${state.title}</b> will change. Nothing is written until you confirm.</p>
        <div class="tablewrap"><table class="review">
          <thead><tr><th>Field</th><th>Cell</th><th class="num">Before</th><th class="num">After</th></tr></thead>
          <tbody>${plan.changes.map((c) => html`<tr><td>${c.where}</td><td class="mono">${c.a1}</td><td class="num muted">${shown(c.before)}</td><td class="num strong">${c.after}</td></tr>`)}</tbody>
        </table></div>
        ${warn.map((w) => html`<p class="warn">⚠ ${w}</p>`)}
        ${err ? html`<div class="err" role="alert"><b>${err}</b>${errDetails.length ? html`<ul>${errDetails.map((d) => html`<li>${d}</li>`)}</ul>` : ''}</div>` : ''}
        <div class="dlg-actions">
          <button type="button" class="btn" data-act="back">Back</button>
          <button type="button" class="btn primary" data-act="write">Write to sheet</button>
        </div>
      </div>`);
    body.querySelector('[data-act="back"]').onclick = () => showForm();
    const btn = body.querySelector('[data-act="write"]');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Writing…';
      try {
        await onWrite(plan);
        dialog.close();
      } catch (e) {
        if (e instanceof ConflictError) showReview({ plan, warn }, e.message, e.details);
        else if (e instanceof AuthError) showReview({ plan, warn }, 'Your Google session expired. Close this, sign in again, and retry.');
        else if (e instanceof AccessError) showReview({ plan, warn }, e.message);
        else showReview({ plan, warn }, `Write failed: ${e.message}`);
      }
    };
  };

  body.onclick = (e) => { if (e.target.closest('[data-act="cancel"]')) dialog.close(); };
  showForm();
  dialog.showModal();
}
