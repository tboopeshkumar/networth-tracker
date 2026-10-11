import { IconChevronRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import { changesSince, type LineChange } from '../../lib/dailyLog';
import { fmtDay, join, num, signedPct, todaySerial } from '../../lib/format';
import type { ViewId } from '../../lib/links';
import type { Model, NetWorthRow } from '../../lib/model';
import { Amount, CATEGORY_SLOT, Card, Label, PANEL, Pill, Swatch, cx } from '../ui';

interface Props {
  model: Model;
  linkOf: (r: NetWorthRow) => ViewId | null;
  onDrill: (id: ViewId) => void;
}

// Line | invested change | current change. Phones drop the invested column
// and put that change under the line's name instead.
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_120px_120px]';

/** A change in value: green up, red down. A change in what was put in is neither, so it stays plain. */
function Delta({ value, plain }: { value: number; plain?: boolean }) {
  if (Math.abs(value) < 1) return <span className="text-ink-3">—</span>;
  return <Amount value={value} signed className={cx('tabular-nums', plain ? 'text-ink-2' : value > 0 ? 'text-good' : 'text-bad')} />;
}

/**
 * What moved since the last daily record: each Net Worth line whose invested
 * or current figure differs from that day's, and the totals they add up to.
 * Shown only when the sheet keeps a Daily Log tab.
 */
export function Movers({ model, linkOf, onDrill }: Props) {
  const c = useMemo(() => changesSince(model), [model]);
  if (c === null) return null;
  if (c === 'first') {
    return (
      <Card title="What changed" sub="Since the last daily record">
        <p className="text-[13px] text-ink-2">The first daily record was taken today. From tomorrow, this shows what moved since the day before.</p>
      </Card>
    );
  }

  const when = c.since === todaySerial() - 1 ? `yesterday (${fmtDay(c.since)})` : fmtDay(c.since);
  const gain = c.current - c.invested;
  return (
    <Card title="What changed" sub={`Since ${when}, the last daily record`}>
      <div className="grid grid-cols-3 gap-2">
        {([['Invested', c.invested, true], ['Unrealised gain', gain, false], ['Net worth', c.current, false]] as const).map(([label, value, plain]) => (
          <div className={cx(PANEL, 'min-w-0 px-3 py-2')} key={label}>
            <Label>{label}</Label>
            <div className="mt-0.5 text-[15px] font-semibold sm:text-base"><Delta value={value} plain={plain} /></div>
          </div>
        ))}
      </div>

      {c.rates.map((r) => (
        <p className="mt-2.5 text-[13px] text-ink-2" key={r.label}>
          <b className="font-semibold text-ink">{r.label}</b> went from <span className="tabular-nums">{num(r.from, 4)}</span> to{' '}
          <span className="tabular-nums">{num(r.to, 4)}</span> ({signedPct(r.to / r.from - 1)}). Everything held in AED moves with it, invested amounts included.
        </p>
      ))}

      {c.lines.length === 0 ? (
        <p className="mt-2.5 text-[13px] text-ink-2">No line has moved since {fmtDay(c.since)}.</p>
      ) : (
        // Runs to the card's bottom edge, like All positions
        <div className="-mx-4 -mb-4 mt-3.5 overflow-hidden rounded-b-xl border-t border-line sm:-mx-5 sm:-mb-5">
          <div className={cx(GRID, 'border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3 sm:px-5')}>
            <span>Line</span>
            <span className="hidden text-right sm:block">Invested</span>
            <span className="text-right">Current</span>
          </div>
          {c.lines.map((x) => <Line key={x.asset} change={x} link={x.row ? linkOf(x.row) : null} onDrill={onDrill} />)}
        </div>
      )}
    </Card>
  );
}

function Line({ change: x, link, onDrill }: { change: LineChange; link: ViewId | null; onDrill: (id: ViewId) => void }) {
  const investedMoved = Math.abs(x.invested) >= 1;
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        <Swatch slot={CATEGORY_SLOT[String(x.row?.category ?? '')]} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <span className="truncate">{x.asset}</span>
            {x.status !== 'changed' && <Pill>{x.status === 'new' ? 'new line' : 'removed'}</Pill>}
            {link && <IconChevronRight size={14} stroke={2} className="flex-none text-ink-3 transition-colors group-hover:text-accent" aria-hidden="true" />}
          </span>
          <span className="hidden truncate text-xs text-ink-3 sm:block">{join(x.row?.category, x.row?.location, x.row?.holder)}</span>
          {/* Phones have no invested column: say it here when it moved */}
          <span className="block truncate text-xs text-ink-3 sm:hidden">
            {investedMoved ? <>Invested <Delta value={x.invested} plain /></> : join(x.row?.category, x.row?.location)}
          </span>
        </span>
      </span>
      <span className="hidden text-right sm:block"><Delta value={x.invested} plain /></span>
      <span className="text-right font-semibold"><Delta value={x.current} /></span>
    </>
  );
  const row = cx(GRID, 'w-full border-b border-grid px-4 py-2.5 text-left last:border-0 sm:px-5');
  return link
    ? <button type="button" className={cx(row, 'group cursor-pointer transition-colors hover:bg-sunk')} onClick={() => onDrill(link)}>{body}</button>
    : <div className={row}>{body}</div>;
}
