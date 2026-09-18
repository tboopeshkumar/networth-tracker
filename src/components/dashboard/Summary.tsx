import { cr, fmtDate, fmtMonth, isNum, n0, pct, ret, signedCr, signedPct, tone } from '../../lib/format';
import type { Model } from '../../lib/model';

/** One composition figure: amount and its share of the total. */
function ShareTile({ label, value, share }: { label: string; value: number; share: number }) {
  return (
    <div className="card share-tile">
      <div className="label">{label}</div>
      <div className="share-val">{cr(value)}</div>
      <div className="share-pct">{pct(share)}<span className="share-of"> of total</span></div>
    </div>
  );
}

/** A labelled figure with one line of context, coloured by gain or loss. */
function Stat({ label, value, note, t }: { label: string; value: string; note: string; t: string }) {
  return (
    <div className={`stat stat-${t || 'flat'}`}>
      <div className="label">{label}</div>
      <div className={`stat-val ${t}`}>{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

export function Summary({ model }: { model: Model }) {
  const T = model.totals;
  const nw = model.rows.networth;
  const r = ret(T.pnl, T.invested);

  const sumWhere = (p: (x: (typeof nw)[number]) => boolean) => nw.filter(p).reduce((a, x) => a + n0(x.current), 0);
  const liquid = sumWhere((x) => x.category === 'Liquid');
  const equity = sumWhere((x) => x.category === 'Equity');
  const uae = sumWhere((x) => x.location === 'UAE');
  const share = (v: number) => (T.current ? v / T.current : 0);

  // Latest recorded month, and the one before it for "vs …"
  const months = model.rows.trend.filter((d) => isNum(d.savings));
  const latest = months.at(-1);
  const prior = model.rows.trend[model.rows.trend.findIndex((d) => d === latest) - 1];
  const arrow = (n: unknown) => (n0(n) >= 0 ? '▲' : '▼');

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

        <div className="hero-value">{cr(T.invested)}</div>
        <div className="hero-now"><span className="muted">now worth</span> <b>{cr(T.current)}</b></div>

        <div className="stats">
          <Stat
            label="Unrealised gain"
            value={signedCr(T.pnl)}
            note={`${signedPct(r)} on invested`}
            t={tone(T.pnl)}
          />
          {latest && (
            <Stat
              label={fmtMonth(latest.month)}
              value={`${arrow(latest.savings)} ${signedCr(latest.savings)}`}
              note={prior ? `change vs ${fmtMonth(prior.month)}` : 'change on the month'}
              t={tone(latest.savings)}
            />
          )}
        </div>
      </section>

      <div className="grid shares">
        <ShareTile label="Liquid cash" value={liquid} share={share(liquid)} />
        <ShareTile label="Equity exposure" value={equity} share={share(equity)} />
        <ShareTile label="Held in UAE" value={uae} share={share(uae)} />
      </div>
    </>
  );
}
