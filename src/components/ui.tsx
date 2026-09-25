import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cr, inr, isNum, signedCr, signedInr } from '../lib/format';
import type { EditRequest } from '../lib/editors';

/** Colour follows the category, never its rank (validated palette, see app.css). */
export const CATEGORY_SLOT: Record<string, number> = {
  Liquid: 1, Equity: 2, FI: 3, Gold: 4, MF: 5, 'Real Estate': 6, Silver: 7,
};

export const slotColor = (slot: number | undefined) => `var(--s${slot ?? 0})`;

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function Swatch({ slot }: { slot: number | undefined }) {
  return <span className="inline-block size-2 flex-none rounded-full" style={{ background: slotColor(slot) }} aria-hidden="true" />;
}

/* ---------- surfaces ---------- */

export const CARD = 'rounded-2xl border border-line bg-surface shadow-card';
/** A panel inside a card: stats, tiles, the gold valuation. */
export const PANEL = 'rounded-xl border border-line bg-sunk';

export function Card({ title, sub, action, children, className }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cx(CARD, 'mb-3 p-4 sm:mb-4 sm:p-5', className)}>
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small muted label above a figure. */
export function Label({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5 text-xs font-medium text-ink-3', className)}>
      {icon}{children}
    </div>
  );
}

/* ---------- amounts ---------- */

/**
 * A rupee amount in compact form (₹6.12 Cr, ₹68.6 L) that flips to the full
 * figure (₹6,12,40,881) on tap, and back on a second tap. A dotted underline
 * marks it. Inside a tappable row or a section header, the tap only flips the
 * amount. Figures already shown in full are left as plain text.
 */
export function Amount({ value, signed, className }: { value: unknown; signed?: boolean; className?: string }) {
  const [full, setFull] = useState(false);
  const compact = signed ? signedCr(value) : cr(value);
  const exact = signed ? signedInr(value) : inr(value);
  if (!isNum(value) || compact === exact) return <span className={className}>{compact}</span>;
  const flip = (e: MouseEvent | KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); setFull((f) => !f); };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={full ? exact : `${compact}, tap for the exact amount`}
      title={full ? compact : exact}
      className={cx('cursor-pointer whitespace-nowrap underline decoration-ink-3/50 decoration-dotted underline-offset-[3px]', className)}
      onClick={flip}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') flip(e); }}
    >
      {full ? exact : compact}
    </span>
  );
}

/* ---------- pills ---------- */

type Tone = 'up' | 'down' | '' | undefined;
const PILL_TONE = { up: 'bg-good-soft text-good', down: 'bg-bad-soft text-bad', '': 'bg-sunk text-ink-2' } as const;

/** Gains and losses at a glance: green or red chip, neutral when flat. */
export function Pill({ tone, children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
      PILL_TONE[tone || ''], className,
    )}>
      {children}
    </span>
  );
}

/* ---------- buttons ---------- */

export const BTN = 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-sunk disabled:cursor-default disabled:opacity-50';
export const BTN_PRIMARY = 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-default disabled:opacity-50';
export const BTN_DANGER = 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-default disabled:opacity-50';
export const BTN_GHOST = 'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-3 transition-colors hover:bg-sunk hover:text-ink';

export type OnEdit = (req: EditRequest) => void;

export function DeleteButton({ request, onEdit }: { request: EditRequest; onEdit: OnEdit }) {
  return (
    <button type="button" className={cx(BTN_GHOST, 'hover:text-bad')} aria-label="Delete" title="Delete" onClick={() => onEdit(request)}>
      <IconTrash size={14} stroke={1.75} aria-hidden="true" />
    </button>
  );
}

export function EditButton({ request, onEdit, children }: { request: EditRequest; onEdit: OnEdit; children?: ReactNode }) {
  return (
    <button type="button" className={BTN_GHOST} onClick={() => onEdit(request)}>
      {children ?? <><IconPencil size={14} stroke={1.75} aria-hidden="true" /><span>Edit</span></>}
    </button>
  );
}
