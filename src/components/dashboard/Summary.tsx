import { IconArrowDownRight, IconArrowUpRight, IconCash, IconChartLine, IconMapPin, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { fmtDate, fmtMonth, isNum, n0, pct, ret, signedPct, tone } from '../../lib/format';
import type { Model } from '../../lib/model';
import { Amount, CARD, CATEGORY_SLOT, Label, Pill, cx, slotColor, tint, tintInk } from '../ui';

const ICON = { size: 15, stroke: 1.75, 'aria-hidden': true } as const;

/** One composition figure: amount and its share of the total. */
function ShareTile({ label, icon, value, share, slot }: { label: string; icon: ReactNode; value: number; share: number; slot: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line p-3.5 shadow-card sm:p-4" style={tint(slot)}>
      {/* two lines reserved on phones, so the three values line up */}
      <Label icon={icon} className="min-h-[2lh] items-start !text-current opacity-85 sm:min-h-0 sm:items-center">{label}</Label>
      <div className="mt-1 text-lg font-semibold tracking-tight tabular-nums text-ink sm:text-[22px]"><Amount value={value} /></div>
      <div className="text-xs tabular-nums opacity-85">{pct(share)}<span className="hidden sm:inline"> of total</span></div>
    </div>
  );
}

/** A thin bar of the whole portfolio by asset class, in the category colours. */
function MixBar({ rows, total }: { rows: Model['rows']['networth']; total: number }) {
  const by: Record<string, number> = {};
  for (const r of rows) by[String(r.category || '—')] = (by[String(r.category || '—')] ?? 0) + n0(r.current);
  const parts = Object.entries(by).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!total || !parts.length) return null;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-sunk" role="img" aria-label={parts.map(([k, v]) => `${k} ${pct(v / total)}`).join(', ')}>
        {parts.map(([k, v]) => (
          <span key={k} title={`${k} · ${pct(v / total)}`} style={{ width: `${(v / total) * 100}%`, background: slotColor(CATEGORY_SLOT[k] ?? 0) }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        {parts.slice(0, 5).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1" style={{ color: tintInk(CATEGORY_SLOT[k] ?? 0) }}>
            <span className="inline-block size-1.5 rounded-full" style={{ background: slotColor(CATEGORY_SLOT[k] ?? 0) }} />
            {k} <span className="tabular-nums opacity-80">{pct(v / total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Summary({ model }: { model: Model }) {
  const T = model.totals;
  const nw = model.rows.networth;
  const r = ret(T.pnl, T.invested);

  const sumWhere = (p: (x: (typeof nw)[number]) => boolean) => nw.filter(p).reduce((a, x) => a + n0(x.current), 0);
  const liquid = sumWhere((x) => x.category === 'Liquid');
  const equity = sumWhere((x) => x.category === 'Equity');
  const uae = sumWhere((x) => x.location === 'UAE');
  const share = (v: number) => (T.current ? v / T.current : 0);

  // Latest recorded month, and the one before it for "vs …"
  const months = model.rows.trend.filter((d) => isNum(d.savings));
  const latest = months.at(-1);
  const prior = model.rows.trend[model.rows.trend.findIndex((d) => d === latest) - 1];

  // Newest valuation date across the priced holdings
  const dates = [...model.rows.mf.map((x) => x.navDate), ...model.rows.equity.map((x) => x.navDate), ...model.rows.sgb.map((x) => x.valueDate)].filter(isNum);
  const newest = dates.length ? Math.max(...dates) : null;

  const gainTone = tone(T.pnl);
  const monthTone = latest ? tone(latest.savings) : '';

  return (
    <>
      {/* Invested leads: it's the capital actually committed, and it doesn't
          swing with the market the way current value does. */}
      <section className={cx(CARD, 'mb-3 p-5 sm:mb-4 sm:p-6')}>
        <div className="flex items-baseline justify-between gap-3">
          <Label>Invested capital</Label>
          {newest !== null && <span className="whitespace-nowrap text-xs text-ink-3">valued {fmtDate(newest)}</span>}
        </div>

        <div className="mt-1 text-[34px] font-semibold leading-tight tracking-tight tabular-nums sm:text-[44px]"><Amount value={T.invested} /></div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[15px] text-ink-2">
            now worth <b className="font-semibold text-ink tabular-nums"><Amount value={T.current} /></b>
          </span>
          <Pill tone={gainTone} title="Unrealised gain on invested capital" className="px-2.5 py-1 text-[13px]">
            {gainTone === 'down' ? <IconTrendingDown {...ICON} /> : <IconTrendingUp {...ICON} />}
            <Amount value={T.pnl} signed /> unrealised · {signedPct(r)}
          </Pill>
          {latest && (
            <Pill tone={monthTone} title={prior ? `Change vs ${fmtMonth(prior.month)}` : 'Change on the month'} className="px-2.5 py-1 text-[13px]">
              {monthTone === 'down' ? <IconArrowDownRight {...ICON} /> : <IconArrowUpRight {...ICON} />}
              <Amount value={latest.savings} signed /> in {fmtMonth(latest.month)}
            </Pill>
          )}
        </div>
        <MixBar rows={nw} total={T.current} />
      </section>

      <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3">
        <ShareTile label="Liquid cash" icon={<IconCash {...ICON} />} value={liquid} share={share(liquid)} slot={CATEGORY_SLOT.Liquid} />
        <ShareTile label="Equity exposure" icon={<IconChartLine {...ICON} />} value={equity} share={share(equity)} slot={CATEGORY_SLOT.Equity} />
        <ShareTile label="Held in UAE" icon={<IconMapPin {...ICON} />} value={uae} share={share(uae)} slot={CATEGORY_SLOT.FI} />
      </div>
    </>
  );
}
