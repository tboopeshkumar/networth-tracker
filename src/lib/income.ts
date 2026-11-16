// The "Income" tab: monthly income in AED, one row per payment, headed
//   Year | Month / Note | Amount (AED)
// Bonuses and the like are their own rows ("Mar - Bonus"); a row whose label
// names no month ("Joining Bonus") belongs to the month of the row above. A
// blank Year carries on from the row above. The list ends at its TOTAL row.

import { isNum } from './format';
import type { Grid } from './model';

export const INCOME_TAB = 'Income';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** yyyy-mm → that month's income in AED. */
export function readIncome(grid: Grid | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!grid?.length) return out;
  const head = grid.findIndex((r) => r?.some((v) => norm(v) === 'year') && r.some((v) => /^amount/.test(norm(v))));
  if (head < 0) return out;
  const col = (re: RegExp) => grid[head].findIndex((v) => re.test(norm(v)));
  const [yearCol, labelCol, amountCol] = [col(/^year$/), col(/^month/), col(/^amount/)];
  if (yearCol < 0 || labelCol < 0 || amountCol < 0) return out;

  let year: number | null = null;
  let month: number | null = null;
  for (const r of grid.slice(head + 1)) {
    const label = norm(r?.[labelCol]);
    if (/^total/.test(label)) break;
    const y = Number(String(r?.[yearCol] ?? '').trim());
    if (Number.isInteger(y) && y > 1900) year = y;
    const m = MONTHS.indexOf(label.slice(0, 3));
    if (m >= 0) month = m + 1;
    const amount = r?.[amountCol];
    if (year === null || month === null || !isNum(amount)) continue;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    out.set(key, (out.get(key) ?? 0) + amount);
  }
  return out;
}
