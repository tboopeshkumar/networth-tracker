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
 *   A Scheme ID   B NAV   C NAV date   D Scheme name   E Refreshed   F Note
 *
 * Neither list ever loses a price. A code the source doesn't have on a given
 * day keeps its previous NAV and NAV date (column F says so), so a holding
 * shows an older date rather than dropping to zero.
 *
 * Every feed in this project records how its last run went in a "Feed Status"
 * tab (Feed, Status, Message, Last run, Last success), which the web app reads
 * for "Worth a look". The helpers for that live at the end of this file, so
 * paste this file whenever you update any of the others.
 */

const FEED_TAB = 'NAV Feed';
const FUNDS_TAB = 'Mutual Funds';
const HEADERS = ['AMFI code', 'NAV', 'NAV date', 'AMFI scheme name', 'Refreshed'];
const NPS_TAB = 'NPS';
const NPS_FEED_TAB = 'NPS Feed';
const NPS_URL = 'https://npstrust.org.in/nav-report-excel';
// One scheme's NAV history, for what the daily report lacks (see refreshNps_)
const NPS_HISTORY_URL = 'https://npstrust.org.in/scheme-wise-nav-report-excel';
// An NPS NAV that moved more than this in one refresh is more likely a wrong match than a market move
const NPS_MAX_JUMP = 0.2;
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
    .addSeparator()
    // From DailyLog.gs, if it's in this project
    .addItem('Record daily log now', 'logDaily')
    .addItem('Record daily log every night (11pm UAE)', 'installDailyLogTrigger')
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

/**
 * The daily trigger: mutual fund NAVs, then NPS NAVs. Each is recorded in the
 * Feed Status tab on its own, and one failing doesn't stop the other.
 */
function refreshNav() {
  let failed = null;
  try { runFeed_('Mutual fund NAVs', refreshAmfi_); } catch (e) { failed = e; }
  // NPS rides on the same daily trigger, once its tab has scheme IDs
  if (npsSchemeIds_().length) {
    try { refreshNps(); } catch (e) { failed = failed || e; }
  }
  if (failed) throw failed;
}

function refreshAmfi_(warn) {
  const sh = SpreadsheetApp.getActive().getSheetByName(FEED_TAB) || setupNavFeed();
  const codes = fundCodes_();
  if (!codes.length) {
    throw new Error('No AMFI codes found. Add an "AMFI code" column to the ' + FUNDS_TAB + ' tab.');
  }
  // A failed download throws here, before the tab is touched
  const amfi = parseAmfi_(fetchAmfi_());
  const found = {};
  for (const code of codes) {
    const hit = amfi[String(code).trim()];
    if (hit) found[priceKey_(code)] = hit;
  }
  writePriceList_(sh, codes, found, { label: 'AMFI code', source: 'AMFI', warn });
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
  runFeed_('NPS NAVs', refreshNps_);
}

/**
 * NPS Trust's daily report only carries the latest day any fund manager
 * published, so on a weekend or holiday it can hold one manager's schemes and
 * none of yours. And a scheme can move to a new ID (SBI's Scheme C - Tier I
 * went from SM001004 to SM001026 on 1 Apr 2026). Whatever the daily report
 * lacks is looked up in that scheme's own NAV history, which follows it
 * across such a change.
 */
function refreshNps_(warn) {
  const ids = npsSchemeIds_();
  if (!ids.length) throw new Error('No Scheme IDs on the ' + NPS_TAB + ' tab. Add a table headed "Scheme ID".');

  let navs = {};
  try {
    navs = parseNpsNav_(fetchText_(NPS_URL, 'NPS Trust\'s daily NAV report'));
  } catch (e) {
    warn('NPS Trust\'s daily NAV report was unavailable (' + e.message + '); each scheme was looked up in its history instead.');
  }
  for (const id of ids) {
    if (navs[id]) continue;
    try {
      const latest = npsSchemeLatest_(id);
      if (latest) navs[id] = latest;
    } catch (e) {
      warn('NPS ' + id + ': ' + e.message);
    }
  }
  writePriceList_(npsFeedSheet_(), ids, navs, { label: 'NPS scheme', source: 'NPS Trust', warn, maxJump: NPS_MAX_JUMP });
}

function npsFeedSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(NPS_FEED_TAB);
  if (!sh) {
    sh = ss.insertSheet(NPS_FEED_TAB);
    sh.getRange(1, 1, 1, 5).setValues([['Scheme ID', 'NAV', 'NAV date', 'Scheme name', 'Refreshed']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('C:C').setNumberFormat('d mmm yyyy');
    sh.getRange('E:E').setNumberFormat('d mmm yyyy h:mm');
  }
  return sh;
}

/** The newest NAV of one scheme, from NPS Trust's scheme-wise history (12 months). */
function npsSchemeLatest_(id) {
  const url = NPS_HISTORY_URL + '?navcatdataxls=PFM' + id.slice(2, 5) + '&navyearselxls=12&navsubdataxls=' + id;
  return latestInSeries_(fetchText_(url, 'NPS Trust\'s scheme history'), id);
}

/** A scheme's name without what differs between its old and new IDs ("NPS TRUST A/C …", "… DIRECT"). */
const seriesName_ = (s) => String(s).toUpperCase().replace(/NPS TRUST A\/C/g, ' ').replace(/\bDIRECT\b/g, ' ').replace(/[^A-Z0-9]+/g, ' ').trim();

/**
 * The newest NAV in a scheme-wise history: rows of the requested ID, or of the
 * same scheme under a later ID. Pure, so it can be tested outside Google.
 * Columns: ID | DATE OF NAV | PFM ID | PFM NAME | SCHEME ID | SCHEME NAME | NAV VALUE.
 */
function latestInSeries_(text, id) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines.findIndex((l) => /scheme id/i.test(l) && /nav value/i.test(l));
  if (head < 0) throw new Error('the scheme history has no header line');
  const cols = lines[head].split('\t').map(norm_);
  const iId = cols.indexOf('scheme id'), iName = cols.indexOf('scheme name'), iNav = cols.indexOf('nav value'), iDate = cols.indexOf('date of nav');
  if ([iId, iName, iNav, iDate].some((i) => i < 0)) throw new Error('the scheme history\'s header changed: ' + lines[head]);

  const rows = [];
  for (const line of lines.slice(head + 1)) {
    const p = line.split('\t');
    const nav = Number(p[iNav]);
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec((p[iDate] || '').trim());
    if (!p[iId] || !(nav > 0) || !d) continue;
    rows.push({ id: p[iId].trim().toUpperCase(), name: (p[iName] || '').trim().replace(/\s+/g, ' '), nav, day: d[0], ymd: [Number(d[1]), Number(d[2]), Number(d[3])] });
  }
  const own = rows.filter((r) => r.id === id);
  if (!own.length) throw new Error('not found in NPS Trust\'s NAV history. Check the Scheme ID.');
  const family = seriesName_(own[0].name);
  const latest = rows.filter((r) => r.id === id || seriesName_(r.name) === family)
    .reduce((a, r) => (r.day > a.day ? r : a));
  return { nav: latest.nav, ymd: latest.ymd, name: latest.name, note: latest.id === id ? 'From the scheme\'s NAV history' : 'Now published as ' + latest.id };
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshNav')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshNav').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('NAVs will refresh every morning around 7am IST.', 'Net Worth', 6);
}

/* ---------- shared by every feed in this project ---------- */

function fetchText_(url, what) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error(what + ' returned HTTP ' + res.getResponseCode());
  return res.getContentText();
}

const priceKey_ = (code) => String(code).trim().toUpperCase();

/**
 * Rewrites a price list (A code, B NAV, C NAV date, D name, E refreshed,
 * F note) for `codes`, without ever losing a price. A code `found` lacks keeps
 * its previous row, NAV date included, with a note and a warning. A new NAV
 * that jumped more than `maxJump` from the previous one is held back the same
 * way. When nothing at all was found, the tab is left untouched and it throws.
 *   found: priceKey_(code) → { nav, ymd, name, note? }
 */
function writePriceList_(sh, codes, found, opts) {
  const warn = opts.warn;
  const last = sh.getLastRow();
  const prev = {};
  if (last > 1) {
    const range = sh.getRange(2, 1, last - 1, 5);
    const vals = range.getValues();
    const fx = range.getFormulas();
    vals.forEach((r, i) => {
      // The NAV date is a DATE() formula; keeping the formula keeps the day exact
      if (String(r[0]).trim()) prev[priceKey_(r[0])] = { nav: r[1], date: fx[i][2] || r[2], name: r[3], refreshed: r[4] };
    });
  }
  const now = new Date();
  let fresh = 0;
  const out = codes.map((code) => {
    const hit = found[priceKey_(code)];
    const was = prev[priceKey_(code)];
    const had = was && typeof was.nav === 'number' && was.nav > 0;
    if (hit && had && opts.maxJump && Math.abs(hit.nav / was.nav - 1) > opts.maxJump) {
      warn(opts.label + ' ' + code + ': the new NAV ' + hit.nav + ' is far from the previous ' + was.nav + ', so the previous one was kept. Check the scheme, then refresh again.');
      return [code, was.nav, was.date, was.name, was.refreshed, 'Kept: the new NAV ' + hit.nav + ' looked wrong'];
    }
    if (hit) {
      fresh++;
      return [code, hit.nav, navDay_(hit.ymd), hit.name, now, hit.note || ''];
    }
    if (had) {
      warn(opts.label + ' ' + code + ' wasn\'t in ' + opts.source + '\'s data this time; its previous NAV was kept.');
      return [code, was.nav, was.date, was.name, was.refreshed, 'Kept: not in this refresh'];
    }
    warn(opts.label + ' ' + code + ' wasn\'t found in ' + opts.source + '\'s data, and there is no earlier NAV for it.');
    return [code, '', '', 'Not found', now, 'Not found'];
  });
  if (!fresh) throw new Error('No NAVs could be refreshed from ' + opts.source + ', so the existing ones were left as they were.');

  sh.getRange(1, 6).setValue('Note').setFontWeight('bold');
  if (last > 1) sh.getRange(2, 1, last - 1, 6).clearContent();
  sh.getRange(2, 1, out.length, 6).setValues(out);
}

const STATUS_TAB = 'Feed Status';
const STATUS_HEADERS = ['Feed', 'Status', 'Message', 'Last run', 'Last success'];

/**
 * Runs one feed and records how it went in the Feed Status tab: OK, Warning
 * (it ran, but kept some old values), or Error (nothing changed). Errors are
 * rethrown, so a scheduled run that fails still emails you.
 *   fn(warn): warn(message) notes something worth a look without failing the run
 */
function runFeed_(feed, fn) {
  const warnings = [];
  const warn = (msg) => { warnings.push(msg); console.warn(msg); };
  try {
    fn(warn);
  } catch (e) {
    feedStatus_(feed, 'Error', e.message);
    throw e;
  }
  feedStatus_(feed, warnings.length ? 'Warning' : 'OK', warnings.join(' '));
}

function feedStatus_(feed, status, message) {
  try {
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(STATUS_TAB);
    if (!sh) {
      sh = ss.insertSheet(STATUS_TAB);
      sh.getRange(1, 1, 1, STATUS_HEADERS.length).setValues([STATUS_HEADERS]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange('D:E').setNumberFormat('d mmm yyyy h:mm');
    }
    const last = sh.getLastRow();
    const names = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(([v]) => String(v)) : [];
    const at = names.indexOf(feed);
    const row = at >= 0 ? at + 2 : Math.max(last + 1, 2);
    const lastSuccess = status === 'Error' ? (at >= 0 ? sh.getRange(row, 5).getValue() : '') : new Date();
    sh.getRange(row, 1, 1, STATUS_HEADERS.length).setValues([[feed, status, String(message || '').slice(0, 1000), new Date(), lastSuccess]]);
  } catch (e) {
    console.warn('Feed status not recorded: ' + e.message);
  }
}

/**
 * A broker tab's rows as they are now, by symbol: what the last good refresh
 * wrote. Read before a refresh rewrites the tab.
 *   symbol → { units, invested, value }   (columns D, E, F)
 */
function brokerRowsNow_(sh) {
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  for (const r of sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues()) {
    const symbol = String(r[0]).trim();
    if (symbol) out[symbol] = { units: r[3], invested: r[4], value: r[5] };
  }
  return out;
}

/**
 * Refuses a statement that has lost everything the tab held: no holdings and
 * nothing in total, where the last refresh had some. That's a glitch at the
 * broker far more often than a real sale of everything, and writing it would
 * wipe the tab. Sold everything for real? Clear the tab yourself, then refresh.
 */
function guardBrokerRows_(before, rows, broker) {
  const held = (list) => list.filter((r) => !/^(cash|total|pending orders)$/i.test(String(r[0]))).length;
  const total = rows.find((r) => r[0] === 'Total');
  const hadTotal = before.Total && typeof before.Total.value === 'number' ? before.Total.value : 0;
  const hadHeld = Object.keys(before).filter((k) => !/^(cash|total|pending orders)$/i.test(k)).length;
  if (hadHeld && !held(rows) && hadTotal > 0 && !(total && total[5] > hadTotal / 2)) {
    throw new Error(broker + ' sent a statement with no holdings, where the last refresh had ' + hadHeld + '. The tab was left as it was. If you really sold everything, clear the tab, then refresh.');
  }
}
