import { IconCoin } from '@tabler/icons-react';
import { cr, fmtDate, inr, isNum, num } from '../../lib/format';
import type { GoldValuation as Valuation } from '../../lib/jewellery';
import { feedRateFor, type FeedRate } from '../../lib/ratesFeed';
import { Label, PANEL, cx } from '../ui';

/** Grams per sovereign (pavan), the unit gold jewellery is usually counted in. */
const SOVEREIGN_G = 8;

/**
 * The sheet's own gold valuation: the held 22C lists combined, priced at its
 * gold rate. Reference only — nothing here feeds a total.
 */
export function GoldValuation({ v, feed = [] }: { v: Valuation; feed?: FeedRate[] }) {
  if (!isNum(v.grams)) return null;
  const daily = feedRateFor(feed, v.rateFormula);
  const caveats = v.note?.replace(/^value\s*=[^.]*\.\s*/i, '').replace(/rate as of[^.]*\.?/i, '')
    .replace(v.rateLive || daily ? /rate:?\s*(live|daily)[^.]*\.?/i : /$^/, '').trim();

  return (
    <div className={cx(PANEL, 'mb-2 border-l-[3px] border-l-good px-4 py-3.5')}>
      <div className="flex items-baseline justify-between gap-3">
        <Label icon={<IconCoin size={15} stroke={1.75} aria-hidden="true" />}>{v.title ?? 'Gold valuation'}</Label>
        {daily
          ? <span className="whitespace-nowrap text-xs text-ink-3" title={`Refreshed daily from ${daily.source || 'the Rates Feed tab'}`}>rate of {fmtDate(daily.rateDate)}</span>
          : v.rateLive
            ? <span className="whitespace-nowrap text-xs text-good">● live rate</span>
            : v.rateAsOf && <span className="whitespace-nowrap text-xs text-ink-3">rate as of {v.rateAsOf}</span>}
      </div>

      {/* What you hold leads; its value moves with the gold rate, so it follows */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[28px] font-semibold tracking-tight tabular-nums">{num(v.grams)} g</span>
        <span className="text-lg font-semibold text-ink-2 tabular-nums">{num(v.grams / SOVEREIGN_G, 1)} sovereigns</span>
      </div>
      {isNum(v.value) && (
        <div className="mt-0.5 text-[13px] text-ink-2">
          worth ≈ <b className="font-semibold text-ink tabular-nums">{cr(v.value)}</b>{isNum(v.rate) && <> at {inr(v.rate)}/g</>}
        </div>
      )}

      {caveats && <div className="mt-2.5 text-[11.5px] leading-snug text-ink-3">{caveats}</div>}
    </div>
  );
}
