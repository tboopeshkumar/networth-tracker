import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'err' | 'info';
type Show = (message: string, kind?: Kind) => void;

const ToastContext = createContext<Show>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: Kind; id: number } | null>(null);
  const show = useCallback<Show>((message, kind = 'ok') => setToast({ message, kind, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext value={show}>
      {children}
      {toast && <div key={toast.id} className={`toast ${toast.kind}`} role="status">{toast.message}</div>}
    </ToastContext>
  );
}
