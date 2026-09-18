import { useState } from 'react';

export function SetupScreen({ message }: { message?: string }) {
  return (
    <section className="center card">
      <h1>Almost there</h1>
      <p>
        {message ?? (
          <>Add your Google client ID, API key and project number to <code>.env.local</code> (copy <code>.env.example</code>).
            The README walks through it step by step.</>
        )}
      </p>
    </section>
  );
}

export function SignInScreen({ ready, busy, onSignIn }: { ready: boolean; busy: boolean; onSignIn: () => void }) {
  return (
    <section className="center card">
      <h1>Your net worth, from your own sheet</h1>
      <p>Sign in with Google to open it. The data stays in your Google Sheet: this page stores nothing, and forgets everything when you close it.</p>
      <button type="button" className="btn primary big-btn" disabled={!ready || busy} onClick={onSignIn}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
    </section>
  );
}

export function PickScreen({ onPick, onLink }: { onPick: () => void; onLink: (link: string) => void }) {
  const [link, setLink] = useState('');
  return (
    <section className="center card">
      <h1>Choose your sheet</h1>
      <p>Pick your net worth spreadsheet. The app only gets access to the one file you choose — nothing else in your Drive.</p>
      <button type="button" className="btn primary big-btn" onClick={onPick}>Choose from Google Drive</button>

      <form className="link-open" onSubmit={(e) => { e.preventDefault(); if (link.trim()) onLink(link); }}>
        <p className="hint">
          <b>On iPhone or iPad?</b> Safari blocks the cookies Google&rsquo;s picker needs. If this account has picked the
          sheet before on any device, paste the sheet&rsquo;s link instead.
        </p>
        <div className="link-row">
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
          />
          <button type="submit" className="btn" disabled={!link.trim()}>Open</button>
        </div>
      </form>
    </section>
  );
}

export function LoadingScreen() {
  return (
    <section className="center">
      <div className="spinner" aria-label="Loading" />
    </section>
  );
}
