/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_GOOGLE_APP_ID?: string;
  /** Comma-separated addresses. Empty: no app-level check. */
  readonly VITE_ALLOWED_EMAILS?: string;
  /** Comma-separated addresses. Empty: every allowed account may edit. */
  readonly VITE_EDITOR_EMAILS?: string;
  readonly VITE_IDLE_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
