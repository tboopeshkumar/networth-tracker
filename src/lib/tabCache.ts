// The extra tabs a sheet had at its last load (feeds, logs, ledgers), kept in
// this browser so the next load can ask for every tab in one round of
// requests. Tab names only, never their contents. Each load checks them
// against the sheet's real tab list and corrects this.

const STORE = 'networth.tabs';

const all = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string[]>;
  } catch {
    return {};
  }
};

export function rememberedTabs(sheetId: string): string[] {
  const tabs = all()[sheetId];
  return Array.isArray(tabs) ? tabs.filter((t) => typeof t === 'string') : [];
}

/** Remember a sheet's extra tabs; null forgets them. */
export function rememberTabs(sheetId: string, tabs: string[] | null): void {
  try {
    const next = all();
    if (tabs) next[sheetId] = tabs;
    else delete next[sheetId];
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch { /* storage unavailable: each load takes the two-step path */ }
}

/** Forget every sheet's tabs, as when access to Google is revoked. */
export function forgetAllTabs(): void {
  try { localStorage.removeItem(STORE); } catch { /* nothing to forget */ }
}
