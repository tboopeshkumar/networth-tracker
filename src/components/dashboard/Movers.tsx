import { IconChevronRight } from '@tabler/icons-react';
import { useMemo } from 'react';
import { changesSince, isPending, type Changes, type LineChange } from '../../lib/dailyLog';
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
  if (isPending(c)) {
    return (
      <Card title="What changed" sub="Since the last daily record">
        <p className="text-[13px] text-ink-2">The first daily record was taken today. From {fmtDay(c.pending)}, this shows what moved since the day before.</p>
      </Card>
    );
  }

  const when = c.since === todaySerial() - 1 ? `yesterday (${fmtDay(c.since)})` : fmtDay(c.since);
  return (
    <Card title="What changed" sub={`Since ${when}, the last daily record`}>
      {/* The list runs to the card's bottom edge, like All positions */}
      <ChangeBody changes={c} linkOf={linkOf} onDrill={onDrill} listClass="-mb-4 overflow-hidden rounded-b-xl sm:-mb-5" />
    </Card>
  );
}

const PERIODS = [['Past week', 7], ['Past month', 30], ['Past year', 365]] as const;

/**
 * The same comparison over longer stretches, from the same log: the sheet now
 * against a week, a month and a year ago. Each opens to its own list; one the
 * log doesn't reach back to yet says when it will.
 */
export function MoversOverTime({ model, linkOf, onDrill }: Props) {
  const periods = useMemo(() => PERIODS.map(([name, back]) => ({ name, c: changesSince(model, todaySerial(), back) })), [model]);
  if (periods.every((p) => p.c === null)) return null;

  return (
    <Card title="Changes over time" sub="Your sheet now against the daily log from a week, a month and a year ago">
      <div className="-mx-4 -mb-4 overflow-hidden rounded-b-xl border-t border-line sm:-mx-5 sm:-mb-5">
        {periods.map(({ name, c }) => {
          const head = 'flex items-center gap-2.5 px-4 py-3 sm:px-5';
          if (!c || isPending(c)) {
            return (
              <div key={name} className={cx(head, 'border-b border-line text-ink-3 last:border-0')}>
                <span className="w-4 flex-none" />
                <span className="whitespace-nowrap font-medium">{name}</span>
                {/* The log doesn't go back that far yet */}
                {c && <span className="ml-auto whitespace-nowrap text-xs">available from {fmtDay(c.pending)}</span>}
              </div>
            );
          }
          return (
            <details key={name} className="group border-b border-line last:border-0">
              <summary className={cx(head, 'cursor-pointer select-none transition-colors hover:bg-sunk group-open:border-b group-open:border-grid')}>
                <IconChevronRight size={16} stroke={2} className="flex-none text-ink-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                <span className="font-medium">{name}</span>
                <span className="text-xs text-ink-3">since {fmtDay(c.since)}</span>
                <span className="ml-auto font-semibold"><Delta value={c.current} /></span>
              </summary>
              <div className="bg-sunk/40 px-4 pt-3 sm:px-5">
                <ChangeBody changes={c} linkOf={linkOf} onDrill={onDrill} />
              </div>
            </details>
          );
        })}
      </div>
    </Card>
  );
}

/** The totals, any rate move, and the lines that moved. */
function ChangeBody({ changes: c, linkOf, onDrill, listClass }: { changes: Changes; listClass?: string } & Omit<Props, 'model'>) {
  const gain = c.current - c.invested;
  return (
    <>
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
        <p className="mt-2.5 pb-3 text-[13px] text-ink-2">No line has moved since {fmtDay(c.since)}.</p>
      ) : (
        <div className={cx('-mx-4 mt-3.5 border-t border-line sm:-mx-5', listClass)}>
          <div className={cx(GRID, 'border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3 sm:px-5')}>
            <span>Line</span>
            <span className="hidden text-right sm:block">Invested</span>
            <span className="text-right">Current</span>
          </div>
          {c.lines.map((x) => <Line key={x.asset} change={x} link={x.row ? linkOf(x.row) : null} onDrill={onDrill} />)}
        </div>
      )}
    </>
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
            {link && <IconChevronRight size={14} stroke={2} className="flex-none text-ink-3 transition-colors group-hover/line:text-accent" aria-hidden="true" />}
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
    ? <button type="button" className={cx(row, 'group/line cursor-pointer transition-colors hover:bg-sunk')} onClick={() => onDrill(link)}>{body}</button>
    : <div className={row}>{body}</div>;
}
