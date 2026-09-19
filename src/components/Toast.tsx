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
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={`fixed bottom-[calc(22px+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl px-4 py-2.5 text-[13px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.25)] ${toast.kind === 'err' ? 'bg-bad text-white' : 'bg-ink text-page'}`}
        >
          {toast.message}
        </div>
      )}
    </ToastContext>
  );
}
