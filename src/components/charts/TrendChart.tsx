import { useState, type PointerEvent } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { cr, fmtMonth, isNum } from '../../lib/format';
import type { RowOf } from '../../lib/model';
import { Tooltip } from './Tooltip';

const H = 280;
const P = { t: 12, r: 12, b: 26, l: 50 };

export function TrendChart({ series }: { series: RowOf<'trend'>[] }) {
  const [ref, W] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.filter((d) => isNum(d.month) && isNum(d.networth)) as (RowOf<'trend'> & { month: number; networth: number })[];

  const iw = Math.max(60, W - P.l - P.r);
  const ih = H - P.t - P.b;
  const max = Math.max(1, ...pts.map((d) => d.networth)) * 1.06;
  const X = (i: number) => P.l + (i / Math.max(1, pts.length - 1)) * iw;
  const Y = (v: number) => P.t + ih - (v / max) * ih;
  const step = max > 8e7 ? 4e7 : 2e7;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(pts.length / Math.max(2, Math.floor(iw / 80)));
  const line = pts.map((d, i) => `${i ? 'L' : 'M'}${X(i)},${Y(d.networth)}`).join('');

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = (e.clientX - box.left) * (W / box.width);
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((px - P.l) / iw) * (pts.length - 1)))));
  };

  const h = hover === null ? null : pts[hover];
  return (
    <div className="chart" ref={ref}>
      {W > 0 && pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="Net worth over time">
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={P.l} x2={P.l + iw} y1={Y(v)} y2={Y(v)} />
              <text className="tick" x={P.l - 8} y={Y(v) + 4} textAnchor="end">{`${v / 1e7} Cr`}</text>
            </g>
          ))}
          {pts.map((d, i) => (i % every === 0 || i === pts.length - 1) && (
            <text key={d._key} className="tick" x={X(i)} y={H - 7} textAnchor="middle">{fmtMonth(d.month)}</text>
          ))}
          <path className="area" d={`${line}L${X(pts.length - 1)},${Y(0)}L${X(0)},${Y(0)}Z`} />
          <path className="line" d={line} />
          {pts.map((d, i) => d.note ? <circle key={d._key} className="ring" cx={X(i)} cy={Y(d.networth)} r={4} /> : null)}
          {h && hover !== null && (
            <>
              <line className="cross" x1={X(hover)} x2={X(hover)} y1={P.t} y2={P.t + ih} />
              <circle className="dot" cx={X(hover)} cy={Y(h.networth)} r={5} />
            </>
          )}
          <rect x={P.l} y={P.t} width={iw} height={ih} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {h && hover !== null && (
        <Tooltip x={X(hover)} y={Y(h.networth)} hostWidth={W}>
          <span className="tl">{fmtMonth(h.month)}</span>
          <span className="tv">{cr(h.networth)}</span>
          {isNum(h.savings) && <span className="ts">{`${h.savings >= 0 ? '+' : ''}${cr(h.savings)} vs previous`}</span>}
          {h.note ? <span className="tn">{String(h.note)}</span> : null}
        </Tooltip>
      )}
    </div>
  );
}
