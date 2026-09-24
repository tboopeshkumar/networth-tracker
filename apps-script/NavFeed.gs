/**
 * @OnlyCurrentDoc
 *
 * Daily mutual fund NAVs from AMFI into a "NAV Feed" tab.
 *
 * Paste into your sheet via Extensions → Apps Script. @OnlyCurrentDoc limits
 * the script to this one spreadsheet. It runs on Google's servers under your
 * account; nothing passes through the web app.
 *
 * Your holdings live on the Mutual Funds tab, which has two extra columns:
 *   AMFI code   (find it at https://www.amfiindia.com/nav-history-download
 *                or in https://www.amfiindia.com/spages/NAVAll.txt)
 *   Units       (from your CAS statement)
 * and prices each fund with   Current  = units × VLOOKUP(code, 'NAV Feed'!A:C, 2)
 *                             NAV Date = VLOOKUP(code, 'NAV Feed'!A:C, 3)
 *
 * The NAV Feed tab is a plain price list the script rewrites on every
 * refresh, one row per code found on the Mutual Funds tab:
 *   A AMFI code   B NAV   C NAV date   D AMFI scheme name   E Refreshed
 *
 * NPS works the same way. The NPS tab has a holdings table headed
 * Scheme ID | Scheme | Units | NAV | Value | NAV date (Scheme IDs such as
 * SM001004, from NPS Trust's NAV report), and the same refresh rewrites an
 * "NPS Feed" price list from NPS Trust's daily NAVs:
 *   A Scheme ID   B NAV   C NAV date   D Scheme name   E Refreshed
 */

const FEED_TAB = 'NAV Feed';
const FUNDS_TAB = 'Mutual Funds';
const HEADERS = ['AMFI code', 'NAV', 'NAV date', 'AMFI scheme name', 'Refreshed'];
const NPS_TAB = 'NPS';
const NPS_FEED_TAB = 'NPS Feed';
const NPS_URL = 'https://npstrust.org.in/nav-report-excel';
const SOURCES = [
  'https://www.amfiindia.com/spages/NAVAll.txt',
  'https://portal.amfiindia.com/spages/NAVAll.txt',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Net Worth')
    .addItem('Refresh NAVs now', 'refreshNav')
    .addItem('Refresh NAVs daily (7am IST)', 'installDailyTrigger')
    .addItem('Refresh NPS now', 'refreshNps')
    .addSeparator()
    // From RatesFeed.gs, if it's in this project
    .addItem('Refresh gold & AED rates now', 'refreshRates')
    .addItem('Refresh rates daily (11am IST)', 'installRatesTrigger')
    .addSeparator()
    // From EtoroFeed.gs, if it's in this project
    .addItem('Set eToro keys', 'setEtoroKeys')
    .addItem('Refresh eToro now', 'refreshEtoro')
    .addItem('Refresh eToro daily (7am IST)', 'installEtoroTrigger')
    .addSeparator()
    // From IbkrFeed.gs, if it's in this project
    .addItem('Set IBKR token', 'setIbkrToken')
    .addItem('Refresh IBKR now', 'refreshIbkr')
    .addItem('Refresh IBKR daily (8am IST)', 'installIbkrTrigger')
    .addToUi();
}

function setupNavFeed() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(FEED_TAB);
  if (!sh) sh = ss.insertSheet(FEED_TAB);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('C:C').setNumberFormat('d mmm yyyy');
  sh.getRange('E:E').setNumberFormat('d mmm yyyy h:mm');
  return sh;
}

/* ---------- AMFI ---------- */

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

  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const map = {};
  for (const line of lines) {
    const p = line.split(';');
    if (p.length <= iDate || !/^\d+$/.test((p[iCode] || '').trim())) continue;
    const nav = Number(p[iNav]);
    const d = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((p[iDate] || '').trim());
    if (!Number.isFinite(nav) || !d) continue;
    const name = [p[iName], iPlan >= 0 ? p[iPlan] : '', iOpt >= 0 ? p[iOpt] : '']
      .map((s) => (s || '').trim()).filter(Boolean).join(' · ');
    map[p[iCode].trim()] = { nav, ymd: [Number(d[3]), MON[d[2].toLowerCase()], Number(d[1])], name };
  }
  return map;
}

/**
 * A calendar day as a DATE formula. A JS Date is an instant, and the script's
 * time zone can differ from the sheet's, so new Date(y, m, d) landed on the
 * previous evening (18 Sep read as 17 Sep 20:00). DATE() is the day itself.
 */
function navDay_([y, m, d]) {
  return '=DATE(' + y + ',' + m + ',' + d + ')';
}

/* ---------- the Mutual Funds tab ---------- */

const norm_ = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();

/** The active funds table: its header row, columns by header, and fund rows (all 1-based). */
function fundsTable_(sh) {
  const vals = sh.getDataRange().getValues();
  const h = vals.findIndex((r) => r.some((v) => norm_(v) === 'fund') && r.some((v) => norm_(v) === 'invested') && r.some((v) => norm_(v) === 'current'));
  if (h < 0) throw new Error('No Fund / Invested / Current header row on ' + FUNDS_TAB);
  const cols = {};
  vals[h].forEach((v, c) => { if (norm_(v) && !(norm_(v) in cols)) cols[norm_(v)] = c + 1; });
  let lastCol = 0;
  vals[h].forEach((v, c) => { if (norm_(v)) lastCol = c + 1; });
  const rows = [];
  for (let i = h + 1; i < vals.length; i++) {
    const first = norm_(vals[i][0]);
    if (/^total/.test(first)) break;
    if (vals[i][cols.fund - 1] !== '') rows.push(i + 1);
  }
  return { headerRow: h + 1, cols, lastCol, rows, vals };
}

/** Scheme codes listed on the Mutual Funds tab, in order, without repeats. */
function fundCodes_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FUNDS_TAB);
  if (!sh) return [];
  const t = fundsTable_(sh);
  const col = t.cols['amfi code'];
  if (!col) return [];
  const codes = [];
  const seen = {};
  for (const r of t.rows) {
    const code = t.vals[r - 1][col - 1];
    const key = String(code).trim();
    if (/^\d+$/.test(key) && !seen[key]) { seen[key] = true; codes.push(code); }
  }
  return codes;
}

/* ---------- refresh ---------- */

function refreshNav() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(FEED_TAB) || setupNavFeed();
  const codes = fundCodes_();
  if (!codes.length) {
    throw new Error('No AMFI codes found. Add an "AMFI code" column to the ' + FUNDS_TAB + ' tab.');
  }

  const amfi = parseAmfi_(fetchAmfi_());
  const now = new Date();
  const missing = [];
  // Codes are written back as they appear on the Mutual Funds tab, so VLOOKUP matches type for type
  const out = codes.map((code) => {
    const hit = amfi[String(code).trim()];
    if (!hit) { missing.push(code); return [code, '', '', 'Code not found in AMFI file', now]; }
    return [code, hit.nav, navDay_(hit.ymd), hit.name, now];
  });

  const old = sh.getLastRow();
  if (old > 1) sh.getRange(2, 1, old - 1, HEADERS.length).clearContent();
  sh.getRange(2, 1, out.length, HEADERS.length).setValues(out);

  if (missing.length) console.warn('Scheme codes not found: ' + missing.join(', '));

  // NPS rides on the same daily trigger, once its tab has scheme IDs
  if (npsSchemeIds_().length) refreshNps();
}

/* ---------- NPS ---------- */

/** Scheme IDs listed under the "Scheme ID" header on the NPS tab, in order, without repeats. */
function npsSchemeIds_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(NPS_TAB);
  if (!sh) return [];
  const vals = sh.getDataRange().getValues();
  for (let r = 0; r < vals.length; r++) {
    const c = vals[r].findIndex((v) => norm_(v) === 'scheme id');
    if (c < 0) continue;
    const ids = [];
    for (let i = r + 1; i < vals.length; i++) {
      const id = String(vals[i][c]).trim().toUpperCase();
      if (!id) break;
      if (/^SM\d{6}$/.test(id) && ids.indexOf(id) < 0) ids.push(id);
    }
    return ids;
  }
  return [];
}

/**
 * NPS Trust's NAV report: tab-separated, one row per scheme, headed
 * ID | DATE OF NAV | PFM NAME | SCHEME ID | SCHEME NAME | NAV VALUE.
 * Columns are found by header name.
 */
function parseNpsNav_(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.findIndex((l) => /scheme id/i.test(l) && /nav value/i.test(l));
  if (head < 0) throw new Error('NPS NAV report has no header line');
  const cols = lines[head].split('\t').map(norm_);
  const at = (name) => cols.indexOf(name);
  const iId = at('scheme id'), iName = at('scheme name'), iNav = at('nav value'), iDate = at('date of nav');
  if ([iId, iName, iNav, iDate].some((i) => i < 0)) throw new Error('NPS NAV report header changed: ' + lines[head]);

  const map = {};
  for (const line of lines.slice(head + 1)) {
    const p = line.split('\t');
    const nav = Number(p[iNav]);
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec((p[iDate] || '').trim());
    if (!p[iId] || !Number.isFinite(nav) || !d) continue;
    map[p[iId].trim().toUpperCase()] = { nav, ymd: [Number(d[1]), Number(d[2]), Number(d[3])], name: (p[iName] || '').trim().replace(/\s+/g, ' ') };
  }
  return map;
}

function refreshNps() {
  const ids = npsSchemeIds_();
  if (!ids.length) throw new Error('No Scheme IDs on the ' + NPS_TAB + ' tab. Add a table headed "Scheme ID".');
  const res = UrlFetchApp.fetch(NPS_URL, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('NPS Trust returned HTTP ' + res.getResponseCode());
  const navs = parseNpsNav_(res.getContentText());

  const now = new Date();
  const missing = [];
  const out = ids.map((id) => {
    const hit = navs[id];
    if (!hit) { missing.push(id); return [id, '', '', 'Scheme ID not found in the NPS Trust report', now]; }
    return [id, hit.nav, navDay_(hit.ymd), hit.name, now];
  });

  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(NPS_FEED_TAB);
  if (!sh) {
    sh = ss.insertSheet(NPS_FEED_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Scheme ID', 'NAV', 'NAV date', 'Scheme name', 'Refreshed']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('C:C').setNumberFormat('d mmm yyyy');
    sh.getRange('E:E').setNumberFormat('d mmm yyyy h:mm');
  }
  const old = sh.getLastRow();
  if (old > 1) sh.getRange(2, 1, old - 1, 5).clearContent();
  sh.getRange(2, 1, out.length, 5).setValues(out);
  if (missing.length) throw new Error('NPS scheme IDs not found: ' + missing.join(', ') + '. Check them against NPS Trust\'s NAV report.');
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshNav')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshNav').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('NAVs will refresh every morning around 7am IST.', 'Net Worth', 6);
}
