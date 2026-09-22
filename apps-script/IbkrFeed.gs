/**
 * @OnlyCurrentDoc
 *
 * Daily IBKR positions into an "IBKR Feed" tab, one row per holding.
 *
 * Paste into the same Apps Script project as NavFeed.gs (Extensions → Apps
 * Script → + → Script); NavFeed.gs's Net Worth menu has the items for it.
 *
 * Uses IBKR's Flex Web Service: an Activity Flex Query (Open Positions and
 * Cash Report sections) run on demand with a Flex token. The token can only
 * download reports: it can't trade or move money. Net Worth → Set IBKR token
 * stores the token and query ID in this script's user properties, private to
 * your Google account, never in the sheet or the repo.
 *
 * Flex reports are statements: values are as of the last close.
 *
 * The tab, rewritten on every refresh, amounts in the account's base currency:
 *   A Symbol  B Name  C Type  D Units  E Invested (USD)  F Value (USD)  G P&L (USD)  H Refreshed
 * One row per position, then cash and a Total row. Point the IBKR line's
 * current value at it, e.g.
 *   =VLOOKUP("Total", 'IBKR Feed'!A:F, 6, FALSE)
 */

const IBKR_TAB = 'IBKR Feed';
const IBKR_FLEX = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

/* ---------- token ---------- */

function setIbkrToken() {
  const ui = SpreadsheetApp.getUi();
  const ask = (title, prompt) => {
    const r = ui.prompt(title, prompt, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) throw new Error('Cancelled; nothing changed.');
    return r.getResponseText().trim();
  };
  const token = ask('IBKR Flex token (1 of 2)', 'The Flex Web Service token (Performance & Reports → Flex Queries → Flex Web Service Configuration):');
  const query = ask('IBKR Flex Query ID (2 of 2)', 'The Query ID of your Activity Flex Query (Open Positions + Cash Report):');
  PropertiesService.getUserProperties().setProperties({ IBKR_FLEX_TOKEN: token, IBKR_FLEX_QUERY: query });
  ui.alert('IBKR token saved privately. Now use Net Worth → Refresh IBKR now.');
}

/* ---------- Flex Web Service ---------- */

function flexGet_(step, params) {
  const qs = Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  const res = UrlFetchApp.fetch(IBKR_FLEX + '/' + step + '?' + qs + '&v=3', {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'NetWorthSheet/1.0' },
  });
  if (res.getResponseCode() !== 200) throw new Error('IBKR ' + step + ' returned HTTP ' + res.getResponseCode());
  return XmlService.parse(res.getContentText()).getRootElement();
}

const flexText_ = (el, name) => (el.getChild(name) ? el.getChild(name).getText().trim() : '');

/** Runs the query and returns the statement's root element, waiting while IBKR generates it. */
function fetchFlexStatement_() {
  const p = PropertiesService.getUserProperties();
  const token = p.getProperty('IBKR_FLEX_TOKEN');
  const query = p.getProperty('IBKR_FLEX_QUERY');
  if (!token || !query) throw new Error('No IBKR token yet. Use Net Worth → Set IBKR token.');

  const sent = flexGet_('SendRequest', { t: token, q: query });
  if (flexText_(sent, 'Status') !== 'Success') {
    throw new Error('IBKR refused the request (' + flexText_(sent, 'ErrorCode') + '): ' + flexText_(sent, 'ErrorMessage')
      + '. An expired token needs a new one from Flex Web Service Configuration, then Set IBKR token.');
  }
  const ref = flexText_(sent, 'ReferenceCode');

  // The statement takes a few seconds (longer in market hours) to generate
  for (let attempt = 0; attempt < 8; attempt++) {
    Utilities.sleep(attempt ? 5000 : 3000);
    const got = flexGet_('GetStatement', { t: token, q: ref });
    if (got.getName() === 'FlexQueryResponse') return got;
    const code = flexText_(got, 'ErrorCode');
    // 1019: generation in progress; 1018: too many requests, try shortly
    if (code !== '1019' && code !== '1018') throw new Error('IBKR statement failed (' + code + '): ' + flexText_(got, 'ErrorMessage'));
  }
  throw new Error('IBKR took too long to generate the statement; try Refresh IBKR now again in a minute.');
}

/* ---------- building the rows ---------- */

const flexNum_ = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

/**
 * Turns the statement into sheet rows, in the account's base currency. Pure
 * over plain objects (see flexToPlain_), so it can be tested outside Google.
 *   stmt: { base, positions: [{ symbol, description, assetCategory, subCategory, position,
 *           positionValue, costBasisMoney, fxRateToBase, levelOfDetail }], cash }
 */
function ibkrRows_(stmt, now) {
  const byKey = {};
  for (const p of stmt.positions) {
    // Lot-level rows repeat their summary; count each holding once
    if (p.levelOfDetail && !/summary/i.test(p.levelOfDetail)) continue;
    const fx = flexNum_(p.fxRateToBase) || 1;
    const key = p.symbol + '|' + p.assetCategory;
    const g = byKey[key] || (byKey[key] = {
      symbol: p.symbol, name: p.description,
      type: p.subCategory || p.assetCategory, units: 0, invested: 0, value: 0,
    });
    g.units += flexNum_(p.position);
    g.invested += flexNum_(p.costBasisMoney) * fx;
    g.value += flexNum_(p.positionValue) * fx;
  }
  const rows = Object.keys(byKey).map((k) => {
    const g = byKey[k];
    return [g.symbol, g.name, g.type, g.units, g.invested, g.value, g.value - g.invested, now];
  });
  rows.sort((a, b) => b[5] - a[5]);

  rows.push(['Cash', 'Cash balance', 'Cash', '', stmt.cash, stmt.cash, 0, now]);
  const invested = rows.reduce((a, r) => a + r[4], 0);
  const value = rows.reduce((a, r) => a + r[5], 0);
  rows.push(['Total', '', '', '', invested, value, value - invested, now]);
  return rows;
}

/** The parts of the Flex XML the rows need, as plain objects. */
function flexToPlain_(root) {
  const st = root.getChild('FlexStatements').getChildren('FlexStatement')[0];
  if (!st) throw new Error('The IBKR statement has no account in it.');
  const attrs = (el) => Object.fromEntries(el.getAttributes().map((a) => [a.getName(), a.getValue()]));
  const section = (name, row) => (st.getChild(name) ? st.getChild(name).getChildren(row).map(attrs) : []);

  const positions = section('OpenPositions', 'OpenPosition');
  if (!st.getChild('OpenPositions')) throw new Error('The Flex Query has no Open Positions section. Add it in IBKR and refresh.');
  const cashRows = section('CashReport', 'CashReportCurrency');
  const summary = cashRows.find((c) => c.currency === 'BASE_SUMMARY');
  const info = section('AccountInformation', 'AccountInformation')[0] || {};
  return {
    base: info.currency || (positions[0] && positions[0].currency) || 'USD',
    positions,
    cash: summary ? flexNum_(summary.endingCash) : 0,
    hasCash: !!summary,
  };
}

/* ---------- refresh ---------- */

function refreshIbkr() {
  const stmt = flexToPlain_(fetchFlexStatement_());
  if (!stmt.hasCash) console.warn('No Cash Report in the Flex Query; cash counted as 0. Add the Cash Report section to include it.');
  const rows = ibkrRows_(stmt, new Date());
  const headers = ['Symbol', 'Name', 'Type', 'Units', 'Invested (' + stmt.base + ')', 'Value (' + stmt.base + ')', 'P&L (' + stmt.base + ')', 'Refreshed'];

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(IBKR_TAB) || ss.insertSheet(IBKR_TAB);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows).setFontWeight('normal');
  sh.getRange(rows.length + 1, 1, 1, headers.length).setFontWeight('bold');
  sh.getRange('D:D').setNumberFormat('#,##0.####');
  sh.getRange('E:G').setNumberFormat('#,##0.00');
  sh.getRange('H:H').setNumberFormat('d mmm yyyy h:mm');
}

function installIbkrTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshIbkr')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  // Statements carry the previous session's close; 8am IST is well after it
  ScriptApp.newTrigger('refreshIbkr').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('IBKR will refresh every morning around 8am IST.', 'Net Worth', 6);
}
