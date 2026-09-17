// Number, date and cell-address helpers. Pure: no DOM, no React.

export type Cell = string | number | boolean;

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A number, or 0 for blanks and text. For arithmetic on sheet cells. */
export const n0 = (v: unknown): number => (isNum(v) ? v : 0);

const blank = (v: unknown) => v === '' || v === null || v === undefined;

/* ---------- money ---------- */

/** Compact Indian form: ₹8.31 Cr, ₹62.58 L, ₹5,249 */
export function cr(n: unknown): string {
  if (!isNum(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

/** Full Indian form: ₹8,31,37,403 */
export const inr = (n: unknown): string => (isNum(n) ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—');

export const num = (n: unknown, dp = 2): string =>
  (isNum(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: dp }) : '—');

export const pct = (n: unknown): string => (isNum(n) ? `${(n * 100).toFixed(1)}%` : '—');

const plus = (n: unknown) => (isNum(n) && n > 0 ? '+' : '');
export const signedInr = (n: unknown) => (isNum(n) ? `${plus(n)}${inr(n)}` : '—');
export const signedCr = (n: unknown) => (isNum(n) ? `${plus(n)}${cr(n)}` : '—');
export const signedPct = (n: unknown) => (isNum(n) ? `${plus(n)}${pct(n)}` : '—');
/** Ledger amounts: −₹35,000 for money received back */
export const signedAmt = (n: unknown) => (isNum(n) && n < 0 ? `−${inr(-n)}` : inr(n));

export const ret = (pnl: unknown, invested: unknown): number | null =>
  (isNum(pnl) && isNum(invested) && invested ? pnl / invested : null);

/** CSS class for a gain or loss */
export const tone = (n: unknown): 'up' | 'down' | '' => (isNum(n) && n > 0 ? 'up' : isNum(n) && n < 0 ? 'down' : '');

/** "a · b · c", skipping blanks */
export const join = (...xs: unknown[]): string =>
  xs.filter((x) => !blank(x) && x !== '—').map(String).join(' · ');

/* ---------- dates: Sheets serial numbers, handled in UTC ---------- */

const EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const serialToDate = (s: unknown): Date | null => (isNum(s) ? new Date(EPOCH_MS + Math.round(s * DAY_MS)) : null);
export const dateToSerial = (d: Date): number => Math.round((d.getTime() - EPOCH_MS) / DAY_MS);

/** 'YYYY-MM-DD' (from <input type=date>) → serial */
export function isoToSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return dateToSerial(new Date(Date.UTC(y, m - 1, d)));
}

export const serialToIso = (s: unknown): string => serialToDate(s)?.toISOString().slice(0, 10) ?? '';

export function fmtDate(s: unknown): string {
  const d = serialToDate(s);
  return d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '—';
}

export function fmtMonth(s: unknown): string {
  const d = serialToDate(s);
  return d ? `${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` : '—';
}

export function todaySerial(): number {
  const n = new Date();
  return dateToSerial(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

/* ---------- A1 notation ---------- */

export function colLetter(idx: number): string {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export const colIndex = (letters: string): number =>
  [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** zero-based row/col → 'Tab'!A1 */
export const a1 = (tab: string, row: number, col: number): string =>
  `'${tab.replace(/'/g, "''")}'!${colLetter(col)}${row + 1}`;
