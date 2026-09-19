import { cr, inr, isNum, num } from '../../lib/format';
import type { GoldValuation as Valuation } from '../../lib/jewellery';

/** Grams per sovereign (pavan), the unit gold jewellery is usually counted in. */
const SOVEREIGN_G = 8;

/**
 * The sheet's own gold valuation: the held 22C lists combined, priced at its
 * gold rate. Reference only — nothing here feeds a total.
 */
export function GoldValuation({ v }: { v: Valuation }) {
  if (!isNum(v.grams)) return null;
  const caveats = v.note?.replace(/^value\s*=[^.]*\.\s*/i, '').replace(/rate as of[^.]*\.?/i, '').trim();

  return (
    <div className="gold-card">
      <div className="gold-head">
        <span className="label">{v.title ?? 'Gold valuation'}</span>
        {v.rateAsOf && <span className="gold-asof">rate as of {v.rateAsOf}</span>}
      </div>

      {/* What you hold leads; its value moves with the gold rate, so it follows */}
      <div className="gold-qty">
        <span className="gold-grams">{num(v.grams)} g</span>
        <span className="gold-sov">{num(v.grams / SOVEREIGN_G, 1)} sovereigns</span>
      </div>
      {isNum(v.value) && (
        <div className="gold-worth">
          worth ≈ <b>{cr(v.value)}</b>{isNum(v.rate) && <> at {inr(v.rate)}/g</>}
        </div>
      )}

      {caveats && <div className="gold-foot">{caveats}</div>}
    </div>
  );
}
