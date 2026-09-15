/**
 * @OnlyCurrentDoc
 *
 * Daily mutual fund NAVs from AMFI into a "NAV Feed" tab.
 *
 * Paste into your sheet via Extensions → Apps Script. @OnlyCurrentDoc limits
 * the script to this one spreadsheet. It runs on Google's servers under your
 * account; nothing passes through the web app.
 *
 * In the NAV Feed tab you fill in, per fund:
 *   A  AMFI scheme code   (find it at https://www.amfiindia.com/nav-history-download
 *                          or in https://www.amfiindia.com/spages/NAVAll.txt)
 *   B  Fund               (as written in your Mutual Funds tab)
 *   C  Units held         (from your CAS statement)
 * The script fills D NAV, E NAV date, G AMFI scheme name, H last refresh.
 * F is a formula: units × NAV.
 */

const FEED_TAB = 'NAV Feed';
const HEADERS = ['AMFI code', 'Fund', 'Units', 'NAV', 'NAV date', 'Value (₹)', 'AMFI scheme name', 'Refreshed'];
const SOURCES = [
  'https://www.amfiindia.com/spages/NAVAll.txt',
  'https://portal.amfiindia.com/spages/NAVAll.txt',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Net Worth')
    .addItem('Refresh NAVs now', 'refreshNav')
    .addItem('Set up NAV Feed tab', 'setupNavFeed')
    .addItem('Refresh NAVs daily (7am IST)', 'installDailyTrigger')
    .addToUi();
}

function setupNavFeed() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FEED_TAB);
  if (!sh) sh = ss.insertSheet(FEED_TAB);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('E:E').setNumberFormat('d mmm yyyy');
  sh.getRange('F:F').setNumberFormat('#,##,##0');
  sh.getRange('H:H').setNumberFormat('d mmm yyyy h:mm');
  return sh;
}

function fetchAmfi_() {
  let lastError;
  for (const url of SOURCES) {
    try {
      const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() === 200 && res.getContentText().indexOf('Scheme Code') >= 0) return res.getContentText();
      lastError = new Error(url + ' returned HTTP ' + res.getResponseCode());
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// AMFI's column set has changed before (Plan/Option were split out), so read
// positions from the header line instead of hardcoding them.
function parseAmfi_(text) {
  const lines = text.split(/\r?\n/);
  const head = lines.find((l) => l.indexOf('Scheme Code') === 0);
  if (!head) throw new Error('AMFI file has no header line');
  const cols = head.split(';').map((h) => h.trim().toLowerCase());
  const at = (name) => cols.findIndex((c) => c.indexOf(name) === 0);
  const iCode = at('scheme code');
  const iName = at('scheme name');
  const iPlan = at('plan');
  const iOpt = at('option');
  const iNav = at('net asset value');
  const iDate = cols.lastIndexOf('date');
  if ([iCode, iName, iNav, iDate].some((i) => i < 0)) throw new Error('AMFI header changed: ' + head);

  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const map = {};
  for (const line of lines) {
    const p = line.split(';');
    if (p.length <= iDate || !/^\d+$/.test((p[iCode] || '').trim())) continue;
    const nav = Number(p[iNav]);
    const d = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((p[iDate] || '').trim());
    if (!Number.isFinite(nav) || !d) continue;
    const name = [p[iName], iPlan >= 0 ? p[iPlan] : '', iOpt >= 0 ? p[iOpt] : '']
      .map((s) => (s || '').trim()).filter(Boolean).join(' · ');
    map[p[iCode].trim()] = { nav, date: new Date(Number(d[3]), MON[d[2].toLowerCase()], Number(d[1])), name };
  }
  return map;
}

function refreshNav() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FEED_TAB) || setupNavFeed();
  const last = sh.getLastRow();
  if (last < 2) return;

  const feed = parseAmfi_(fetchAmfi_());
  const codes = sh.getRange(2, 1, last - 1, 1).getValues();
  const now = new Date();
  const out = [];
  const formulas = [];
  const missing = [];

  codes.forEach(([code], i) => {
    const row = i + 2;
    const hit = feed[String(code).trim()];
    formulas.push(['=IF(AND(ISNUMBER(C' + row + '),ISNUMBER(D' + row + ')),C' + row + '*D' + row + ',"")']);
    if (!code) { out.push(['', '', '']); return; }
    if (!hit) { missing.push(code); out.push(['', '', 'Code not found in AMFI file']); return; }
    out.push([hit.nav, hit.date, hit.name]);
  });

  // D NAV, E date  |  F formula  |  G scheme name  |  H refreshed
  sh.getRange(2, 4, out.length, 2).setValues(out.map((r) => [r[0], r[1]]));
  sh.getRange(2, 6, formulas.length, 1).setFormulas(formulas);
  sh.getRange(2, 7, out.length, 1).setValues(out.map((r) => [r[2]]));
  sh.getRange(2, 8, out.length, 1).setValues(out.map(() => [now]));

  if (missing.length) console.warn('Scheme codes not found: ' + missing.join(', '));
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshNav')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshNav').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('NAVs will refresh every morning around 7am IST.', 'Net Worth', 6);
}
