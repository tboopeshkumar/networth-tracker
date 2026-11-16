import { useMemo, useState } from 'react';
import { isNum, num } from '../../lib/format';
import type { Model } from '../../lib/model';
import { savingByMonth, type SavingMonth } from '../../lib/savingRate';
import { Amount, BTN_GHOST, Card, Label, PANEL, cx } from '../ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: SavingMonth) => (m.current ? `${MON[Number(m.month.slice(5)) - 1]} so far` : `${MON[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`);
const SHOWN = 12;

/** A share of income: green when saving, red when the month went backwards. */
function Rate({ saved, income }: { saved: number | null; income: number | null }) {
  if (!isNum(saved) || !isNum(income) || income <= 0) return null;
  const r = saved / income;
  return <span className={cx('tabular-nums', r >= 0 ? 'text-good' : 'text-bad')}>{`${Math.round(r * 100)}%`}</span>;
}

/** Totals over the months that have both figures. */
function sumOf(months: SavingMonth[], field: 'netWorth' | 'putAway') {
  const both = months.filter((m) => !m.current && isNum(m[field]) && isNum(m.incomeInr));
  return { n: both.length, saved: both.reduce((a, m) => a + (m[field] as number), 0), income: both.reduce((a, m) => a + (m.incomeInr as number), 0) };
}

/**
 * Saving against income, month by month: the change in net worth, and the
 * money put away (which leaves out market and AED-rate moves). Shown when the
 * sheet has an Income tab.
 */
export function SavingVsIncome({ model }: { model: Model }) {
  const months = useMemo(() => savingByMonth(model), [model]);
  const [all, setAll] = useState(false);
  if (!months?.length) return null;

  const year = sumOf(months.slice(0, 13), 'netWorth');
  const put = sumOf(months, 'putAway');
  const hasPut = months.some((m) => isNum(m.putAway));
  // Months with money put away but no income yet to compare it with
  const missing = months.filter((m) => !m.current && isNum(m.putAway) && !isNum(m.incomeAed));
  const shown = all ? months : months.slice(0, SHOWN);

  return (
    <Card title="Saving vs income" sub="How much of each month’s income was saved">
      <div className={cx('grid gap-2', hasPut && 'sm:grid-cols-2')}>
        <div className={cx(PANEL, 'px-3 py-2')}>
          <Label>Net worth change · last {year.n} months</Label>
          <div className="mt-0.5 text-base font-semibold"><Amount value={year.saved} signed /> <span className="text-sm font-medium text-ink-3">of <Amount value={year.income} /> income</span></div>
          <div className="text-xs text-ink-2"><Rate saved={year.saved} income={year.income} /> of income, market moves included</div>
        </div>
        {hasPut && (
          <div className={cx(PANEL, 'px-3 py-2')}>
            <Label>Money put away{put.n ? ` · last ${put.n} month${put.n > 1 ? 's' : ''}` : ''}</Label>
            {put.n ? (
              <>
                <div className="mt-0.5 text-base font-semibold"><Amount value={put.saved} signed /> <span className="text-sm font-medium text-ink-3">of <Amount value={put.income} /> income</span></div>
                <div className="text-xs text-ink-2"><Rate saved={put.saved} income={put.income} /> of income, without market moves</div>
              </>
            ) : <div className="mt-0.5 text-xs text-ink-2">{missing.length
              ? `Add ${missing.map(monthName).join(' and ')} income on the Income tab to compare.`
              : 'The first full month shows once this one ends.'}</div>}
          </div>
        )}
      </div>

      {/* Phones: a block per month */}
      <div className="-mx-4 mt-3.5 border-t border-line sm:hidden">
        {shown.map((m) => (
          <div key={m.month} className="border-b border-grid px-4 py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{monthName(m)}</span>
              <span className="text-xs text-ink-2 tabular-nums">{isNum(m.incomeAed) ? `income AED ${num(m.incomeAed, 0)}` : 'no income recorded'}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-ink-2">
              <span>Net worth <b className="font-semibold text-ink">{isNum(m.netWorth) ? <Amount value={m.netWorth} signed /> : '—'}</b> <Rate saved={m.netWorth} income={m.incomeInr} /></span>
              {hasPut && <span>Put away <b className="font-semibold text-ink">{isNum(m.putAway) ? <Amount value={m.putAway} signed /> : '—'}</b> <Rate saved={m.putAway} income={m.incomeInr} /></span>}
            </div>
          </div>
        ))}
      </div>

      {/* Wider screens: a table */}
      <div className="mt-3.5 hidden overflow-x-auto sm:block">
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Income (AED)</th>
              <th className="num">Net worth change</th>
              <th className="num">% of income</th>
              {hasPut && <th className="num">Put away</th>}
              {hasPut && <th className="num">% of income</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month}>
                <td className="name">{monthName(m)}</td>
                <td className={cx('num', !isNum(m.incomeAed) && 'text-ink-3')}>{isNum(m.incomeAed) ? num(m.incomeAed, 0) : '—'}</td>
                <td className="num strong">{isNum(m.netWorth) ? <Amount value={m.netWorth} signed /> : '—'}</td>
                <td className="num"><Rate saved={m.netWorth} income={m.incomeInr} /></td>
                {hasPut && <td className="num strong">{isNum(m.putAway) ? <Amount value={m.putAway} signed /> : '—'}</td>}
                {hasPut && <td className="num"><Rate saved={m.putAway} income={m.incomeInr} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {months.length > SHOWN && (
        <button type="button" className={cx(BTN_GHOST, 'mt-1')} onClick={() => setAll(!all)}>{all ? 'Show the last 12 months' : `Show all ${months.length} months`}</button>
      )}

      <ul className="mt-3 space-y-0.5 text-xs text-ink-3">
        <li><b className="font-medium text-ink-2">Net worth change:</b> from the Monthly Trend tab; includes market and exchange-rate moves.</li>
        {hasPut && <li><b className="font-medium text-ink-2">Put away:</b> the rise in invested capital, from the daily log; leaves those moves out.</li>}
        <li><b className="font-medium text-ink-2">Income:</b> from the Income tab, converted to ₹ at today’s rate.</li>
      </ul>
    </Card>
  );
}
