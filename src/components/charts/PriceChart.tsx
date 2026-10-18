import { useId, useState, type PointerEvent, type ReactNode } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { fmtDay } from '../../lib/format';
import type { RatePoint } from '../../lib/rateHistory';
import { TIP, Tooltip } from './Tooltip';

const H = 170;
const P = { t: 10, r: 10, b: 24, l: 56 };

interface Props {
  points: RatePoint[];
  /** the series colour slot (--s1 … --s7) */
  slot: number;
  label: string;
  /** a value as the axis shows it, and as the tooltip does */
  tick: (v: number) => string;
  value: (v: number) => string;
  /** extra tooltip lines for a point */
  more?: (p: RatePoint) => ReactNode;
}

/**
 * One price over a few weeks: a line scaled to its own range, so day-to-day
 * moves are visible, with a crosshair that snaps to the nearest day.
 */
export function PriceChart({ points: pts, slot, label, tick, value, more }: Props) {
  const [ref, W] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fill = useId().replace(/:/g, '');

  const iw = Math.max(60, W - P.l - P.r);
  const ih = H - P.t - P.b;
  const lo0 = Math.min(...pts.map((p) => p.value));
  const hi0 = Math.max(...pts.map((p) => p.value));
  const pad = (hi0 - lo0 || hi0 * 0.01) * 0.15;
  const [lo, hi] = [lo0 - pad, hi0 + pad];
  const first = pts[0]?.day ?? 0;
  const span = Math.max(1, (pts.at(-1)?.day ?? 1) - first);
  // Spaced by date, so a missing day leaves a gap in time rather than squeezing the line
  const X = (day: number) => P.l + ((day - first) / span) * iw;
  const Y = (v: number) => P.t + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [0, 1, 2, 3].map((i) => lo + pad + ((hi0 - lo0) * i) / 3);
  const every = Math.max(1, Math.ceil(span / Math.max(2, Math.floor(iw / 70))));
  const days = pts.filter((p) => (p.day - first) % every === 0 || p === pts.at(-1));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.day)},${Y(p.value)}`).join('');

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const day = first + (((e.clientX - box.left) * (W / box.width) - P.l) / iw) * span;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.day - day) < Math.abs(pts[best].day - day)) best = i; });
    setHover(best);
  };

  const h = hover === null ? null : pts[hover];
  const color = `var(--s${slot})`;
  return (
    <div className="chart" ref={ref}>
      {W > 0 && pts.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`${label}, ${fmtDay(first)} to ${fmtDay(pts.at(-1)!.day)}`}>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.18 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {(hi0 > lo0 ? ticks : [lo0]).map((v) => (
            <g key={v}>
              <line className="grid" x1={P.l} x2={P.l + iw} y1={Y(v)} y2={Y(v)} />
              <text className="tick" x={P.l - 8} y={Y(v) + 4} textAnchor="end">{tick(v)}</text>
            </g>
          ))}
          {days.map((p) => (
            <text key={p.day} className="tick" x={X(p.day)} y={H - 6} textAnchor={p === pts.at(-1) ? 'end' : p.day === first ? 'start' : 'middle'}>{fmtDay(p.day)}</text>
          ))}
          <path d={`${line}L${X(pts.at(-1)!.day)},${P.t + ih}L${X(first)},${P.t + ih}Z`} fill={`url(#${fill})`} />
          <path className="line" d={line} style={{ stroke: color }} />
          {h && (
            <>
              <line className="cross" x1={X(h.day)} x2={X(h.day)} y1={P.t} y2={P.t + ih} />
              <circle className="dot" cx={X(h.day)} cy={Y(h.value)} r={5} style={{ fill: color }} />
            </>
          )}
          <rect x={P.l} y={P.t} width={iw} height={ih} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {h && (
        <Tooltip x={X(h.day)} y={Y(h.value)} hostWidth={W}>
          <span className={TIP.label}>{fmtDay(h.day)}</span>
          <span className={TIP.value}>{value(h.value)}</span>
          {more?.(h)}
        </Tooltip>
      )}
    </div>
  );
}
