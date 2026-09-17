// Google sign-in via Google Identity Services (token model).
//
// The access token lives only in this module's memory: never localStorage,
// never cookies. Reloading the tab discards it. Tokens last about an hour.

const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `openid email ${SCOPE_FILE}`;

let client: google.accounts.oauth2.TokenClient | null = null;
let token: string | null = null;
let expiresAt = 0;
let email: string | null = null;
let pending: { resolve: (email: string) => void; reject: (e: Error) => void } | null = null;

// One load per script, shared by every caller. Checking for an existing <script>
// tag isn't enough: a second caller would continue before the first finished
// loading (React runs startup effects twice in development).
const scripts = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let loading = scripts.get(src);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scripts.delete(src); // allow a retry
        s.remove();
        reject(new Error(`Couldn't load ${new URL(src).host} — check your connection or content blockers`));
      };
      document.head.appendChild(s);
    });
    scripts.set(src, loading);
  }
  return loading;
}

async function onToken(resp: google.accounts.oauth2.TokenResponse) {
  const p = pending;
  if (!p) return;
  try {
    if (resp.error) throw new Error(resp.error_description || resp.error);
    if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_FILE)) {
      throw new Error('Access to the chosen file was not granted, so the app can’t open your sheet.');
    }
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${resp.access_token}` },
    });
    if (!res.ok) throw new Error('Couldn’t read your Google account');
    const info = (await res.json()) as { email: string };
    token = resp.access_token;
    expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
    email = info.email;
    p.resolve(info.email);
  } catch (e) {
    p.reject(e as Error);
  }
}

export async function initAuth(clientId: string): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client');
  client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp) => void onToken(resp),
    error_callback: (err) => pending?.reject(new Error(
      err.type === 'popup_closed' ? 'Sign-in window was closed' : (err.message || 'Sign-in failed'))),
  });
}

/** Must be called from a click handler, or browsers block the popup. */
export function signIn(): Promise<string> {
  if (!client) return Promise.reject(new Error('Sign-in is still loading'));
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestAccessToken({ prompt: '' });
  });
}

export const getToken = (): string | null => (token && Date.now() < expiresAt ? token : null);
export const getEmail = (): string | null => email;

/** Forget the token locally. Access to the picked sheet is kept. */
export function signOut(): void {
  token = null;
  expiresAt = 0;
  email = null;
}

/** Revoke this app's access entirely (the sheet must be picked again). */
export function disconnect(): void {
  if (token) google.accounts.oauth2.revoke(token, () => {});
  signOut();
}
