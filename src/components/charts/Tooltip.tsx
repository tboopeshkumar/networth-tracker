import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Positions itself above (x, y) within the chart, clamped to its width. */
export function Tooltip({ x, y, hostWidth, children }: { x: number; y: number; hostWidth: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [children]);

  const left = Math.max(0, Math.min(hostWidth - size.w, x - size.w / 2));
  const top = Math.max(0, y - size.h - 12);
  return (
    <div
      ref={ref}
      role="status"
      style={{ left, top, opacity: size.w ? 1 : 0 }}
      className="pointer-events-none absolute z-[5] grid whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[0_6px_20px_rgba(0,0,0,0.16)] transition-opacity"
    >
      {children}
    </div>
  );
}

/** Tooltip lines: label, value, secondary, note. */
export const TIP = {
  label: 'text-[11px] text-ink-3',
  value: 'font-semibold tabular-nums',
  sub: 'text-ink-2 tabular-nums',
  note: 'text-ink-3',
} as const;
