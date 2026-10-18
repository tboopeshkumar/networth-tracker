// The sheet scripts (apps-script/*.gs), run against a stand-in for Google's
// services. They hold no data; everything here is made up. What matters most:
// a failure never wipes a value the sheet already had.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'vitest';

type Cell = string | number | Date;
type Grid = Cell[][];

/** Just enough of a Google sheet for the scripts. */
class Sheet {
  rows: Grid;
  constructor(rows: Grid = []) { this.rows = rows.map((r) => [...r]); }
  getDataRange() { return { getValues: () => this.rows.map((r) => [...r]) }; }
  getLastRow() { let n = this.rows.length; while (n && this.rows[n - 1].every((v) => v === '')) n--; return n; }
  cell(r: number, c: number): Cell { return this.rows[r - 1]?.[c - 1] ?? ''; }
  set(r: number, c: number, v: Cell) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  getRange(a: number | string, b = 1, h = 1, w = 1) {
    const self = this;
    if (typeof a === 'string') {
      const whole = { setFontWeight: () => whole, setNumberFormat: () => whole };
      return whole;
    }
    const each = <T>(f: (r: number, c: number) => T) => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => f(a + i, b + j)));
    const range = {
      setFontWeight: () => range,
      setNumberFormat: () => range,
      // A DATE() formula reads back as a date, as it would in Sheets
      getValues: () => each((r, c) => { const v = self.cell(r, c); return typeof v === 'string' && v.startsWith('=') ? new Date(2026, 0, 1) : v; }),
      getFormulas: () => each((r, c) => { const v = self.cell(r, c); return typeof v === 'string' && v.startsWith('=') ? v : ''; }),
      getValue: () => self.cell(a, b),
      setValues: (v: Grid) => { v.forEach((row, i) => row.forEach((x, j) => self.set(a + i, b + j, x))); return range; },
      setValue: (v: Cell) => { self.set(a, b, v); return range; },
      clearContent: () => { each((r, c) => self.set(r, c, '')); return range; },
    };
    return range;
  }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
  deleteRows(at: number, n: number) { this.rows.splice(at - 1, n); }
}

type Fetch = (url: string) => { code?: number; text?: string };

/** All the scripts loaded together, as Apps Script would, over the given sheets and web. */
function scripts(sheets: Record<string, Sheet>, fetch: Fetch) {
  const ctx: Record<string, unknown> = {
    SpreadsheetApp: {
      getActive: () => ({ getSheetByName: (n: string) => sheets[n] ?? null, insertSheet: (n: string) => (sheets[n] = new Sheet()), toast() {} }),
      flush() {},
    },
    UrlFetchApp: { fetch: (url: string) => { const r = fetch(url); return { getResponseCode: () => r.code ?? 200, getContentText: () => r.text ?? '' }; } },
    Utilities: { formatDate: (d: Date, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d), sleep() {}, getUuid: () => 'id' },
    PropertiesService: { getUserProperties: () => ({ getProperty: () => 'key' }) },
    console: { warn() {}, log() {} },
  };
  const code = ['NavFeed', 'RatesFeed', 'EtoroFeed', 'IbkrFeed', 'DailyLog']
    .map((f) => readFileSync(new URL(`../apps-script/${f}.gs`, import.meta.url), 'utf8')).join('\n');
  // Top-level functions become properties of the context, so a test can call or replace them
  runInNewContext(code, ctx);
  return ctx as Record<string, (...a: unknown[]) => unknown>;
}

const status = (sheets: Record<string, Sheet>, feed: string) => sheets['Feed Status']?.rows.find((r) => r[0] === feed);

/* ---------- NPS ---------- */

const DAILY_HEAD = 'ID\tDATE OF NAV\tPFM NAME\tSCHEME ID\tSCHEME NAME\tNAV VALUE';
const HISTORY_HEAD = 'ID\tDATE OF NAV\tPFM ID\tPFM NAME\tSCHEME ID\tSCHEME NAME\tNAV VALUE';
// A weekend: the latest day only one other fund manager published
const weekendReport = `${DAILY_HEAD}\n1\t2026-10-17\tOther PFM\tSM099001\tOTHER SCHEME E - TIER I\t15.4\n`;
// One scheme that moved to a new ID on 1 April, one that didn't
const histories: Record<string, string> = {
  SM001004: `${HISTORY_HEAD}\n1\t2026-10-16\tPFM001\tA Pension\tSM001026\tNPS TRUST A/C A PENSION FUND SCHEME C - TIER I DIRECT\t46.38\n2\t2026-04-01\tPFM001\tA Pension\tSM001026\tNPS TRUST A/C A PENSION FUND SCHEME C - TIER I DIRECT\t45.27\n3\t2026-03-31\tPFM001\tA Pension\tSM001004\tA PENSION FUND SCHEME C - TIER I\t45.27\n4\t2026-10-15\tPFM001\tA Pension\tSM001099\tA PENSION FUND SCHEME E - TIER I\t99\n`,
  SM007001: `${HISTORY_HEAD}\n1\t2026-10-16\tPFM007\tB Pension\tSM007001\tB PENSION FUND SCHEME E - TIER I\t70.9\n2\t2026-10-15\tPFM007\tB Pension\tSM007001\tB PENSION FUND SCHEME E - TIER I\t70.5\n`,
};
const npsWeb: Fetch = (url) => {
  if (url.includes('scheme-wise')) {
    const id = /navsubdataxls=(SM\d+)/.exec(url)?.[1] ?? '';
    return histories[id] ? { text: histories[id] } : { code: 404 };
  }
  return { text: weekendReport };
};
const npsSheets = (feed: Grid) => ({
  NPS: new Sheet([['NPS'], [], ['Scheme ID', 'Scheme', 'Units', 'NAV', 'Value', 'NAV date'], ['SM001004', 'A C', 100], ['SM007001', 'B E', 50]]),
  'NPS Feed': new Sheet([['Scheme ID', 'NAV', 'NAV date', 'Scheme name', 'Refreshed'], ...feed]),
});

test('NPS: a weekend report without your schemes, and a scheme with a new ID, are filled from each scheme\'s history', () => {
  const sheets = npsSheets([['SM001004', '', '', 'Not found', 'x'], ['SM007001', '', '', 'Not found', 'x']]);
  scripts(sheets, npsWeb).refreshNps();
  const rows = sheets['NPS Feed'].rows.slice(1);
  assert.deepEqual(rows.map((r) => [r[0], r[1], r[2], r[5]]), [
    // The newest NAV of the same scheme under its new ID, not another scheme of that manager
    ['SM001004', 46.38, '=DATE(2026,10,16)', 'Now published as SM001026'],
    ['SM007001', 70.9, '=DATE(2026,10,16)', 'From the scheme\'s NAV history'],
  ]);
  assert.equal(status(sheets, 'NPS NAVs')?.[1], 'OK');
});

test('NPS: when nothing can be fetched, the existing NAVs stay exactly as they were', () => {
  const sheets = npsSheets([['SM001004', 45, '=DATE(2026,10,9)', 'A C', 'x'], ['SM007001', 70, '=DATE(2026,10,9)', 'B E', 'x']]);
  const before = JSON.stringify(sheets['NPS Feed'].rows);
  assert.throws(() => scripts(sheets, () => ({ code: 503 })).refreshNps(), /No NAVs could be refreshed/);
  assert.equal(JSON.stringify(sheets['NPS Feed'].rows), before);
  assert.equal(status(sheets, 'NPS NAVs')?.[1], 'Error');
});

test('NPS: a scheme that can\'t be found keeps its previous NAV and date', () => {
  const sheets = npsSheets([['SM001004', 45, '=DATE(2026,10,9)', 'A C', 'x'], ['SM007001', 70, '=DATE(2026,10,9)', 'B E', 'x']]);
  scripts(sheets, (url) => (url.includes('SM001004') ? { code: 500 } : npsWeb(url))).refreshNps();
  const [a, b] = sheets['NPS Feed'].rows.slice(1);
  assert.deepEqual([a[1], a[2], a[5]], [45, '=DATE(2026,10,9)', 'Kept: not in this refresh']);
  assert.deepEqual([b[1], b[2]], [70.9, '=DATE(2026,10,16)']);
  assert.equal(status(sheets, 'NPS NAVs')?.[1], 'Warning');
});

test('NPS: a NAV far from the previous one is held back as a likely wrong match', () => {
  const sheets = npsSheets([['SM001004', 45, '=DATE(2026,10,9)', 'A C', 'x'], ['SM007001', 20, '=DATE(2026,10,9)', 'B E', 'x']]);
  scripts(sheets, npsWeb).refreshNps();
  const [a, b] = sheets['NPS Feed'].rows.slice(1);
  assert.equal(a[1], 46.38);
  assert.deepEqual([b[1], b[2]], [20, '=DATE(2026,10,9)'], '70.9 is too far from 20 to be the same scheme');
  assert.match(String(b[5]), /looked wrong/);
  assert.equal(status(sheets, 'NPS NAVs')?.[1], 'Warning');
});

/* ---------- mutual funds ---------- */

test('Mutual funds: a code missing from AMFI\'s file keeps its NAV; a failed download changes nothing', () => {
  const sheets = {
    'Mutual Funds': new Sheet([['Mutual Funds'], [], [], ['Fund', 'Invested', 'Current', 'AMFI code', 'Units'], ['Fund A', 100, 120, 111111, 10], ['Fund B', 100, 120, 222222, 10], ['Total']]),
    'NAV Feed': new Sheet([['AMFI code', 'NAV', 'NAV date', 'AMFI scheme name', 'Refreshed'], [111111, 40, '=DATE(2026,10,15)', 'Fund A', 'x'], [222222, 55.5, '=DATE(2026,10,15)', 'Fund B', 'x']]),
  };
  const amfi = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\n111111;a;b;Fund A;45.67;16-Oct-2026\n';
  scripts(sheets, () => ({ text: amfi })).refreshNav();
  assert.deepEqual(sheets['NAV Feed'].rows.slice(1).map((r) => [r[0], r[1], r[2]]), [[111111, 45.67, '=DATE(2026,10,16)'], [222222, 55.5, '=DATE(2026,10,15)']]);
  assert.equal(status(sheets, 'Mutual fund NAVs')?.[1], 'Warning');

  const before = JSON.stringify(sheets['NAV Feed'].rows);
  assert.throws(() => scripts(sheets, () => ({ code: 500 })).refreshNav());
  assert.equal(JSON.stringify(sheets['NAV Feed'].rows), before);
  assert.equal(status(sheets, 'Mutual fund NAVs')?.[1], 'Error');
});

/* ---------- rates ---------- */

test('Rates: a failed source or a far-off value keeps the previous rate', () => {
  const sheets = { 'Rates Feed': new Sheet([['Rate', 'Value', 'Source', 'Rate date', 'Refreshed'], ['Gold 22C (₹/g)', 10000, 's', 'x', 'x'], ['Gold 999 (₹/g)', 12000, 's', 'x', 'x'], ['AED → INR', 26.1, 's', 'x', 'x']]) };
  const s = scripts(sheets, () => ({ code: 500 }));
  s.fetchGold22_ = () => ({ value: 25000, ymd: [2026, 10, 17], source: 'page' }); // a misread page
  s.fetchAedInr_ = () => ({ value: 26.2, ymd: null, source: 'Google Finance' });
  runInNewContext('refreshRates()', s);
  const r = sheets['Rates Feed'].rows;
  assert.deepEqual([r[1][1], r[2][1], r[3][1]], [10000, 12000, 26.2]);
  assert.equal(status(sheets, 'Gold & AED rates')?.[1], 'Warning');
});

/* ---------- brokers ---------- */

const brokerTab = () => new Sheet([
  ['Symbol', 'Name', 'Type', 'Units', 'Invested ($)', 'Value ($)', 'P&L ($)', 'Refreshed'],
  ['AAA', 'A', 'Stocks', 10, 1500, 2300, 800, 'x'], ['BBB', 'B', 'Stocks', 5, 1000, 2100, 1100, 'x'],
  ['Cash', '', 'Cash', '', 50, 50, 0, 'x'], ['Total', '', '', '', 2550, 4450, 1900, 'x'],
]);

test('eToro: a holding without a live price keeps its last value; an empty statement is refused', () => {
  const sheets = { 'eToro Feed': brokerTab() };
  const s = scripts(sheets, () => ({}));
  s.etoroGet_ = (path: unknown) => {
    const p = String(path);
    if (p.startsWith('/trading')) return { clientPortfolio: { positions: [{ instrumentID: 1, units: 10, amount: 1500, isBuy: true, leverage: 1 }, { instrumentID: 2, units: 5, amount: 1000, isBuy: true, leverage: 1 }], credit: 50 } };
    if (p.includes('/rates')) return { rates: [{ instrumentID: 1, bid: 240, conversionRateBid: 1 }] };
    if (p.includes('instrument-types')) return { instrumentTypes: [] };
    return { instrumentDisplayDatas: [{ instrumentID: 1, symbolFull: 'AAA' }, { instrumentID: 2, symbolFull: 'BBB' }] };
  };
  runInNewContext('refreshEtoro()', s);
  const rows = sheets['eToro Feed'].rows;
  assert.equal(rows.find((r) => r[0] === 'BBB')?.[5], 2100, 'its last value, not its cost of 1000');
  assert.equal(rows.find((r) => r[0] === 'Total')?.[5], 2400 + 2100 + 50);
  assert.equal(status(sheets, 'eToro')?.[1], 'Warning');

  s.etoroGet_ = (path: unknown) => (String(path).startsWith('/trading') ? { clientPortfolio: { positions: [], credit: 0 } } : { rates: [] });
  const before = JSON.stringify(sheets['eToro Feed'].rows);
  assert.throws(() => runInNewContext('refreshEtoro()', s), /no holdings/);
  assert.equal(JSON.stringify(sheets['eToro Feed'].rows), before);
});

test('IBKR: an empty statement is refused and the tab kept', () => {
  const sheets = { 'IBKR Feed': brokerTab() };
  const s = scripts(sheets, () => ({}));
  s.fetchFlexStatement_ = () => ({});
  s.flexToPlain_ = () => ({ base: 'USD', positions: [], cash: 0, hasCash: true });
  const before = JSON.stringify(sheets['IBKR Feed'].rows);
  assert.throws(() => runInNewContext('refreshIbkr()', s), /no holdings/);
  assert.equal(JSON.stringify(sheets['IBKR Feed'].rows), before);
  assert.equal(status(sheets, 'IBKR')?.[1], 'Error');
});
