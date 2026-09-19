import { useRef } from 'react';
import { Logo } from './Logo';

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

export function Header({ sheetTitle, email, canEdit, showActions, demo, onRefresh, onSwitchSheet, onDisconnect, onSignOut }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (fn: () => void) => () => {
    if (menu.current) menu.current.open = false;
    fn();
  };
  const account = demo ? 'demo mode' : email;

  return (
    <header className="bar">
      <div className="bar-title">
        <Logo />
        <div>
          <div className="app-name">Net Worth</div>
          <div className="bar-sub">
            {sheetTitle} {email && <span id="who" className="muted">{demo ? 'demo' : email}</span>}
          </div>
        </div>
      </div>
      {showActions && (
        <div className="bar-actions">
          <button type="button" id="btn-refresh" className="btn" title="Reload from the sheet" aria-label="Reload from the sheet" onClick={onRefresh}>
            <span aria-hidden="true">↻</span><span className="btn-label"> Refresh</span>
          </button>
          <details className="menu" ref={menu}>
            <summary className="btn" aria-label="More">⋯</summary>
            <div className="menu-pop">
              <div className="menu-account">
                Signed in as <b>{canEdit ? account : `${account} (view only)`}</b>
              </div>
              {!demo && <button type="button" onClick={pick(onSwitchSheet)}>Choose a different sheet</button>}
              {!demo && <button type="button" onClick={pick(onDisconnect)}>Revoke Google access</button>}
              <button type="button" onClick={pick(onSignOut)}>Sign out</button>
            </div>
          </details>
        </div>
      )}
    </header>
  );
}
