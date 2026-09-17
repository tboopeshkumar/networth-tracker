import { useEffect, useRef } from 'react';

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Calls onIdle after `minutes` without user input, while `active`. */
export function useIdleLock(active: boolean, minutes: number, onIdle: () => void) {
  const callback = useRef(onIdle);
  useEffect(() => { callback.current = onIdle; });

  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const check = () => { if (Date.now() - last > minutes * 60_000) callback.current(); };
    const onVisible = () => { if (!document.hidden) check(); };

    EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 30_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [active, minutes]);
}
