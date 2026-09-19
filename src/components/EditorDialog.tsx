import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { editorFor, type EditRequest, type EditorDef, type Field, type Values } from '../lib/editors';
import { serialToIso, todaySerial } from '../lib/format';
import type { Model } from '../lib/model';
import { AccessError, AuthError, type SheetData } from '../lib/sheets';
import { ConflictError, type Plan } from '../lib/writer';
import { BTN, BTN_PRIMARY } from './ui';

const HINT = 'mb-3.5 text-[13px] text-ink-2';
const ERR = 'mt-2.5 text-[13px] text-bad';
const ACTIONS = 'mt-5 flex justify-end gap-2';
const INPUT = 'w-full rounded-lg border border-line bg-sunk px-3 py-2 text-ink focus:outline-2 focus:-outline-offset-1 focus:outline-accent';

interface Props {
  request: EditRequest;
  model: Model;
  data: SheetData;
  sheetTitle: string;
  onWrite: (plan: Plan) => Promise<void>;
  onClose: () => void;
}

type Review = { plan: Plan; warn: string[] };
type Failure = { message: string; details: string[] };

const initialValue = (f: Field) =>
  (f.type === 'date' ? serialToIso(f.value) : f.value === null || f.value === undefined ? '' : String(f.value));

/** Form → review (exact cells, before → after) → write. Nothing is written without the review. */
export function EditorDialog({ request, model, data, sheetTitle, onWrite, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const def = useMemo<EditorDef | Error>(() => {
    try { return editorFor(model, data, request); } catch (e) { return e as Error; }
  }, [model, data, request]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog ref={ref} className="m-auto w-[min(560px,calc(100vw-20px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_24px_64px_rgba(0,0,0,0.3)]" onClose={onClose}>
      <div className="max-h-[calc(100vh-60px)] overflow-y-auto p-5 sm:p-6">
        {def instanceof Error
          ? <Problem message={def.message} onClose={() => ref.current?.close()} />
          : <Flow def={def} sheetTitle={sheetTitle} onWrite={onWrite} onDone={() => ref.current?.close()} />}
      </div>
    </dialog>
  );
}

function Problem({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <>
      <p className={ERR} role="alert">{message}</p>
      <div className={ACTIONS}><button type="button" className={BTN} onClick={onClose}>Close</button></div>
    </>
  );
}

function Flow({ def, sheetTitle, onWrite, onDone }: { def: EditorDef; sheetTitle: string; onWrite: Props['onWrite']; onDone: () => void }) {
  const [vals, setVals] = useState<Values>(() => Object.fromEntries(def.fields.map((f) => [f.name, initialValue(f)])));
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [writing, setWriting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const first = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => { if (!review) first.current?.focus(); }, [review]);

  const change = (f: Field, value: string) => {
    setVals((prev) => {
      const next = { ...prev, [f.name]: value };
      // Changing a value moves its "valued on" date to today, unless you've set that date yourself
      if (f.bumps && !touched.has(f.bumps)) next[f.bumps] = serialToIso(todaySerial());
      return next;
    });
    setTouched((prev) => new Set(prev).add(f.name));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      setReview(def.build({ ...vals }));
      setFormError(null);
      setFailure(null);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const write = async () => {
    if (!review) return;
    setWriting(true);
    setFailure(null);
    try {
      await onWrite(review.plan);
      onDone();
    } catch (e) {
      if (e instanceof ConflictError) setFailure({ message: e.message, details: e.details });
      else if (e instanceof AuthError) setFailure({ message: 'Your Google session expired. Close this, sign in again, and retry.', details: [] });
      else if (e instanceof AccessError) setFailure({ message: e.message, details: [] });
      else setFailure({ message: `Write failed: ${(e as Error).message}`, details: [] });
    } finally {
      setWriting(false);
    }
  };

  if (review) {
    return (
      <div>
        <h3 className="mb-1.5 text-base font-semibold">Review: {review.plan.title}</h3>
        <p className={HINT}>These cells in <b>{sheetTitle}</b> will change. Nothing is written until you confirm.</p>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Field</th><th>Cell</th><th className="num">Before</th><th className="num">After</th></tr></thead>
            <tbody>
              {review.plan.changes.map((c) => (
                <tr key={`${c.a1}-${c.where}`}>
                  <td>{c.where}</td><td className="font-mono text-xs">{c.a1}</td>
                  <td className="num text-ink-3">{c.before}</td><td className="num strong">{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {review.warn.map((w) => <p className="mt-2.5 rounded-lg bg-warn-soft px-3 py-2 text-[13px]" key={w}>⚠ {w}</p>)}
        {failure && (
          <div className={ERR} role="alert">
            <b className="font-semibold">{failure.message}</b>
            {failure.details.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-ink">{failure.details.map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}
        <div className={ACTIONS}>
          <button type="button" className={BTN} disabled={writing} onClick={() => setReview(null)}>Back</button>
          <button type="button" className={BTN_PRIMARY} disabled={writing} onClick={() => void write()}>
            {writing ? 'Writing…' : 'Write to sheet'}
          </button>
        </div>
      </div>
    );
  }

  const mode = vals.mode;
  return (
    <form onSubmit={submit} noValidate>
      <h3 className="mb-1.5 text-base font-semibold">{def.title}</h3>
      {def.hint && <p className={HINT}>{def.hint}</p>}
      {def.fields.filter((f) => !f.showIf || f.showIf === mode).map((f, i) => (
        <label className="mb-3 grid gap-1" key={f.name}>
          <span className="text-xs font-medium text-ink-2">{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' ? (
            <select className={INPUT} ref={i === 0 ? first : undefined} name={f.name} value={vals[f.name]} onChange={(e) => change(f, e.target.value)}>
              {f.options?.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          ) : (
            <input
              className={INPUT}
              ref={i === 0 ? first : undefined}
              name={f.name}
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : 'text'}
              value={vals[f.name]}
              required={f.required}
              autoComplete="off"
              list={f.list ? `${f.name}-list` : undefined}
              onChange={(e) => change(f, e.target.value)}
            />
          )}
          {f.list && <datalist id={`${f.name}-list`}>{f.list.map((o) => <option key={o} value={o} />)}</datalist>}
          {f.hint && <small className="text-[11.5px] text-ink-3">{f.hint}</small>}
        </label>
      ))}
      {formError && <p className={ERR} role="alert">{formError}</p>}
      <div className={ACTIONS}>
        <button type="button" className={BTN} onClick={onDone}>Cancel</button>
        <button type="submit" className={BTN_PRIMARY}>Review changes</button>
      </div>
    </form>
  );
}
