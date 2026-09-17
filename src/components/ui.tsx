import type { ReactNode } from 'react';
import type { EditRequest } from '../lib/editors';

/** Colour follows the category, never its rank (validated palette, see app.css). */
export const CATEGORY_SLOT: Record<string, number> = {
  Liquid: 1, Equity: 2, FI: 3, Gold: 4, MF: 5, 'Real Estate': 6, Silver: 7,
};

export const slotColor = (slot: number | undefined) => `var(--s${slot ?? 0})`;

export function Swatch({ slot }: { slot: number | undefined }) {
  return <span className="sw" style={{ background: slotColor(slot) }} />;
}

export function Card({ title, sub, action, children, className = '' }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="h2sub">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export type OnEdit = (req: EditRequest) => void;

export function EditButton({ request, onEdit, children = 'Edit' }: { request: EditRequest; onEdit: OnEdit; children?: ReactNode }) {
  return <button type="button" className="btn-mini" onClick={() => onEdit(request)}>{children}</button>;
}
