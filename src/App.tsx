import { useCallback, useState } from 'react';
import { EditorDialog } from './components/EditorDialog';
import { Header } from './components/Header';
import { LoadingScreen, PickScreen, SetupScreen, SignInScreen } from './components/Screens';
import { useToast } from './components/Toast';
import { Dashboard } from './components/dashboard/Dashboard';
import { CONFIG } from './config';
import { useIdleLock } from './hooks/useIdleLock';
import { DEMO, useSession } from './hooks/useSession';
import type { EditRequest } from './lib/editors';

export function App() {
  const toast = useToast();
  const s = useSession(toast);
  const [editing, setEditing] = useState<EditRequest | null>(null);
  const canEdit = s.identity?.canEdit ?? false;

  useIdleLock(s.phase === 'ready' && !DEMO, CONFIG.idleMinutes, () => {
    setEditing(null);
    s.lock(`Signed out after ${CONFIG.idleMinutes} minutes of inactivity.`);
  });

  const onEdit = useCallback((req: EditRequest) => {
    if (!canEdit) { toast('This account has view-only access.', 'err'); return; }
    if (!s.tokenValid()) { s.lock('Your session expired — sign in again to continue.'); return; }
    setEditing(req);
  }, [canEdit, s, toast]);

  const session = s.phase === 'ready' ? s.session : null;

  return (
    <>
      {DEMO && <div className="demo-banner">Demo mode — local fixture, nothing is sent to Google</div>}
      <Header
        sheetTitle={session?.backend.title}
        email={s.identity?.email}
        canEdit={canEdit}
        demo={DEMO}
        showActions={!!session}
        onRefresh={() => void s.refresh()}
        onSwitchSheet={s.switchSheet}
        onDisconnect={s.revoke}
        onSignOut={() => { setEditing(null); s.lock('Signed out.'); }}
      />
      <main className="wrap">
        {s.phase === 'setup' && <SetupScreen message={s.setupMessage} />}
        {s.phase === 'signin' && <SignInScreen ready={s.authReady} busy={s.busy} onSignIn={s.startSignIn} />}
        {s.phase === 'pick' && <PickScreen onPick={() => void s.pick()} onLink={(link) => void s.openLink(link)} />}
        {(s.phase === 'loading' || s.phase === 'booting') && <LoadingScreen />}
        {session && <Dashboard loaded={session.loaded} canEdit={canEdit} onEdit={onEdit} />}
      </main>
      {editing && session && (
        <EditorDialog
          request={editing}
          model={session.loaded.model}
          data={session.loaded.data}
          sheetTitle={session.backend.title}
          onWrite={s.write}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
