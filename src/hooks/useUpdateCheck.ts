import { useEffect, useState } from 'react';

export const VERSION = __APP_VERSION__;
export const BUILT = __APP_BUILT__;

const EVERY_MS = 5 * 60 * 1000;

/**
 * True once a newer build than this one is live. Checks version.json on
 * start and whenever the app comes back to the foreground (a Home Screen app
 * resumes rather than reloads), at most every five minutes. Production only.
 */
export function useUpdateCheck(): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < EVERY_MS) return;
      last = Date.now();
      try {
        // A query string and no-store get past GitHub Pages' 10-minute cache
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${last}`, { cache: 'no-store' });
        if (!res.ok) return;
        const live = await res.json() as { version?: string };
        if (live.version && live.version !== VERSION) setStale(true);
      } catch { /* offline: try again next time */ }
    };
    void check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  return stale;
}
