import { useCallback, useEffect, useRef, useState } from 'react';

export const VERSION = __APP_VERSION__;
export const BUILT = __APP_BUILT__;

/** How often a visible app looks for a newer build on its own. */
const EVERY_MS = 2 * 60 * 1000;
/** Coming back to the app or pressing Refresh checks sooner than that, but not in a burst. */
const AT_LEAST_MS = 20 * 1000;

/**
 * Whether a newer build than this one is live. Checks version.json on start,
 * every couple of minutes while the app is visible, whenever it comes back to
 * the foreground or regains focus (a Home Screen app resumes rather than
 * reloads), and when asked to with `checkNow`. Production only.
 */
export function useUpdateCheck(): { stale: boolean; checkNow: () => void } {
  const [stale, setStale] = useState(false);
  const last = useRef(0);

  const check = useCallback(async (gap: number) => {
    if (import.meta.env.DEV) return;
    if (document.visibilityState !== 'visible' || Date.now() - last.current < gap) return;
    last.current = Date.now();
    try {
      // A query string and no-store get past GitHub Pages' 10-minute cache
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${last.current}`, { cache: 'no-store' });
      if (!res.ok) return;
      const live = await res.json() as { version?: string };
      if (live.version && live.version !== VERSION) setStale(true);
    } catch { /* offline: try again next time */ }
  }, []);

  useEffect(() => {
    const soon = () => void check(AT_LEAST_MS);
    void check(0);
    const timer = window.setInterval(() => void check(EVERY_MS), EVERY_MS);
    document.addEventListener('visibilitychange', soon);
    window.addEventListener('focus', soon);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', soon);
      window.removeEventListener('focus', soon);
    };
  }, [check]);

  return { stale, checkNow: useCallback(() => void check(AT_LEAST_MS), [check]) };
}

/**
 * Reload the app itself, picking up a newer build if there is one. The page
 * is fetched past the browser's cache first, so the reload can't land on a
 * stale copy of it.
 */
export async function reloadApp(): Promise<void> {
  try {
    await fetch(window.location.href.split('#')[0], { cache: 'reload' });
  } catch { /* offline: reload anyway */ }
  window.location.reload();
}
