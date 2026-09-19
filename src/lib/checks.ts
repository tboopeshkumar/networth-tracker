// "Worth a look": things in the sheet that are probably wrong or stale.

import { fmtDate, inr, isNum, todaySerial } from './format';
import { totalDrift, type Grids, type Model } from './model';

export interface Check { id: string; title: string; detail: string }

export function runChecks(model: Model, values: Grids, canEdit: boolean): Check[] {
  const out: Check[] = [];
  const R = model.rows;

  for (const [id, field, name] of [['mf', 'current', 'Mutual Funds'], ['equity', 'currentInr', 'Equity'], ['sgb', 'market', 'Gold (SGB)'], ['fd', 'amount', 'Fixed Deposits']] as const) {
    const d = totalDrift(model, values, id, field);
    if (d) {
      out.push({
        id: `drift-${id}`,
        title: `${name} total doesn’t match its rows.`,
        detail: `The sheet says ${inr(d.sheet)}, the rows add up to ${inr(d.sum)}. A row may sit below the total, or its SUM formula was overwritten.`,
      });
    }
  }

  const dates = [...R.mf.map((r) => r.navDate), ...R.equity.map((r) => r.navDate), ...R.sgb.map((r) => r.valueDate)].filter(isNum);
  if (dates.length) {
    const newest = Math.max(...dates);
    const age = todaySerial() - newest;
    if (age > 10) {
      out.push({
        id: 'stale',
        title: `Valuations are ${age} days old.`,
        detail: `The newest is from ${fmtDate(newest)}. Update them with Edit on each holding, or set up the NAV feed described in the README.`,
      });
    }
  }

  for (const L of Object.values(model.ledgers)) {
    if (isNum(L.balance) && isNum(L.recorded) && Math.abs(L.balance - L.recorded) > 1) {
      out.push({
        id: `ledger-${L.sheet}`,
        title: `${L.title}: ledger and Receivables disagree by ${inr(Math.abs(L.balance - L.recorded))}.`,
        detail: `The ${L.sheet} ledger nets to ${inr(L.balance)}, but Receivables records ${inr(L.recorded)}${L.recordedFormula ? '' : ' as a typed number'}, and Net Worth uses that figure.`
          + (!L.recordedFormula && canEdit ? ' Open the ledger under Holdings and use “Link to ledger” to keep them in step.' : ''),
      });
    }
  }

  const matured = R.fd.filter((r) => isNum(r.maturityDate) && r.maturityDate < todaySerial());
  if (matured.length) {
    out.push({
      id: 'matured',
      title: `${matured.length} fixed deposit${matured.length > 1 ? 's' : ''} past maturity but still counted.`,
      detail: matured.map((r) => `${r.institution} (${fmtDate(r.maturityDate)})`).join(', '),
    });
  }

  const nw = R.networth;
  if (nw.some((r) => /nps/i.test(String(r.asset)) && r.category === 'MF') && nw.some((r) => /mutual/i.test(String(r.asset)) && r.category === 'Equity')) {
    out.push({
      id: 'categories',
      title: 'NPS is categorised “MF” while Mutual Funds are “Equity”.',
      detail: 'The category chart inherits this. Change it in the Net Worth tab’s Category column if it isn’t intended.',
    });
  }

  for (const [id, name] of [['fxAedInr', 'AED → INR'], ['fxUsdAed', 'USD → AED']] as const) {
    const c = model.cells[id];
    if (c && !c.formula) {
      out.push({
        id: `fx-${id}`,
        title: `The ${name} rate is typed in (${String(c.value)}).`,
        detail: (id === 'fxAedInr' ? 'Most of your value is in AED, so this one cell moves the headline by lakhs. ' : '')
          + 'Edit it under Rates & other inputs, where you can switch to a live rate.',
      });
    }
  }

  // The daily Rates Feed script stopped (trigger removed, source page changed...)
  const lastFeed = Math.max(...model.ratesFeed.map((f) => f.refreshed).filter(isNum));
  if (Number.isFinite(lastFeed) && todaySerial() - lastFeed > 3) {
    out.push({
      id: 'rates-feed',
      title: `Gold and AED rates haven’t refreshed since ${fmtDate(lastFeed)}.`,
      detail: 'In the sheet, use Net Worth → Refresh gold & AED rates now to see the error, then Refresh rates daily to reinstall the schedule.',
    });
  }

  return out;
}
