import { cr, fmtDate, fmtMonth, inr, isNum, n0, pct, ret, signedCr, signedPct, tone } from '../../lib/format';
import type { Model } from '../../lib/model';
import { Sparkline } from '../charts/Sparkline';
import { slotColor } from '../ui';

/** One composition figure: amount, share of total, and a bar for the share. */
function ShareTile({ label, value, share, slot }: { label: string; value: number; share: number; slot: number }) {
  return (
    <div className="card share-tile">
      <div className="label">{label}</div>
      <div className="share-val">{cr(value)}</div>
      <div className="share-row">
        <span className="share-pct">{pct(share)}</span>
        <span className="share-track"><span className="share-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: slotColor(slot) }} /></span>
      </div>
    </div>
  );
}

export function Summary({ model }: { model: Model }) {
  const T = model.totals;
  const nw = model.rows.networth;
  const trend = model.rows.trend.filter((d) => isNum(d.networth));
  const r = ret(T.pnl, T.invested);

  const sumWhere = (p: (x: (typeof nw)[number]) => boolean) => nw.filter(p).reduce((a, x) => a + n0(x.current), 0);
  const liquid = sumWhere((x) => x.category === 'Liquid');
  const equity = sumWhere((x) => x.category === 'Equity');
  const uae = sumWhere((x) => x.location === 'UAE');
  const share = (v: number) => (T.current ? v / T.current : 0);

  const latest = model.rows.trend.filter((d) => isNum(d.savings)).at(-1);
  const first = trend[0];
  const growth = first && n0(first.networth) ? n0(trend[trend.length - 1]?.networth) / n0(first.networth) : null;

  // Newest valuation date across the priced holdings
  const dates = [...model.rows.mf.map((x) => x.navDate), ...model.rows.equity.map((x) => x.navDate), ...model.rows.sgb.map((x) => x.valueDate)].filter(isNum);
  const newest = dates.length ? Math.max(...dates) : null;

  return (
    <>
      {/* Invested leads: it's the capital actually committed, and it doesn't
          swing with the market the way current value does. */}
      <section className="card hero-card">
        <div className="hero-head">
          <span className="label">Invested capital</span>
          {newest !== null && <span className="hero-asof">valued {fmtDate(newest)}</span>}
        </div>

        <div className="hero-figure">
          <span className="hero-value">{cr(T.invested)}</span>
          <span className="hero-secondary">
            <span className="muted">now worth</span>
            <b>{cr(T.current)}</b>
            <span className={`hero-chip ${tone(T.pnl)}`}>{signedPct(r)}</span>
          </span>
        </div>

        <Sparkline values={trend.map((d) => n0(d.networth))} />
        <div className="spark-cap">Recorded month-end net worth · {trend.length} months</div>

        <div className="hero-facts">
          <span className={tone(T.pnl)}><span className="muted">Unrealised</span> {signedCr(T.pnl)}</span>
          {latest && (
            <span className={tone(latest.savings)}>
              <span className="muted">{fmtMonth(latest.month)}</span> {n0(latest.savings) >= 0 ? '▲' : '▼'} {signedCr(latest.savings)}
            </span>
          )}
          {growth && first && <span><span className="muted">Since {fmtMonth(first.month)}</span> {growth.toFixed(2)}×</span>}
          <span className="hero-exact muted">{inr(T.invested)} invested</span>
        </div>
      </section>

      <div className="grid shares">
        <ShareTile label="Liquid cash" value={liquid} share={share(liquid)} slot={1} />
        <ShareTile label="Equity exposure" value={equity} share={share(equity)} slot={2} />
        <ShareTile label="Held in UAE" value={uae} share={share(uae)} slot={4} />
      </div>
    </>
  );
}
