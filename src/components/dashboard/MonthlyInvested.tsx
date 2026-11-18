import { useMemo } from 'react';
import { fmtDay, isNum, isoToSerial, n0, num, signedCr, signedInr } from '../../lib/format';
import type { Model } from '../../lib/model';
import { monthlyInvested, type MonthRow, type Series } from '../../lib/monthlyInvested';
import { Amount, FoldCard, cx } from '../ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** A month's change in a series' own currency, signed; a dash where there's nothing to show. */
function money(v: number | null | undefined, currency: string, compact = false): string {
  if (!isNum(v) || Math.abs(v) < 1) return '—';
  if (currency === 'INR') return compact ? signedCr(v) : signedInr(v);
  const n = `${currency === 'USD' ? '$' : `${currency} `}${num(Math.abs(v), 0)}`;
  return `${v > 0 ? '+' : '−'}${n}`;
}

/**
 * How much went into mutual funds, eToro and IBKR each month: the rise in
 * each one's invested total, from the nightly Daily Log. Shown once the log
 * has a figure to start from.
 */
export function MonthlyInvested({ model }: { model: Model }) {
  const data = useMemo(() => monthlyInvested(model), [model]);
  if (!data) return null;
  const { series, months } = data;
  const brokers = series.filter((s) => s.key !== 'mf' && s.kind === 'change').map((s) => s.label);
  const exact = series.filter((s) => s.kind === 'deposits').map((s) => s.label);

  // A rough rupee total for the month, at today's rates; only when every amount converts
  const aedInr = n0(model.cells.fxAedInr?.value);
  const usdAed = n0(model.cells.fxUsdAed?.value);
  const toInr: Record<string, number> = { INR: 1, AED: aedInr, USD: usdAed * aedInr };
  const total = (row: MonthRow) => {
    let sum = 0;
    for (const s of series) {
      const v = row.values[s.key];
      if (!isNum(v)) continue;
      if (!(toInr[s.currency] > 0)) return null;
      sum += v * toInr[s.currency];
    }
    return Math.abs(sum) >= 1 ? sum : null;
  };
  const label = (row: MonthRow) => (row.current ? `${MON[Number(row.month.slice(5, 7)) - 1]} so far` : monthName(row.month));
  // Only beside a figure: the month it covers began part-way, when the log did
  const note = (row: MonthRow, s: Series) => isNum(row.values[s.key]) && row.from[s.key] !== undefined && row.from[s.key] > isoToSerial(`${row.month}-01`) ? `from ${fmtDay(row.from[s.key])}` : null;

  // Closed, the card says what's gone in this month so far (or last month, if nothing yet)
  const lead = months.find((r) => isNum(total(r))) ?? months[0];
  const summary = lead && isNum(total(lead))
    ? <>{label(lead)}: <b className="font-semibold text-ink">≈ <Amount value={total(lead)} signed /></b></>
    : 'Nothing recorded yet this month';
  const unit = (s: Series) => (s.currency === 'INR' ? '₹' : s.currency === 'USD' ? '$' : s.currency);
  // Phones: the month, then one column per platform, so months compare down each column
  // Fixed widths, so each month's figures sit under the same heading as every other month's
  const cols = `minmax(0,1fr) repeat(${series.length}, ${series.length > 2 ? '4.5rem' : '6rem'})`;

  return (
    <FoldCard title="Invested each month" summary={summary}>
      <p className="mb-3 text-xs text-ink-3">{series.map((s) => `${s.label} since ${fmtDay(s.since)}`).join(' · ')}</p>
      <div className="-mx-4 border-t border-line sm:hidden">
        <div className="grid items-baseline gap-x-2 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3" style={{ gridTemplateColumns: cols }}>
          <span>Month</span>
          {series.map((s) => <span key={s.key} className="text-right">{s.key === 'mf' ? 'Funds' : s.label} ({unit(s)})</span>)}
        </div>
        {months.map((row) => (
          <div key={row.month} className="grid items-baseline gap-x-2 border-b border-grid px-4 py-2.5 last:border-0" style={{ gridTemplateColumns: cols }}>
            <span className="min-w-0">
              <span className="block whitespace-nowrap font-medium">{MON[Number(row.month.slice(5, 7)) - 1]}{row.current ? '' : ` ’${row.month.slice(2, 4)}`}</span>
              {row.current && <span className="block text-xs text-ink-3">so far</span>}
              {series.length > 1 && isNum(total(row)) && <span className="block whitespace-nowrap text-xs text-ink-3 tabular-nums">≈ <Amount value={total(row)} signed /></span>}
            </span>
            {series.map((s) => (
              <span key={s.key} className={cx('whitespace-nowrap text-right tabular-nums', isNum(row.values[s.key]) ? 'font-semibold' : 'text-ink-3')}>
                {money(row.values[s.key], s.currency, true)}
                {note(row, s) && <span className="block text-[11px] font-normal text-ink-3">{note(row, s)}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Wider screens: a table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              {series.map((s) => <th key={s.key} className="num">{s.label} ({s.currency === 'INR' ? '₹' : s.currency === 'USD' ? '$' : s.currency})</th>)}
              <th className="num">Total ≈ ₹</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month}>
                <td className="name">{label(row)}</td>
                {series.map((s) => (
                  <td key={s.key} className={cx('num', !isNum(row.values[s.key]) && 'text-ink-3')}>
                    {money(row.values[s.key], s.currency)}
                    {note(row, s) && <div className="sub2">{note(row, s)}</div>}
                  </td>
                ))}
                <td className="num strong">{isNum(total(row)) ? <Amount value={total(row)} signed /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-0.5 text-xs text-ink-3">
        {series.some((s) => s.key === 'mf') && <li><b className="font-medium text-ink-2">Mutual funds:</b> counted once their Invested amount is updated, e.g. by Import CAS.</li>}
        {brokers.length > 0 && <li><b className="font-medium text-ink-2">{brokers.join(' and ')}:</b> include profit from sales left in the account.</li>}
        {exact.length > 0 && <li><b className="font-medium text-ink-2">{exact.join(' and ')}:</b> actual deposits, minus withdrawals.</li>}
        <li><b className="font-medium text-ink-2">Total:</b> converted to ₹ at today’s rates.</li>
      </ul>
    </FoldCard>
  );
}
