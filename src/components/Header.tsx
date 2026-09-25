import { IconDots, IconRefresh } from '@tabler/icons-react';
import { useRef } from 'react';
import { BUILT, VERSION } from '../hooks/useUpdateCheck';
import { Logo } from './Logo';
import { BTN } from './ui';

interface Props {
  sheetTitle?: string;
  email?: string;
  canEdit: boolean;
  showActions: boolean;
  demo: boolean;
  onRefresh: () => void;
  onSwitchSheet: () => void;
  onDisconnect: () => void;
  onSignOut: () => void;
}

// When this copy of the app was built, in the viewer's local time
const builtAt = new Date(BUILT).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const MENU_ITEM = 'cursor-pointer rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-sunk';

export function Header({ sheetTitle, email, canEdit, showActions, demo, onRefresh, onSwitchSheet, onDisconnect, onSignOut }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false;
    fn();
  };
  const account = demo ? 'demo mode' : email;

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
      {showActions && (
        <div className="flex flex-none items-center gap-1.5">
          <button type="button" className={BTN} title="Reload from the sheet" aria-label="Reload from the sheet" onClick={onRefresh}>
            <IconRefresh size={16} stroke={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <details className="relative" ref={menu}>
            <summary className={BTN.replace('px-3', 'px-2')} aria-label="More"><IconDots size={16} stroke={1.75} aria-hidden="true" /></summary>
            <div className="absolute right-0 top-[calc(100%+6px)] grid min-w-[230px] rounded-xl border border-line bg-surface p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              <div className="mb-1 border-b border-line px-2.5 pb-2 pt-1.5 text-xs text-ink-3">
                Signed in as
                <b className="block break-all font-medium text-ink">{canEdit ? account : `${account} (view only)`}</b>
              </div>
              {!demo && <button type="button" className={MENU_ITEM} onClick={pick(onSwitchSheet)}>Choose a different sheet</button>}
              {!demo && <button type="button" className={MENU_ITEM} onClick={pick(onDisconnect)}>Revoke Google access</button>}
              <button type="button" className={MENU_ITEM} onClick={pick(onSignOut)}>Sign out</button>
              <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2 text-[11px] text-ink-3">
                Version <span className="font-mono">{VERSION}</span> · {builtAt}
              </div>
            </div>
          </details>
        </div>
      )}
    </header>
  );
}
