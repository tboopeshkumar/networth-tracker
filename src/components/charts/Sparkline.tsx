import { useElementWidth } from '../../hooks/useElementWidth';

/** A calm, axis-free line for context inside a stat card. */
export function Sparkline({ values, height = 46 }: { values: number[]; height?: number }) {
  const [ref, W] = useElementWidth<HTMLDivElement>();
  const show = values.length > 1 && W > 0;

  let path = '';
  let last: { x: number; y: number } | null = null;
  if (show) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = 4;
    const X = (i: number) => (i / (values.length - 1)) * W;
    const Y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
    path = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    last = { x: X(values.length - 1), y: Y(values[values.length - 1]) };
  }

  return (
    <div className="spark" ref={ref}>
      {show && (
        <svg viewBox={`0 0 ${W} ${height}`} height={height} aria-hidden="true">
          <path className="spark-area" d={`${path}L${W},${height}L0,${height}Z`} />
          <path className="spark-line" d={path} />
          {last && <circle className="spark-dot" cx={last.x} cy={last.y} r={3} />}
        </svg>
      )}
    </div>
  );
}
