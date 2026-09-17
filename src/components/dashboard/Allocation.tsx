import { cr, n0, pct } from '../../lib/format';
import type { Model } from '../../lib/model';
import { CATEGORY_SLOT, Card, slotColor } from '../ui';

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

function Bars({ entries, total, slot }: { entries: [string, number][]; total: number; slot: (name: string) => number }) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <>
      {entries.map(([name, v]) => (
        <div className="bar-row" key={name}>
          <div className="bar-name">{name}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(v / max) * 100}%`, background: slotColor(slot(name)) }} />
          </div>
          <div className="bar-val">{cr(v)} <span className="muted">{pct(total ? v / total : null)}</span></div>
        </div>
      ))}
    </>
  );
}

export function Allocation({ model }: { model: Model }) {
  const nw = model.rows.networth;
  const total = model.totals.current;
  return (
    <div className="grid two">
      <Card title="By category" sub="Share of current value">
        <Bars entries={group(nw, 'category')} total={total} slot={(n) => CATEGORY_SLOT[n] ?? 0} />
      </Card>
      <Card title="By location" sub="Where the assets sit">
        <Bars entries={group(nw, 'location')} total={total} slot={(n) => (n === 'India' ? 3 : 2)} />
        <h2 className="gap">By holder</h2>
        <div className="h2sub">Whose name it is in</div>
        <Bars entries={group(nw, 'holder')} total={total} slot={holderSlots(nw)} />
      </Card>
    </div>
  );
}
