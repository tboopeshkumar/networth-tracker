// The jewellery register: shown for reference, never counted in net worth.
//
// The tab holds several lists, each with its own header row (Date, Grams,
// Item, ...) and usually a title just above it, plus a valuation block
// (total grams held × gold rate). Sections are found by their headers and
// titles, so no section or person names are hardcoded.

import { isNum, n0, type Cell } from './format';
import type { Grid } from './model';

export const JEWELLERY_TAB = 'Jewels';

const FIELDS = {
  date: 'date', grams: 'grams', amount: 'amount', currency: 'cur.', making: 'making', vat: 'vat',
  total: 'total', perGram: 'per gram', item: 'item', shop: 'shop', location: 'location',
} as const;
type Field = keyof typeof FIELDS;

export type JewelRow = Partial<Record<Field, Cell>> & { _row: number; _key: string };

export interface JewelSection {
  title: string;
  rows: JewelRow[];
  /** false for record-only sections such as exchanged or sold pieces */
  held: boolean;
  grams: number;
}

export interface Jewellery {
  sections: JewelSection[];
  valuation: { grams: number | null; rate: number | null; value: number | null; note: string | null };
}

const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (v: unknown) => v === '' || v === null || v === undefined;
const filled = (row: Cell[] | undefined) => (row ?? []).filter((v) => !blank(v));

const isHeader = (row: Cell[] | undefined) => {
  const cells = (row ?? []).map(norm);
  return cells.includes('grams') && cells.includes('item');
};

/** A row with a single piece of text in its first cell — a section title. */
const labelOnly = (row: Cell[] | undefined) => {
  const f = filled(row);
  return f.length === 1 && typeof row?.[0] === 'string' && !blank(row[0]);
};

const firstNumberAfter = (row: Cell[], col: number) => row.slice(col + 1).find(isNum) ?? null;

export function readJewellery(grid: Grid | undefined): Jewellery | null {
  if (!grid) return null;
  const sections: JewelSection[] = [];

  for (let h = 0; h < grid.length; h++) {
    if (!isHeader(grid[h])) continue;

    const cols: Partial<Record<Field, number>> = {};
    grid[h].forEach((v, c) => {
      const f = (Object.entries(FIELDS) as [Field, string][]).find(([, name]) => norm(v) === name)?.[0];
      if (f && cols[f] === undefined) cols[f] = c;
    });

    // Title: a lone label within two rows above the header
    let title = 'Held';
    for (const i of [h - 1, h - 2]) {
      if (i >= 0 && labelOnly(grid[i])) { title = String(grid[i][0]).trim().replace(/\s+/g, ' '); break; }
    }

    const rows: JewelRow[] = [];
    const seen: Record<string, number> = {};
    for (let i = h + 1; i < grid.length; i++) {
      const row = grid[i] ?? [];
      if (isHeader(row) || labelOnly(row) || /^(total|current gold valuation)/i.test(String(row[0] ?? ''))) break;
      if (!filled(row).length) continue;
      const rec: JewelRow = { _row: i, _key: '' };
      for (const [f, c] of Object.entries(cols) as [Field, number][]) {
        const v = row[c];
        if (!blank(v)) rec[f] = typeof v === 'string' ? v.trim() : v;
      }
      if (blank(rec.item) && !isNum(rec.grams)) continue;
      const base = `${norm(rec.item)}␟${String(rec.date ?? '')}␟${String(rec.grams ?? '')}`;
      seen[base] = (seen[base] ?? 0) + 1;
      rec._key = seen[base] > 1 ? `${base}␟#${seen[base]}` : base;
      rows.push(rec);
    }

    sections.push({
      title,
      rows,
      held: !/exchang|no longer|sold/i.test(title),
      grams: rows.reduce((a, r) => a + n0(r.grams), 0),
    });
  }

  if (!sections.length) return null;

  // Valuation block: labelled rows with their figure to the right
  const find = (re: RegExp) => {
    for (const row of grid) {
      const c = (row ?? []).findIndex((v) => typeof v === 'string' && re.test(v));
      if (c >= 0) return { row, c };
    }
    return null;
  };
  const numberBy = (re: RegExp) => { const hit = find(re); return hit ? firstNumberAfter(hit.row, hit.c) : null; };
  const noteHit = find(/^value\s*=/i);

  return {
    sections,
    valuation: {
      grams: numberBy(/total grams/i),
      rate: numberBy(/gold rate/i),
      value: numberBy(/estimated value/i),
      note: noteHit ? String(noteHit.row[noteHit.c]).trim() : null,
    },
  };
}
