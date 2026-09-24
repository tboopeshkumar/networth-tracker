// What each holdings section shows. One record list feeds both
// presentations: `columns` for the wide table, `card` for phones.

import type { ReactNode } from 'react';
import type { EditRequest, EditableRow } from '../../lib/editors';
import {
  cr, fmtDate, fmtDay, inr, isNum, join, n0, num, pct, ret, signedAmt, signedCr, signedInr, signedPct, todaySerial, tone, usd,
} from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { BrokerFeed } from '../../lib/brokerFeed';
import type { Ledger, Model, Row, RowOf } from '../../lib/model';
import { PANEL, Pill, cx } from '../ui';

export interface Column<R> {
  head: string;
  num?: boolean;
  /** the row's name column: wraps, and is styled as the primary text */
  name?: boolean;
  render: (r: R) => ReactNode;
  className?: (r: R) => string;
}

export interface CardContent {
  title: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  right?: { text: string; tone?: string };
  foot?: ReactNode;
}

export interface View<R extends Row = Row> {
  id: ViewId;
  group: string;
  name: string;
  total: string;
  /** shown in the section header, e.g. the date the prices are from */
  note?: string;
  recs: R[];
  columns: Column<R>[];
  card: (r: R) => CardContent;
  /** present when rows can be edited */
  edit?: (r: R) => EditRequest;
  ledger?: Ledger;
  /** a line above the rows, for figures that belong to the section rather than a row */
  lead?: ReactNode;
}

const text = (v: unknown) => (v === '' || v === null || v === undefined ? '—' : String(v));
const sum = (recs: Row[], f: string) => recs.reduce((a, r) => a + n0(r[f]), 0);
const gain = (pnl: unknown, inv: unknown) => ({ text: pnl ? `${signedCr(pnl)} · ${signedPct(ret(pnl, inv))}` : '—', tone: tone(pnl) });
const fdStatus = (r: RowOf<'fd'>): [string, string] =>
  (!isNum(r.maturityDate) ? ['no date', 'down'] : r.maturityDate < todaySerial() ? ['matured', 'down'] : ['active', '']);

const editRow = (id: EditableRow) => (r: Row): EditRequest => ({ kind: 'row', id, key: r._key });

// Erases the per-view record type so views can share one array.
const view = <R extends Row>(v: View<R>) => v as unknown as View;

/** The oldest date a section is priced from: what its total is only as fresh as. */
function oldest(dates: unknown[]): string | undefined {
  const known = dates.filter(isNum);
  return known.length ? fmtDay(Math.min(...known)) : undefined;
}

export function buildViews(model: Model): View[] {
  const R = model.rows;
  const views: View[] = [
    view<RowOf<'mf'>>({
      id: 'mf', group: 'Investments', name: 'Mutual funds', recs: R.mf, total: cr(sum(R.mf, 'current')),
      // The oldest NAV in the list: the date the whole total is only as fresh as
      note: oldest(R.mf.map((r) => r.navDate)),
      edit: editRow('mf'),
      columns: [
        { head: 'Fund', name: true, render: (r) => <>{text(r.fund)}<div className="sub2">{text(r.platform)}</div></> },
        { head: 'Holder', render: (r) => text(r.holder) },
        { head: 'Type', render: (r) => text(r.category) },
        { head: 'Invested', num: true, render: (r) => inr(r.invested) },
        { head: 'Current', num: true, render: (r) => inr(r.current), className: () => 'strong' },
        { head: 'P&L', num: true, render: (r) => signedInr(r.pnl), className: (r) => tone(r.pnl) },
        { head: 'Return', num: true, render: (r) => <Pill tone={tone(r.pnl)}>{signedPct(ret(r.pnl, r.invested))}</Pill> },
        { head: 'NAV date', render: (r) => fmtDate(r.navDate) },
      ],
      card: (r) => ({
        title: text(r.fund), value: inr(r.current), sub: join(r.holder, r.category, r.platform),
        right: gain(r.pnl, r.invested), foot: `Invested ${cr(r.invested)} · NAV ${fmtDay(r.navDate)}`,
      }),
    }),
    view<RowOf<'equity'>>({
      id: 'equity', group: 'Investments', name: 'Equity', recs: R.equity, total: cr(sum(R.equity, 'currentInr')),
      note: oldest(R.equity.map((r) => r.navDate)),
      edit: editRow('equity'),
      columns: [
        { head: 'Account', name: true, render: (r) => <>{text(r.account)}<div className="sub2">{text(r.details)}</div></> },
        { head: 'Cur.', render: (r) => text(r.currency || 'INR') },
        { head: 'Current (local)', num: true, render: (r) => (isNum(r.currentLocal) ? num(r.currentLocal, 0) : '—') },
        { head: 'Invested (INR)', num: true, render: (r) => inr(r.investedInr) },
        { head: 'Current (INR)', num: true, render: (r) => inr(r.currentInr), className: () => 'strong' },
        { head: 'P&L', num: true, render: (r) => signedInr(r.pnl), className: (r) => tone(r.pnl) },
        { head: 'Return', num: true, render: (r) => <Pill tone={tone(r.pnl)}>{signedPct(ret(r.pnl, r.investedInr))}</Pill> },
        { head: 'Priced', render: (r) => fmtDate(r.navDate) },
      ],
      card: (r) => ({
        title: text(r.account), value: inr(r.currentInr), sub: text(r.details || r.currency || 'INR'),
        right: gain(r.pnl, r.investedInr),
        foot: join(isNum(r.currentLocal) ? `${String(r.currency || '')} ${num(r.currentLocal, 0)}`.trim() : '', `Priced ${fmtDay(r.navDate)}`),
      }),
    }),
    ...npsView(model),
    ...brokerView(model, model.etoro, 'etoro', 'eToro'),
    ...brokerView(model, model.ibkr, 'ibkr', 'IBKR'),
    view<RowOf<'sgb'>>({
      id: 'sgb', group: 'Investments', name: 'Gold (SGB)', recs: R.sgb, total: cr(sum(R.sgb, 'market')),
      note: oldest(R.sgb.map((r) => r.valueDate)),
      edit: editRow('sgb'),
      columns: [
        { head: 'Holding', name: true, render: (r) => text(r.holding) },
        { head: 'Holder', render: (r) => text(r.holder) },
        { head: 'Qty (g)', num: true, render: (r) => num(r.qty) },
        { head: 'Cost', num: true, render: (r) => inr(r.cost) },
        { head: 'Market', num: true, render: (r) => inr(r.market), className: () => 'strong' },
        { head: 'Gain', num: true, render: (r) => signedInr(n0(r.market) - n0(r.cost)), className: (r) => tone(n0(r.market) - n0(r.cost)) },
        { head: 'Matures', render: (r) => fmtDate(r.maturity) },
        { head: 'Valued', render: (r) => fmtDate(r.valueDate) },
      ],
      card: (r) => ({
        title: text(r.holding), value: inr(r.market), sub: join(r.holder, `${num(r.qty)} g`),
        right: gain(n0(r.market) - n0(r.cost), r.cost), foot: `Cost ${cr(r.cost)} · matures ${fmtDay(r.maturity)}`,
      }),
    }),
    view<RowOf<'fd'>>({
      id: 'fd', group: 'Investments', name: 'Fixed deposits', recs: R.fd, total: cr(sum(R.fd, 'amount')),
      edit: editRow('fd'),
      columns: [
        { head: 'Institution', name: true, render: (r) => <>{text(r.institution)}<div className="sub2">{r.ref ? String(r.ref) : ''}</div></> },
        { head: 'Holder', render: (r) => text(r.holder) },
        { head: 'Amount', num: true, render: (r) => inr(r.amount), className: () => 'strong' },
        { head: 'At maturity', num: true, render: (r) => inr(r.maturityAmount) },
        { head: 'Rate', num: true, render: (r) => (isNum(r.rate) ? `${r.rate}%` : '—') },
        { head: 'Matures', render: (r) => fmtDate(r.maturityDate) },
        { head: 'Status', render: (r) => fdStatus(r)[0], className: (r) => fdStatus(r)[1] },
      ],
      card: (r) => {
        const [status, statusTone] = fdStatus(r);
        return {
          title: text(r.institution), value: inr(r.amount), sub: join(r.holder, isNum(r.rate) ? `${r.rate}%` : ''),
          right: { text: status, tone: statusTone },
          foot: join(`Matures ${fmtDay(r.maturityDate)}`, isNum(r.maturityAmount) ? `${cr(r.maturityAmount)} at maturity` : ''),
        };
      },
    }),
    view<RowOf<'bankInr'>>({
      id: 'bankInr', group: 'Cash', name: 'Bank · INR', recs: R.bankInr, total: cr(sum(R.bankInr, 'balance')),
      edit: editRow('bankInr'),
      columns: [
        { head: 'Account', name: true, render: (r) => text(r.account) },
        { head: 'Holder', render: (r) => text(r.holder) },
        { head: 'Balance (INR)', num: true, render: (r) => inr(r.balance), className: () => 'strong' },
      ],
      card: (r) => ({ title: text(r.account), value: inr(r.balance), sub: text(r.holder) }),
    }),
    view<RowOf<'bankAed'>>({
      id: 'bankAed', group: 'Cash', name: 'Bank · AED', recs: R.bankAed, total: `AED ${num(sum(R.bankAed, 'balance'), 0)}`,
      edit: editRow('bankAed'),
      columns: [
        { head: 'Account', name: true, render: (r) => text(r.account) },
        { head: 'Holder', render: (r) => text(r.holder) },
        { head: 'Balance (AED)', num: true, render: (r) => `AED ${num(r.balance, 0)}`, className: () => 'strong' },
      ],
      card: (r) => ({ title: text(r.account), value: `AED ${num(r.balance, 0)}`, sub: text(r.holder) }),
    }),
    ...(['goldUae', 'silverUae'] as const).map((id) => {
      const unit = id === 'goldUae' ? 'g' : 'oz';
      return view<RowOf<typeof id>>({
        id, group: 'Metals · UAE', name: id === 'goldUae' ? 'Gold (UAE)' : 'Silver (UAE)',
        recs: R[id], total: `${num(sum(R[id], 'qty'))} ${unit}`,
        columns: [
          { head: 'Bought', render: (r) => fmtDate(r.date) },
          { head: 'Source', render: (r) => text(r.source) },
          { head: `AED / ${unit}`, num: true, render: (r) => num(r.perUnit) },
          { head: `Qty (${unit})`, num: true, render: (r) => num(r.qty) },
          { head: 'Cost (AED)', num: true, render: (r) => num(r.cost), className: () => 'strong' },
        ],
        card: (r) => ({
          title: `${num(r.qty)} ${unit}`, value: `AED ${num(r.cost)}`, sub: join(fmtDate(r.date), r.source),
          foot: `AED ${num(r.perUnit)} per ${unit === 'g' ? 'gram' : 'ounce'}`,
        }),
      });
    }),
  ];

  if (R.givenOut.length) {
    views.push(view<RowOf<'givenOut'>>({
      id: 'givenOut', group: 'Money lent', name: 'Receivables', recs: R.givenOut, total: cr(sum(R.givenOut, 'amount')),
      columns: [
        { head: 'Person', name: true, render: (r) => text(r.person) },
        { head: 'Given on', render: (r) => fmtDate(r.date) },
        { head: 'Amount', num: true, render: (r) => inr(r.amount), className: () => 'strong' },
        { head: 'Status', render: (r) => text(r.status) },
      ],
      card: (r) => ({ title: text(r.person), value: inr(r.amount), sub: `Given ${fmtDate(r.date)}`, right: { text: String(r.status ?? '') } }),
    }));
  }

  // One section per family-loan ledger. Negative amounts are money received back.
  for (const L of Object.values(model.ledgers)) {
    const notes = (r: Row) => join(r.note, r.detail, r.interest);
    views.push(view({
      id: `ledger:${L.sheet}`, group: 'Money lent', name: L.title, recs: L.rows, total: cr(L.balance), ledger: L,
      columns: [
        { head: 'Date', render: (r) => fmtDate(r.date) },
        { head: 'Description', name: true, render: (r) => text(r.description) },
        { head: 'Amount', num: true, render: (r) => signedAmt(r.amount), className: (r) => (n0(r.amount) < 0 ? 'up' : 'strong') },
        { head: 'Note', render: (r) => notes(r) || '—' },
      ],
      card: (r) => ({ title: text(r.description), value: signedAmt(r.amount), sub: fmtDate(r.date), foot: notes(r) }),
    }));
  }

  // The jewellery register: one section per list in the sheet, for reference.
  // Nothing here feeds a total anywhere in the app. Record-only lists
  // (exchanged or sold pieces) stay in the sheet and aren't shown.
  model.jewellery?.sections.forEach((s, i) => {
    if (!s.rows.length || !s.held) return;
    const paid = (r: Row) => {
      if (!isNum(r.total)) return '—';
      return !r.currency || /inr/i.test(String(r.currency)) ? inr(r.total) : `${String(r.currency)} ${num(r.total, 0)}`;
    };
    const when = (r: Row) => (isNum(r.date) ? fmtDate(r.date) : text(r.date));
    // Some items are named after their photo file; show the name without the extension
    const item = (r: Row) => text(r.item).replace(/\.(jpe?g|png|heic|webp)$/i, '');
    views.push(view<Row>({
      id: `jewels:${i}`, group: JEWELLERY_GROUP, name: s.title,
      recs: s.rows as unknown as Row[], total: `${num(s.grams)} g`,
      columns: [
        { head: 'Bought', render: when },
        { head: 'Item', name: true, render: item },
        { head: 'Grams', num: true, render: (r) => num(r.grams, 3), className: () => 'strong' },
        { head: 'Paid', num: true, render: paid },
        { head: 'Shop', render: (r) => text(r.shop) },
        { head: 'Kept at', render: (r) => text(r.location) },
      ],
      card: (r) => ({
        title: item(r), value: `${num(r.grams, 3)} g`, sub: join(when(r), r.shop),
        right: { text: paid(r) }, foot: r.location ? `Kept at ${String(r.location)}` : undefined,
      }),
    }));
  });

  return views;
}

/**
 * NPS schemes, priced from the NPS Feed tab. Contributions are recorded for
 * the account as a whole, not per scheme, so gain is shown for the section.
 */
function npsView(model: Model): View[] {
  const recs = model.rows.nps;
  if (!recs.length) return [];
  const value = sum(recs, 'value');
  const invested = model.cells.npsInvested?.value;
  const gain = isNum(invested) ? value - invested : null;
  return [view<RowOf<'nps'>>({
    id: 'nps', group: 'Investments', name: 'NPS', recs, total: cr(value),
    note: oldest(recs.map((r) => r.navDate)),
    edit: editRow('nps'),
    lead: isNum(invested) && (
      <div className={cx(PANEL, 'mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-3 py-2 text-[13px]')}>
        <span>Contributed <b className="font-semibold tabular-nums">{cr(invested)}</b></span>
        <span className="text-ink-3">worth {cr(value)}</span>
        <Pill tone={tone(gain)}>{signedCr(gain)} · {signedPct(ret(gain, invested))}</Pill>
      </div>
    ),
    columns: [
      { head: 'Scheme', name: true, render: (r) => <>{text(r.scheme)}<div className="sub2">{text(r.schemeId)}</div></> },
      { head: 'Units', num: true, render: (r) => num(r.units, 4) },
      { head: 'NAV', num: true, render: (r) => num(r.nav, 4) },
      { head: 'Value', num: true, render: (r) => inr(r.value), className: () => 'strong' },
      { head: 'Share', num: true, render: (r) => pct(value ? n0(r.value) / value : null) },
      { head: 'NAV date', render: (r) => fmtDate(r.navDate) },
    ],
    card: (r) => ({
      title: text(r.scheme), value: inr(r.value), sub: join(r.schemeId, `${num(r.units, 4)} units`),
      right: { text: pct(value ? n0(r.value) / value : null) },
      foot: `NAV ${num(r.nav, 4)} · ${fmtDay(r.navDate)}`,
    }),
  })];
}

/**
 * Each holding at a broker, from its feed tab. Rows stay in the broker's
 * currency; the section total is in rupees at the sheet's own rates, as the
 * Equity tab converts it.
 */
function brokerView(model: Model, feed: BrokerFeed | null, id: 'etoro' | 'ibkr', name: string): View[] {
  if (!feed?.rows.length) return [];
  const recs = feed.rows as unknown as Row[];
  const cur = feed.currency;
  const money = (n: unknown) => (cur === 'USD' ? usd(n) : isNum(n) ? `${cur} ${num(n, 0)}` : '—');
  const signed = (n: unknown) => (isNum(n) && n > 0 ? `+${money(n)}` : money(n));
  const units = (r: Row) => (isNum(r.units) ? num(r.units, r.units % 1 ? 4 : 0) : '');
  const totalLocal = feed.total?.value ?? recs.reduce((a, r) => a + n0(r.value), 0);
  const aedInr = n0(model.cells.fxAedInr?.value);
  const toInr = { USD: n0(model.cells.fxUsdAed?.value) * aedInr, AED: aedInr, INR: 1 }[cur] ?? 0;
  const sym = cur === 'USD' ? '$' : cur;
  return [view<Row>({
    id, group: 'Investments', name, recs,
    note: isNum(feed.refreshed) ? fmtDay(feed.refreshed) : undefined,
    total: toInr > 0 ? cr(totalLocal * toInr) : money(totalLocal),
    columns: [
      { head: 'Holding', name: true, render: (r) => <>{text(r.symbol)}<div className="sub2">{String(r.name ?? '')}</div></> },
      { head: 'Type', render: (r) => text(r.type) },
      { head: 'Units', num: true, render: (r) => units(r) || '—' },
      { head: `Invested (${sym})`, num: true, render: (r) => money(r.invested) },
      { head: `Value (${sym})`, num: true, render: (r) => money(r.value), className: () => 'strong' },
      { head: `P&L (${sym})`, num: true, render: (r) => (r.pnl ? signed(r.pnl) : '—'), className: (r) => tone(r.pnl) },
      { head: 'Return', num: true, render: (r) => (r.pnl ? <Pill tone={tone(r.pnl)}>{signedPct(ret(r.pnl, r.invested))}</Pill> : '—') },
    ],
    card: (r) => ({
      title: text(r.symbol), value: money(r.value), sub: join(r.name, units(r) && `${units(r)} units`),
      right: r.pnl ? { text: `${signed(r.pnl)} · ${signedPct(ret(r.pnl, r.invested))}`, tone: tone(r.pnl) } : undefined,
      foot: isNum(r.invested) && r.type !== 'Cash' ? `Invested ${money(r.invested)}` : undefined,
    }),
  })];
}

export const JEWELLERY_GROUP = 'Jewellery · not in net worth';
export const GROUP_ORDER = ['Investments', 'Cash', 'Metals · UAE', 'Money lent', JEWELLERY_GROUP];

/** A line under a group's heading, where the group needs explaining. */
export function groupNote(model: Model, group: string): string | null {
  return group === JEWELLERY_GROUP && model.jewellery ? 'For reference only — not counted in your net worth.' : null;
}
