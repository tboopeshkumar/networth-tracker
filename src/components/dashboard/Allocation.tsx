import { n0, pct } from '../../lib/format';
import type { Model } from '../../lib/model';
import { Amount, CATEGORY_SLOT, Card, Swatch, slotColor } from '../ui';

type Rows = Model['rows']['networth'];

const group = (rows: Rows, field: 'category' | 'location' | 'holder') => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[field] || '—');
    out[k] = (out[k] ?? 0) + n0(r.current);
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
};

/** Each person keeps a colour however values shift; joint entries are violet. */
function holderSlots(rows: Rows) {
  const names = [...new Set(rows.map((r) => String(r.holder)).filter((h) => h && !/^both$/i.test(h)))].sort();
  return (n: string) => (/^both$/i.test(n) ? 7 : [1, 5, 3, 2][names.indexOf(n)] ?? 0);
}

/** Name and amount on one line, the share as a thin bar under it. */
function Bars({ entries, total, slot }: { entries: [string, number][]; total: number; slot: (name: string) => number }) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="space-y-3">
      {entries.map(([name, v]) => (
        <div key={name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
              <Swatch slot={slot(name)} /><span className="truncate">{name}</span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              <b className="font-semibold"><Amount value={v} /></b> <span className="text-ink-3">{pct(total ? v / total : null)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunk">
            <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: slotColor(slot(name)) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Allocation({ model }: { model: Model }) {
  const nw = model.rows.networth;
  const total = model.totals.current;
  return (
    <div className="grid gap-x-4 md:grid-cols-2">
      <Card title="By category" sub="Share of current value">
        <Bars entries={group(nw, 'category')} total={total} slot={(n) => CATEGORY_SLOT[n] ?? 0} />
      </Card>
      <Card title="By location" sub="Where the assets sit">
        <Bars entries={group(nw, 'location')} total={total} slot={(n) => (n === 'India' ? 3 : 2)} />
        <h2 className="mt-6 text-[15px] font-semibold tracking-tight">By holder</h2>
        <p className="mb-3.5 mt-0.5 text-xs text-ink-3">Whose name it is in</p>
        <Bars entries={group(nw, 'holder')} total={total} slot={holderSlots(nw)} />
      </Card>
    </div>
  );
}
