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

export function PickScreen({ onPick }: { onPick: () => void }) {
  return (
    <section className="center card">
      <h1>Choose your sheet</h1>
      <p>Pick your net worth spreadsheet. The app only gets access to the one file you choose — nothing else in your Drive.</p>
      <button type="button" className="btn primary big-btn" onClick={onPick}>Choose from Google Drive</button>
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
