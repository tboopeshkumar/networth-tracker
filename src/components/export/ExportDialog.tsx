import { useEffect, useRef, useState } from 'react';
import type { Grids, Model } from '../../lib/model';
import { VERSION } from '../../hooks/useUpdateCheck';
import { BTN, BTN_PRIMARY } from '../ui';
import { buildReport } from './report';

interface Props { model: Model; values: Grids; sheetTitle: string; onClose: () => void }

/**
 * Everything in the app as one text PDF, made on this device. Phones get the
 * share sheet (Save to Files, or straight into an AI app); desktops download.
 */
export function ExportDialog({ model, values, sheetTitle, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mask, setMask] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { reportPdf } = await import('./pdf');
      const blob = await reportPdf(buildReport(model, values, { sheetTitle, version: VERSION, mask }));
      const name = `networth-${new Date().toISOString().slice(0, 10)}${mask ? '-masked' : ''}.pdf`;
      const file = new File([blob], name, { type: 'application/pdf' });
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Net worth report' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      ref.current?.close();
    } catch (e) {
      // Closing the share sheet without choosing counts as a cancel, not a failure
      if ((e as Error).name !== 'AbortError') setError(`Couldn't create the PDF: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="m-auto w-[min(480px,calc(100vw-20px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_rgba(0,0,0,0.3)]" onClose={onClose}>
      <div className="p-5 sm:p-6">
        <h3 className="mb-1.5 text-base font-semibold">Export to PDF</h3>
        <p className="mb-3.5 text-[13px] text-ink-2">
          Every section, fully expanded, with exact amounts: summary, net worth lines, allocation, all holdings, cash and dues,
          rates, the monthly trend and the checks. Made on this device; nothing is uploaded.
        </p>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-sunk px-3 py-2.5 text-[13px]">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={mask} onChange={(e) => setMask(e.target.checked)} />
          <span>
            <b className="font-semibold">Hide names and account numbers</b>
            <span className="block text-xs text-ink-3">People become Person 1, 2…; folio, account and PRAN numbers keep only their last 4 digits. Amounts are unchanged.</span>
          </span>
        </label>
        <p className="mt-3 text-xs text-ink-3">The file holds your full financial picture: share it only with tools you trust.</p>
        {error && <p className="mt-2.5 text-[13px] text-bad" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BTN} disabled={busy} onClick={() => ref.current?.close()}>Cancel</button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create PDF'}</button>
        </div>
      </div>
    </dialog>
  );
}
