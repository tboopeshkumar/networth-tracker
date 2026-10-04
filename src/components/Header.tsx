import { IconDots, IconMoon, IconRefresh, IconReload, IconSun } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';
import { BUILT, VERSION, reloadApp } from '../hooks/useUpdateCheck';
import { Logo } from './Logo';
import { BTN, cx } from './ui';

interface Props {
  sheetTitle?: string;
  email?: string;
  canEdit: boolean;
  showActions: boolean;
  demo: boolean;
  /** a newer build is live: the reload button says so */
  updateReady?: boolean;
  onRefresh: () => void;
  onSwitchSheet: () => void;
  onDisconnect: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onImportCas: () => void;
}

// When this copy of the app was built, in the viewer's local time
const builtAt = new Date(BUILT).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const MENU_ITEM = 'cursor-pointer rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-sunk';

export function Header({ sheetTitle, email, canEdit, showActions, demo, updateReady, onRefresh, onSwitchSheet, onDisconnect, onSignOut, onExport, onImportCas }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false;
    fn();
  };
  // The menu closes as soon as you tap, scroll or press Escape anywhere outside it
  useEffect(() => {
    const close = (e: Event) => {
      const m = menu.current;
      if (!m?.open) return;
      if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !m.contains(e.target as Node)) m.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close);
    };
  }, []);
  const account = demo ? 'demo mode' : email;
  const { theme, chosen, choose } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="safe-bar sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-page/85 pb-2.5 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <div className="min-w-0">
          <div className="font-semibold leading-tight">Net Worth</div>
          <div className="truncate text-xs text-ink-3">
            {sheetTitle}
            {/* On phones the email moves into the ⋯ menu, so the sheet name keeps its room */}
            {email && <span className="hidden sm:inline"> · {demo ? 'demo' : email}</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-1.5">
        {showActions && (
          <button type="button" className={BTN} title="Reload from the sheet" aria-label="Reload from the sheet" onClick={onRefresh}>
            <IconRefresh size={16} stroke={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
        {/* Refresh re-reads the sheet; this reloads the app itself, for a newer version. The dot means one is waiting. */}
        {showActions && (
          <button
            type="button" className={cx(BTN.replace('px-3', 'px-2'), 'relative')} onClick={() => void reloadApp()}
            title={updateReady ? 'Reload the app: a newer version is available' : 'Reload the app'}
            aria-label={updateReady ? 'Reload the app: a newer version is available' : 'Reload the app'}
          >
            <IconReload size={16} stroke={1.75} aria-hidden="true" />
            {updateReady && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-page bg-accent" aria-hidden="true" />}
          </button>
        )}
        {/* Always there, so the sign-in screen can switch too */}
        <button type="button" className={BTN.replace('px-3', 'px-2')} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`} onClick={() => choose(next)}>
          {theme === 'dark' ? <IconSun size={16} stroke={1.75} aria-hidden="true" /> : <IconMoon size={16} stroke={1.75} aria-hidden="true" />}
        </button>
        {showActions && (
          <details className="relative" ref={menu}>
            <summary className={BTN.replace('px-3', 'px-2')} aria-label="More"><IconDots size={16} stroke={1.75} aria-hidden="true" /></summary>
            <div className="absolute right-0 top-[calc(100%+6px)] grid min-w-[230px] rounded-lg border border-line bg-surface p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <div className="mb-1 border-b border-line px-2.5 pb-2 pt-1.5 text-xs text-ink-3">
                Signed in as
                <b className="block break-all font-medium text-ink">{canEdit ? account : `${account} (view only)`}</b>
              </div>
              {canEdit && <button type="button" className={MENU_ITEM} onClick={pick(onImportCas)}>Import CAS (fund units)…</button>}
              <button type="button" className={MENU_ITEM} onClick={pick(onExport)}>Export to PDF…</button>
              {chosen && <button type="button" className={MENU_ITEM} onClick={pick(() => choose(null))}>Match device appearance</button>}
              {!demo && <button type="button" className={MENU_ITEM} onClick={pick(onSwitchSheet)}>Choose a different sheet</button>}
              {!demo && <button type="button" className={MENU_ITEM} onClick={pick(onDisconnect)}>Revoke Google access</button>}
              <button type="button" className={MENU_ITEM} onClick={pick(onSignOut)}>Sign out</button>
              <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[11px] text-ink-3">
                Version <span className="font-mono">{VERSION}</span> · {builtAt}
              </div>
            </div>
          </details>
        )}
      </div>
    </header>
  );
}
