import { IconBrandGoogle, IconFileSpreadsheet } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Logo } from './Logo';
import { BTN, BTN_PRIMARY, CARD, cx } from './ui';

function Centered({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cx(CARD, 'mx-auto mt-[10vh] max-w-[460px] p-6 text-center sm:p-8')}>
      <div className="mb-4 flex justify-center"><Logo size={44} /></div>
      <h1 className="mb-2 text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </section>
  );
}

const LEAD = 'mb-5 text-ink-2';

export function SetupScreen({ message }: { message?: string }) {
  return (
    <Centered title="Almost there">
      <p className={LEAD}>
        {message ?? (
          <>Add your Google client ID, API key and project number to <code className="font-mono text-xs">.env.local</code> (copy{' '}
            <code className="font-mono text-xs">.env.example</code>). The README walks through it step by step.</>
        )}
      </p>
    </Centered>
  );
}

export function SignInScreen({ ready, busy, onSignIn }: { ready: boolean; busy: boolean; onSignIn: () => void }) {
  return (
    <Centered title="Your net worth, from your own sheet">
      <p className={LEAD}>Sign in with Google to open it. The data stays in your Google Sheet: this page stores nothing, and forgets everything when you close it.</p>
      <button type="button" className={cx(BTN_PRIMARY, 'px-5 py-2.5')} disabled={!ready || busy} onClick={onSignIn}>
        <IconBrandGoogle size={17} stroke={2} aria-hidden="true" />
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
    </Centered>
  );
}

export function PickScreen({ onPick, onLink }: { onPick: () => void; onLink: (link: string) => void }) {
  const [link, setLink] = useState('');
  return (
    <Centered title="Choose your sheet">
      <p className={LEAD}>Pick your net worth spreadsheet. The app only gets access to the one file you choose — nothing else in your Drive.</p>
      <button type="button" className={cx(BTN_PRIMARY, 'px-5 py-2.5')} onClick={onPick}>
        <IconFileSpreadsheet size={17} stroke={2} aria-hidden="true" />Choose from Google Drive
      </button>

      <form className="mt-6 border-t border-grid pt-5 text-left" onSubmit={(e) => { e.preventDefault(); if (link.trim()) onLink(link); }}>
        <p className="mb-2.5 text-[13px] text-ink-2">
          <b className="font-semibold text-ink">On iPhone or iPad?</b> Safari blocks the cookies Google&rsquo;s picker needs. If this account has picked the
          sheet before on any device, paste the sheet&rsquo;s link instead.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Paste the Google Sheets link"
            aria-label="Google Sheets link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-sunk px-3 py-2 text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-accent"
          />
          <button type="submit" className={BTN} disabled={!link.trim()}>Open</button>
        </div>
      </form>
    </Centered>
  );
}

export function LoadingScreen() {
  return (
    <section className="mt-[18vh] flex justify-center">
      <div className="size-7 animate-spin rounded-full border-[3px] border-grid border-t-accent motion-reduce:[animation-duration:3s]" aria-label="Loading" />
    </section>
  );
}
