// npm test
//
// Most tests need demo/fixture.json (run tools/make_fixture.py first). The
// fixture holds real data and is gitignored, so they only run locally.
//
// This file is public: every expectation is derived from the fixture at run
// time. Never hardcode figures, fund names or people's names from the sheet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { buildModel, totalDrift, TABS } from '../js/model.js';
import { DemoSheets, shiftRows } from '../js/sheets.js';
import { execute, loadAll, planRowEdit, planInsert, planMetalPurchase, planCellEdit, V, ConflictError } from '../js/writer.js';
import { esc, html } from '../js/util.js';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const skip = !existsSync(FIX) && 'no demo/fixture.json — run tools/make_fixture.py';
const fixture = () => JSON.parse(readFileSync(FIX, 'utf8'));
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} != ${b}`);
const sum = (rows, f) => rows.reduce((a, r) => a + (typeof r[f] === 'number' ? r[f] : 0), 0);

/* ---------- pure ---------- */

test('shiftRows moves relative rows only', () => {
  assert.equal(shiftRows('=G20-F20', 1), '=G21-F21');
  assert.equal(shiftRows("=G5*$C$20*'Rates'!$B$30", 1), "=G6*$C$20*'Rates'!$B$30");
  assert.equal(shiftRows('=SUM(INDIRECT("F5:F"&ROW()-1))', 1), '=SUM(INDIRECT("F5:F"&ROW()-1))');
  assert.equal(shiftRows('=IF(C47="",NA(),C47)', 1), '=IF(C48="",NA(),C48)');
  assert.equal(shiftRows('=B47-B46', 1), '=B48-B47');
});

test('html`` escapes interpolations', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(html`<td>${evil}</td>`.s, `<td>${esc(evil)}</td>`);
  assert.ok(!html`<b>${evil}</b>`.s.includes('<img'));
  assert.equal(html`<i>${html`<b>ok</b>`}</i>`.s, '<i><b>ok</b></i>', 'nested html`` is trusted');
});

/* ---------- model ---------- */

test('model reads every section of the layout', { skip }, () => {
  const f = fixture();
  const m = buildModel(f.values, f.formulas);

  for (const id of ['networth', 'mf', 'equity', 'sgb', 'fd', 'bankInr', 'bankAed', 'goldUae', 'silverUae', 'trend']) {
    assert.ok(m.rows[id].length > 0, `${id} has rows`);
    assert.equal(new Set(m.rows[id].map((r) => r._key)).size, m.rows[id].length, `${id} row keys are unique`);
  }

  // Net worth lines reconcile with the sheet's own grand total
  approx(sum(m.rows.networth, 'current'), m.totals.current, 'net worth lines vs grand total');
  approx(sum(m.rows.networth, 'invested'), m.totals.invested, 'invested lines vs grand total');

  // Section totals are formulas that match their rows
  for (const [id, field] of [['mf', 'current'], ['equity', 'currentInr'], ['sgb', 'market'], ['fd', 'amount']]) {
    assert.equal(totalDrift(m, f.values, id, field), null, `${id} total matches rows`);
  }

  // Metal summaries equal the sum of purchase rows
  for (const id of ['goldUae', 'silverUae']) {
    approx(sum(m.rows[id], 'cost'), m.summaries[id].investedAed.value, `${id} invested`);
    approx(sum(m.rows[id], 'qty'), m.summaries[id].qty.value, `${id} quantity`);
  }

  // Only the active FD section is read, not the closed-deposits record below it
  const fdGrid = f.values['Fixed Deposits'];
  const secondHeader = fdGrid.findIndex((row, i) => i > m.tables.fd.headerRow && row.includes('Institution'));
  if (secondHeader > 0) assert.ok(m.rows.fd.every((r) => r._row < secondHeader), 'closed FDs excluded');

  // Two tables side by side on one tab are told apart
  assert.notEqual(m.tables.bankInr.cols.balance, m.tables.bankAed.cols.balance);

  for (const id of ['fxAedInr', 'fxUsdAed', 'npsInvested', 'npsGain']) {
    assert.equal(typeof m.cells[id]?.value, 'number', `${id} found`);
  }
});

test('every tab the app reads exists', { skip }, () => {
  const f = fixture();
  for (const t of TABS) assert.ok(f.values[t], t);
});

/* ---------- writes ---------- */

test('edit a value, then read it back', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf.find((r) => typeof r.invested === 'number' && r.invested > 0);
  const target = Math.round(rec.invested * 1.1);
  const date = rec.navDate + 7;

  await execute(demo, planRowEdit(model, 'mf', rec, {
    current: { value: V.number(target), display: '' },
    navDate: { value: V.date(date), display: '' },
  }, 'Update'));

  const after = (await loadAll(demo)).model.rows.mf.find((r) => r._key === rec._key);
  assert.equal(after.current, target);
  assert.equal(after.navDate, date);
  assert.equal(after.pnl, target - rec.invested, 'P&L formula re-evaluated');
});

test('a concurrent change blocks the write and writes nothing', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf[0];
  const plan = planRowEdit(model, 'mf', rec, { current: { value: V.number(1), display: '1' } }, 'Update');

  const col = model.tables.mf.cols.current;
  demo.f.values['Mutual Funds'][rec._row][col] = 424242;
  demo.f.formulas['Mutual Funds'][rec._row][col] = 424242;
  const before = JSON.stringify(demo.f);

  await assert.rejects(execute(demo, plan), (e) => e instanceof ConflictError && /4,24,242/.test(e.details[0]));
  assert.equal(JSON.stringify(demo.f), before, 'no partial write');
});

test('a row inserted above the target is followed, not overwritten', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf.at(-1);
  const plan = planRowEdit(model, 'mf', rec, { current: { value: V.number(777), display: '' } }, 'Update');

  const first = model.tables.mf.firstRow;
  for (const g of [demo.f.values['Mutual Funds'], demo.f.formulas['Mutual Funds']]) {
    g.splice(first, 0, ['Hand-added fund', 'Someone', 'Index', 'X', '', 1, 1]);
  }

  await execute(demo, plan);
  const m2 = (await loadAll(demo)).model;
  assert.equal(m2.rows.mf.find((r) => r._key === rec._key).current, 777);
  assert.equal(m2.rows.mf.find((r) => r.fund === 'Hand-added fund').current, 1, 'neighbour untouched');
});

test('add a row above a total', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const cells = {
    fund: V.string('Test Fund'), holder: V.string('Someone'), category: V.string('Index'),
    platform: V.string('Test'), invested: V.number(1000), current: V.number(1040), navDate: V.date(46000),
  };
  await execute(demo, planInsert(model, 'mf', cells, {}, 'Add fund'));

  const { model: m2, data } = await loadAll(demo);
  const added = m2.rows.mf.at(-1);
  assert.equal(m2.rows.mf.length, model.rows.mf.length + 1);
  assert.equal(added.fund, 'Test Fund');
  assert.equal(added.folio, '', 'inputs are not inherited from the row above');
  assert.equal(added.pnl, 40);
  const n = added._row + 1;
  const pnlCol = m2.tables.mf.cols.pnl;
  const prevFormula = data.formulas['Mutual Funds'][added._row - 1][pnlCol];
  assert.equal(data.formulas['Mutual Funds'][added._row][pnlCol], shiftRows(prevFormula, 1));
  assert.ok(String(data.formulas['Mutual Funds'][added._row][pnlCol]).includes(String(n)));
  assert.equal(m2.tables.mf.totalRow, model.tables.mf.totalRow + 1, 'total row still below');
});

test('metal purchase turns the typed summary into a growing SUM', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const cells = { date: V.date(46000), source: V.string('Test'), perUnit: V.number(10), cost: V.number(20), qty: V.number(2) };
  await execute(demo, planMetalPurchase(model, 'goldUae', cells, {}, 'Buy'));

  const { model: m2, data } = await loadAll(demo);
  const s = m2.summaries.goldUae;
  const t = m2.tables.goldUae;
  const L = (c) => String.fromCharCode(65 + c);
  assert.equal(m2.rows.goldUae.at(-1).cost, 20);
  assert.equal(data.formulas['Gold (UAE)'][s.investedAed.row][s.investedAed.col], `=SUM(${L(t.cols.cost)}${t.firstRow + 1}:${L(t.cols.cost)}${t.lastRow + 2})`);
  assert.equal(data.formulas['Gold (UAE)'][s.qty.row][s.qty.col], `=SUM(${L(t.cols.qty)}${t.firstRow + 1}:${L(t.cols.qty)}${t.lastRow + 2})`);
});

test('monthly snapshot keeps helper formulas in step', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model, data: d0 } = await loadAll(demo);
  const prev = model.rows.trend.at(-1);
  const value = prev.networth + 12345;
  await execute(demo, planInsert(model, 'trend', { month: V.date(prev.month + 30), networth: V.number(value) }, {}, 'Snapshot'));

  const { model: m2, data } = await loadAll(demo);
  const row = m2.rows.trend.at(-1)._row;
  assert.equal(m2.rows.trend.length, model.rows.trend.length + 1);
  assert.equal(m2.rows.trend.at(-1).savings, 12345);
  d0.formulas['Monthly Trend'][prev._row].forEach((f, c) => {
    if (typeof f === 'string' && f.startsWith('=') && c !== m2.tables.trend.cols.month) {
      assert.equal(data.formulas['Monthly Trend'][row][c], shiftRows(f, 1), `helper column ${c}`);
    }
  });
});

test('a rate cell can switch to a live formula', { skip }, async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const live = '=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725';
  await execute(demo, planCellEdit(['cells', 'fxAedInr'], model.cells.fxAedInr, V.formula(live), 'live', 'FX'));
  assert.equal((await loadAll(demo)).model.cells.fxAedInr.formula, live);
});
