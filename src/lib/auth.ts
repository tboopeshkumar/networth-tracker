// Google sign-in, in this tab: the page goes to Google's sign-in and Google
// sends it back with an access token in the URL fragment (OAuth's token flow
// for browser apps). No popup window.
//
// The token lives only in this module's memory: never localStorage, never
// cookies. It's taken out of the address bar as soon as the page loads, and a
// random `state` kept for the trip proves the reply answers this tab's own
// request. Reloading the tab discards it. Tokens last about an hour.

const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `openid email ${SCOPE_FILE}`;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
/** The request's random state, for the round trip; this tab only. */
const STATE_KEY = 'networth.signin';

let token: string | null = null;
let expiresAt = 0;
let email: string | null = null;

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

/** Google's sign-in library, used here only to revoke access. Sign-in itself doesn't need it. */
export function initAuth(): Promise<void> {
  return loadScript('https://accounts.google.com/gsi/client');
}

/** Where Google sends this tab back: the app's own address. Must be an authorized redirect URI of the OAuth client. */
export const returnUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/** Google's sign-in address for this app. Pure, so it can be tested. */
export function authUrl(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'token',
    scope: SCOPES, include_granted_scopes: 'true', state,
  });
  return `${AUTH_URL}?${p}`;
}

/** Leaves the app for Google's sign-in; it comes back to returnUrl(). */
export function signIn(clientId: string): void {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(STATE_KEY, state);
  window.location.assign(authUrl(clientId, returnUrl(), state));
}

export type Reply =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'token'; token: string; expiresIn: number; scope: string };

/** What Google's reply in the URL fragment says. Pure, so it can be tested. */
export function readReply(hash: string, expectedState: string | null): Reply {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (!p.has('access_token') && !p.has('error')) return { kind: 'none' };
  // A reply this tab didn't ask for (an old link, or someone else's) is ignored
  if (!expectedState || p.get('state') !== expectedState) return { kind: 'error', message: 'That sign-in didn’t start here. Sign in again.' };
  const error = p.get('error');
  if (error) return { kind: 'error', message: error === 'access_denied' ? 'Sign-in was cancelled.' : `Sign-in failed (${error}).` };
  return { kind: 'token', token: p.get('access_token')!, expiresIn: Number(p.get('expires_in')) || 3600, scope: p.get('scope') ?? '' };
}

let returned: Promise<string | null> | null | undefined;

/**
 * When this page load is Google sending the tab back from sign-in: the account
 * it confirmed (or why not). Null on an ordinary load. The reply is read once
 * and the same answer given to every caller.
 */
export function returnedSignIn(): Promise<string | null> | null {
  if (returned === undefined) returned = readReply(window.location.hash, 'any').kind === 'none' ? null : completeSignIn();
  return returned;
}

/** Takes the token out of the address bar, checks it, and returns the account's email. */
async function completeSignIn(): Promise<string | null> {
  const expected = sessionStorage.getItem(STATE_KEY);
  const reply = readReply(window.location.hash, expected);
  if (reply.kind === 'none') return null;
  // Out of the address bar and the tab's history before anything else
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  sessionStorage.removeItem(STATE_KEY);
  if (reply.kind === 'error') throw new Error(reply.message);
  if (!reply.scope.split(' ').includes(SCOPE_FILE)) {
    throw new Error('Access to the chosen file was not granted, so the app can’t open your sheet.');
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${reply.token}` } });
  if (!res.ok) throw new Error('Couldn’t read your Google account');
  const info = (await res.json()) as { email: string };
  token = reply.token;
  expiresAt = Date.now() + (reply.expiresIn - 60) * 1000;
  email = info.email;
  return info.email;
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
  if (token && typeof google !== 'undefined') google.accounts.oauth2.revoke(token, () => {});
  signOut();
}
