// Google sign-in via Google Identity Services (token model).
//
// The access token lives only in this module's memory: never localStorage,
// never cookies. Closing or reloading the tab discards it. Tokens expire
// after about an hour; the app then asks you to continue.

const SCOPE_FILE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `openid email ${SCOPE_FILE}`;

let client = null;
let token = null;
let expiresAt = 0;
let email = null;
let pending = null;

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${new URL(src).host} — check your connection or content blockers`));
    document.head.appendChild(s);
  });
}

export async function initAuth(clientId) {
  await loadScript('https://accounts.google.com/gsi/client');
  client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (resp) => pending?.onToken(resp),
    error_callback: (err) => pending?.reject(new Error(
      err.type === 'popup_closed' ? 'Sign-in window was closed' : (err.message || 'Sign-in failed'))),
  });
}

// Must be called from a click handler, or browsers block the popup.
export function signIn() {
  if (!client) return Promise.reject(new Error('Sign-in is still loading'));
  return new Promise((resolve, reject) => {
    pending = {
      reject,
      onToken: async (resp) => {
        try {
          if (resp.error) throw new Error(resp.error_description || resp.error);
          if (!google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_FILE)) {
            throw new Error('Access to the chosen file was not granted, so the app can’t open your sheet.');
          }
          const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Couldn’t read your Google account'))));
          token = resp.access_token;
          expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
          email = info.email;
          resolve({ email });
        } catch (e) {
          reject(e);
        }
      },
    };
    client.requestAccessToken({ prompt: '' });
  });
}

export const getToken = () => (token && Date.now() < expiresAt ? token : null);
export const getEmail = () => email;

// Forget the token locally. The app keeps its access to the picked sheet, so
// next time you won't need to pick it again.
export function signOut() {
  token = null;
  expiresAt = 0;
  email = null;
}

// Revoke this app's access entirely (you'll need to re-pick the sheet).
export function disconnect() {
  if (token) google.accounts.oauth2.revoke(token, () => {});
  signOut();
}
