import { IconAlertCircle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { cx } from './ui';

type Kind = 'ok' | 'err' | 'info';
type Show = (message: string, kind?: Kind) => void;
interface Message { message: string; kind: Kind; id: number }

const ToastContext = createContext<Show>(() => {});
const CurrentContext = createContext<{ toast: Message | null; dismiss: () => void }>({ toast: null, dismiss: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Message | null>(null);
  const show = useCallback<Show>((message, kind = 'ok') => setToast({ message, kind, id: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext value={show}>
      <CurrentContext value={{ toast, dismiss }}>{children}</CurrentContext>
    </ToastContext>
  );
}

const LOOK = {
  err: { box: 'border-bad/40 bg-bad-soft', icon: <IconAlertCircle size={18} stroke={1.75} className="flex-none text-bad" aria-hidden="true" /> },
  info: { box: 'border-line bg-surface', icon: <IconInfoCircle size={18} stroke={1.75} className="flex-none text-ink-3" aria-hidden="true" /> },
  ok: { box: 'border-line bg-surface', icon: <IconCircleCheck size={18} stroke={1.75} className="flex-none text-good" aria-hidden="true" /> },
};

export function ToastCard({ message, kind, onDismiss }: { message: string; kind: Kind; onDismiss: () => void }) {
  const look = LOOK[kind];
  return (
    <div
      role={kind === 'err' ? 'alert' : 'status'}
      className={cx('pointer-events-auto flex max-w-[640px] items-start gap-2 rounded-lg border py-2 pl-3 pr-1.5 text-[13px] text-ink shadow-[0_6px_20px_rgba(0,0,0,0.16)]', look.box)}
    >
      <span className="mt-px">{look.icon}</span>
      <span className="min-w-0 flex-1 py-px">{message}</span>
      <button type="button" className="grid size-6 flex-none cursor-pointer place-items-center rounded-md text-ink-3 hover:text-ink" aria-label="Dismiss" onClick={onDismiss}>
        <IconX size={14} stroke={2} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The current message, hanging just below its positioned parent (the sticky header), so it stays in view on scroll. */
export function ToastHost() {
  const { toast, dismiss } = useContext(CurrentContext);
  if (!toast) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-3 pt-2">
      <ToastCard key={toast.id} message={toast.message} kind={toast.kind} onDismiss={dismiss} />
    </div>
  );
}
