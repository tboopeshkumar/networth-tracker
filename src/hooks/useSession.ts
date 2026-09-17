import { useCallback, useEffect, useState } from 'react';
import { CONFIG, isConfigured } from '../config';
import { accessFor } from '../lib/access';
import { disconnect, getToken, initAuth, signIn, signOut } from '../lib/auth';
import { pickSpreadsheet, rememberSheet, rememberedSheet } from '../lib/picker';
import { AccessError, AuthError, GoogleSheets, type SheetsBackend } from '../lib/sheets';
import { execute, loadAll, type Loaded, type Plan } from '../lib/writer';

export type Phase = 'booting' | 'setup' | 'signin' | 'pick' | 'loading' | 'ready';

export interface Identity { email: string; canEdit: boolean }
export interface Session { backend: SheetsBackend; loaded: Loaded }

type Toast = (message: string, kind?: 'ok' | 'err' | 'info') => void;

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
/** Dev-only: ?demo loads a local fixture. Compiled out of production builds. */
export const DEMO = import.meta.env.DEV && isLocal && new URLSearchParams(window.location.search).has('demo');
const EXPIRED = 'Your session expired — sign in again to continue.';

export function useSession(toast: Toast) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [setupMessage, setSetupMessage] = useState<string>();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Drop the token and every trace of the data from the page. */
  const lock = useCallback((message?: string) => {
    signOut();
    setSession(null);
    setIdentity(null);
    if (DEMO) { window.location.reload(); return; }
    setPhase('signin');
    if (message) toast(message, 'info');
  }, [toast]);

  const fail = useCallback((e: unknown) => {
    console.error(e);
    if (e instanceof AuthError) { lock(EXPIRED); return; }
    toast(e instanceof Error ? e.message : String(e), 'err');
  }, [lock, toast]);

  const open = useCallback(async (backend: SheetsBackend, email: string) => {
    setPhase('loading');
    try {
      const loaded = await loadAll(backend);
      setSession({ backend, loaded });
      setPhase('ready');
    } catch (e) {
      if (e instanceof AccessError) {
        rememberSheet(email, null);
        setPhase('pick');
        toast(e.message, 'err');
        return;
      }
      setPhase(getToken() ? 'pick' : 'signin');
      fail(e);
    }
  }, [fail, toast]);

  // Boot: demo fixture in development, otherwise load Google sign-in
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (DEMO) {
        try {
          const { DemoSheets } = await import('../lib/demoSheets');
          const backend = await DemoSheets.load(`${import.meta.env.BASE_URL}__demo/fixture.json`);
          if (cancelled) return;
          setIdentity({ email: 'demo', canEdit: !new URLSearchParams(window.location.search).has('viewer') });
          await open(backend, 'demo');
        } catch (e) {
          setSetupMessage(`Demo mode: ${(e as Error).message}`);
          setPhase('setup');
        }
        return;
      }
      if (!isConfigured()) { setPhase('setup'); return; }
      setPhase('signin');
      try {
        await initAuth(CONFIG.clientId);
        if (!cancelled) setAuthReady(true);
      } catch (e) {
        fail(e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, fail]);

  // Called from a click handler so the browser allows the sign-in popup
  const startSignIn = useCallback(() => {
    setBusy(true);
    signIn()
      .then(async (email) => {
        const access = accessFor(email, { allowed: CONFIG.allowedEmails, editors: CONFIG.editorEmails });
        if (!access.allowed) {
          signOut();
          throw new Error(`${email} isn't set up for this app.`);
        }
        setIdentity({ email, canEdit: access.canEdit });
        const sheet = rememberedSheet(email);
        if (sheet) await open(new GoogleSheets(sheet.id, getToken), email);
        else setPhase('pick');
      })
      .catch(fail)
      .finally(() => setBusy(false));
  }, [open, fail]);

  const pick = useCallback(async () => {
    const token = getToken();
    if (!token || !identity) { lock(EXPIRED); return; }
    try {
      const sheet = await pickSpreadsheet({ apiKey: CONFIG.apiKey, appId: CONFIG.appId, token });
      if (!sheet) return;
      rememberSheet(identity.email, sheet);
      await open(new GoogleSheets(sheet.id, getToken), identity.email);
    } catch (e) {
      fail(e);
    }
  }, [identity, lock, open, fail]);

  const refresh = useCallback(async () => {
    if (!session) return;
    if (!DEMO && !getToken()) { lock(EXPIRED); return; }
    try {
      const loaded = await loadAll(session.backend);
      setSession({ ...session, loaded });
      toast('Up to date');
    } catch (e) {
      fail(e);
    }
  }, [session, lock, fail, toast]);

  /** Errors propagate to the editor dialog, which explains them. */
  const write = useCallback(async (plan: Plan) => {
    if (!session) throw new Error('Nothing is loaded');
    await execute(session.backend, plan);
    const loaded = await loadAll(session.backend);
    setSession((s) => (s ? { ...s, loaded } : s));
    toast('Saved to your sheet');
  }, [session, toast]);

  const switchSheet = useCallback(() => {
    if (!identity) return;
    rememberSheet(identity.email, null);
    setSession(null);
    setPhase('pick');
  }, [identity]);

  const revoke = useCallback(() => {
    if (!window.confirm('Revoke this app’s access to your Google account? You will need to sign in and pick the sheet again.')) return;
    if (identity) rememberSheet(identity.email, null);
    disconnect();
    lock('Access revoked.');
  }, [identity, lock]);

  const tokenValid = useCallback(() => DEMO || getToken() !== null, []);

  return {
    phase, setupMessage, identity, session, authReady, busy,
    startSignIn, pick, refresh, write, switchSheet, revoke, lock, tokenValid,
  };
}
