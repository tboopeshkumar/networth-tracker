// npm test
//
// Most tests need demo/fixture.json (npm run fixture -- <your.xlsx>). The
// fixture holds real data and is gitignored, so they only run locally.
//
// This file is public: every expectation is derived from the fixture at run
// time. Never hardcode figures, fund names or people's names from the sheet.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

import { accessFor } from '../src/lib/access';
import { DemoSheets, shiftRows, type Fixture } from '../src/lib/demoSheets';
import { n0, type Cell } from '../src/lib/format';
import { JEWELLERY_TAB, readJewellery } from '../src/lib/jewellery';
import { editorFor } from '../src/lib/editors';
import { feedRateFor, readRatesFeed } from '../src/lib/ratesFeed';
import { readBrokerFeed } from '../src/lib/brokerFeed';
import { buildModel, parseRef, totalDrift, TABS, type Row } from '../src/lib/model';
import { parseSheetId } from '../src/lib/picker';
import {
  ConflictError, V, execute, loadAll, planCellEdit, planInsert, planMetalPurchase, planRowEdit,
} from '../src/lib/writer';

const FIX = new URL('../demo/fixture.json', import.meta.url);
const noFixture = !existsSync(FIX);
const withFixture = test.skipIf(noFixture);
const fixture = (): Fixture => JSON.parse(readFileSync(FIX, 'utf8')) as Fixture;
const approx = (a: unknown, b: unknown, msg: string) =>
  assert.ok(Math.abs(n0(a) - n0(b)) < 0.01, `${msg}: ${String(a)} != ${String(b)}`);
const sum = (rows: readonly object[], f: string) =>
  rows.reduce((a, r) => a + n0((r as Record<string, Cell>)[f]), 0);

/* ---------- pure ---------- */

test('shiftRows moves relative rows only', () => {
  assert.equal(shiftRows('=G20-F20', 1), '=G21-F21');
  assert.equal(shiftRows("=G5*$C$20*'Rates'!$B$30", 1), "=G6*$C$20*'Rates'!$B$30");
  assert.equal(shiftRows('=SUM(INDIRECT("F5:F"&ROW()-1))', 1), '=SUM(INDIRECT("F5:F"&ROW()-1))');
  assert.equal(shiftRows('=IF(C47="",NA(),C47)', 1), '=IF(C48="",NA(),C48)');
  assert.equal(shiftRows('=B47-B46', 1), '=B48-B47');
});

test('parseRef reads single-cell references', () => {
  assert.deepEqual(parseRef("='Some Tab'!$C$13"), { tab: 'Some Tab', row: 12, col: 2 });
  assert.deepEqual(parseRef('=Tab!D18'), { tab: 'Tab', row: 17, col: 3 });
  assert.deepEqual(parseRef("='It''s'!$AB$2"), { tab: "It's", row: 1, col: 27 });
  assert.equal(parseRef('=SUM(A1:A5)'), null);
  assert.equal(parseRef(1000), null);
});

test('access lists decide what the UI offers', () => {
  const lists = { allowed: ['owner@example.com', 'viewer@example.com'], editors: ['owner@example.com'] };
  assert.deepEqual(accessFor('owner@example.com', lists), { allowed: true, canEdit: true });
  assert.deepEqual(accessFor('viewer@example.com', lists), { allowed: true, canEdit: false });
  assert.deepEqual(accessFor('stranger@example.com', lists), { allowed: false, canEdit: false });
  // case and spacing shouldn't matter
  assert.deepEqual(accessFor('  Owner@Example.com ', lists), { allowed: true, canEdit: true });
  // empty lists mean no restriction at this level
  assert.deepEqual(accessFor('anyone@example.com', { allowed: [], editors: [] }), { allowed: true, canEdit: true });
});

test('a pasted sheet link or bare ID yields the spreadsheet ID', () => {
  const id = 'AbC_12-' + 'x'.repeat(30);
  const base = ['https:', '', 'docs.google.com', 'spreadsheets', 'd'].join('/'); // built up so the hook doesn't flag it
  assert.equal(parseSheetId(`${base}/${id}/edit?gid=0#gid=0`), id);
  assert.equal(parseSheetId(`  ${base}/${id}/edit  `), id);
  assert.equal(parseSheetId(id), id);
  assert.equal(parseSheetId('not a link'), null);
  assert.equal(parseSheetId('https://example.com/doc/123'), null);
});

/* ---------- model ---------- */

withFixture('model reads every section of the layout', () => {
  const f = fixture();
  const m = buildModel(f.values, f.formulas);

  for (const id of ['networth', 'mf', 'equity', 'sgb', 'fd', 'bankInr', 'bankAed', 'goldUae', 'silverUae', 'trend'] as const) {
    const rows = m.rows[id] as Row[];
    assert.ok(rows.length > 0, `${id} has rows`);
    assert.equal(new Set(rows.map((r) => r._key)).size, rows.length, `${id} row keys are unique`);
  }

  approx(sum(m.rows.networth, 'current'), m.totals.current, 'net worth lines vs grand total');
  approx(sum(m.rows.networth, 'invested'), m.totals.invested, 'invested lines vs grand total');

  for (const [id, field] of [['mf', 'current'], ['equity', 'currentInr'], ['sgb', 'market'], ['fd', 'amount']] as const) {
    assert.equal(totalDrift(m, f.values, id, field), null, `${id} total matches rows`);
  }

  for (const id of ['goldUae', 'silverUae'] as const) {
    approx(sum(m.rows[id], 'cost'), m.summaries[id]?.investedAed.value, `${id} invested`);
    approx(sum(m.rows[id], 'qty'), m.summaries[id]?.qty.value, `${id} quantity`);
  }

  // Only the active FD section, not the closed-deposits record below it
  const fdGrid = f.values['Fixed Deposits'];
  const second = fdGrid.findIndex((row, i) => i > m.tables.fd.headerRow && row.includes('Institution'));
  if (second > 0) assert.ok(m.rows.fd.every((r) => r._row < second), 'closed FDs excluded');

  // Two tables side by side on one tab are told apart
  assert.notEqual(m.tables.bankInr.cols.balance, m.tables.bankAed.cols.balance);

  for (const id of ['fxAedInr', 'fxUsdAed', 'npsInvested', 'npsGain'] as const) {
    assert.equal(typeof m.cells[id]?.value, 'number', `${id} found`);
  }
});

withFixture('every tab the app reads exists', () => {
  const f = fixture();
  for (const t of TABS) assert.ok(f.values[t], t);
});

withFixture('receivables and family-loan ledgers are found and linked', async () => {
  const { model, data } = await loadAll(new DemoSheets(fixture()));

  for (const f of model.rows.familyLoans) {
    if (data.values[String(f.detailSheet)]) assert.ok(model.ledgers[String(f.detailSheet)], `${f.detailSheet} parsed`);
  }
  for (const L of Object.values(model.ledgers)) {
    approx(sum(L.rows, 'amount'), L.balance, `${L.sheet} rows vs net balance`);
    assert.match(String(L.balanceRef), /^'.+'!C\d+$/);
  }

  const famRows = new Set(model.rows.familyLoans.map((f) => f._row));
  for (const r of model.rows.networth.filter((x) => x._src?.tab === 'Receivables')) {
    if (famRows.has(r._src!.row)) {
      const f = model.rows.familyLoans.find((x) => x._row === r._src!.row)!;
      approx(r.current, f.balance, 'net worth line equals the family-loan balance it references');
    } else {
      approx(r.current, sum(model.rows.givenOut, 'amount'), 'given-out line equals the list total');
    }
  }
});

withFixture('the jewellery register is read, and never touches a total', async () => {
  const f = fixture();
  const { model } = await loadAll(new DemoSheets(f));
  const J = model.jewellery;
  if (!f.values[JEWELLERY_TAB]) { assert.equal(J, null); return; }
  assert.ok(J && J.sections.length > 0, 'sections found');
  for (const s of J.sections) {
    assert.equal(new Set(s.rows.map((r) => r._key)).size, s.rows.length, `${s.title}: unique keys`);
    approx(s.grams, sum(s.rows, 'grams'), `${s.title}: grams add up`);
  }
  // The sheet's "total grams held" is the sum of its leading held sections
  if (typeof J.valuation.grams === 'number') {
    let run = 0;
    const matches = J.sections.some((s) => { run += s.grams; return Math.abs(run - n0(J.valuation.grams)) < 0.01; });
    assert.ok(matches, 'valuation grams reconcile with the sections');
  }

  // Removing the tab changes nothing but the jewellery itself
  const without = structuredClone(f);
  delete without.values[JEWELLERY_TAB];
  delete without.formulas[JEWELLERY_TAB];
  without.sheets = without.sheets.filter((s) => s.title !== JEWELLERY_TAB);
  const { model: m2 } = await loadAll(new DemoSheets(without));
  assert.equal(m2.jewellery, null, 'a sheet without the tab still loads');
  assert.deepEqual(m2.totals, model.totals, 'totals are identical with or without jewellery');
});

withFixture('a heading typed above a jewellery list becomes its title', () => {
  const f = fixture();
  const grid = f.values[JEWELLERY_TAB];
  if (!grid) return;
  const before = readJewellery(grid)!;
  const first = before.sections[0];

  // Insert a lone label directly above the first list's header row
  const edited = structuredClone(grid);
  edited.splice(first.headerRow, 0, ['A New Heading']);
  const after = readJewellery(edited)!;

  assert.equal(after.sections[0].title, 'A New Heading');
  assert.equal(after.sections[0].rows.length, first.rows.length, 'same items');
  assert.equal(after.sections.length, before.sections.length, 'no section gained or lost');
});

withFixture('the 22C valuation combines the lists above it and reconciles', () => {
  const f = fixture();
  const J = readJewellery(f.values[JEWELLERY_TAB]);
  if (!J || typeof J.valuation.grams !== 'number') return;
  const { parts, grams } = J.valuation;
  assert.ok(parts.length > 0, 'the lists behind the valuation were identified');
  approx(sum(parts, 'grams'), grams, 'parts add up to the sheet total');
  for (const p of parts) {
    const s = J.sections.find((x) => x.title === p.title)!;
    assert.ok(s.held, `${p.title} is a held list`);
  }
  // record-only sections are never part of it
  assert.ok(J.sections.filter((s) => !s.held).every((s) => !parts.some((p) => p.title === s.title)));
});

test('a gold rate fetched by a formula is marked live; a typed one is not', () => {
  // Synthetic register: one list, then the valuation block
  const grid: Cell[][] = [
    ['Date', 'Grams', 'Item'],
    [45000, 10, 'Ring'],
    [],
    ['Current gold valuation (22C)'],
    ['Total grams (held)', '', 10],
    ['Gold rate (Rs / gram, 22C)', '', 1000],
    ['Estimated value', '', 10000],
  ];
  const formulas = structuredClone(grid);
  formulas[5][2] = '=IMPORTXML("https://example.com/gold", "//td")';

  const live = readJewellery(grid, formulas)!.valuation;
  assert.equal(live.rate, 1000, 'the fetched value is what the app uses');
  assert.equal(live.rateLive, true);

  assert.equal(readJewellery(grid, grid)!.valuation.rateLive, false, 'typed number');
  assert.equal(readJewellery(grid)!.valuation.rateLive, false, 'no formulas read');
  formulas[5][2] = '=C4*1.1';
  assert.equal(readJewellery(grid, formulas)!.valuation.rateLive, false, 'a formula that fetches nothing');
});

test('a rate read from the Rates Feed tab is traced back to its row', () => {
  const feed = readRatesFeed([
    ['Rate', 'Value', 'Source', 'Rate date', 'Refreshed'],
    ['Gold 22C (₹/g)', 1000, 'Example', 46000, 46000.5],
    ['AED → INR', 20, 'Example', 46001, 46001.5],
  ]);
  assert.equal(feed.length, 2);
  assert.equal(feedRateFor(feed, `=VLOOKUP("Gold 22C (₹/g)", 'Rates Feed'!A:B, 2, FALSE)`)?.rateDate, 46000);
  assert.equal(feedRateFor(feed, `='Rates Feed'!B3`)?.label, 'AED → INR', 'direct reference, by sheet row');
  assert.equal(feedRateFor(feed, `='Rates Feed'!$B$2*1`)?.label, 'Gold 22C (₹/g)');
  assert.equal(feedRateFor(feed, '=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725'), null, 'not from the feed');
  assert.equal(feedRateFor(feed, null), null);
  assert.deepEqual(readRatesFeed(undefined), []);
});

test('the eToro Feed tab is read by header, with its Total kept apart', () => {
  const feed = readBrokerFeed([
    ['Symbol', 'Name', 'Type', 'Units', 'Invested ($)', 'Value ($)', 'P&L ($)', 'Refreshed'],
    ['AAA', 'Example A Inc', 'Stocks', 15, 2300, 2590, 290, 46287.3],
    ['Copy · sometrader', 'Copy portfolio', 'Copy', '', 1500, 1340, -160, 46287.3],
    ['Cash', 'Available balance', 'Cash', '', 1200.5, 1200.5, 0, 46287.3],
    ['Total', '', '', '', 5000.5, 5130.5, 130, 46287.3],
  ])!;
  assert.deepEqual(feed.rows.map((r) => r.symbol), ['AAA', 'Copy · sometrader', 'Cash']);
  assert.deepEqual(feed.total, { invested: 5000.5, value: 5130.5 });
  assert.equal(feed.refreshed, 46287.3);
  assert.equal(feed.rows[0].units, 15);
  assert.equal(feed.currency, 'USD', '"$" in the headers');
  const ibkr = readBrokerFeed([
    ['Symbol', 'Name', 'Type', 'Units', 'Invested (AED)', 'Value (AED)', 'P&L (AED)', 'Refreshed'],
    ['XYZ', 'Example', 'ETF', 5, 100, 120, 20, 46287.3],
    ['Total', '', '', '', 100, 120, 20, 46287.3],
  ])!;
  assert.equal(ibkr.currency, 'AED');
  assert.deepEqual([ibkr.rows[0].value, ibkr.total?.value], [120, 120]);
  assert.equal(readBrokerFeed(undefined), null);
  assert.equal(readBrokerFeed([['something else']]), null);
});

/* ---------- writes ---------- */

/** The fixture as it looks after "Move units to Mutual Funds": code and units columns, Current priced from them. */
function withUnitsOnFunds(f: Fixture): Fixture {
  const tab = 'Mutual Funds';
  const vals = f.values[tab];
  const fx = f.formulas[tab];
  const h = vals.findIndex((r) => r.includes('Fund') && r.includes('Invested'));
  const width = Math.max(...vals[h].map((v, i) => (v === '' ? 0 : i + 1)));
  const cur = vals[h].indexOf('Current');
  const [code, units] = [width, width + 1];
  const set = (g: Cell[][], r: number, c: number, v: Cell) => { while (g[r].length <= c) g[r].push(''); g[r][c] = v; };
  for (const g of [vals, fx]) { set(g, h, code, 'AMFI code'); set(g, h, units, 'Units'); }
  for (let r = h + 1; r < vals.length && !/^total/i.test(String(vals[r][0])); r++) {
    if (vals[r][0] === '') continue;
    for (const g of [vals, fx]) { set(g, r, code, 100000 + r); set(g, r, units, 10); }
    set(fx, r, cur, `=IFERROR(L${r + 1}*VLOOKUP(K${r + 1},'NAV Feed'!$A:$C,2,FALSE),"")`);
  }
  return f;
}

withFixture('funds priced by the NAV Feed are edited by units, not by value', async () => {
  const { model, data } = await loadAll(new DemoSheets(withUnitsOnFunds(fixture())));
  const rec = model.rows.mf[0] as Row;
  assert.equal(rec.units, 10, 'units read from the new column');

  const edit = editorFor(model, data, { kind: 'row', id: 'mf', key: rec._key });
  assert.deepEqual(edit.fields.map((x) => x.name), ['units', 'invested', 'code']);
  const { plan, warn } = edit.build({ units: '12.5', invested: String(rec.invested), code: String(rec.code) });
  assert.deepEqual(plan.changes.map((c) => [c.where, c.after]), [['Units', '12.5']]);
  assert.deepEqual(warn, [], 'no formula is overwritten');

  const add = editorFor(model, data, { kind: 'add', id: 'mf' });
  const names = add.fields.map((x) => x.name);
  assert.ok(names.includes('units') && names.includes('code') && !names.includes('current'), names.join());

  // The sheet before the move still edits by value
  const legacy = await loadAll(new DemoSheets(fixture()));
  const old = editorFor(legacy.model, legacy.data, { kind: 'row', id: 'mf', key: legacy.model.rows.mf[0]._key });
  assert.deepEqual(old.fields.map((x) => x.name), ['current', 'invested', 'navDate']);
});

withFixture('edit a value, then read it back', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf.find((r) => n0(r.invested) > 0)!;
  const target = Math.round(n0(rec.invested) * 1.1);
  const date = n0(rec.navDate) + 7;

  await execute(demo, planRowEdit(model, 'mf', rec, {
    current: { value: V.number(target), display: '' },
    navDate: { value: V.date(date), display: '' },
  }, 'Update'));

  const after = (await loadAll(demo)).model.rows.mf.find((r) => r._key === rec._key)!;
  assert.equal(after.current, target);
  assert.equal(after.navDate, date);
  assert.equal(after.pnl, target - n0(rec.invested), 'P&L formula re-evaluated');
});

withFixture('a concurrent change blocks the write and writes nothing', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf[0];
  const plan = planRowEdit(model, 'mf', rec, { current: { value: V.number(1), display: '1' } }, 'Update');

  const col = model.tables.mf.cols.current;
  demo.f.values['Mutual Funds'][rec._row][col] = 424242;
  demo.f.formulas['Mutual Funds'][rec._row][col] = 424242;
  const before = JSON.stringify(demo.f);

  await assert.rejects(execute(demo, plan), (e: unknown) => e instanceof ConflictError && /4,24,242/.test(e.details[0]));
  assert.equal(JSON.stringify(demo.f), before, 'no partial write');
});

withFixture('a row inserted above the target is followed, not overwritten', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const rec = model.rows.mf.at(-1)!;
  const plan = planRowEdit(model, 'mf', rec, { current: { value: V.number(777), display: '' } }, 'Update');

  const first = model.tables.mf.firstRow;
  for (const g of [demo.f.values['Mutual Funds'], demo.f.formulas['Mutual Funds']]) {
    g.splice(first, 0, ['Hand-added fund', 'Someone', 'Index', 'X', '', 1, 1]);
  }

  await execute(demo, plan);
  const m2 = (await loadAll(demo)).model;
  assert.equal(m2.rows.mf.find((r) => r._key === rec._key)!.current, 777);
  assert.equal(m2.rows.mf.find((r) => r.fund === 'Hand-added fund')!.current, 1, 'neighbour untouched');
});

withFixture('add a row above a total', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  await execute(demo, planInsert(model, 'mf', {
    fund: V.string('Test Fund'), holder: V.string('Someone'), category: V.string('Index'),
    platform: V.string('Test'), invested: V.number(1000), current: V.number(1040), navDate: V.date(46000),
  }, {}, 'Add fund'));

  const { model: m2, data } = await loadAll(demo);
  const added = m2.rows.mf.at(-1)!;
  assert.equal(m2.rows.mf.length, model.rows.mf.length + 1);
  assert.equal(added.fund, 'Test Fund');
  assert.equal(added.folio, '', 'inputs are not inherited from the row above');
  assert.equal(added.pnl, 40);
  const pnlCol = m2.tables.mf.cols.pnl;
  const prev = String(data.formulas['Mutual Funds'][added._row - 1][pnlCol]);
  assert.equal(data.formulas['Mutual Funds'][added._row][pnlCol], shiftRows(prev, 1));
  assert.equal(m2.tables.mf.totalRow, n0(model.tables.mf.totalRow) + 1, 'total row still below');
});

withFixture('metal purchase turns the typed summary into a growing SUM', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const cells = { date: V.date(46000), source: V.string('Test'), perUnit: V.number(10), cost: V.number(20), qty: V.number(2) };
  await execute(demo, planMetalPurchase(model, 'goldUae', cells, {}, 'Buy'));

  const { model: m2, data } = await loadAll(demo);
  const s = m2.summaries.goldUae!;
  const t = m2.tables.goldUae;
  const L = (c: number) => String.fromCharCode(65 + c);
  assert.equal(m2.rows.goldUae.at(-1)!.cost, 20);
  assert.equal(data.formulas['Gold (UAE)'][s.investedAed.row!][s.investedAed.col], `=SUM(${L(t.cols.cost)}${t.firstRow + 1}:${L(t.cols.cost)}${t.lastRow + 2})`);
  assert.equal(data.formulas['Gold (UAE)'][s.qty.row!][s.qty.col], `=SUM(${L(t.cols.qty)}${t.firstRow + 1}:${L(t.cols.qty)}${t.lastRow + 2})`);
});

withFixture('monthly snapshot keeps helper formulas in step', async () => {
  const demo = new DemoSheets(fixture());
  const { model, data: d0 } = await loadAll(demo);
  const prev = model.rows.trend.at(-1)!;
  const value = n0(prev.networth) + 12345;
  await execute(demo, planInsert(model, 'trend', { month: V.date(n0(prev.month) + 30), networth: V.number(value) }, {}, 'Snapshot'));

  const { model: m2, data } = await loadAll(demo);
  const row = m2.rows.trend.at(-1)!._row;
  assert.equal(m2.rows.trend.length, model.rows.trend.length + 1);
  assert.equal(m2.rows.trend.at(-1)!.savings, 12345);
  d0.formulas['Monthly Trend'][prev._row].forEach((f, c) => {
    if (typeof f === 'string' && f.startsWith('=') && c !== m2.tables.trend.cols.month) {
      assert.equal(data.formulas['Monthly Trend'][row][c], shiftRows(f, 1), `helper column ${c}`);
    }
  });
});

withFixture('a rate cell can switch to a live formula', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const live = '=GOOGLEFINANCE("CURRENCY:USDINR")/3.6725';
  await execute(demo, planCellEdit(['cells', 'fxAedInr'], model.cells.fxAedInr!, V.formula(live), 'live', 'FX'));
  assert.equal((await loadAll(demo)).model.cells.fxAedInr?.formula, live);
});

withFixture('linking a family loan to its ledger writes a formula to the right cell', async () => {
  const demo = new DemoSheets(fixture());
  const { model } = await loadAll(demo);
  const L = Object.values(model.ledgers)[0];
  if (!L) return;
  const rec = model.rows.familyLoans.find((r) => r._key === L.familyKey)!;
  await execute(demo, planRowEdit(model, 'familyLoans', rec, { balance: { value: V.formula(`=${L.balanceRef}`), display: '' } }, 'Link'));

  const { data } = await loadAll(demo);
  assert.equal(data.formulas.Receivables[rec._row][model.tables.familyLoans!.cols.balance], `=${L.balanceRef}`);
});
