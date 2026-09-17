import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { editorFor, type EditRequest, type EditorDef, type Field, type Values } from '../lib/editors';
import { serialToIso, todaySerial } from '../lib/format';
import type { Model } from '../lib/model';
import { AccessError, AuthError, type SheetData } from '../lib/sheets';
import { ConflictError, type Plan } from '../lib/writer';

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
    <dialog ref={ref} className="dlg" onClose={onClose}>
      <div className="dlg-body">
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
      <p className="err" role="alert">{message}</p>
      <div className="dlg-actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
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
      <div className="dlg-review">
        <h3>Review: {review.plan.title}</h3>
        <p className="hint">These cells in <b>{sheetTitle}</b> will change. Nothing is written until you confirm.</p>
        <div className="tablewrap">
          <table className="review">
            <thead><tr><th>Field</th><th>Cell</th><th className="num">Before</th><th className="num">After</th></tr></thead>
            <tbody>
              {review.plan.changes.map((c) => (
                <tr key={`${c.a1}-${c.where}`}>
                  <td>{c.where}</td><td className="mono">{c.a1}</td>
                  <td className="num muted">{c.before}</td><td className="num strong">{c.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {review.warn.map((w) => <p className="warn" key={w}>⚠ {w}</p>)}
        {failure && (
          <div className="err" role="alert">
            <b>{failure.message}</b>
            {failure.details.length > 0 && <ul>{failure.details.map((d) => <li key={d}>{d}</li>)}</ul>}
          </div>
        )}
        <div className="dlg-actions">
          <button type="button" className="btn" disabled={writing} onClick={() => setReview(null)}>Back</button>
          <button type="button" className="btn primary" disabled={writing} onClick={() => void write()}>
            {writing ? 'Writing…' : 'Write to sheet'}
          </button>
        </div>
      </div>
    );
  }

  const mode = vals.mode;
  return (
    <form className="dlg-form" onSubmit={submit} noValidate>
      <h3>{def.title}</h3>
      {def.hint && <p className="hint">{def.hint}</p>}
      {def.fields.filter((f) => !f.showIf || f.showIf === mode).map((f, i) => (
        <label className="field" key={f.name}>
          <span>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' ? (
            <select ref={i === 0 ? first : undefined} name={f.name} value={vals[f.name]} onChange={(e) => change(f, e.target.value)}>
              {f.options?.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          ) : (
            <input
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
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
      {formError && <p className="err" role="alert">{formError}</p>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary">Review changes</button>
      </div>
    </form>
  );
}
