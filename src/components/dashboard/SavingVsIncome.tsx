import { useMemo, useState } from 'react';
import { isNum } from '../../lib/format';
import type { Model } from '../../lib/model';
import { savingByMonth, type SavingMonth } from '../../lib/savingRate';
import { Amount, BTN_GHOST, FoldCard, Label, PANEL, cx } from '../ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m: SavingMonth) => (m.current ? `${MON[Number(m.month.slice(5)) - 1]} so far` : `${MON[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`);
const SHOWN = 12;

/** A share of income: green when saving, red when the month went backwards. */
function Rate({ saved, income }: { saved: number | null; income: number | null }) {
  if (!isNum(saved) || !isNum(income) || income <= 0) return null;
  const r = saved / income;
  return <span className={cx('tabular-nums', r >= 0 ? 'text-good' : 'text-bad')}>{`${Math.round(r * 100)}%`}</span>;
}

/** A month's figure, with its share of income under it. */
function Figure({ saved, income }: { saved: number | null; income: number | null }) {
  if (!isNum(saved)) return <span className="text-right text-ink-3">—</span>;
  return (
    <span className="text-right tabular-nums">
      <span className="block font-semibold"><Amount value={saved} signed /></span>
      <span className="block text-xs"><Rate saved={saved} income={income} /></span>
    </span>
  );
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
  const cols = hasPut ? 'grid-cols-[minmax(0,1fr)_6rem_6rem]' : 'grid-cols-[minmax(0,1fr)_7rem]';
  // Months with money put away but no income yet to compare it with
  const missing = months.filter((m) => !m.current && isNum(m.putAway) && !isNum(m.incomeAed));
  const shown = all ? months : months.slice(0, SHOWN);

  // Closed, the card gives the latest month with a share of income: money put away where there is one
  const rated = (m: SavingMonth) => isNum(m.incomeInr) && m.incomeInr > 0;
  const latest = months.find((m) => !m.current && rated(m) && (isNum(m.putAway) || isNum(m.netWorth)));
  const pick = latest && (isNum(latest.putAway) ? { kind: 'put away', v: latest.putAway } : { kind: 'net worth', v: latest.netWorth as number });
  const summary = latest && pick
    ? <>{monthName(latest)}: <b className="font-semibold text-ink"><Amount value={pick.v} signed /></b> {pick.kind} · <Rate saved={pick.v} income={latest.incomeInr} /> of income</>
    : 'How much of each month’s income was saved';

  return (
    <FoldCard title="Saving vs income" summary={summary}>
      <div className={cx('grid gap-2', hasPut && 'sm:grid-cols-2')}>
        <div className={cx(PANEL, 'px-3 py-2')}>
          <Label>Net worth change · last {year.n} months</Label>
          <div className="mt-0.5 text-base font-semibold"><Amount value={year.saved} signed /></div>
          <div className="text-xs text-ink-2"><Rate saved={year.saved} income={year.income} /> of income</div>
        </div>
        {hasPut && (
          <div className={cx(PANEL, 'px-3 py-2')}>
            <Label>Money put away{put.n ? ` · last ${put.n} month${put.n > 1 ? 's' : ''}` : ''}</Label>
            {put.n ? (
              <>
                <div className="mt-0.5 text-base font-semibold"><Amount value={put.saved} signed /></div>
                <div className="text-xs text-ink-2"><Rate saved={put.saved} income={put.income} /> of income</div>
              </>
            ) : <div className="mt-0.5 text-xs text-ink-2">{missing.length
              ? `Add ${missing.map(monthName).join(' and ')} income on the Income tab to compare.`
              : 'The first full month shows once this one ends.'}</div>}
          </div>
        )}
      </div>

      {/* Phones: the month, then a column per figure with its share of income under it */}
      <div className="-mx-4 mt-3.5 border-t border-line sm:hidden">
        <div className={cx('grid items-baseline gap-x-3 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3', cols)}>
          <span>Month</span><span className="text-right">Net worth</span>{hasPut && <span className="text-right">Put away</span>}
        </div>
        {shown.map((m) => (
          <div key={m.month} className={cx('grid items-baseline gap-x-3 border-b border-grid px-4 py-2.5 last:border-0', cols)}>
            <span className="font-medium">{monthName(m)}</span>
            <Figure saved={m.netWorth} income={m.incomeInr} />
            {hasPut && <Figure saved={m.putAway} income={m.incomeInr} />}
          </div>
        ))}
      </div>

      {/* Wider screens: a table */}
      <div className="mt-3.5 hidden overflow-x-auto sm:block">
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
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
    </FoldCard>
  );
}
