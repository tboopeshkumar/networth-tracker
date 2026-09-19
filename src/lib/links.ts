// Which holdings section a Net Worth line drills into.

import type { Model, NetWorthRow } from './model';

export type ViewId =
  | 'mf' | 'equity' | 'sgb' | 'fd' | 'bankInr' | 'bankAed' | 'goldUae' | 'silverUae' | 'givenOut'
  | `ledger:${string}` | `jewels:${number}`;

/** Matched on words rather than exact names, so renaming a line doesn't break it. */
function byName(r: NetWorthRow): ViewId | null {
  const a = String(r.asset ?? '').toLowerCase();
  const uae = r.location === 'UAE';
  if (/mutual fund/.test(a)) return 'mf';
  if (/sovereign gold|sgb/.test(a)) return 'sgb';
  if (/gold/.test(a)) return uae ? 'goldUae' : 'sgb';
  if (/silver/.test(a)) return 'silverUae';
  if (/fixed deposit|bond/.test(a)) return 'fd';
  if (/liquid cash|bank/.test(a)) return uae ? 'bankAed' : 'bankInr';
  if (/equity|stock|share/.test(a)) return 'equity';
  if (/receivable|given out|lent/.test(a)) return 'givenOut';
  return null;
}

/**
 * Lines fed from the Receivables tab are linked by the cell their formula
 * references: a family-loan row opens its ledger, anything else opens the
 * given-out list.
 */
export function makeLinker(model: Model): (r: NetWorthRow) => ViewId | null {
  const fam = model.tables.familyLoans;
  return (r) => {
    const src = r._src;
    if (src && fam && src.tab === fam.spec.tab) {
      const f = model.rows.familyLoans.find((x) => x._row === src.row);
      if (f && model.ledgers[String(f.detailSheet)]) return `ledger:${String(f.detailSheet)}`;
      if (model.rows.givenOut.length) return 'givenOut';
    }
    const v = byName(r);
    return v === 'givenOut' && !model.rows.givenOut.length ? null : v;
  };
}
