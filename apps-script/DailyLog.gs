/**
 * @OnlyCurrentDoc
 *
 * A nightly record of every Net Worth line, into a "Daily Log" tab, so the
 * web app can show what changed since yesterday.
 *
 * Paste into the same Apps Script project as NavFeed.gs (Extensions → Apps
 * Script → + → Script). NavFeed.gs's Net Worth menu has the items for it.
 * It only reads and writes this spreadsheet: nothing is fetched or sent.
 *
 * One row per line per day:
 *   A Date (text, yyyy-mm-dd)   B Line   C Invested (INR)   D Current (INR)
 * The AED → INR rate is logged too, as a line named "Rate: AED → INR" with
 * the rate under Current. Running it twice in a day replaces that day's rows,
 * and rows older than 400 days are removed.
 */

const DAILY_TAB = 'Daily Log';
const DAILY_HEADERS = ['Date', 'Line', 'Invested (INR)', 'Current (INR)'];
const DAILY_RATE = 'Rate: AED → INR';
const DAILY_KEEP_DAYS = 400;
// The day a run belongs to. Named outright: the spreadsheet's own zone can come back invalid.
const DAILY_ZONE = 'Asia/Dubai';

function setupDailyLog() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(DAILY_TAB);
  if (!sh) sh = ss.insertSheet(DAILY_TAB);
  sh.getRange(1, 1, 1, DAILY_HEADERS.length).setValues([DAILY_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Text, so a date is the same day whatever zone reads it
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('C:D').setNumberFormat('#,##0.00');
  return sh;
}

function logDaily() {
  runFeed_('Daily log', logDaily_);
}

function logDaily_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DAILY_TAB) || setupDailyLog();
  SpreadsheetApp.flush();
  const now = new Date();
  const day = Utilities.formatDate(now, DAILY_ZONE, 'yyyy-MM-dd');
  const cutoff = Utilities.formatDate(new Date(now.getTime() - DAILY_KEEP_DAYS * 86400000), DAILY_ZONE, 'yyyy-MM-dd');

  const rows = dailyLines_().map(([line, invested, current]) => [day, line, invested, current]);
  if (!rows.length) throw new Error('Daily log: the Net Worth tab has no lines');
  const rate = dailyAedInr_();
  if (rate) rows.push([day, DAILY_RATE, '', rate]);

  // Rows are in date order: today's (a rerun) are at the end, the oldest at the top
  const dates = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(([v]) => String(v))
    : [];
  const today = dates.indexOf(day);
  if (today >= 0) sh.deleteRows(today + 2, dates.length - today);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, DAILY_HEADERS.length).setValues(rows);
  // Pruned after writing, so the tab is never emptied (Sheets refuses to delete every row)
  const old = dates.filter((d) => d && d < cutoff).length;
  if (old > 0) sh.deleteRows(2, old);
}

/** [line, invested, current] for every line on the Net Worth tab, above its grand total. */
function dailyLines_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Net Worth');
  if (!sh) throw new Error('Daily log: no "Net Worth" tab');
  const g = sh.getDataRange().getValues();
  const norm = (v) => String(v).trim().toLowerCase();
  const head = g.findIndex((r) => r.some((v) => norm(v) === 'asset') && r.some((v) => norm(v) === 'current value (inr)'));
  if (head < 0) throw new Error('Daily log: the Net Worth table (Asset, Invested (INR), Current Value (INR)) was not found');
  const col = (name) => g[head].findIndex((v) => norm(v) === name);
  const asset = col('asset');
  const invested = col('invested (inr)');
  const current = col('current value (inr)');

  const out = [];
  for (let i = head + 1; i < g.length; i++) {
    if (g[i].some((v) => /grand total/i.test(String(v)))) break;
    const line = String(g[i][asset]).trim();
    if (!line) continue;
    const cur = g[i][current];
    // A formula mid-error (#N/A from a rate lookup) would record a false drop: skip the whole run
    if (typeof cur !== 'number') throw new Error('Daily log: "' + line + '" has no number under Current Value right now (' + cur + '). Nothing was logged.');
    out.push([line, typeof g[i][invested] === 'number' ? g[i][invested] : '', cur]);
  }
  return out;
}

/** The AED → INR rate the sheet is using: the cell beside its label on Bank Balances. */
function dailyAedInr_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Bank Balances');
  if (!sh) return null;
  const g = sh.getDataRange().getValues();
  for (const r of g) {
    const c = r.findIndex((v) => typeof v === 'string' && /AED\s*→\s*INR/i.test(v));
    if (c >= 0 && typeof r[c + 1] === 'number' && r[c + 1] > 0) return r[c + 1];
  }
  return null;
}

/* ---------- schedule ---------- */

// Late evening, so each day's row is how that day ended. The app compares
// what the sheet says now with the last row from before today.
function installDailyLogTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'logDaily')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('logDaily').timeBased().everyDays(1).atHour(23).inTimezone(DAILY_ZONE).create();
  SpreadsheetApp.getActive().toast('Net Worth lines will be recorded every night around 11pm UAE time.', 'Net Worth', 6);
}
