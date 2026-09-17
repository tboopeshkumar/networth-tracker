import { useMemo } from 'react';
import { inr, isNum } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Ledger, Model, Row } from '../../lib/model';
import { Card, EditButton, type OnEdit } from '../ui';
import { GROUP_ORDER, buildViews, type View } from './holdingViews';

interface Props {
  model: Model;
  canEdit: boolean;
  onEdit: OnEdit;
  open: ReadonlySet<ViewId>;
  onToggle: (id: ViewId, open: boolean) => void;
  flash: ViewId | null;
  sectionRef: (id: ViewId, el: HTMLDetailsElement | null) => void;
}

/** Grouped, collapsible sections; closed headers still show count and total. */
export function Holdings({ model, canEdit, onEdit, open, onToggle, flash, sectionRef }: Props) {
  const views = useMemo(() => buildViews(model), [model]);
  const groups = GROUP_ORDER
    .map((g) => [g, views.filter((v) => v.group === g)] as const)
    .filter(([, vs]) => vs.length);

  const addButtons = canEdit
    ? (
      <div className="add-row">
        <button type="button" className="btn" onClick={() => onEdit({ kind: 'add', id: 'mf' })}>+ Fund</button>
        <button type="button" className="btn" onClick={() => onEdit({ kind: 'add', id: 'fd' })}>+ FD</button>
        <button type="button" className="btn" onClick={() => onEdit({ kind: 'add', id: 'goldUae' })}>+ Gold</button>
        <button type="button" className="btn" onClick={() => onEdit({ kind: 'add', id: 'silverUae' })}>+ Silver</button>
      </div>
    )
    : <span className="pill">View only</span>;

  return (
    <Card title="Holdings" sub={canEdit ? 'Edits are written straight to your sheet, after you review them' : 'Read-only view'} action={addButtons}>
      <div className="holdings">
        {groups.map(([label, vs]) => (
          <div className="hgroup" key={label}>
            <div className="hgroup-label">{label}</div>
            {vs.map((v) => (
              <details
                key={v.id}
                ref={(el) => sectionRef(v.id, el)}
                className={`hsec${flash === v.id ? ' flash' : ''}`}
                open={open.has(v.id)}
                onToggle={(e) => onToggle(v.id, e.currentTarget.open)}
              >
                <summary>
                  <span className="hsec-name">{v.name}</span>
                  <span className="hsec-count">{v.recs.length}</span>
                  <span className="hsec-total">{v.total}</span>
                </summary>
                {/* Render the body only when open: long ledgers stay cheap */}
                {open.has(v.id) && (
                  <div className="hsec-body">
                    <Section view={v} canEdit={canEdit} onEdit={onEdit} />
                  </div>
                )}
              </details>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Section({ view: v, canEdit, onEdit }: { view: View; canEdit: boolean; onEdit: OnEdit }) {
  const edit = canEdit ? v.edit : undefined;
  return (
    <>
      {v.ledger && <LedgerSummary ledger={v.ledger} canEdit={canEdit} onEdit={onEdit} />}

      <div className="pos-list only-narrow">
        {v.recs.map((r: Row) => {
          const c = v.card(r);
          return (
            <div className="hcard" key={r._key}>
              <div className="pos-top"><span className="pos-name">{c.title}</span><span className="pos-val">{c.value}</span></div>
              <div className="pos-meta">
                <span>{c.sub}</span>
                {c.right && <span className={c.right.tone}>{c.right.text}</span>}
              </div>
              {(c.foot || edit) && (
                <div className="hcard-foot">
                  <span>{c.foot}</span>
                  {edit && <EditButton request={edit(r)} onEdit={onEdit} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="tablewrap only-wide">
        <table>
          <thead>
            <tr>
              {v.columns.map((col) => <th key={col.head} className={col.num ? 'num' : undefined}>{col.head}</th>)}
              {edit && <th />}
            </tr>
          </thead>
          <tbody>
            {v.recs.map((r: Row) => (
              <tr key={r._key}>
                {v.columns.map((col) => (
                  <td key={col.head} className={[col.num && 'num', col.name && 'name', col.className?.(r)].filter(Boolean).join(' ') || undefined}>
                    {col.render(r)}
                  </td>
                ))}
                {edit && <td className="act"><EditButton request={edit(r)} onEdit={onEdit} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LedgerSummary({ ledger: L, canEdit, onEdit }: { ledger: Ledger; canEdit: boolean; onEdit: OnEdit }) {
  const drift = isNum(L.balance) && isNum(L.recorded) && Math.abs(L.balance - L.recorded) > 1;
  return (
    <div className="ledger-sum">
      <span>Ledger balance <b>{inr(L.balance)}</b></span>
      <span className="muted">{L.rows.length} entries</span>
      {drift && isNum(L.balance) && isNum(L.recorded) ? (
        <>
          <span className="down">
            {`Receivables records ${inr(L.recorded)} — ${inr(Math.abs(L.balance - L.recorded))} ${L.balance > L.recorded ? 'less' : 'more'} than this ledger`}
          </span>
          {canEdit && !L.recordedFormula && L.balanceRef && (
            <EditButton request={{ kind: 'link', sheet: L.sheet }} onEdit={onEdit}>Link to ledger</EditButton>
          )}
        </>
      ) : (
        <span className="up">✓ matches Receivables</span>
      )}
    </div>
  );
}
