/**
 * @OnlyCurrentDoc
 *
 * Daily gold and AED → INR rates into a "Rates Feed" tab.
 *
 * Paste into the same Apps Script project as NavFeed.gs (Extensions → Apps
 * Script → + → Script). NavFeed.gs's Net Worth menu has the items for it.
 * It runs on Google's servers under your account, so the rates stay fresh
 * even when nobody opens the sheet; nothing passes through the web app.
 *
 * The tab has one row per rate, found by its label in column A:
 *   A Rate   B Value   C Source   D Rate date   E Refreshed
 * Point the cells that use a rate at it, for example
 *   =VLOOKUP("Gold 22C (₹/g)", 'Rates Feed'!A:B, 2, FALSE)
 * A rate that fails to fetch keeps its previous value, so nothing that
 * depends on it breaks; column E then shows the last good refresh.
 */

const RATES_TAB = 'Rates Feed';
const RATES_HEADERS = ['Rate', 'Value', 'Source', 'Rate date', 'Refreshed'];
const GOLD_LABEL = 'Gold 22C (₹/g)';
const GOLD999_LABEL = 'Gold 999 (₹/g)';
const AED_LABEL = 'AED → INR';
const GOLD_URL = 'https://gulfnews.com/gold-forex/india-gold-prices';
const IBJA_URL = 'https://ibjarates.com/';
const AED_USD_PEG = 3.6725;

function setupRatesFeed() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(RATES_TAB);
  if (!sh) sh = ss.insertSheet(RATES_TAB);
  sh.getRange(1, 1, 1, RATES_HEADERS.length).setValues([RATES_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  for (const label of [GOLD_LABEL, GOLD999_LABEL, AED_LABEL]) rateRow_(sh, label);
  sh.getRange('D:D').setNumberFormat('d mmm yyyy');
  sh.getRange('E:E').setNumberFormat('d mmm yyyy h:mm');
  return sh;
}

/** Row number of a rate's label, adding it at the end if missing. */
function rateRow_(sh, label) {
  const labels = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  const i = labels.findIndex(([v]) => String(v).trim() === label);
  if (i >= 0) return i + 1;
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1).setValue(label);
  return row;
}

function refreshRates() {
  const sh = SpreadsheetApp.getActive().getSheetByName(RATES_TAB) || setupRatesFeed();
  const failed = [];
  const put = (label, fetch) => {
    try {
      const r = fetch();
      const date = r.ymd ? rateDay_(r.ymd) : new Date();
      sh.getRange(rateRow_(sh, label), 2, 1, 4).setValues([[r.value, r.source, date, new Date()]]);
    } catch (e) {
      failed.push(label + ': ' + e.message);
    }
  };
  put(GOLD_LABEL, fetchGold22_);
  put(GOLD999_LABEL, fetchGold999_);
  put(AED_LABEL, () => fetchAedInr_(sh));
  if (failed.length) throw new Error('Rates not refreshed — ' + failed.join('; '));
}

/* ---------- 22C gold, India (Gulf News) ---------- */

function fetchGold22_() {
  const res = UrlFetchApp.fetch(GOLD_URL, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('Gulf News returned HTTP ' + res.getResponseCode());
  return parseGold22_(res.getContentText());
}

// Two tables on the page: today's prices by time of day, and a dated history
// whose first row is the latest day. Prefer the history, as it carries the date.
function parseGold22_(html) {
  const tables = (html.match(/<table[\s\S]*?<\/table>/gi) || []).map(tableRows_);
  const number = (s) => {
    const m = /^\d[\d,]*(\.\d+)?/.exec(s || '');
    return m ? Number(m[0].replace(/,/g, '')) : NaN;
  };

  for (const rows of tables) {
    const head = rows[0] || [];
    const col = head.findIndex((c) => /^22\s*carat/i.test(c));
    if (col < 0 || !/^date$/i.test(head[0] || '')) continue;
    for (const r of rows.slice(1)) {
      const ymd = parseDayMonth_(r[0]);
      const value = number(r[col]);
      if (ymd && value > 0) return { value, ymd, source: 'Gulf News' };
    }
  }

  // Fallback: today's table, latest of morning/afternoon/evening
  for (const rows of tables) {
    const r = rows.find((x) => /^22\s*carat/i.test(x[0] || ''));
    if (!r) continue;
    const today = r.slice(1, 4).map(number).filter((v) => v > 0);
    if (today.length) return { value: today[today.length - 1], ymd: null, source: 'Gulf News (today)' };
  }
  throw new Error('22 Carat price not found on the Gulf News page');
}

function tableRows_(table) {
  return (table.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) =>
    (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map((cell) =>
      cell.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()));
}

/** "19th Sept 2026" → [2026, 9, 19] */
function parseDayMonth_(s) {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/.exec((s || '').trim());
  if (!m) return null;
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : [Number(m[3]), mon + 1, Number(m[1])];
}

/** The day itself as a DATE formula; a JS Date would shift with the script's time zone. */
function rateDay_([y, m, d]) {
  return '=DATE(' + y + ',' + m + ',' + d + ')';
}

/* ---------- 999 gold, India (IBJA) ---------- */

/**
 * The rate sovereign gold bonds are redeemed at: the simple average of the
 * IBJA 999 closing price over the previous three business days. IBJA
 * publishes per 10 grams; this returns per gram.
 */
function fetchGold999_() {
  const res = UrlFetchApp.fetch(IBJA_URL, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('IBJA returned HTTP ' + res.getResponseCode());
  return parseIbja999_(res.getContentText());
}

function parseIbja999_(html) {
  const tables = (html.match(/<table[\s\S]*?<\/table>/gi) || []).map(tableRows_);
  let closes = null;
  for (const rows of tables) {
    const dated = rows.map((r) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((r[0] || '').trim());
      const per10g = Number((r[1] || '').replace(/,/g, ''));
      return m && per10g > 0 ? { ymd: [Number(m[3]), Number(m[2]), Number(m[1])], per10g } : null;
    }).filter(Boolean);
    // Both an AM and a PM table are published; the closing (PM) one comes last
    if (dated.length >= 3) closes = dated;
  }
  if (!closes) throw new Error('No 999 rate table found on the IBJA page');

  const used = closes.slice(0, 3);
  const avg = used.reduce((a, d) => a + d.per10g, 0) / used.length / 10;
  return { value: Math.round(avg * 100) / 100, ymd: used[0].ymd, source: 'IBJA 999, 3-day average' };
}

/* ---------- AED → INR ---------- */

// Google Finance's USD → INR over the AED peg, the same as the sheet's formula.
// Apps Script can't call GOOGLEFINANCE directly, so it's evaluated in a spare
// cell of this tab, read, and cleared.
function fetchAedInr_(sh) {
  const cell = sh.getRange(1, RATES_HEADERS.length + 2);
  try {
    cell.setFormula('=GOOGLEFINANCE("CURRENCY:USDINR")');
    SpreadsheetApp.flush();
    const usdInr = cell.getValue();
    if (typeof usdInr !== 'number' || !(usdInr > 0)) throw new Error('Google Finance gave ' + usdInr);
    return { value: usdInr / AED_USD_PEG, ymd: null, source: 'Google Finance' };
  } finally {
    cell.clearContent();
  }
}

/* ---------- schedule ---------- */

// Indian gold rates are set each morning; 11am IST picks up the day's rate.
function installRatesTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshRates')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('refreshRates').timeBased().everyDays(1).atHour(11).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('Gold and AED rates will refresh every day around 11am IST.', 'Net Worth', 6);
}
