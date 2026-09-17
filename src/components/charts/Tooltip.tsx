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
    <div ref={ref} className="tip" role="status" style={{ left, top, opacity: size.w ? 1 : 0 }}>
      {children}
    </div>
  );
}
