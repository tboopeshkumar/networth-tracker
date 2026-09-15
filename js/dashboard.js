import { changeChart, trendChart } from './charts.js';
import { totalDrift } from './model.js';
import { cr, fmtDate, fmtMonth, html, inr, isNum, mount, num, pct, raw, todaySerial } from './util.js';

// Colour follows the category, never its rank (validated palette, see css).
const CAT = { Liquid: 1, Equity: 2, FI: 3, Gold: 4, MF: 5, 'Real Estate': 6, Silver: 7 };
const swatch = (n) => raw(`<span class="sw" style="background:var(--s${n || 0})"></span>`);
const cls = (n) => (isNum(n) && n > 0 ? 'up' : isNum(n) && n < 0 ? 'down' : '');
const signedInr = (n) => (isNum(n) ? `${n > 0 ? '+' : ''}${inr(n)}` : '—');
const ret = (pnl, inv) => (isNum(pnl) && isNum(inv) && inv ? pnl / inv : null);
const signedPct = (r) => (isNum(r) ? `${r > 0 ? '+' : ''}${pct(r)}` : '—');

let activeTab = 'mf';

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

const group = (rows, field) => {
  const out = {};
  for (const r of rows) if (isNum(r.current)) out[r[field] || '—'] = (out[r[field] || '—'] || 0) + r.current;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

const editBtn = (id, key, label = 'Edit') => html`<button class="btn-mini" data-edit="row" data-id="${id}" data-key="${key}">${label}</button>`;
const cellBtn = (path, label = 'Edit') => html`<button class="btn-mini" data-edit="cell" data-path="${path}">${label}</button>`;

/* ---------- holdings tabs ---------- */

function holdings(model) {
  const R = model.rows;
  const VIEWS = {
    mf: {
      name: 'Mutual funds',
      head: ['Fund', 'Holder', 'Type', 'Invested', 'Current', 'P&L', 'Return', 'NAV date', ''],
      rows: R.mf.map((r) => [html`<td class="name">${r.fund}<div class="sub2">${r.platform}</div></td>`, r.holder, r.category,
        [inr(r.invested)], [inr(r.current), 'strong'], [signedInr(r.pnl), cls(r.pnl)], [signedPct(ret(r.pnl, r.invested)), cls(r.pnl)],
        fmtDate(r.navDate), editBtn('mf', r._key)]),
    },
    equity: {
      name: 'Equity',
      head: ['Account', 'Cur.', 'Current (local)', 'Invested (INR)', 'Current (INR)', 'P&L', 'Return', 'Priced', ''],
      rows: R.equity.map((r) => [html`<td class="name">${r.account}<div class="sub2">${r.details}</div></td>`, r.currency || 'INR',
        [isNum(r.currentLocal) ? num(r.currentLocal, 0) : '—'], [inr(r.investedInr)], [inr(r.currentInr), 'strong'],
        [signedInr(r.pnl), cls(r.pnl)], [signedPct(ret(r.pnl, r.investedInr)), cls(r.pnl)], fmtDate(r.navDate), editBtn('equity', r._key)]),
    },
    sgb: {
      name: 'Gold (SGB)',
      head: ['Holding', 'Holder', 'Qty (g)', 'Cost', 'Market', 'Gain', 'Matures', 'Valued', ''],
      rows: R.sgb.map((r) => [html`<td class="name">${r.holding}</td>`, r.holder, [num(r.qty)], [inr(r.cost)], [inr(r.market), 'strong'],
        [signedInr(r.market - r.cost), cls(r.market - r.cost)], fmtDate(r.maturity), fmtDate(r.valueDate), editBtn('sgb', r._key)]),
    },
    fd: {
      name: 'Fixed deposits',
      head: ['Institution', 'Holder', 'Amount', 'At maturity', 'Rate', 'Matures', 'Status', ''],
      rows: R.fd.map((r) => {
        const st = !isNum(r.maturityDate) ? ['no date', 'down'] : r.maturityDate < todaySerial() ? ['matured', 'down'] : ['active', ''];
        return [html`<td class="name">${r.institution}<div class="sub2">${r.ref}</div></td>`, r.holder, [inr(r.amount), 'strong'],
          [inr(r.maturityAmount)], [isNum(r.rate) ? `${r.rate}%` : '—'], fmtDate(r.maturityDate), [st[0], st[1]], editBtn('fd', r._key)];
      }),
    },
    bankInr: {
      name: 'Bank · INR',
      head: ['Account', 'Holder', 'Balance (INR)', ''],
      rows: R.bankInr.map((r) => [html`<td class="name">${r.account}</td>`, r.holder, [inr(r.balance), 'strong'], editBtn('bankInr', r._key)]),
    },
    bankAed: {
      name: 'Bank · AED',
      head: ['Account', 'Holder', 'Balance (AED)', ''],
      rows: R.bankAed.map((r) => [html`<td class="name">${r.account}</td>`, r.holder, [`AED ${num(r.balance, 0)}`, 'strong'], editBtn('bankAed', r._key)]),
    },
    goldUae: {
      name: 'Gold (UAE)',
      head: ['Bought', 'Source', 'AED / g', 'Qty (g)', 'Cost (AED)'],
      rows: R.goldUae.map((r) => [fmtDate(r.date), r.source, [num(r.perUnit)], [num(r.qty)], [num(r.cost), 'strong']]),
    },
    silverUae: {
      name: 'Silver (UAE)',
      head: ['Bought', 'Source', 'AED / oz', 'Qty (oz)', 'Cost (AED)'],
      rows: R.silverUae.map((r) => [fmtDate(r.date), r.source, [num(r.perUnit)], [num(r.qty)], [num(r.cost), 'strong']]),
    },
  };
  if (!VIEWS[activeTab]) activeTab = 'mf';
  const v = VIEWS[activeTab];

  const cell = (c) => {
    if (c && typeof c === 'object' && 's' in c) return c.s.startsWith('<td') ? c : html`<td class="act">${c}</td>`;
    if (Array.isArray(c)) return html`<td class="num ${c[1] || ''}">${c[0]}</td>`;
    return html`<td>${c ?? '—'}</td>`;
  };

  return html`
    <div class="tabs" role="tablist">
      ${Object.entries(VIEWS).map(([id, x]) => html`<button class="tab" role="tab" data-tab="${id}" aria-selected="${id === activeTab}">${x.name} <span class="muted">${x.rows.length}</span></button>`)}
    </div>
    <div class="tablewrap"><table>
      <thead><tr>${v.head.map((h, i) => html`<th class="${i >= 2 && h ? 'num' : ''}">${h}</th>`)}</tr></thead>
      <tbody>${v.rows.map((r) => html`<tr>${r.map(cell)}</tr>`)}</tbody>
    </table></div>`;
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

export function renderDashboard(root, { model, data }) {
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
      ${tile('Total net worth', cr(T.current), inr(T.current), true)}
      ${tile('Invested', cr(T.invested), 'capital deployed', true)}
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
      <div class="card-head">
        <div><h2>Net worth over time</h2><div class="h2sub">${trend.length} recorded months · ringed points carry a note</div></div>
        <button class="btn" data-add="trend">+ Snapshot</button>
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

    <section class="card">
      <h2>All positions</h2><div class="h2sub">The lines that roll up into your total — computed in the sheet</div>
      <div class="tablewrap"><table>
        <thead><tr><th>Asset</th><th>Holder</th><th>Category</th><th>Where</th><th class="num">Invested</th><th class="num">Current</th><th class="num">P&amp;L</th><th class="num">Return</th></tr></thead>
        <tbody>
          ${[...nw].sort((a, b) => b.current - a.current).map((x) => html`<tr>
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
        <div><h2>Holdings</h2><div class="h2sub">Edits are written straight to your sheet, after you review them</div></div>
        <div class="add-row">
          <button class="btn" data-add="mf">+ Fund</button>
          <button class="btn" data-add="fd">+ FD</button>
          <button class="btn" data-add="goldUae">+ Gold</button>
          <button class="btn" data-add="silverUae">+ Silver</button>
        </div>
      </div>
      <div id="holdings">${holdings(model)}</div>
    </section>

    <section class="card">
      <h2>Rates &amp; other inputs</h2><div class="h2sub">Single cells the totals depend on</div>
      <div class="tablewrap"><table>
        <tbody>
          ${C.fxAedInr ? html`<tr><td class="name">AED → INR</td><td class="num strong">${C.fxAedInr.value}</td><td>${C.fxAedInr.formula ? 'live formula' : 'typed in'}</td><td class="act">${cellBtn('cells.fxAedInr')}</td></tr>` : ''}
          ${C.fxUsdAed ? html`<tr><td class="name">USD → AED</td><td class="num strong">${C.fxUsdAed.value}</td><td>${C.fxUsdAed.formula ? 'formula' : 'typed in'}</td><td class="act">${cellBtn('cells.fxUsdAed')}</td></tr>` : ''}
          ${C.npsInvested ? html`<tr><td class="name">NPS contributions</td><td class="num strong">${inr(C.npsInvested.value)}</td><td>as of ${fmtDate(C.npsAsOf?.value)}</td><td class="act">${cellBtn('cells.npsInvested')}</td></tr>` : ''}
          ${C.npsGain ? html`<tr><td class="name">NPS gain</td><td class="num strong">${inr(C.npsGain.value)}</td><td></td><td class="act">${cellBtn('cells.npsGain')}</td></tr>` : ''}
          ${S.goldUae?.currentAed ? html`<tr><td class="name">Gold (UAE) current value</td><td class="num strong">AED ${num(S.goldUae.currentAed.value)}</td><td>${num(S.goldUae.qty.value)} g held</td><td class="act">${cellBtn('summaries.goldUae.currentAed')}</td></tr>` : ''}
          ${S.silverUae?.sellPrice ? html`<tr><td class="name">Silver sell price (AED/oz)</td><td class="num strong">${num(S.silverUae.sellPrice.value)}</td><td>${num(S.silverUae.qty.value)} oz held</td><td class="act">${cellBtn('summaries.silverUae.sellPrice')}</td></tr>` : ''}
        </tbody>
      </table></div>
    </section>

    <section class="card">
      <h2>Worth a look</h2><div class="h2sub">Checked live against the sheet on every load</div>
      ${checks(model, data.values)}
    </section>
  `);

  trendChart(root.querySelector('#trend'), trend);
  changeChart(root.querySelector('#change'), trend);

  root.querySelector('#holdings').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    activeTab = t.dataset.tab;
    mount(root.querySelector('#holdings'), holdings(model));
  });
}
