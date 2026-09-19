import { useState } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { cr, fmtMonth, isNum } from '../../lib/format';
import type { RowOf } from '../../lib/model';
import { TIP, Tooltip } from './Tooltip';

const H = 190;
const P = { t: 10, r: 12, b: 24, l: 50 };

export function ChangeChart({ series }: { series: RowOf<'trend'>[] }) {
  const [ref, W] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.filter((d) => isNum(d.savings)) as (RowOf<'trend'> & { savings: number })[];

  const iw = Math.max(60, W - P.l - P.r);
  const ih = H - P.t - P.b;
  const max = Math.max(0, ...pts.map((d) => d.savings));
  const min = Math.min(0, ...pts.map((d) => d.savings));
  const Y = (v: number) => P.t + ih - ((v - min) / (max - min || 1)) * ih;
  const slot = iw / Math.max(1, pts.length);
  const bw = Math.max(2, slot - 3);
  const every = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 80)));
  // Drop an axis label that would collide with the zero label
  const axis = [min, 0, max].filter((v) => v === 0 || Math.abs(Y(v) - Y(0)) >= 14);

  const h = hover === null ? null : pts[hover];
  return (
    <div className="chart" ref={ref}>
      {W > 0 && pts.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Month-on-month change">
          {axis.map((v) => (
            <g key={v}>
              <line className={v === 0 ? 'base' : 'grid'} x1={P.l} x2={P.l + iw} y1={Y(v)} y2={Y(v)} />
              <text className="tick" x={P.l - 8} y={Y(v) + 4} textAnchor="end">{v === 0 ? '0' : `${Math.round(v / 1e5)} L`}</text>
            </g>
          ))}
          {pts.map((d, i) => {
            const x = P.l + i * slot;
            const up = d.savings >= 0;
            const show = () => setHover(i);
            return (
              <g key={d._key}>
                <rect className={up ? 'bar-up' : 'bar-down'} x={x} y={up ? Y(d.savings) : Y(0)} width={bw}
                  height={Math.max(1.5, Math.abs(Y(d.savings) - Y(0)))} rx={Math.min(3, bw / 2)}
                  onPointerEnter={show} onPointerDown={show} onPointerLeave={() => setHover(null)} />
                {((i % every === 0 && pts.length - 1 - i >= every / 2) || i === pts.length - 1) && (
                  <text className="tick" x={x + bw / 2} y={H - 6} textAnchor="middle">{fmtMonth(d.month)}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={P.l + hover * slot + bw / 2} y={Math.min(Y(h.savings), Y(0))} hostWidth={W}>
          <span className={TIP.label}>{fmtMonth(h.month)}</span>
          <span className={`${TIP.value} ${h.savings >= 0 ? 'up' : 'down'}`}>{`${h.savings >= 0 ? '+' : ''}${cr(h.savings)}`}</span>
          {h.note ? <span className={TIP.note}>{String(h.note)}</span> : null}
        </Tooltip>
      )}
    </div>
  );
}
