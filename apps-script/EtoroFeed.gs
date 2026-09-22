/**
 * @OnlyCurrentDoc
 *
 * Daily eToro portfolio into an "eToro Feed" tab, one row per holding.
 *
 * Paste into the same Apps Script project as NavFeed.gs (Extensions → Apps
 * Script → + → Script); NavFeed.gs's Net Worth menu has the items for it.
 *
 * Keys: eToro's public API needs two. The API key identifies the app (from
 * the eToro API portal); the user key identifies your account (eToro →
 * Settings → Trading → API Key Management → Create New Key, environment
 * "Real", permission "Read"). A Read key can see the portfolio but never
 * trade. Net Worth → Set eToro keys stores them in this script's user
 * properties: private to your Google account, never in the sheet or the repo.
 *
 * The tab, rewritten on every refresh:
 *   A Symbol  B Name  C Type  D Units  E Invested ($)  F Value ($)  G P&L ($)  H Refreshed
 * One row per instrument you hold (lots of the same stock combined), one per
 * copy-trading portfolio, pending orders, cash, then a Total row. Point the
 * eToro line's current value at it, e.g.
 *   =VLOOKUP("Total", 'eToro Feed'!A:F, 6, FALSE)
 * Value is priced from eToro's live rates (the bid, converted to USD at
 * eToro's own rate), so it doesn't depend on a P&L field in the portfolio.
 */

const ETORO_TAB = 'eToro Feed';
const ETORO_API = 'https://public-api.etoro.com/api/v1';
const ETORO_HEADERS = ['Symbol', 'Name', 'Type', 'Units', 'Invested ($)', 'Value ($)', 'P&L ($)', 'Refreshed'];

/* ---------- keys ---------- */

function setEtoroKeys() {
  const ui = SpreadsheetApp.getUi();
  const ask = (title, prompt) => {
    const r = ui.prompt(title, prompt, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) throw new Error('Cancelled; keys unchanged.');
    return r.getResponseText().trim();
  };
  const apiKey = ask('eToro API key (1 of 2)', 'The public API key from the eToro API portal:');
  const userKey = ask('eToro user key (2 of 2)', 'Your user key (eToro → Settings → Trading → API Key Management). Use a Real, Read-only key:');
  PropertiesService.getUserProperties().setProperties({ ETORO_API_KEY: apiKey, ETORO_USER_KEY: userKey });
  ui.alert('eToro keys saved privately. Now use Net Worth → Refresh eToro now.');
}

function etoroGet_(path) {
  const p = PropertiesService.getUserProperties();
  const apiKey = p.getProperty('ETORO_API_KEY');
  const userKey = p.getProperty('ETORO_USER_KEY');
  if (!apiKey || !userKey) throw new Error('No eToro keys yet. Use Net Worth → Set eToro keys.');
  const res = UrlFetchApp.fetch(ETORO_API + path, {
    muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'x-user-key': userKey, 'x-request-id': Utilities.getUuid() },
  });
  const code = res.getResponseCode();
  if (code === 401 || code === 403) throw new Error('eToro refused the keys (HTTP ' + code + '). Check they are for the Real environment with Read permission, then set them again.');
  if (code !== 200) throw new Error('eToro ' + path.split('?')[0] + ' returned HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

/* ---------- building the rows ---------- */

const num_ = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

/**
 * What a position is worth now, in USD.
 *   rates: instrumentID → eToro's live rate { bid, ask, conversionRateBid, conversionRateAsk }
 * A plain (unleveraged) buy is worth units × bid × the USD conversion. Shorts
 * and leveraged positions are worth what was put in plus the price move since
 * opening. Without a rate, falls back to any P&L eToro sent, else to cost.
 */
function worth_(pos, rates) {
  const r = rates[pos.instrumentID];
  const amount = num_(pos.amount);
  const units = num_(pos.units);
  if (r && num_(r.bid) > 0) {
    const bidUsd = num_(r.bid) * (num_(r.conversionRateBid) || 1);
    const askUsd = (num_(r.ask) || num_(r.bid)) * (num_(r.conversionRateAsk) || num_(r.conversionRateBid) || 1);
    const openUsd = num_(pos.openRate) * (num_(pos.openConversionRate) || 1);
    if (pos.isBuy !== false && num_(pos.leverage) <= 1) return units * bidUsd;
    return amount + units * (pos.isBuy === false ? openUsd - askUsd : bidUsd - openUsd);
  }
  const pnl = typeof pos.pnL === 'number' ? pos.pnL : pos.unrealizedPnL && typeof pos.unrealizedPnL.pnL === 'number' ? pos.unrealizedPnL.pnL : 0;
  return amount + pnl;
}

/**
 * Turns eToro's portfolio response into sheet rows. Pure (no Apps Script
 * calls), so it can be tested outside Google.
 *   info:  instrumentID → { symbol, name, type }
 *   rates: instrumentID → live rate (see worth_)
 */
function etoroRows_(portfolio, info, rates, now) {
  const p = portfolio.clientPortfolio || portfolio;
  const rows = [];

  // Your own positions, lots of the same instrument combined
  const byId = {};
  for (const pos of p.positions || []) {
    const id = pos.instrumentID;
    const g = byId[id] || (byId[id] = { units: 0, invested: 0, value: 0 });
    g.units += num_(pos.units) * (pos.isBuy === false ? -1 : 1);
    g.invested += num_(pos.amount);
    g.value += worth_(pos, rates);
  }
  const held = Object.keys(byId).map((id) => {
    const g = byId[id];
    const i = info[id] || {};
    return [i.symbol || '#' + id, i.name || '', i.type || '', g.units, g.invested, g.value, g.value - g.invested, now];
  });
  held.sort((a, b) => b[5] - a[5]);
  rows.push(...held);

  // Copy-trading portfolios, one line each: their positions plus uninvested cash
  for (const m of p.mirrors || []) {
    const value = (m.positions || []).reduce((a, pos) => a + worth_(pos, rates), 0) + num_(m.availableAmount);
    const invested = m.depositSummary != null ? num_(m.depositSummary) - num_(m.withdrawalSummary) : num_(m.initialInvestment);
    rows.push(['Copy · ' + (m.parentUsername || m.mirrorID), 'Copy portfolio', 'Copy', '', invested, value, value - invested, now]);
  }

  // Money set aside for orders not yet filled
  const pending = [...(p.ordersForOpen || []), ...(p.orders || [])].reduce((a, o) => a + num_(o.amount), 0);
  if (pending) rows.push(['Pending orders', 'Reserved for open orders', 'Cash', '', pending, pending, 0, now]);

  const cash = num_(p.credit);
  rows.push(['Cash', 'Available balance', 'Cash', '', cash, cash, 0, now]);

  const invested = rows.reduce((a, r) => a + r[4], 0);
  const value = rows.reduce((a, r) => a + r[5], 0);
  rows.push(['Total', '', '', '', invested, value, value - invested, now]);
  return rows;
}

/** instrumentID → symbol, name and type, from eToro's market data (100 ids per call). */
function etoroInfo_(ids) {
  const types = {};
  try {
    for (const t of etoroGet_('/market-data/instrument-types').instrumentTypes || []) types[t.instrumentTypeID] = t.instrumentTypeDescription;
  } catch (e) { console.warn('Instrument types unavailable: ' + e.message); }

  const info = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = etoroGet_('/market-data/instruments?instrumentIds=' + chunk.join(','));
    for (const d of res.instrumentDisplayDatas || []) {
      info[d.instrumentID] = { symbol: d.symbolFull, name: d.instrumentDisplayName, type: types[d.instrumentTypeID] || '' };
    }
  }
  return info;
}

/** instrumentID → live rate, from eToro's market data (100 ids per call). */
function etoroRates_(ids) {
  const rates = {};
  for (let i = 0; i < ids.length; i += 100) {
    const res = etoroGet_('/market-data/instruments/rates?instrumentIds=' + ids.slice(i, i + 100).join(','));
    for (const r of res.rates || []) rates[r.instrumentID] = r;
  }
  return rates;
}

/* ---------- refresh ---------- */

function refreshEtoro() {
  const portfolio = etoroGet_('/trading/info/real/pnl');
  const p = portfolio.clientPortfolio || portfolio;
  const own = (p.positions || []).map((pos) => pos.instrumentID);
  const copied = (p.mirrors || []).flatMap((m) => (m.positions || []).map((pos) => pos.instrumentID));
  const ids = [...new Set(own)];
  const priced = [...new Set([...own, ...copied])];
  const rates = priced.length ? etoroRates_(priced) : {};
  const unpriced = priced.filter((id) => !(rates[id] && rates[id].bid > 0));
  if (unpriced.length) console.warn('No live rate for instruments ' + unpriced.join(', ') + '; valued at cost plus any P&L eToro sent.');
  const rows = etoroRows_(portfolio, ids.length ? etoroInfo_(ids) : {}, rates, new Date());

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ETORO_TAB) || ss.insertSheet(ETORO_TAB);
  sh.clearContents();
  sh.getRange(1, 1, 1, ETORO_HEADERS.length).setValues([ETORO_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, rows.length, ETORO_HEADERS.length).setValues(rows);
  sh.getRange(2, 1, rows.length, ETORO_HEADERS.length).setFontWeight('normal');
  sh.getRange(rows.length + 1, 1, 1, ETORO_HEADERS.length).setFontWeight('bold');
  sh.getRange('D:D').setNumberFormat('#,##0.####');
  sh.getRange('E:G').setNumberFormat('#,##0.00');
  sh.getRange('H:H').setNumberFormat('d mmm yyyy h:mm');
}

function installEtoroTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'refreshEtoro')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  // US markets close at 1:30–2:30am IST, so 7am picks up the previous session's close
  ScriptApp.newTrigger('refreshEtoro').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Kolkata').create();
  SpreadsheetApp.getActive().toast('eToro will refresh every morning around 7am IST.', 'Net Worth', 6);
}
