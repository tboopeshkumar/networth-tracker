import { IconArrowsSort, IconCheck, IconChevronRight, IconMenu2, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { inr, isNum } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Ledger, Model, Row } from '../../lib/model';
import { Amount, BTN, BTN_GHOST, BTN_PRIMARY, Card, DeleteButton, EditButton, GROUP_SLOT, PANEL, Pill, cx, slotColor, tint, type OnEdit } from '../ui';
import { GoldValuation } from './GoldValuation';
import { GROUP_ORDER, JEWELLERY_GROUP, buildViews, groupInr, groupNote, holdersIn, rowsFor, type View } from './holdingViews';

interface Props {
  model: Model;
  canEdit: boolean;
  onEdit: OnEdit;
  open: ReadonlySet<ViewId>;
  onToggle: (id: ViewId, open: boolean) => void;
  flash: ViewId | null;
  sectionRef: (id: ViewId, el: HTMLDetailsElement | null) => void;
  /** show just this group, as its own card titled with its name */
  only?: string;
  /** groups to leave out (shown in a card of their own elsewhere) */
  except?: string[];
}

/** Grouped, collapsible sections; closed headers still show count and total. */
export function Holdings({ model, canEdit, onEdit, open, onToggle, flash, sectionRef, only, except = [] }: Props) {
  const views = useMemo(() => buildViews(model), [model]);
  const groups = GROUP_ORDER
    .filter((g) => (only ? g === only : !except.includes(g)))
    .map((g) => [g, views.filter((v) => v.group === g)] as const)
    .filter(([, vs]) => vs.length);
  if (!groups.length) return null;

  const viewOnly = canEdit ? undefined : <Pill>View only</Pill>;
  const title = only
    ? <span className="inline-flex items-center gap-2"><span className="inline-block size-2.5 rounded-full" style={{ background: slotColor(GROUP_SLOT[only] ?? 5) }} />{only}</span>
    : 'Holdings';
  const sub = only
    ? groupNote(model, only) ?? undefined
    : canEdit ? 'Edits are written straight to your sheet, after you review them' : 'Read-only view';

  return (
    <Card title={title} sub={sub} action={viewOnly}>
      <div className="space-y-6">
        {groups.map(([label, vs], gi) => (
          <div key={label}>
            {/* Each group opens with a band in its colour, edge to edge, with its total when it has one */}
            {!only && <GroupBand label={label} note={groupNote(model, label)} total={groupInr(vs)} />}
            {label === JEWELLERY_GROUP && model.jewellery && <GoldValuation v={model.jewellery.valuation} feed={model.ratesFeed} />}
            {/* Sections run edge to edge of the card, like All positions: rows split by
                hairlines, the group's colour as a stripe at the left edge */}
            {/* The last list runs to the card's bottom edge, its corners following the card's */}
            <div className={cx('-mx-4 sm:-mx-5', only && 'border-t border-line', gi === groups.length - 1 ? '-mb-4 overflow-hidden rounded-b-xl sm:-mb-5' : 'border-b border-line')}>
              {vs.map((v) => (
                <details
                  key={v.id}
                  ref={(el) => sectionRef(v.id, el)}
                  className={cx('group scroll-mt-20 bg-surface [&+&]:border-t [&+&]:border-t-line', flash === v.id && 'flash')}
                  style={{ ['--stripe' as string]: slotColor(GROUP_SLOT[label] ?? 5) }}
                  open={open.has(v.id)}
                  onToggle={(e) => onToggle(v.id, e.currentTarget.open)}
                >
                  {/* The group colour is a short bar inset in each row, so the card's rounded corners never clip it */}
                  <summary className="relative flex cursor-pointer select-none items-center gap-2.5 px-4 py-3 transition-colors before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-[var(--stripe)] hover:bg-sunk group-open:border-b group-open:border-grid sm:px-5">
                    <IconChevronRight size={16} stroke={2} className="flex-none text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    {/* A long name gives way before the figures do */}
                    <span className="min-w-0 truncate font-medium">{v.name}</span>
                    {v.note && <span className="flex-none text-xs text-ink-3">{v.note}</span>}
                    {/* Add sits by the name, so every section's total ends at the same right edge */}
                    {canEdit && v.add && (
                      <button
                        type="button"
                        className="-my-1 -ml-1 grid size-7 flex-none cursor-pointer place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunk hover:text-accent"
                        aria-label={`Add to ${v.name}`}
                        title={`Add to ${v.name}`}
                        // Inside <summary>: don't also open or close the section
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(v.add!); }}
                      >
                        <IconPlus size={16} stroke={2} aria-hidden="true" />
                      </button>
                    )}
                    <span className="ml-auto flex flex-none items-center gap-2.5">
                      {/* On phones a dated header needs the room more than the count does */}
                      <span className={cx('rounded-full bg-sunk px-2 text-[11px] leading-[18px] text-ink-3 tabular-nums', v.note && 'hidden sm:inline')}>{v.recs.length}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">{v.total}</span>
                    </span>
                  </summary>
                  {/* Render the body only when open: long ledgers stay cheap */}
                  {open.has(v.id) && (
                    <div className="bg-sunk/40 px-4 pb-2.5 pt-2 sm:px-5">
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

/** A group's heading: a tinted band across the card with a solid bar in the group's colour, its name at the left and its total at the right. */
function GroupBand({ label, note, total }: { label: string; note: string | null; total: number | undefined }) {
  return (
    <div
      className="relative -mx-4 flex items-center gap-3 border-y border-line px-4 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[var(--band)] sm:-mx-5 sm:px-5"
      style={{ ...tint(GROUP_SLOT[label] ?? 5), ['--band' as string]: slotColor(GROUP_SLOT[label] ?? 5) }}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold">{label}</h3>
        {note && <p className="text-xs opacity-80">{note}</p>}
      </div>
      {total !== undefined && <Amount value={total} className="text-[13px] font-semibold tabular-nums" />}
    </div>
  );
}

/**
 * Choosing the order of a section's rows, as in iOS lists: drag a row by its
 * handle and the others make room. The page scrolls while a row is held near
 * the top or bottom edge. The handle also takes the arrow keys. Then review
 * before it's written.
 */
function Arrange({ view: v, order, setOrder, onReview }: { view: View; order: string[]; setOrder: (o: string[] | null) => void; onReview: () => void }) {
  const byKey = new Map(v.recs.map((r) => [r._key, r]));
  const moved = order.join('\n') !== v.recs.map((r) => r._key).join('\n');
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order];
    const [key] = next.splice(from, 1);
    next.splice(to, 0, key);
    setOrder(next);
  };

  // While dragging: the held row follows the pointer; `over` is where it would land
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; dy: number; over: number; h: number } | null>(null);
  const live = useRef<{ from: number; startY: number; startScroll: number; y: number; tops: number[]; heights: number[]; over: number; raf: number } | null>(null);
  useEffect(() => () => { if (live.current) cancelAnimationFrame(live.current.raf); }, []);

  const follow = () => {
    const d = live.current;
    if (!d) return;
    const dy = d.y - d.startY + (window.scrollY - d.startScroll);
    const centre = d.tops[d.from] + dy + d.heights[d.from] / 2;
    d.over = d.tops.reduce((n, top, i) => (i !== d.from && top + d.heights[i] / 2 < centre ? n + 1 : n), 0);
    setDrag({ from: d.from, dy, over: d.over, h: d.heights[d.from] });
  };
  // Near the screen's top or bottom edge, scroll, faster the closer the pointer
  const scroll = () => {
    const d = live.current;
    if (!d) return;
    const edge = 72;
    const speed = d.y < edge ? -(edge - d.y) / 5 : d.y > window.innerHeight - edge ? (d.y - window.innerHeight + edge) / 5 : 0;
    if (speed) { window.scrollBy(0, speed); follow(); }
    d.raf = requestAnimationFrame(scroll);
  };
  const pickUp = (i: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = items.current.slice(0, order.length).map((el) => el!.getBoundingClientRect());
    live.current = { from: i, startY: e.clientY, startScroll: window.scrollY, y: e.clientY, tops: rects.map((r) => r.top + window.scrollY), heights: rects.map((r) => r.height), over: i, raf: 0 };
    live.current.raf = requestAnimationFrame(scroll);
    setDrag({ from: i, dy: 0, over: i, h: rects[i].height });
  };
  const drop = () => {
    const d = live.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    live.current = null;
    setDrag(null);
    move(d.from, d.over);
  };
  const shift = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -drag.h;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) return drag.h;
    return 0;
  };

  const icon = 'grid size-10 flex-none place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink';
  return (
    <div className="pb-1 pt-1">
      <p className="mb-2 text-xs text-ink-2">Drag ☰ to put the accounts in the order you want, then review. The rows move in your sheet, so every device shows this order.</p>
      <ol className={cx(PANEL, 'bg-surface', !drag && 'overflow-hidden', drag && 'select-none')}>
        {order.map((key, i) => {
          const c = v.card(byKey.get(key)!);
          const label = String(byKey.get(key)!.account ?? '');
          const held = drag?.from === i;
          return (
            <li
              key={key} ref={(el) => { items.current[i] = el; }}
              className={cx('relative flex items-center gap-2 border-b border-line bg-surface py-1 pl-3 pr-1 text-[13px] last:border-0',
                held ? 'z-10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.22)]' : 'transition-transform duration-150 motion-reduce:transition-none')}
              style={{ transform: shift(i) ? `translateY(${shift(i)}px)${held ? ' scale(1.02)' : ''}` : undefined }}
            >
              <span className="w-5 flex-none text-xs text-ink-3 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block truncate text-xs text-ink-2">{c.sub}</span>
              </span>
              <span className="hidden whitespace-nowrap tabular-nums text-ink-2 sm:inline">{c.value}</span>
              <button
                type="button" className={cx(icon, 'touch-none', held ? 'cursor-grabbing text-ink' : 'cursor-grab')}
                aria-label={`Reorder ${label}: drag, or use the up and down arrow keys`} title="Drag to reorder"
                onPointerDown={(e) => pickUp(i, e)}
                onPointerMove={(e) => { if (live.current) { live.current.y = e.clientY; follow(); } }}
                onPointerUp={drop} onPointerCancel={drop}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1); }
                }}
              >
                <IconMenu2 size={18} stroke={1.75} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" className={BTN} onClick={() => setOrder(null)}>Cancel</button>
        <button type="button" className={BTN_PRIMARY} disabled={!moved || !!drag} onClick={onReview}>Review order</button>
      </div>
    </div>
  );
}

function Section({ view: v, canEdit, onEdit }: { view: View; canEdit: boolean; onEdit: OnEdit }) {
  const edit = canEdit ? v.edit : undefined;
  const remove = canEdit ? v.remove : undefined;
  // Some sections only delete (ledger entries): the actions column is there for either
  const acts = !!(edit || remove);

  // Narrowing to one holder, where the section records one and has more than one
  const [who, setWho] = useState<string | null>(null);
  const names = useMemo(() => holdersIn(v), [v]);
  // A holder whose last row was just deleted is no longer a choice
  const picked = who !== null && names.includes(who) ? who : null;
  const recs = rowsFor(v, picked);

  // Arranging: the rows in the order being chosen, until it's written (the rows then come back in it) or cancelled
  const [order, setOrder] = useState<string[] | null>(null);
  const sheetOrder = v.recs.map((r) => r._key).join('\n');
  useEffect(() => setOrder(null), [sheetOrder]);
  const canArrange = canEdit && !!v.reorder && v.recs.length > 1;
  const arrange = canArrange && (
    <button type="button" className={cx(BTN_GHOST, 'ml-auto')} onClick={() => setOrder(v.recs.map((r) => r._key))}>
      <IconArrowsSort size={14} stroke={1.75} aria-hidden="true" /><span>Arrange</span>
    </button>
  );
  if (order && v.reorder) {
    return <Arrange view={v} order={order} setOrder={setOrder} onReview={() => onEdit({ kind: 'reorder', id: v.reorder!, keys: order })} />;
  }

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
      {names.length > 1 && v.holders && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Filter by holder">
          {[null, ...names].map((h) => (
            <button
              key={h ?? ''} type="button" aria-pressed={picked === h} onClick={() => setWho(h)}
              className={cx('cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                picked === h ? 'border-accent bg-accent font-semibold text-white' : 'border-line bg-surface text-ink-2 hover:bg-sunk')}
            >
              {h ?? 'All'}
            </button>
          ))}
          {picked && (
            <span className="ml-auto text-xs text-ink-3 tabular-nums">
              {recs.length} of {v.recs.length} · <b className="font-semibold text-ink">{v.holders.total(recs)}</b>
            </span>
          )}
          {!picked && arrange}
        </div>
      )}
      {canArrange && !(names.length > 1 && v.holders) && <div className="mb-1 flex pt-1">{arrange}</div>}

      {/* phones: one card per record */}
      <div className="md:hidden">
        {recs.map((r: Row) => {
          const c = v.card(r);
          // With nothing else to show beside the sub line, Edit sits there instead of on a row of its own
          const inlineEdit = acts && !c.foot && !c.right;
          return (
            <div className="flex gap-3 border-b border-grid py-2.5 last:border-0" key={r._key}>
              {c.icon && <div className="pt-0.5">{c.icon}</div>}
              <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 font-medium">{c.title}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{c.value}</span>
              </div>
              <div className="mt-0.5 flex min-h-6 items-center justify-between gap-3 text-xs text-ink-2">
                <span className="min-w-0">{c.sub}</span>
                {inlineEdit && <span className="-my-1 -mr-2">{actions(r)}</span>}
                {c.right && (c.right.tone
                  ? <Pill tone={c.right.tone as 'up' | 'down'}>{c.right.text}</Pill>
                  : <span className="whitespace-nowrap tabular-nums">{c.right.text}</span>)}
              </div>
              {(c.foot || (acts && !inlineEdit)) && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-ink-2">
                  <span className="min-w-0 truncate">{c.foot}</span>
                  {acts && actions(r)}
                </div>
              )}
              </div>
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
              {acts && <th />}
            </tr>
          </thead>
          <tbody>
            {recs.map((r: Row) => (
              <tr key={r._key}>
                {v.columns.map((col) => (
                  <td key={col.head} className={[col.num && 'num', col.name && 'name', col.className?.(r)].filter(Boolean).join(' ') || undefined}>
                    {col.render(r)}
                  </td>
                ))}
                {acts && <td className="act">{actions(r)}</td>}
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
