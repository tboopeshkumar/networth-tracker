import { changeChart, trendChart } from './charts.js';
import { totalDrift } from './model.js';
import { cr, esc, fmtDate, fmtMonth, html, inr, isNum, mount, num, pct, raw, todaySerial } from './util.js';

// Colour follows the category, never its rank (validated palette, see css).
const CAT = { Liquid: 1, Equity: 2, FI: 3, Gold: 4, MF: 5, 'Real Estate': 6, Silver: 7 };
const swatch = (n) => raw(`<span class="sw" style="background:var(--s${n || 0})"></span>`);
const cls = (n) => (isNum(n) && n > 0 ? 'up' : isNum(n) && n < 0 ? 'down' : '');
const signedInr = (n) => (isNum(n) ? `${n > 0 ? '+' : ''}${inr(n)}` : '—');
const ret = (pnl, inv) => (isNum(pnl) && isNum(inv) && inv ? pnl / inv : null);
const signedPct = (r) => (isNum(r) ? `${r > 0 ? '+' : ''}${pct(r)}` : '—');

const openViews = new Set(['mf']); // holdings sections left open across re-renders
let canEdit = true; // set from state on each render; UI only, see config.js

function tile(label, value, note, big = false, valueCls = '') {
  return html`<div class="card tile">
    <div class="label">${label}</div>
    <div class="${big ? 'big' : 'mid'} ${valueCls}">${value}</div>
    ${note ? html`<div class="note">${note}</div>` : ''}
  </div>`;
}

function bars(entries, total, colour) {
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return entries.map(([name, v]) => html`
    <div class="bar-row">
      <div class="bar-name">${name}</div>
      <div class="bar-track"><div class="bar-fill" style="${raw(`width:${(v / max * 100).toFixed(2)}%;background:var(--s${colour(name)})`)}"></div></div>
      <div class="bar-val">${cr(v)} <span class="muted">${pct(v / total)}</span></div>
    </div>`);
}

// Holder colours keyed by name in alphabetical order, so each person keeps
// their colour however the values shift. Joint entries ("Both") get violet.
const holderColour = (rows) => {
  const names = [...new Set(rows.map((r) => r.holder).filter(Boolean))].filter((h) => !/^both$/i.test(h)).sort();
  return (n) => (/^both$/i.test(n) ? 7 : [1, 5, 3, 2][names.indexOf(n)] || 0);
};

// Which holdings tab a Net Worth line drills into. Matched on words rather
// than exact asset names, so renaming a line in the sheet doesn't break it.
function linkedTab(r) {
  const a = String(r.asset || '').toLowerCase();
  const uae = r.location === 'UAE';
  if (/mutual fund/.test(a)) return 'mf';
  if (/sovereign gold|sgb/.test(a)) return 'sgb';
  if (/gold/.test(a)) return uae ? 'goldUae' : 'sgb';
  if (/silver/.test(a)) return 'silverUae';
  if (/fixed deposit|bond/.test(a)) return 'fd';
  if (/liquid cash|bank/.test(a)) return uae ? 'bankAed' : 'bankInr';
  if (/equity|stock|share/.test(a)) return 'equity';
  if (/receivable|given out|lent/.test(a)) return 'givenOut';
  return null;
}

// Lines fed from the Receivables tab are linked by the cell they reference:
// a family-loan row opens its ledger, anything else opens the given-out list.
function makeLinker(model) {
  const fam = model.rows.familyLoans;
  return (r) => {
    const src = r._src;
    if (src && model.tables.familyLoans && src.tab === model.tables.familyLoans.spec.tab) {
      const f = fam.find((x) => x._row === src.row);
      if (f && model.ledgers[f.detailSheet]) return `ledger:${f.detailSheet}`;
      if (model.rows.givenOut.length) return 'givenOut';
    }
    const tab = linkedTab(r);
    return tab === 'givenOut' && !model.rows.givenOut.length ? null : tab;
  };
}

const signedAmt = (n) => (isNum(n) && n < 0 ? `−${inr(-n)}` : inr(n));

// Phone layout for "All positions": the wide table is unusable at 375px, so
// each line becomes a card — name and value, then the details and P&L.
function positionCards(rows, linkOf) {
  return rows.map((x) => {
    const tab = linkOf(x);
    const r = ret(x.pnl, x.invested);
    const inner = html`
      <div class="pos-top">
        ${swatch(CAT[x.category])}<span class="pos-name">${x.asset}</span>
        <span class="pos-val">${cr(x.current)}</span>
      </div>
      <div class="pos-meta">
        <span>${[x.category, x.location, x.holder].filter(Boolean).join(' · ')}</span>
        <span class="${cls(x.pnl)}">${x.pnl ? `${x.pnl > 0 ? '+' : ''}${cr(x.pnl)} · ${signedPct(r)}` : '—'}</span>
      </div>`;
    return tab
      ? html`<button class="pos linked" data-goto="${tab}">${inner}</button>`
      : html`<div class="pos">${inner}</div>`;
  });
}

const group = (rows, field) => {
  const out = {};
  for (const r of rows) if (isNum(r.current)) out[r[field] || '—'] = (out[r[field] || '—'] || 0) + r.current;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

const editBtn = (id, key, label = 'Edit') => (canEdit
  ? html`<button class="btn-mini" data-edit="row" data-id="${id}" data-key="${key}">${label}</button>` : '');
const cellBtn = (path, label = 'Edit') => (canEdit
  ? html`<button class="btn-mini" data-edit="cell" data-path="${path}">${label}</button>` : '');

/* ---------- holdings tabs ---------- */

// Each tab defines both presentations from one record list: `row` for the
// wide table, `card` for phones. A card is title + headline value, a detail
// line, and an optional footer carrying the date and the Edit button — so
// each tab surfaces what actually matters for that kind of holding.
function holdings(model) {
  const R = model.rows;
  const gain = (pnl, inv) => ({ text: pnl ? `${pnl > 0 ? '+' : ''}${cr(pnl)} · ${signedPct(ret(pnl, inv))}` : '—', cls: cls(pnl) });
  const fdStatus = (r) => (!isNum(r.maturityDate) ? ['no date', 'down']
    : r.maturityDate < todaySerial() ? ['matured', 'down'] : ['active', '']);
  const join = (...xs) => xs.filter((x) => x !== '' && x !== null && x !== undefined && x !== '—').join(' · ');

  const VIEWS = {
    mf: {
      name: 'Mutual funds',
      recs: R.mf,
      head: ['Fund', 'Holder', 'Type', 'Invested', 'Current', 'P&L', 'Return', 'NAV date', ''],
      row: (r) => [html`<td class="name">${r.fund}<div class="sub2">${r.platform}</div></td>`, r.holder, r.category,
        [inr(r.invested)], [inr(r.current), 'strong'], [signedInr(r.pnl), cls(r.pnl)], [signedPct(ret(r.pnl, r.invested)), cls(r.pnl)],
        fmtDate(r.navDate), editBtn('mf', r._key)],
      card: (r) => ({ title: r.fund, value: inr(r.current), sub: join(r.holder, r.category, r.platform), right: gain(r.pnl, r.invested), foot: `Invested ${cr(r.invested)} · NAV ${fmtDate(r.navDate)}`, edit: ['mf', r._key] }),
    },
    equity: {
      name: 'Equity',
      recs: R.equity,
      head: ['Account', 'Cur.', 'Current (local)', 'Invested (INR)', 'Current (INR)', 'P&L', 'Return', 'Priced', ''],
      row: (r) => [html`<td class="name">${r.account}<div class="sub2">${r.details}</div></td>`, r.currency || 'INR',
        [isNum(r.currentLocal) ? num(r.currentLocal, 0) : '—'], [inr(r.investedInr)], [inr(r.currentInr), 'strong'],
        [signedInr(r.pnl), cls(r.pnl)], [signedPct(ret(r.pnl, r.investedInr)), cls(r.pnl)], fmtDate(r.navDate), editBtn('equity', r._key)],
      card: (r) => ({ title: r.account, value: inr(r.currentInr), sub: r.details || (r.currency || 'INR'), right: gain(r.pnl, r.investedInr), foot: join(isNum(r.currentLocal) ? `${r.currency || ''} ${num(r.currentLocal, 0)}`.trim() : '', `Priced ${fmtDate(r.navDate)}`), edit: ['equity', r._key] }),
    },
    sgb: {
      name: 'Gold (SGB)',
      recs: R.sgb,
      head: ['Holding', 'Holder', 'Qty (g)', 'Cost', 'Market', 'Gain', 'Matures', 'Valued', ''],
      row: (r) => [html`<td class="name">${r.holding}</td>`, r.holder, [num(r.qty)], [inr(r.cost)], [inr(r.market), 'strong'],
        [signedInr(r.market - r.cost), cls(r.market - r.cost)], fmtDate(r.maturity), fmtDate(r.valueDate), editBtn('sgb', r._key)],
      card: (r) => ({ title: r.holding, value: inr(r.market), sub: join(r.holder, `${num(r.qty)} g`), right: gain(r.market - r.cost, r.cost), foot: `Cost ${cr(r.cost)} · matures ${fmtDate(r.maturity)}`, edit: ['sgb', r._key] }),
    },
    fd: {
      name: 'Fixed deposits',
      recs: R.fd,
      head: ['Institution', 'Holder', 'Amount', 'At maturity', 'Rate', 'Matures', 'Status', ''],
      row: (r) => {
        const st = fdStatus(r);
        return [html`<td class="name">${r.institution}<div class="sub2">${r.ref}</div></td>`, r.holder, [inr(r.amount), 'strong'],
          [inr(r.maturityAmount)], [isNum(r.rate) ? `${r.rate}%` : '—'], fmtDate(r.maturityDate), [st[0], st[1]], editBtn('fd', r._key)];
      },
      card: (r) => {
        const st = fdStatus(r);
        return { title: r.institution, value: inr(r.amount), sub: join(r.holder, isNum(r.rate) ? `${r.rate}%` : ''), right: { text: st[0], cls: st[1] }, foot: join(`Matures ${fmtDate(r.maturityDate)}`, isNum(r.maturityAmount) ? `${cr(r.maturityAmount)} at maturity` : ''), edit: ['fd', r._key] };
      },
    },
    bankInr: {
      name: 'Bank · INR',
      recs: R.bankInr,
      head: ['Account', 'Holder', 'Balance (INR)', ''],
      row: (r) => [html`<td class="name">${r.account}</td>`, r.holder, [inr(r.balance), 'strong'], editBtn('bankInr', r._key)],
      card: (r) => ({ title: r.account, value: inr(r.balance), sub: r.holder, edit: ['bankInr', r._key] }),
    },
    bankAed: {
      name: 'Bank · AED',
      recs: R.bankAed,
      head: ['Account', 'Holder', 'Balance (AED)', ''],
      row: (r) => [html`<td class="name">${r.account}</td>`, r.holder, [`AED ${num(r.balance, 0)}`, 'strong'], editBtn('bankAed', r._key)],
      card: (r) => ({ title: r.account, value: `AED ${num(r.balance, 0)}`, sub: r.holder, edit: ['bankAed', r._key] }),
    },
    goldUae: {
      name: 'Gold (UAE)',
      recs: R.goldUae,
      head: ['Bought', 'Source', 'AED / g', 'Qty (g)', 'Cost (AED)'],
      row: (r) => [fmtDate(r.date), r.source, [num(r.perUnit)], [num(r.qty)], [num(r.cost), 'strong']],
      card: (r) => ({ title: `${num(r.qty)} g`, value: `AED ${num(r.cost)}`, sub: join(fmtDate(r.date), r.source), foot: `AED ${num(r.perUnit)} per gram` }),
    },
    silverUae: {
      name: 'Silver (UAE)',
      recs: R.silverUae,
      head: ['Bought', 'Source', 'AED / oz', 'Qty (oz)', 'Cost (AED)'],
      row: (r) => [fmtDate(r.date), r.source, [num(r.perUnit)], [num(r.qty)], [num(r.cost), 'strong']],
      card: (r) => ({ title: `${num(r.qty)} oz`, value: `AED ${num(r.cost)}`, sub: join(fmtDate(r.date), r.source), foot: `AED ${num(r.perUnit)} per ounce` }),
    },
  };

  if (R.givenOut.length) {
    VIEWS.givenOut = {
      name: 'Receivables',
      recs: R.givenOut,
      head: ['Person', 'Given on', 'Amount', 'Status'],
      numCols: [2],
      row: (r) => [html`<td class="name">${r.person}</td>`, fmtDate(r.date), [inr(r.amount), 'strong'], r.status || '—'],
      card: (r) => ({ title: r.person, value: inr(r.amount), sub: `Given ${fmtDate(r.date)}`, right: { text: r.status || '', cls: '' } }),
    };
  }

  // One tab per family-loan ledger. Negative amounts are money received back.
  for (const L of Object.values(model.ledgers)) {
    VIEWS[`ledger:${L.sheet}`] = {
      name: L.title,
      recs: L.rows,
      ledger: L,
      head: ['Date', 'Description', 'Amount', 'Note'],
      numCols: [2],
      row: (r) => [fmtDate(r.date), html`<td class="name">${r.description}</td>`,
        [signedAmt(r.amount), r.amount < 0 ? 'up' : 'strong'], join(r.note, r.detail, r.interest) || '—'],
      card: (r) => ({ title: r.description, value: signedAmt(r.amount), sub: fmtDate(r.date), foot: join(r.note, r.detail, r.interest) }),
    };
  }
  // Collapsed headers show the total, so the closed list is an overview too.
  const total = (recs, f) => recs.reduce((a, r) => a + (isNum(r[f]) ? r[f] : 0), 0);
  VIEWS.mf.total = cr(total(R.mf, 'current'));
  VIEWS.equity.total = cr(total(R.equity, 'currentInr'));
  VIEWS.sgb.total = cr(total(R.sgb, 'market'));
  VIEWS.fd.total = cr(total(R.fd, 'amount'));
  VIEWS.bankInr.total = cr(total(R.bankInr, 'balance'));
  VIEWS.bankAed.total = `AED ${num(total(R.bankAed, 'balance'), 0)}`;
  VIEWS.goldUae.total = `${num(total(R.goldUae, 'qty'))} g`;
  VIEWS.silverUae.total = `${num(total(R.silverUae, 'qty'))} oz`;
  if (VIEWS.givenOut) VIEWS.givenOut.total = cr(total(R.givenOut, 'amount'));
  for (const L of Object.values(model.ledgers)) VIEWS[`ledger:${L.sheet}`].total = cr(L.balance);

  const GROUPS = [
    ['Investments', ['mf', 'equity', 'sgb', 'fd']],
    ['Cash', ['bankInr', 'bankAed']],
    ['Metals · UAE', ['goldUae', 'silverUae']],
    ['Money lent', Object.keys(VIEWS).filter((id) => id === 'givenOut' || id.startsWith('ledger:'))],
  ];

  const cell = (c) => {
    if (c && typeof c === 'object' && 's' in c) return c.s.startsWith('<td') ? c : html`<td class="act">${c}</td>`;
    if (Array.isArray(c)) return html`<td class="num ${c[1] || ''}">${c[0]}</td>`;
    return html`<td>${c ?? '—'}</td>`;
  };

  const body = (v) => {
    const card = (r) => {
      const c = v.card(r);
      return html`<div class="hcard">
        <div class="pos-top"><span class="pos-name">${c.title}</span><span class="pos-val">${c.value}</span></div>
        <div class="pos-meta">
          <span>${c.sub}</span>
          ${c.right ? html`<span class="${c.right.cls}">${c.right.text}</span>` : ''}
        </div>
        ${c.foot || c.edit ? html`<div class="hcard-foot">
          <span>${c.foot || ''}</span>
          ${c.edit ? editBtn(c.edit[0], c.edit[1]) : ''}
        </div>` : ''}
      </div>`;
    };

    const isNumCol = (i, h) => (v.numCols ? v.numCols.includes(i) : i >= 2 && h);
    const L = v.ledger;
    const ledgerHead = L ? html`<div class="ledger-sum">
        <span>Ledger balance <b>${inr(L.balance)}</b></span>
        <span class="muted">${L.rows.length} entries</span>
        ${isNum(L.balance) && isNum(L.recorded) && Math.abs(L.balance - L.recorded) > 1
          ? html`<span class="down">Receivables records ${inr(L.recorded)} — ${inr(Math.abs(L.balance - L.recorded))} ${L.balance > L.recorded ? 'less' : 'more'} than this ledger</span>
            ${canEdit && !L.recordedFormula && L.balanceRef ? html`<button class="btn-mini" data-edit="link" data-sheet="${L.sheet}">Link to ledger</button>` : ''}`
          : html`<span class="up">✓ matches Receivables</span>`}
      </div>` : '';

    return html`
      ${ledgerHead}
      <div class="pos-list only-narrow">${v.recs.map(card)}</div>
      <div class="tablewrap only-wide"><table>
        <thead><tr>${v.head.map((h, i) => html`<th class="${isNumCol(i, h) ? 'num' : ''}">${h}</th>`)}</tr></thead>
        <tbody>${v.recs.map((r) => html`<tr>${v.row(r).map(cell)}</tr>`)}</tbody>
      </table></div>`;
  };

  const section = (id) => {
    const v = VIEWS[id];
    return html`<details class="hsec" data-view="${id}" ${openViews.has(id) ? 'open' : ''}>
      <summary>
        <span class="hsec-name">${v.name}</span>
        <span class="hsec-count">${v.recs.length}</span>
        <span class="hsec-total">${v.total}</span>
      </summary>
      <div class="hsec-body">${body(v)}</div>
    </details>`;
  };

  return html`${GROUPS.filter(([, ids]) => ids.length).map(([label, ids]) => html`
    <div class="hgroup">
      <div class="hgroup-label">${label}</div>
      ${ids.filter((id) => VIEWS[id]).map(section)}
    </div>`)}`;
}

/* ---------- checks ---------- */

function checks(model, values) {
  const out = [];
  const T = model.totals;
  const trend = model.rows.trend.filter((d) => isNum(d.networth));
  const last = trend.at(-1);

  for (const [id, field, name] of [['mf', 'current', 'Mutual Funds'], ['equity', 'currentInr', 'Equity'], ['sgb', 'market', 'Gold (SGB)'], ['fd', 'amount', 'Fixed Deposits']]) {
    const d = totalDrift(model, values, id, field);
    if (d) out.push(html`<b>${name} total doesn’t match its rows.</b> Sheet says ${inr(d.sheet)}, rows add up to ${inr(d.sum)}. A row may sit below the total, or the SUM formula was overwritten.`);
  }

  const dates = [...model.rows.mf.map((r) => r.navDate), ...model.rows.equity.map((r) => r.navDate), ...model.rows.sgb.map((r) => r.valueDate)].filter(isNum);
  if (dates.length) {
    const age = todaySerial() - Math.max(...dates);
    if (age > 10) out.push(html`<b>Valuations are ${age} days old.</b> Newest is ${fmtDate(Math.max(...dates))}. Use <i>Edit</i> on each holding, or set up the NAV feed from the README.`);
  }

  for (const L of Object.values(model.ledgers)) {
    if (isNum(L.balance) && isNum(L.recorded) && Math.abs(L.balance - L.recorded) > 1) {
      out.push(html`<b>${L.title}: ledger and Receivables disagree by ${inr(Math.abs(L.balance - L.recorded))}.</b> The ${L.sheet} ledger nets to ${inr(L.balance)}, but Receivables records ${inr(L.recorded)}${L.recordedFormula ? '' : ' as a typed number'} — and Net Worth uses that figure.${L.recordedFormula || !canEdit ? '' : html` Open that ledger under <i>Holdings</i> and use <b>Link to ledger</b> to keep them in step.`}`);
    }
  }

  const matured = model.rows.fd.filter((r) => isNum(r.maturityDate) && r.maturityDate < todaySerial());
  if (matured.length) out.push(html`<b>${matured.length} fixed deposit${matured.length > 1 ? 's' : ''} past maturity</b> but still counted: ${matured.map((r) => `${r.institution} (${fmtDate(r.maturityDate)})`).join(', ')}.`);

  if (last && T && Math.abs(T.current - last.networth) > 1e5) {
    out.push(html`<b>Last trend entry differs from today’s total by ${cr(T.current - last.networth)}.</b> ${fmtMonth(last.month)} recorded ${cr(last.networth)}; the Net Worth tab now totals ${cr(T.current)}. Normal if markets moved — or add a snapshot.`);
  }

  const nw = model.rows.networth;
  if (nw.some((r) => /nps/i.test(r.asset) && r.category === 'MF') && nw.some((r) => /mutual/i.test(r.asset) && r.category === 'Equity')) {
    out.push(html`<b>NPS is categorised “MF” while Mutual Funds are “Equity”.</b> The category chart inherits this — change it in the Net Worth tab’s Category column if unintended.`);
  }

  for (const [id, name] of [['fxAedInr', 'AED→INR'], ['fxUsdAed', 'USD→AED']]) {
    const c = model.cells[id];
    if (c && !c.formula) out.push(html`<b>${name} rate is typed in (${c.value}).</b> ${id === 'fxAedInr' ? 'Most of your value is in AED, so this one cell moves the headline by lakhs. ' : ''}Edit it under <i>Rates &amp; other inputs</i>, where you can switch to a live rate.`);
  }

  return out.length
    ? out.map((m) => html`<div class="flag"><span class="flag-ic" aria-hidden="true">▲</span><span>${m}</span></div>`)
    : [html`<div class="ok">✓ Nothing to flag.</div>`];
}

/* ---------- main render ---------- */

export function renderDashboard(root, { model, data, canEdit: mayEdit = true }) {
  canEdit = mayEdit;
  const linkOf = makeLinker(model);
  const T = model.totals;
  const nw = model.rows.networth;
  const trend = model.rows.trend;
  const r = ret(T.pnl, T.invested);
  const liquid = nw.filter((x) => x.category === 'Liquid').reduce((a, x) => a + x.current, 0);
  const equity = nw.filter((x) => x.category === 'Equity').reduce((a, x) => a + x.current, 0);
  const uae = nw.filter((x) => x.location === 'UAE').reduce((a, x) => a + x.current, 0);
  const lastChange = trend.filter((d) => isNum(d.savings)).at(-1);
  const C = model.cells;
  const S = model.summaries;

  mount(root, html`
    <div class="grid hero">
      ${tile('Invested', cr(T.invested), 'capital deployed', true)}
      ${tile('Total net worth', cr(T.current), inr(T.current), true)}
      ${tile('Unrealised P&L', `${T.pnl > 0 ? '+' : ''}${cr(T.pnl)}`, inr(T.pnl), true, cls(T.pnl))}
      ${tile('Overall return', signedPct(r), 'on invested capital', true, cls(r))}
    </div>
    <div class="grid hero">
      ${tile('Liquid cash', cr(liquid), `${pct(liquid / T.current)} of total`)}
      ${tile('Equity exposure', cr(equity), `${pct(equity / T.current)} of total`)}
      ${tile('Held in UAE', pct(uae / T.current), cr(uae))}
      ${lastChange ? tile('Latest month change', `${lastChange.savings > 0 ? '+' : ''}${cr(lastChange.savings)}`, fmtMonth(lastChange.month), false, cls(lastChange.savings)) : ''}
    </div>

    <section class="card">
      <h2>All positions</h2><div class="h2sub">The lines that roll up into your total — computed in the sheet. Click a linked row to see what's inside it.</div>
      <div class="pos-list only-narrow">
        ${positionCards([...nw].sort((a, b) => b.current - a.current), linkOf)}
        <div class="pos pos-total">
          <div class="pos-top"><span class="pos-name">Total</span><span class="pos-val">${cr(T.current)}</span></div>
          <div class="pos-meta"><span>Invested ${cr(T.invested)}</span><span class="${cls(T.pnl)}">${T.pnl > 0 ? '+' : ''}${cr(T.pnl)} · ${signedPct(r)}</span></div>
        </div>
      </div>
      <div class="tablewrap only-wide"><table id="positions">
        <thead><tr><th>Asset</th><th>Holder</th><th>Category</th><th>Where</th><th class="num">Invested</th><th class="num">Current</th><th class="num">P&amp;L</th><th class="num">Return</th></tr></thead>
        <tbody>
          ${[...nw].sort((a, b) => b.current - a.current).map((x) => html`<tr ${linkOf(x) ? raw(`class="linked" tabindex="0" role="button" data-goto="${esc(linkOf(x))}"`) : ''}>
            <td class="name">${swatch(CAT[x.category])}${x.asset}</td><td>${x.holder}</td><td>${x.category}</td><td>${x.location}</td>
            <td class="num">${inr(x.invested)}</td><td class="num strong">${inr(x.current)}</td>
            <td class="num ${cls(x.pnl)}">${x.pnl ? signedInr(x.pnl) : '—'}</td>
            <td class="num ${cls(x.pnl)}">${x.pnl ? signedPct(ret(x.pnl, x.invested)) : '—'}</td></tr>`)}
          <tr class="total"><td class="name">Total</td><td></td><td></td><td></td><td class="num">${inr(T.invested)}</td>
            <td class="num strong">${inr(T.current)}</td><td class="num ${cls(T.pnl)}">${signedInr(T.pnl)}</td><td class="num ${cls(r)}">${signedPct(r)}</td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2>Holdings</h2><div class="h2sub">${canEdit ? 'Edits are written straight to your sheet, after you review them' : 'Read-only view'}</div></div>
        ${canEdit ? html`<div class="add-row">
          <button class="btn" data-add="mf">+ Fund</button>
          <button class="btn" data-add="fd">+ FD</button>
          <button class="btn" data-add="goldUae">+ Gold</button>
          <button class="btn" data-add="silverUae">+ Silver</button>
        </div>` : html`<span class="pill">View only</span>`}
      </div>
      <div id="holdings">${holdings(model)}</div>
    </section>

    <section class="card">
      <h2>Rates &amp; other inputs</h2><div class="h2sub">Single cells the totals depend on</div>
      <div class="inputs">
        ${[
          C.fxAedInr && { label: 'AED → INR', value: num(C.fxAedInr.value, 4), note: C.fxAedInr.formula ? 'Live rate' : 'Typed in', path: 'cells.fxAedInr' },
          C.fxUsdAed && { label: 'USD → AED', value: num(C.fxUsdAed.value, 4), note: C.fxUsdAed.formula ? 'Formula' : 'Typed in', path: 'cells.fxUsdAed' },
          C.npsInvested && { label: 'NPS contributions', value: inr(C.npsInvested.value), note: `As of ${fmtDate(C.npsAsOf?.value)}`, path: 'cells.npsInvested' },
          C.npsGain && { label: 'NPS gain', value: inr(C.npsGain.value), note: 'Unrealised', path: 'cells.npsGain' },
          S.goldUae?.currentAed && { label: 'Gold (UAE) value', value: `AED ${num(S.goldUae.currentAed.value)}`, note: `${num(S.goldUae.qty.value)} g held`, path: 'summaries.goldUae.currentAed' },
          S.silverUae?.sellPrice && { label: 'Silver sell price', value: `AED ${num(S.silverUae.sellPrice.value)}`, note: `per oz · ${num(S.silverUae.qty.value)} oz held`, path: 'summaries.silverUae.sellPrice' },
        ].filter(Boolean).map((i) => html`<div class="input-tile">
          <div class="input-label">${i.label}</div>
          <div class="input-val">${i.value}</div>
          <div class="input-foot"><span>${i.note}</span>${cellBtn(i.path)}</div>
        </div>`)}
      </div>
    </section>

    <section class="card">
      <h2>Worth a look</h2><div class="h2sub">Checked live against the sheet on every load</div>
      ${checks(model, data.values)}
    </section>

    <section class="card">
      <div class="card-head">
        <div><h2>Net worth over time</h2><div class="h2sub">${trend.length} recorded months · ringed points carry a note</div></div>
        ${canEdit ? html`<button class="btn" data-add="trend">+ Snapshot</button>` : ''}
      </div>
      <div class="chart" id="trend"><div class="tip" role="status"></div></div>
    </section>

    <section class="card">
      <h2>Month-on-month change</h2>
      <div class="h2sub">Recorded saving or drawdown between entries</div>
      <div class="chart" id="change"><div class="tip" role="status"></div></div>
    </section>

    <div class="grid two">
      <section class="card">
        <h2>By category</h2><div class="h2sub">Share of current value</div>
        ${bars(group(nw, 'category'), T.current, (n) => CAT[n] || 0)}
      </section>
      <section class="card">
        <h2>By location</h2><div class="h2sub">Where the assets sit</div>
        ${bars(group(nw, 'location'), T.current, (n) => (n === 'India' ? 3 : 2))}
        <h2 class="gap">By holder</h2><div class="h2sub">Whose name it is in</div>
        ${bars(group(nw, 'holder'), T.current, holderColour(nw))}
      </section>
    </div>
  `);

  trendChart(root.querySelector('#trend'), trend);
  changeChart(root.querySelector('#change'), trend);

  const host = root.querySelector('#holdings');

  // Remember which sections are open, so saving an edit doesn't collapse them.
  // (toggle doesn't bubble, hence the capture listener)
  host.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details[data-view]')) return;
    if (d.open) openViews.add(d.dataset.view);
    else openViews.delete(d.dataset.view);
  }, true);

  // Drilling down from a Net Worth line: open that section and bring it into view
  const drill = (id) => {
    const d = host.querySelector(`details[data-view="${CSS.escape(id)}"]`);
    if (!d) return;
    d.open = true;
    openViews.add(id);
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    d.classList.remove('flash');
    void d.offsetWidth; // restart the animation if the same section is re-targeted
    d.classList.add('flash');
  };
  // Table rows (wide) and cards (narrow) both carry data-goto
  const positions = root.querySelector('#positions').closest('section');
  positions.addEventListener('click', (e) => {
    const el = e.target.closest('[data-goto]');
    if (el) drill(el.dataset.goto);
  });
  positions.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('tr[data-goto]'); // cards are buttons and handle keys themselves
    if (!el) return;
    e.preventDefault();
    drill(el.dataset.goto);
  });
}
