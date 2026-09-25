import { IconCheck, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { inr, isNum } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Ledger, Model, Row } from '../../lib/model';
import { Card, DeleteButton, EditButton, PANEL, Pill, cx, type OnEdit } from '../ui';
import { GoldValuation } from './GoldValuation';
import { GROUP_ORDER, JEWELLERY_GROUP, buildViews, groupNote, type View } from './holdingViews';

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

  const viewOnly = canEdit ? undefined : <Pill>View only</Pill>;

  return (
    <Card title="Holdings" sub={canEdit ? 'Edits are written straight to your sheet, after you review them' : 'Read-only view'} action={viewOnly}>
      <div className="space-y-5">
        {groups.map(([label, vs]) => (
          <div key={label}>
            <div className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{label}</div>
            {groupNote(model, label) && <p className="-mt-1 mb-2 px-0.5 text-xs text-ink-2">{groupNote(model, label)}</p>}
            {label === JEWELLERY_GROUP && model.jewellery && <GoldValuation v={model.jewellery.valuation} feed={model.ratesFeed} />}
            <div className="space-y-1.5">
              {vs.map((v) => (
                <details
                  key={v.id}
                  ref={(el) => sectionRef(v.id, el)}
                  className={cx('group scroll-mt-20 rounded-xl border border-line bg-surface', flash === v.id && 'flash')}
                  open={open.has(v.id)}
                  onToggle={(e) => onToggle(v.id, e.currentTarget.open)}
                >
                  <summary className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-sunk group-open:rounded-b-none group-open:border-b group-open:border-grid">
                    <IconChevronRight size={16} stroke={2} className="flex-none text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    <span className="min-w-0 shrink-0 truncate font-medium">{v.name}</span>
                    {v.note && <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{v.note}</span>}
                    {/* On phones a dated header needs the room more than the count does */}
                    <span className={cx('rounded-full bg-sunk px-2 text-[11px] leading-[18px] text-ink-3 tabular-nums', !v.note && 'ml-auto', v.note && 'hidden sm:inline')}>{v.recs.length}</span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{v.total}</span>
                    {canEdit && v.add && (
                      <button
                        type="button"
                        className="-my-1 -mr-1.5 grid size-7 flex-none cursor-pointer place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunk hover:text-accent"
                        aria-label={`Add to ${v.name}`}
                        title={`Add to ${v.name}`}
                        // Inside <summary>: don't also open or close the section
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(v.add!); }}
                      >
                        <IconPlus size={16} stroke={2} aria-hidden="true" />
                      </button>
                    )}
                  </summary>
                  {/* Render the body only when open: long ledgers stay cheap */}
                  {open.has(v.id) && (
                    <div className="px-3 pb-2.5 pt-2">
                      <Section view={v} canEdit={canEdit} onEdit={onEdit} />
                    </div>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Section({ view: v, canEdit, onEdit }: { view: View; canEdit: boolean; onEdit: OnEdit }) {
  const edit = canEdit ? v.edit : undefined;
  const remove = canEdit ? v.remove : undefined;
  const actions = (r: Row) => (
    <span className="inline-flex items-center">
      {edit && <EditButton request={edit(r)} onEdit={onEdit} />}
      {remove && <DeleteButton request={remove(r)} onEdit={onEdit} />}
    </span>
  );
  return (
    <>
      {v.ledger && <LedgerSummary ledger={v.ledger} canEdit={canEdit} onEdit={onEdit} />}
      {v.lead}

      {/* phones: one card per record */}
      <div className="md:hidden">
        {v.recs.map((r: Row) => {
          const c = v.card(r);
          // With nothing else to show beside the sub line, Edit sits there instead of on a row of its own
          const inlineEdit = edit && !c.foot && !c.right;
          return (
            <div className="border-b border-grid py-2.5 last:border-0" key={r._key}>
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 font-medium">{c.title}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{c.value}</span>
              </div>
              <div className="mt-0.5 flex min-h-6 items-center justify-between gap-3 text-xs text-ink-3">
                <span className="min-w-0">{c.sub}</span>
                {inlineEdit && <span className="-my-1 -mr-2">{actions(r)}</span>}
                {c.right && (c.right.tone
                  ? <Pill tone={c.right.tone as 'up' | 'down'}>{c.right.text}</Pill>
                  : <span className="whitespace-nowrap tabular-nums">{c.right.text}</span>)}
              </div>
              {(c.foot || (edit && !inlineEdit)) && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] text-ink-3">
                  <span className="min-w-0 truncate">{c.foot}</span>
                  {edit && actions(r)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* wider screens: the full table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="tbl">
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
                {edit && <td className="act">{actions(r)}</td>}
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
    <div className={cx(PANEL, 'mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 py-2 text-[13px]')}>
      <span>Ledger balance <b className="font-semibold tabular-nums">{inr(L.balance)}</b></span>
      <span className="text-ink-3">{L.rows.length} entries</span>
      {drift && isNum(L.balance) && isNum(L.recorded) ? (
        <>
          <span className="text-bad">
            {`Receivables records ${inr(L.recorded)} — ${inr(Math.abs(L.balance - L.recorded))} ${L.balance > L.recorded ? 'less' : 'more'} than this ledger`}
          </span>
          {canEdit && !L.recordedFormula && L.balanceRef && (
            <span className="ml-auto"><EditButton request={{ kind: 'link', sheet: L.sheet }} onEdit={onEdit}>Link to ledger</EditButton></span>
          )}
        </>
      ) : (
        <Pill tone="up"><IconCheck size={13} stroke={2.25} aria-hidden="true" />matches Receivables</Pill>
      )}
    </div>
  );
}
