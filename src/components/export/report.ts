// Everything on the dashboard as plain text tables, for the PDF export.
// Holdings sections reuse the dashboard's own view definitions, so the export
// always matches what the app shows: every section expanded, amounts in full.

import { isValidElement, type ReactNode } from 'react';
import { runChecks } from '../../lib/checks';
import { fmtDate, fmtMonth, inr, isNum, n0, num, pct, ret, signedInr, signedPct } from '../../lib/format';
import type { Grids, Model } from '../../lib/model';
import { buildViews, GROUP_ORDER, groupNote } from '../dashboard/holdingViews';
import { Amount } from '../ui';

export interface ReportTable { head: string[]; rows: string[][]; right: boolean[] }
export interface ReportSection { heading: string; lines?: string[]; table?: ReportTable }
export interface Report { title: string; meta: [string, string][]; sections: ReportSection[] }

/** Plain text of a rendered cell: text, fragments and elements' children; an Amount becomes its full figure. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (isValidElement(node)) {
    const props = node.props as { value?: unknown; signed?: boolean; children?: ReactNode };
    if (node.type === Amount) return props.signed ? signedInr(props.value) : inr(props.value);
    return nodeText(props.children);
  }
  return '';
}

const table = (head: string[], rows: string[][], right: boolean[] = head.map(() => false)): ReportTable => ({ head, rows, right });

/**
 * Hides who and which account: holder names become Person 1, Person 2…, and
 * long digit runs (folios, account and PRAN numbers) keep only their last 4.
 */
export function masker(model: Model): (s: string) => string {
  const names = new Set<string>();
  const add = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (s && s.length > 1 && !/^(both|joint|—|-)$/i.test(s)) names.add(s);
  };
  for (const r of model.rows.networth) add(r.holder);
  for (const id of ['mf', 'sgb', 'fd', 'bankInr', 'bankAed'] as const) for (const r of model.rows[id]) add((r as { holder?: unknown }).holder);
  for (const r of model.rows.givenOut) add(r.person);
  // Holders are sometimes written with a note ("Name (1-Sep-26)"): mask the name part.
  // Numbered in order of appearance, so the main holder on Net Worth is Person 1.
  const words = [...new Set([...names].map((n) => n.replace(/\s*\(.*$/, '').trim()).filter((n) => n.length > 2))];
  const alias = new Map(words.map((w, i) => [w.toLowerCase(), `Person ${i + 1}`]));
  // Longest first, so a full name wins over a shorter one it contains
  const pattern = [...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const nameRe = words.length ? new RegExp(`\\b(${pattern})\\b`, 'gi') : null;
  return (s) => {
    let out = nameRe ? s.replace(nameRe, (m) => alias.get(m.toLowerCase()) ?? m) : s;
    out = out.replace(/\b[A-Z]{0,4}\d{6,}\b/g, (m) => `••••${m.slice(-4)}`);
    return out;
  };
}

export function buildReport(model: Model, values: Grids, opts: { sheetTitle: string; version: string; mask: boolean }): Report {
  const T = model.totals;
  const sections: ReportSection[] = [];
  const nw = model.rows.networth;

  // Summary
  const months = model.rows.trend.filter((d) => isNum(d.savings));
  const latest = months.at(-1);
  const sumWhere = (p: (x: (typeof nw)[number]) => boolean) => nw.filter(p).reduce((a, x) => a + n0(x.current), 0);
  const share = (v: number) => pct(T.current ? v / T.current : null);
  sections.push({
    heading: 'Summary',
    table: table(['Measure', 'Value'], [
      ['Invested capital', inr(T.invested)],
      ['Current value (net worth)', inr(T.current)],
      ['Unrealised gain', `${signedInr(T.pnl)} (${signedPct(ret(T.pnl, T.invested))} on invested)`],
      ...(latest ? [[`Change in ${fmtMonth(latest.month)}`, signedInr(latest.savings)]] : []),
      ['Liquid cash', `${inr(sumWhere((x) => x.category === 'Liquid'))} (${share(sumWhere((x) => x.category === 'Liquid'))} of total)`],
      ['Equity exposure', `${inr(sumWhere((x) => x.category === 'Equity'))} (${share(sumWhere((x) => x.category === 'Equity'))} of total)`],
      ['Held in UAE', `${inr(sumWhere((x) => x.location === 'UAE'))} (${share(sumWhere((x) => x.location === 'UAE'))} of total)`],
    ], [false, true]),
  });

  // Net Worth lines
  sections.push({
    heading: 'Net worth lines (from the Net Worth tab)',
    table: table(
      ['Asset', 'Holder', 'Category', 'Location', 'Invested', 'Current', 'P&L', 'Return'],
      [...nw].sort((a, b) => n0(b.current) - n0(a.current)).map((x) => [
        String(x.asset ?? ''), String(x.holder ?? ''), String(x.category ?? ''), String(x.location ?? ''),
        inr(x.invested), inr(x.current), x.pnl ? signedInr(x.pnl) : '—', x.pnl ? signedPct(ret(x.pnl, x.invested)) : '—',
      ]).concat([['Total', '', '', '', inr(T.invested), inr(T.current), signedInr(T.pnl), signedPct(ret(T.pnl, T.invested))]]),
      [false, false, false, false, true, true, true, true],
    ),
  });

  // Allocation
  for (const [field, label] of [['category', 'category'], ['location', 'location'], ['holder', 'holder']] as const) {
    const by: Record<string, number> = {};
    for (const r of nw) by[String(r[field] || '—')] = (by[String(r[field] || '—')] ?? 0) + n0(r.current);
    sections.push({
      heading: `Allocation by ${label}`,
      table: table([label[0].toUpperCase() + label.slice(1), 'Current value', 'Share'],
        Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, inr(v), share(v)]), [false, true, true]),
    });
  }

  // Every holdings section, expanded
  const views = buildViews(model);
  for (const group of GROUP_ORDER) {
    const vs = views.filter((v) => v.group === group);
    if (!vs.length) continue;
    const note = groupNote(model, group);
    if (group.startsWith('Jewellery') && model.jewellery) {
      const J = model.jewellery.valuation;
      sections.push({
        heading: `${group}: gold valuation`,
        lines: [
          ...(note ? [note] : []),
          `${J.title ?? 'Gold valuation'}: ${num(J.grams)} g (${num(n0(J.grams) / 8, 1)} sovereigns)`,
          ...(isNum(J.value) ? [`Estimated value ${inr(J.value)}${isNum(J.rate) ? ` at ${inr(J.rate)} per gram` : ''}`] : []),
        ],
      });
    }
    for (const v of vs) {
      const lead = nodeText(v.lead);
      sections.push({
        heading: `${group} › ${v.name} — total ${nodeText(v.total)}${v.note ? ` (priced ${v.note})` : ''}`,
        lines: [...(note && v === vs[0] && !group.startsWith('Jewellery') ? [note] : []), ...(lead ? [lead] : [])],
        table: table(v.columns.map((c) => c.head), v.recs.map((r) => v.columns.map((c) => nodeText(c.render(r)))), v.columns.map((c) => !!c.num)),
      });
    }
  }

  // Rates and single inputs
  const C = model.cells;
  const S = model.summaries;
  const inputs: string[][] = [];
  if (C.fxAedInr) inputs.push(['AED to INR rate', num(C.fxAedInr.value, 4)]);
  if (C.fxUsdAed) inputs.push(['USD to AED rate (pegged)', num(C.fxUsdAed.value, 4)]);
  if (C.npsInvested) inputs.push(['NPS contributions', `${inr(C.npsInvested.value)} as of ${fmtDate(C.npsAsOf?.value)}`]);
  if (C.npsGain) inputs.push(['NPS gain', inr(C.npsGain.value)]);
  if (S.goldUae) inputs.push(['Gold (UAE) current value', `AED ${num(S.goldUae.currentAed.value)} for ${num(S.goldUae.qty.value)} g`]);
  if (S.silverUae?.sellPrice) inputs.push(['Silver sell price', `AED ${num(S.silverUae.sellPrice.value)} per oz, ${num(S.silverUae.qty.value)} oz held`]);
  for (const f of model.ratesFeed) inputs.push([`${f.label} (daily feed)`, `${isNum(f.value) ? num(f.value, 4) : '—'} · ${f.source} · ${fmtDate(f.rateDate)}`]);
  if (inputs.length) sections.push({ heading: 'Rates and other inputs', table: table(['Input', 'Value'], inputs, [false, true]) });

  // Monthly trend
  if (model.rows.trend.length) {
    sections.push({
      heading: 'Monthly net worth trend',
      table: table(['Month', 'Net worth', 'Change', 'Note'],
        model.rows.trend.map((d) => [fmtMonth(d.month), inr(d.networth), isNum(d.savings) ? signedInr(d.savings) : '—', String(d.note ?? '')]),
        [false, true, true, false]),
    });
  }

  // Checks
  const checks = runChecks(model, values, false);
  sections.push({ heading: 'Worth a look (automatic checks)', lines: checks.length ? checks.map((c) => `${c.title} ${c.detail}`) : ['Nothing to flag.'] });

  const report: Report = {
    title: 'Net worth report',
    meta: [
      ['Generated', new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
      ['Sheet', opts.sheetTitle],
      ['App version', opts.version],
      ['Amounts', 'In full, INR unless marked (AED, USD). P&L = current minus invested.'],
      ...(opts.mask ? [['Privacy', 'Names replaced with Person 1, 2…; account numbers show last 4 digits.'] as [string, string]] : []),
    ],
    sections,
  };
  if (!opts.mask) return report;

  const m = masker(model);
  return {
    ...report,
    meta: report.meta.map(([k, v]) => [k, k === 'Sheet' ? 'Net worth sheet' : m(v)]),
    sections: report.sections.map((s) => ({
      heading: m(s.heading),
      lines: s.lines?.map(m),
      table: s.table && { ...s.table, rows: s.table.rows.map((r) => r.map(m)) },
    })),
  };
}
