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

      {isNum(v.value) && <div className="gold-value">≈ {cr(v.value)}</div>}
      <div className="gold-facts">
        <b>{num(v.grams)} g</b>
        <span className="muted"> · {num(v.grams / SOVEREIGN_G, 1)} sovereigns</span>
        {isNum(v.rate) && <span className="muted"> · at {inr(v.rate)}/g</span>}
      </div>

      {v.parts.length > 1 && (
        <div className="gold-parts">
          {v.parts.map((p) => (
            <div className="gold-part" key={p.title}>
              <span className="gold-part-name">{p.title}</span>
              <span className="gold-part-g">{num(p.grams)} g</span>
              <span className="gold-part-share">
                <span style={{ width: `${(p.grams / (v.grams as number)) * 100}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}

      {caveats && <div className="gold-foot">{caveats}</div>}
    </div>
  );
}
