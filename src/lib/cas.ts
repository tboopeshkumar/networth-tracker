// Mutual fund holdings from an MF Central "Consolidated Account Summary" PDF,
// and how they line up with the Mutual Funds tab. Pure: the PDF is read into
// positioned text elsewhere (components/cas/pdfText.ts), so this can be tested
// without a PDF.
//
// Each holding is one line holding the folio, invested value, units, NAV date,
// NAV and market value; a long scheme name wraps onto the lines just above and
// below it. The summary has no ISIN, so funds are matched by folio + name.

import type { Cell } from './format';
import type { Model, RowOf } from './model';

/** A Mutual Funds row, with the optional Units column the NAV feed layout adds. */
export type FundRow = RowOf<'mf'> & { units?: Cell };

export interface TextItem { x: number; y: number; str: string }
export interface CasHolding {
  folio: string;
  scheme: string;
  invested: number | null;
  units: number;
  navDate: string;
  nav: number | null;
  value: number | null;
}

const DATE = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/;
/** "12,34,567.89" → 1234567.89; "(9,876.50)" → -9876.5 */
export const casNumber = (s: string): number | null => {
  const m = /^\(?-?[\d,]+(\.\d+)?\)?$/.exec(s.trim());
  if (!m) return null;
  const n = Number(s.replace(/[(),\s]/g, ''));
  return Number.isFinite(n) ? (s.trim().startsWith('(') ? -n : n) : null;
};

/** Holdings from each page's positioned text (x from the left, y from the bottom, as PDFs measure). */
export function casHoldings(pages: TextItem[][]): CasHolding[] {
  const out: CasHolding[] = [];
  for (const items of pages) {
    // Columns from the header row: where "Scheme Details" starts and where the numbers begin
    const schemeHead = items.find((i) => /^scheme details$/i.test(i.str.trim()));
    const investedHead = items.find((i) => /^invested value/i.test(i.str.trim()));
    if (!schemeHead || !investedHead) continue;
    const schemeX = schemeHead.x - 80;     // names start a little left of their header
    const numbersX = investedHead.x - 5;

    // Group into lines by y
    const lines: { y: number; items: TextItem[] }[] = [];
    for (const it of items) {
      if (!it.str.trim()) continue;
      let line = lines.find((l) => Math.abs(l.y - it.y) <= 2);
      if (!line) lines.push(line = { y: it.y, items: [] });
      line.items.push(it);
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);

    // Anchor lines: a folio at the left and a date among the numbers
    const anchors = lines.filter((l) => l.items.some((i) => DATE.test(i.str.trim())) && l.items[0].x < schemeX && /^[\d/]+$/.test(l.items[0].str.trim()));
    const nameParts = new Map(anchors.map((a) => [a, [] as { y: number; str: string }[]]));

    // Scheme-name text (between the folio and number columns) goes to the nearest anchor
    for (const l of lines) {
      const text = l.items.filter((i) => i.x >= schemeX && i.x < numbersX && !DATE.test(i.str.trim()) && casNumber(i.str) === null);
      if (!text.length || !anchors.length) continue;
      if (text.some((i) => /scheme details|consolidated account|as on date|holdings/i.test(i.str))) continue;
      const nearest = anchors.reduce((a, b) => (Math.abs(b.y - l.y) < Math.abs(a.y - l.y) ? b : a));
      if (Math.abs(nearest.y - l.y) > 16) continue;
      nameParts.get(nearest)!.push({ y: l.y, str: text.map((i) => i.str.trim()).join(' ') });
    }

    for (const a of anchors) {
      const tokens = a.items.map((i) => i.str.trim());
      const d = tokens.findIndex((t) => DATE.test(t));
      const units = casNumber(tokens[d - 1] ?? '');
      if (units === null) continue;
      const scheme = nameParts.get(a)!.sort((p, q) => q.y - p.y).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim();
      out.push({
        folio: tokens[0],
        scheme,
        invested: casNumber(tokens[d - 2] ?? ''),
        units,
        navDate: tokens[d],
        nav: casNumber(tokens[d + 1] ?? ''),
        value: casNumber(tokens[d + 2] ?? ''),
      });
    }
  }
  return out;
}

/* ---------- matching to the Mutual Funds tab ---------- */

const FILLER = new Set(['fund', 'plan', 'growth', 'option', 'the', 'of', 'and', 'india', 'mutual']);
/** Name words that identify a scheme, without plan/option filler or "(formerly …)" notes. */
const words = (s: unknown) => new Set(String(s ?? '').toLowerCase()
  .replace(/\((?:formerly|erstwhile|earlier)[^)]*\)?/g, ' ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .split(/\s+/)
  .filter((w) => w && !FILLER.has(w)));

/** How alike two scheme names are, 0–1 (shared words over the shorter name's words). */
export function nameScore(a: unknown, b: unknown): number {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
/** Folios as written differ ("2587322/71" vs "258732271"); compare their digits, allowing a suffix. */
const sameFolio = (a: unknown, b: unknown) => {
  const x = digits(a), y = digits(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};

export interface CasMatch {
  rec: FundRow;
  holding: CasHolding;
  /** folio and name agree, or only the name (no folio in the sheet, or it differs) */
  by: 'folio' | 'name';
}

export function matchCas(model: Model, holdings: CasHolding[]) {
  const held = holdings.filter((h) => h.units > 0);
  const rows = [...model.rows.mf] as FundRow[];
  const matches: CasMatch[] = [];
  const used = new Set<CasHolding>();

  for (const rec of rows) {
    const scored = held
      .filter((h) => !used.has(h))
      .map((h) => ({ h, folio: sameFolio(rec.folio, h.folio), score: nameScore(rec.fund, h.scheme) }))
      .filter((c) => (c.folio ? c.score >= 0.34 : c.score >= 0.75))
      .sort((p, q) => Number(q.folio) - Number(p.folio) || q.score - p.score);
    const best = scored[0];
    if (!best) continue;
    used.add(best.h);
    matches.push({ rec, holding: best.h, by: best.folio ? 'folio' : 'name' });
  }
  return {
    matches,
    /** in the statement with units, but no row on the Mutual Funds tab */
    notInSheet: held.filter((h) => !used.has(h)),
    /** on the Mutual Funds tab, but not found in the statement */
    notInCas: rows.filter((r) => !matches.some((m) => m.rec === r)),
  };
}
