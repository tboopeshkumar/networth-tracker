import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'networth.theme';
const PAGE = { light: '#f1f0ec', dark: '#0a0a0a' } as const; // matches --page, for the phone's status bar
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

/** The theme picked on this device, or null to follow the device's own setting. */
function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

/** Puts a theme on the page: the data-theme attribute the stylesheet keys off, and the status-bar colour. */
function apply(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? PAGE.dark : PAGE.light;
    meta.content = theme ? PAGE[theme] : own;
  }
}

/** Run before the app renders, so a chosen theme shows from the first frame. */
export function applyStoredTheme() { apply(stored()); }

/**
 * Light or dark: the viewer's choice on this device if they made one, else the
 * device setting (followed live). `choose(null)` goes back to following it.
 */
export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const [system, setSystem] = useState<Theme>(() => (media().matches ? 'dark' : 'light'));

  useEffect(() => {
    const m = media();
    const onChange = () => setSystem(m.matches ? 'dark' : 'light');
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  const choose = useCallback((theme: Theme | null) => {
    try {
      if (theme) localStorage.setItem(KEY, theme);
      else localStorage.removeItem(KEY);
    } catch { /* private browsing: the choice lasts for this visit only */ }
    apply(theme);
    setChoice(theme);
  }, []);

  return { theme: choice ?? system, chosen: choice !== null, choose };
}
