import type { ReactNode } from 'react';
import { cr, fmtDay, inr, isNum, num, signedPct, todaySerial } from '../../lib/format';
import type { Model } from '../../lib/model';
import { lastDays, type RatePoint } from '../../lib/rateHistory';
import { feedRateFor } from '../../lib/ratesFeed';
import { PriceChart } from '../charts/PriceChart';
import { TIP } from '../charts/Tooltip';
import { Amount, CATEGORY_SLOT, Card, Label, Pill, cx } from '../ui';

const DAYS = 30;
const GOLD_22C = 'Gold 22C (₹/g)';

/** The newest value, its move over the window, and the window's range: the chart's headline. */
function Headline({ label, pts, show }: { label: string; pts: RatePoint[]; show: (v: number) => ReactNode }) {
  const first = pts[0].value;
  const last = pts.at(-1)!.value;
  const change = last / first - 1;
  return (
    <div className="mb-2">
      <Label>{label}</Label>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-xl font-semibold tabular-nums">{show(last)}</span>
        <Pill tone={change > 0 ? 'up' : change < 0 ? 'down' : undefined}>{signedPct(change)} since {fmtDay(pts[0].day)}</Pill>
      </div>
      <div className="mt-0.5 text-xs text-ink-3 tabular-nums">
        Low {show(Math.min(...pts.map((p) => p.value)))} · High {show(Math.max(...pts.map((p) => p.value)))}
      </div>
    </div>
  );
}

/**
 * How the AED → INR rate and the gold valuation moved over the last month,
 * from the Rates History tab. Two charts, each on its own scale: they measure
 * different things. Shown once there are at least two days to draw.
 */
export function PriceMovements({ model }: { model: Model }) {
  const today = todaySerial();
  const aed = lastDays(model.rateHistory['AED → INR'], DAYS, today);
  // The valuation is priced at whichever feed rate its cell reads; 22C unless it says otherwise
  const v = model.jewellery?.valuation;
  const goldLabel = feedRateFor(model.ratesFeed, v?.rateFormula)?.label ?? GOLD_22C;
  const rate = lastDays(model.rateHistory[goldLabel], DAYS, today);
  const grams = v && isNum(v.grams) ? v.grams : null;
  const gold = grams ? rate.map((p) => ({ day: p.day, value: p.value * grams })) : rate;
  if (aed.length < 2 && gold.length < 2) return null;

  const rateOn = new Map(rate.map((p) => [p.day, p.value]));
  return (
    <Card title="Price movements" sub={`The last ${DAYS} days, from the Rates History tab`}>
      <div className="grid gap-6 md:grid-cols-2">
        {aed.length > 1 && (
          <div className="min-w-0">
            <Headline label="AED → INR" pts={aed} show={(n) => num(n, 4)} />
            <PriceChart points={aed} slot={CATEGORY_SLOT.Liquid} label="AED to INR rate" tick={(n) => num(n, 2)} value={(n) => num(n, 4)} />
          </div>
        )}
        {gold.length > 1 && (
          <div className="min-w-0">
            {grams
              ? <Headline label={v?.title ?? 'Current gold valuation'} pts={gold} show={(n) => <Amount value={n} />} />
              : <Headline label={goldLabel} pts={gold} show={(n) => inr(n)} />}
            <PriceChart
              points={gold} slot={CATEGORY_SLOT.Gold} label={grams ? 'Gold valuation' : goldLabel}
              tick={(n) => (grams ? cr(n) : inr(n))} value={(n) => (grams ? cr(n) : inr(n))}
              more={(p) => grams && rateOn.has(p.day) ? <span className={TIP.sub}>{inr(rateOn.get(p.day))}/g · {num(grams)} g</span> : null}
            />
          </div>
        )}
      </div>

      {/* The same numbers as a table, for reading without the charts */}
      <details className="group mt-3 text-[13px]">
        <summary className="cursor-pointer select-none text-xs text-ink-3 hover:text-ink-2">Daily values</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="tbl">
            <thead><tr><th>Date</th><th className="num">AED → INR</th><th className="num">{goldLabel}</th>{grams && <th className="num">Valuation</th>}</tr></thead>
            <tbody>
              {[...new Set([...aed, ...rate].map((p) => p.day))].sort((a, b) => b - a).map((day) => {
                const a = aed.find((p) => p.day === day)?.value;
                const g = rateOn.get(day);
                return (
                  <tr key={day}>
                    <td>{fmtDay(day)}</td>
                    <td className={cx('num', !isNum(a) && 'text-ink-3')}>{isNum(a) ? num(a, 4) : '—'}</td>
                    <td className={cx('num', !isNum(g) && 'text-ink-3')}>{isNum(g) ? inr(g) : '—'}</td>
                    {grams && <td className="num">{isNum(g) ? cr(g * grams) : '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
