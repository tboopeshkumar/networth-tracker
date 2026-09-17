// Build-time configuration, from .env.local (dev) or GitHub Actions variables
// (live site). Every value ends up in the published JavaScript, and that's
// fine: Google client IDs, API keys and project numbers are public by design,
// and emails are present only as hashes. See .env.example.

const env = import.meta.env;

const hashes = (s: string | undefined) =>
  (s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{64}$/.test(x));

export const CONFIG = {
  clientId: env.VITE_GOOGLE_CLIENT_ID ?? '',
  apiKey: env.VITE_GOOGLE_API_KEY ?? '',
  /** Google Cloud project NUMBER — the Picker needs it for drive.file */
  appId: env.VITE_GOOGLE_APP_ID ?? '',
  allowedHashes: hashes(env.VITE_ALLOWED_EMAIL_HASHES),
  editorHashes: hashes(env.VITE_EDITOR_EMAIL_HASHES),
  /** sign out and clear the page after this much inactivity */
  idleMinutes: Number(env.VITE_IDLE_MINUTES) || 20,
};

export const isConfigured = () => Boolean(CONFIG.clientId && CONFIG.apiKey && CONFIG.appId);
