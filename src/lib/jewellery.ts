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
  headerRow: number;
}

export interface GoldValuation {
  /** the block's own heading, e.g. "Current gold valuation (22C)" */
  title: string | null;
  grams: number | null;
  rate: number | null;
  value: number | null;
  note: string | null;
  /** date the rate was taken, as written in the note */
  rateAsOf: string | null;
  /** the rate cell fetches its value (IMPORTXML, GOOGLEFINANCE, ...) */
  rateLive: boolean;
  /**
   * The held lists the valuation covers: those placed above the valuation
   * block. Empty unless their grams add up to the sheet's own total.
   */
  parts: { title: string; grams: number }[];
}

export interface Jewellery {
  sections: JewelSection[];
  valuation: GoldValuation;
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

const FETCHES = /\b(IMPORTXML|IMPORTHTML|IMPORTDATA|IMPORTFEED|GOOGLEFINANCE)\s*\(/i;

export function readJewellery(grid: Grid | undefined, formulas?: Grid): Jewellery | null {
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
      headerRow: h,
    });
  }

  if (!sections.length) return null;

  // Valuation block: labelled rows with their figure to the right
  const find = (re: RegExp) => {
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i] ?? [];
      const c = row.findIndex((v) => typeof v === 'string' && re.test(v));
      if (c >= 0) return { row, c, i };
    }
    return null;
  };
  const numberBy = (re: RegExp) => { const hit = find(re); return hit ? firstNumberAfter(hit.row, hit.c) : null; };
  const noteHit = find(/^value\s*=/i);
  const titleHit = find(/gold valuation/i);
  const grams = numberBy(/total grams/i);

  // The rate is the first number right of its label; "live" when that cell fetches it
  const rateHit = find(/gold rate/i);
  const rateCol = rateHit ? rateHit.row.findIndex((v, j) => j > rateHit.c && isNum(v)) : -1;
  const rate = rateHit && rateCol >= 0 ? (rateHit.row[rateCol] as number) : null;
  const rateLive = !!rateHit && rateCol >= 0 && FETCHES.test(String(formulas?.[rateHit.i]?.[rateCol] ?? ''));
  const note = noteHit ? String(noteHit.row[noteHit.c]).trim() : null;

  // The lists the valuation covers sit above its block; trust the split only
  // when it reconciles with the sheet's own total.
  const blockRow = titleHit?.i ?? find(/total grams/i)?.i ?? -1;
  let parts = sections.filter((s) => s.held && s.headerRow < blockRow).map((s) => ({ title: s.title, grams: s.grams }));
  if (!isNum(grams) || Math.abs(parts.reduce((a, s) => a + s.grams, 0) - grams) > 0.01) parts = [];

  return {
    sections,
    valuation: {
      title: titleHit ? String(titleHit.row[titleHit.c]).trim().replace(/\s+/g, ' ') : null,
      grams,
      rate,
      value: numberBy(/estimated value/i),
      note,
      rateAsOf: note?.match(/rate as of\s*([0-9]{1,2}[-\s][A-Za-z]{3,9}[-\s][0-9]{4})/i)?.[1] ?? null,
      rateLive,
      parts,
    },
  };
}
