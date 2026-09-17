// Build-time configuration, from .env.local (dev) or GitHub Actions variables
// (live site). See .env.example.
//
// Everything here ends up inside the published JavaScript, so treat it as
// public: the Google client ID, API key and project number are public by
// design, and the email lists are readable by anyone who opens the site.
// Nothing here controls access to your data — Google does that.

const env = import.meta.env;

const emails = (s: string | undefined) =>
  (s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export const CONFIG = {
  clientId: env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: env.VITE_GOOGLE_API_KEY ?? '',
  /** Google Cloud project NUMBER — the Picker needs it for drive.file */
  appId: env.VITE_GOOGLE_APP_ID ?? '',
  /** who may use the app; empty means anyone Google lets sign in */
  allowedEmails: emails(env.VITE_ALLOWED_EMAILS),
  /** who sees Edit and Add; empty means every allowed account */
  editorEmails: emails(env.VITE_EDITOR_EMAILS),
  /** sign out and clear the page after this much inactivity */
  idleMinutes: Number(env.VITE_IDLE_MINUTES) || 20,
};

export const isConfigured = () => Boolean(CONFIG.clientId && CONFIG.apiKey && CONFIG.appId);
