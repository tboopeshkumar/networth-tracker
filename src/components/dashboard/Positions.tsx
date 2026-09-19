import { IconChevronRight } from '@tabler/icons-react';
import { cr, join, ret, n0, signedCr, signedPct, tone } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Model, NetWorthRow } from '../../lib/model';
import { CATEGORY_SLOT, Card, Pill, Swatch, cx } from '../ui';

interface Props {
  model: Model;
  linkOf: (r: NetWorthRow) => ViewId | null;
  onDrill: (id: ViewId) => void;
}

// Name | invested | current | return. Phones drop the invested column and
// tuck the return under the current value.
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_110px_120px_96px]';

function ReturnPill({ pnl, invested }: { pnl: unknown; invested: unknown }) {
  if (!pnl) return <span className="text-xs text-ink-3">—</span>;
  return <Pill tone={tone(pnl)} title={signedCr(pnl)}>{signedPct(ret(pnl, invested))}</Pill>;
}

/** The Net Worth lines, largest first; linked lines open their holdings. */
export function Positions({ model, linkOf, onDrill }: Props) {
  const T = model.totals;
  const rows = [...model.rows.networth].sort((a, b) => n0(b.current) - n0(a.current));

  return (
    <Card title="All positions" sub="The lines that roll up into your total, computed in the sheet. Tap a line to see its holdings.">
      <div className="-mx-4 sm:-mx-5">
        <div className={cx(GRID, 'border-b border-line px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-ink-3 sm:px-5')}>
          <span>Asset</span>
          <span className="hidden text-right sm:block">Invested</span>
          <span className="text-right">Current</span>
          <span className="hidden text-right sm:block">Return</span>
        </div>

        {rows.map((x) => {
          const link = linkOf(x);
          const body = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <Swatch slot={CATEGORY_SLOT[String(x.category)]} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 font-medium text-ink">
                    <span className="truncate">{String(x.asset)}</span>
                    {link && <IconChevronRight size={14} stroke={2} className="flex-none text-ink-3 transition-colors group-hover:text-accent" aria-hidden="true" />}
                  </span>
                  <span className="block truncate text-xs text-ink-3">{join(x.category, x.location, x.holder)}</span>
                </span>
              </span>
              <span className="hidden text-right tabular-nums text-ink-2 sm:block">{cr(x.invested)}</span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">{cr(x.current)}</span>
                <span className="mt-0.5 block sm:hidden"><ReturnPill pnl={x.pnl} invested={x.invested} /></span>
              </span>
              <span className="hidden text-right sm:block"><ReturnPill pnl={x.pnl} invested={x.invested} /></span>
            </>
          );
          const row = cx(GRID, 'w-full border-b border-grid px-4 py-3 text-left last:border-0 sm:px-5');
          return link
            ? <button key={x._key} type="button" className={cx(row, 'group cursor-pointer transition-colors hover:bg-sunk')} onClick={() => onDrill(link)}>{body}</button>
            : <div key={x._key} className={row}>{body}</div>;
        })}

        <div className={cx(GRID, 'bg-sunk px-4 py-3 font-semibold sm:px-5')}>
          <span>Total</span>
          <span className="hidden text-right tabular-nums sm:block">{cr(T.invested)}</span>
          <span className="text-right">
            <span className="block tabular-nums">{cr(T.current)}</span>
            <span className="mt-0.5 block sm:hidden"><ReturnPill pnl={T.pnl} invested={T.invested} /></span>
          </span>
          <span className="hidden text-right sm:block"><ReturnPill pnl={T.pnl} invested={T.invested} /></span>
        </div>
      </div>
    </Card>
  );
}
