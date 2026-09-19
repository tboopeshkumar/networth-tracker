import { IconArrowDownRight, IconArrowUpRight, IconCash, IconChartLine, IconMapPin, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { cr, fmtDate, fmtMonth, isNum, n0, pct, ret, signedCr, signedPct, tone } from '../../lib/format';
import type { Model } from '../../lib/model';
import { CARD, Label, Pill, cx } from '../ui';

const ICON = { size: 15, stroke: 1.75, 'aria-hidden': true } as const;

/** One composition figure: amount and its share of the total. */
function ShareTile({ label, icon, value, share }: { label: string; icon: ReactNode; value: number; share: number }) {
  return (
    <div className={cx(CARD, 'min-w-0 p-3.5 sm:p-4')}>
      {/* two lines reserved on phones, so the three values line up */}
      <Label icon={icon} className="min-h-[2lh] items-start sm:min-h-0 sm:items-center">{label}</Label>
      <div className="mt-1 text-lg font-semibold tracking-tight tabular-nums sm:text-[22px]">{cr(value)}</div>
      <div className="text-xs text-ink-3 tabular-nums">{pct(share)}<span className="hidden sm:inline"> of total</span></div>
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

        <div className="mt-1 text-[34px] font-semibold leading-tight tracking-tight tabular-nums sm:text-[44px]">{cr(T.invested)}</div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[15px] text-ink-2">
            now worth <b className="font-semibold text-ink tabular-nums">{cr(T.current)}</b>
          </span>
          <Pill tone={gainTone} title="Unrealised gain on invested capital" className="px-2.5 py-1 text-[13px]">
            {gainTone === 'down' ? <IconTrendingDown {...ICON} /> : <IconTrendingUp {...ICON} />}
            {signedCr(T.pnl)} unrealised · {signedPct(r)}
          </Pill>
          {latest && (
            <Pill tone={monthTone} title={prior ? `Change vs ${fmtMonth(prior.month)}` : 'Change on the month'} className="px-2.5 py-1 text-[13px]">
              {monthTone === 'down' ? <IconArrowDownRight {...ICON} /> : <IconArrowUpRight {...ICON} />}
              {signedCr(latest.savings)} in {fmtMonth(latest.month)}
            </Pill>
          )}
        </div>
      </section>

      <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3">
        <ShareTile label="Liquid cash" icon={<IconCash {...ICON} />} value={liquid} share={share(liquid)} />
        <ShareTile label="Equity exposure" icon={<IconChartLine {...ICON} />} value={equity} share={share(equity)} />
        <ShareTile label="Held in UAE" icon={<IconMapPin {...ICON} />} value={uae} share={share(uae)} />
      </div>
    </>
  );
}
