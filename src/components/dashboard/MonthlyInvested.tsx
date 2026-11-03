import { useMemo } from 'react';
import { fmtDay, isNum, isoToSerial, n0, num, signedInr } from '../../lib/format';
import type { Model } from '../../lib/model';
import { monthlyInvested, type MonthRow, type Series } from '../../lib/monthlyInvested';
import { Amount, Card, cx } from '../ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** A month's change in a series' own currency, signed; a dash where there's nothing to show. */
function money(v: number | null | undefined, currency: string): string {
  if (!isNum(v) || Math.abs(v) < 1) return '—';
  if (currency === 'INR') return signedInr(v);
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
  const brokers = series.filter((s) => s.key !== 'mf').map((s) => s.label);

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

  return (
    <Card title="Invested each month" sub={`The rise in each one's invested total, from the daily log: ${series.map((s) => `${s.label} since ${fmtDay(s.since)}`).join(' · ')}`}>
      {/* Phones: a block per month */}
      <div className="-mx-4 -mb-4 overflow-hidden rounded-b-xl border-t border-line sm:hidden">
        {months.map((row) => (
          <div key={row.month} className="border-b border-grid px-4 py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{label(row)}</span>
              <span className="font-semibold tabular-nums">{isNum(total(row)) ? <>≈ <Amount value={total(row)} signed /></> : '—'}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-2 tabular-nums">
              {series.map((s) => (
                <span key={s.key}>{s.label} <b className="font-semibold text-ink">{money(row.values[s.key], s.currency)}</b>{note(row, s) && <span className="text-ink-3"> ({note(row, s)})</span>}</span>
              ))}
            </div>
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

      <ul className="mt-3 space-y-0.5 text-xs text-ink-3 max-sm:mt-6">
        {series.some((s) => s.key === 'mf') && <li><b className="font-medium text-ink-2">Mutual funds:</b> counted once their Invested amount is updated, e.g. by Import CAS.</li>}
        {brokers.length > 0 && <li><b className="font-medium text-ink-2">{brokers.join(' and ')}:</b> include profit from sales left in the account.</li>}
        <li><b className="font-medium text-ink-2">Total:</b> converted to ₹ at today’s rates.</li>
      </ul>
    </Card>
  );
}
