import type { ReactNode } from 'react';
import { cr, fmtMonth, inr, isNum, n0, pct, ret, signedCr, signedPct, tone } from '../../lib/format';
import type { Model } from '../../lib/model';

function Tile({ label, value, note, big = false, valueTone = '' }: {
  label: string; value: ReactNode; note?: ReactNode; big?: boolean; valueTone?: string;
}) {
  return (
    <div className="card tile">
      <div className="label">{label}</div>
      <div className={`${big ? 'big' : 'mid'} ${valueTone}`}>{value}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function StatTiles({ model }: { model: Model }) {
  const T = model.totals;
  const nw = model.rows.networth;
  const r = ret(T.pnl, T.invested);
  const sumWhere = (p: (x: (typeof nw)[number]) => boolean) => nw.filter(p).reduce((a, x) => a + n0(x.current), 0);
  const liquid = sumWhere((x) => x.category === 'Liquid');
  const equity = sumWhere((x) => x.category === 'Equity');
  const uae = sumWhere((x) => x.location === 'UAE');
  const last = model.rows.trend.filter((d) => isNum(d.savings)).at(-1);
  const share = (v: number) => `${pct(T.current ? v / T.current : null)} of total`;

  return (
    <>
      <div className="grid hero">
        <Tile big label="Invested" value={cr(T.invested)} note="capital deployed" />
        <Tile big label="Total net worth" value={cr(T.current)} note={inr(T.current)} />
        <Tile big label="Unrealised P&L" value={signedCr(T.pnl)} note={inr(T.pnl)} valueTone={tone(T.pnl)} />
        <Tile big label="Overall return" value={signedPct(r)} note="on invested capital" valueTone={tone(r)} />
      </div>
      <div className="grid hero">
        <Tile label="Liquid cash" value={cr(liquid)} note={share(liquid)} />
        <Tile label="Equity exposure" value={cr(equity)} note={share(equity)} />
        <Tile label="Held in UAE" value={pct(T.current ? uae / T.current : null)} note={cr(uae)} />
        {last && <Tile label="Latest month change" value={signedCr(last.savings)} note={fmtMonth(last.month)} valueTone={tone(last.savings)} />}
      </div>
    </>
  );
}
