import { cr, inr, n0, ret, signedCr, signedInr, signedPct, tone } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Model, NetWorthRow } from '../../lib/model';
import { CATEGORY_SLOT, Card, Swatch } from '../ui';

interface Props {
  model: Model;
  linkOf: (r: NetWorthRow) => ViewId | null;
  onDrill: (id: ViewId) => void;
}

/** The Net Worth lines: a table on wide screens, cards on phones. */
export function Positions({ model, linkOf, onDrill }: Props) {
  const T = model.totals;
  const rows = [...model.rows.networth].sort((a, b) => n0(b.current) - n0(a.current));
  const r = ret(T.pnl, T.invested);

  return (
    <Card title="All positions" sub="The lines that roll up into your total — computed in the sheet. Tap a linked line to see what's inside it.">
      <div className="pos-list only-narrow">
        {rows.map((x) => {
          const link = linkOf(x);
          const inner = (
            <>
              <div className="pos-top">
                <Swatch slot={CATEGORY_SLOT[String(x.category)]} />
                <span className="pos-name">{String(x.asset)}</span>
                <span className="pos-val">{cr(x.current)}</span>
              </div>
              <div className="pos-meta">
                <span>{[x.category, x.location, x.holder].filter(Boolean).join(' · ')}</span>
                <span className={tone(x.pnl)}>{x.pnl ? `${signedCr(x.pnl)} · ${signedPct(ret(x.pnl, x.invested))}` : '—'}</span>
              </div>
            </>
          );
          return link
            ? <button key={x._key} type="button" className="pos linked" onClick={() => onDrill(link)}>{inner}</button>
            : <div key={x._key} className="pos">{inner}</div>;
        })}
        <div className="pos pos-total">
          <div className="pos-top"><span className="pos-name">Total</span><span className="pos-val">{cr(T.current)}</span></div>
          <div className="pos-meta">
            <span>Invested {cr(T.invested)}</span>
            <span className={tone(T.pnl)}>{`${signedCr(T.pnl)} · ${signedPct(r)}`}</span>
          </div>
        </div>
      </div>

      <div className="tablewrap only-wide">
        <table>
          <thead>
            <tr>
              <th>Asset</th><th>Holder</th><th>Category</th><th>Where</th>
              <th className="num">Invested</th><th className="num">Current</th><th className="num">P&amp;L</th><th className="num">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const link = linkOf(x);
              const open = link ? () => onDrill(link) : undefined;
              return (
                <tr key={x._key} className={link ? 'linked' : undefined} tabIndex={link ? 0 : undefined} role={link ? 'button' : undefined}
                  onClick={open}
                  onKeyDown={open && ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } })}>
                  <td className="name"><Swatch slot={CATEGORY_SLOT[String(x.category)]} />{String(x.asset)}</td>
                  <td>{String(x.holder)}</td><td>{String(x.category)}</td><td>{String(x.location)}</td>
                  <td className="num">{inr(x.invested)}</td>
                  <td className="num strong">{inr(x.current)}</td>
                  <td className={`num ${tone(x.pnl)}`}>{x.pnl ? signedInr(x.pnl) : '—'}</td>
                  <td className={`num ${tone(x.pnl)}`}>{x.pnl ? signedPct(ret(x.pnl, x.invested)) : '—'}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td className="name">Total</td><td /><td /><td />
              <td className="num">{inr(T.invested)}</td>
              <td className="num strong">{inr(T.current)}</td>
              <td className={`num ${tone(T.pnl)}`}>{signedInr(T.pnl)}</td>
              <td className={`num ${tone(r)}`}>{signedPct(r)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
