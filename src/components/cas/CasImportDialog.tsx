import { useEffect, useMemo, useRef, useState } from 'react';
import { casHoldings, matchCas, type CasHolding } from '../../lib/cas';
import { inr, isNum, num } from '../../lib/format';
import type { Model } from '../../lib/model';
import { V, planRowEdit, type Edit, type Plan } from '../../lib/writer';
import { AmcBadge, BTN, BTN_PRIMARY, PANEL, cx } from '../ui';
import { PasswordNeeded, pdfText } from './pdfText';

interface Props { model: Model; onWrite: (plan: Plan) => Promise<void>; onClose: () => void }

const same = (a: unknown, b: number | null) => isNum(a) && isNum(b) && Math.abs(a - b) < 0.0005;

/**
 * Updates fund units (and optionally invested amounts) from an MF Central
 * Consolidated Account Summary PDF. The PDF is read in this browser and never
 * uploaded; its password, if any, is used once and not kept.
 */
export function CasImportDialog({ model, onWrite, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [holdings, setHoldings] = useState<CasHolding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [withInvested, setWithInvested] = useState(false);

  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const hasUnits = model.tables.mf.cols.units !== undefined;

  const read = async (f: File, pw?: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = casHoldings(await pdfText(f, pw || undefined));
      if (!found.length) throw new Error('No fund holdings found. Is this an MF Central Consolidated Account Summary?');
      setHoldings(found);
      setNeedPassword(false);
    } catch (e) {
      if (e instanceof PasswordNeeded) { setNeedPassword(true); setError(e.wrong ? e.message : null); }
      else setError((e as Error).message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  const result = useMemo(() => (holdings ? matchCas(model, holdings) : null), [model, holdings]);
  const changes = (result?.matches ?? []).filter((m) => !same(m.rec.units, m.holding.units) || (withInvested && !same(m.rec.invested, m.holding.invested)));
  const chosen = changes.filter((m) => !skip.has(m.rec._key));

  const write = async () => {
    if (!chosen.length) return;
    const title = `Update ${chosen.length} fund${chosen.length > 1 ? 's' : ''} from CAS`;
    const plan: Plan = { title, changes: [], ops: [] };
    for (const m of chosen) {
      const edits: Record<string, Edit> = {};
      if (!same(m.rec.units, m.holding.units)) {
        edits.units = { value: V.number(m.holding.units), display: num(m.holding.units, 3), before: isNum(m.rec.units) ? num(m.rec.units, 3) : '—', label: `${String(m.rec.fund)} · Units` };
      }
      if (withInvested && isNum(m.holding.invested) && !same(m.rec.invested, m.holding.invested)) {
        edits.invested = { value: V.number(m.holding.invested), display: inr(m.holding.invested), before: inr(m.rec.invested), label: `${String(m.rec.fund)} · Invested` };
      }
      const p = planRowEdit(model, 'mf', m.rec, edits, title);
      plan.changes.push(...p.changes);
      plan.ops.push(...p.ops);
    }
    setBusy(true);
    setError(null);
    try {
      await onWrite(plan);
      ref.current?.close();
    } catch (e) {
      setError(`Nothing was written: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="m-auto w-[min(640px,calc(100vw-20px))] rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_rgba(0,0,0,0.3)]" onClose={onClose}>
      <div className="max-h-[calc(100vh-60px)] overflow-y-auto p-5 sm:p-6">
        <h3 className="mb-1.5 text-base font-semibold">Import from CAS</h3>
        <p className="mb-3.5 text-[13px] text-ink-2">
          Pick your MF Central <b className="font-semibold">Consolidated Account Summary</b> PDF. It's read on this device, nothing is
          uploaded, and funds are matched to your Mutual Funds tab by folio and name. You review every change before it's written.
        </p>

        {!hasUnits && <p className="mb-3 text-[13px] text-bad">Your Mutual Funds tab has no Units column yet, so there's nothing to update.</p>}

        {!holdings && hasUnits && (
          <div className="space-y-3">
            <input
              type="file" accept="application/pdf,.pdf"
              className="block w-full text-[13px] file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-sunk file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setNeedPassword(false); if (f) void read(f); }}
            />
            {needPassword && file && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void read(file, password); }}>
                <input
                  type="password" autoComplete="off" placeholder="PDF password" aria-label="PDF password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-sunk px-3 py-2 text-ink focus:outline-2 focus:outline-accent"
                />
                <button type="submit" className={BTN} disabled={!password || busy}>Open</button>
              </form>
            )}
            {busy && <p className="text-[13px] text-ink-3">Reading the statement…</p>}
          </div>
        )}

        {result && (
          <>
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px]">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={withInvested} onChange={(e) => setWithInvested(e.target.checked)} />
              Also update invested amounts from the statement
            </label>

            {changes.length ? (
              <div className={cx(PANEL, 'divide-y divide-line overflow-hidden')}>
                {changes.map((m) => {
                  const on = !skip.has(m.rec._key);
                  const toggle = () => setSkip((s) => { const n = new Set(s); if (on) n.add(m.rec._key); else n.delete(m.rec._key); return n; });
                  return (
                    <label key={m.rec._key} className="flex cursor-pointer items-center gap-3 bg-surface px-3 py-2.5 text-[13px]">
                      <input type="checkbox" className="size-4 flex-none accent-[var(--accent)]" checked={on} onChange={toggle} />
                      <AmcBadge fund={m.rec.fund} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{String(m.rec.fund)}</span>
                        <span className="block text-xs text-ink-3 tabular-nums">
                          {!same(m.rec.units, m.holding.units) && <>Units {isNum(m.rec.units) ? num(m.rec.units, 3) : '—'} → <b className="font-semibold text-ink">{num(m.holding.units, 3)}</b></>}
                          {withInvested && !same(m.rec.invested, m.holding.invested) && <>{!same(m.rec.units, m.holding.units) && ' · '}Invested {inr(m.rec.invested)} → <b className="font-semibold text-ink">{inr(m.holding.invested)}</b></>}
                          {m.by === 'name' && <span className="text-warn"> · matched by name</span>}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-good">Everything already matches the statement.</p>
            )}

            {(result.notInSheet.length > 0 || result.notInCas.length > 0) && (
              <div className="mt-3 space-y-1 text-xs text-ink-3">
                {result.notInSheet.length > 0 && <p>In the statement but not on your sheet: {result.notInSheet.map((h) => h.scheme).join('; ')}. Add them with + on Mutual funds.</p>}
                {result.notInCas.length > 0 && <p>On your sheet but not in this statement (left unchanged): {result.notInCas.map((r) => String(r.fund)).join('; ')}.</p>}
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-[13px] text-bad" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BTN} disabled={busy} onClick={() => ref.current?.close()}>{result ? 'Cancel' : 'Close'}</button>
          {result && changes.length > 0 && (
            <button type="button" className={BTN_PRIMARY} disabled={busy || !chosen.length} onClick={() => void write()}>
              {busy ? 'Writing…' : `Write ${chosen.length} to sheet`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
