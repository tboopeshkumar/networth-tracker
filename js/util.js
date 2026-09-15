// Formatting, escaping and date helpers. No DOM access, so it runs under node too.

/* ---------- HTML: escaped by default ---------- */

class SafeHtml {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new SafeHtml(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const part = (v) => (v instanceof SafeHtml ? v.s : esc(v));

// Tagged template: every interpolation is escaped unless it is already SafeHtml.
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    out += Array.isArray(v) ? v.map(part).join('') : part(v);
    out += strings[i + 1];
  });
  return new SafeHtml(out);
}

export function mount(el, safe) {
  if (!(safe instanceof SafeHtml)) throw new Error('mount() requires html`` output');
  el.innerHTML = safe.s;
}

/* ---------- numbers ---------- */

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function cr(n) {
  if (!isNum(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}

export const inr = (n) => (isNum(n) ? `₹${Math.round(n).toLocaleString('en-IN')}` : '—');
export const num = (n, dp = 2) => (isNum(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: dp }) : '—');
export const pct = (n) => (isNum(n) ? `${(n * 100).toFixed(1)}%` : '—');
export const signed = (s, n) => (isNum(n) && n > 0 ? `+${s}` : s);

/* ---------- dates: Sheets serial numbers, handled in UTC ---------- */

const EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const serialToDate = (s) => (isNum(s) ? new Date(EPOCH_MS + Math.round(s * DAY_MS)) : null);
export const dateToSerial = (d) => Math.round((d.getTime() - EPOCH_MS) / DAY_MS);

// 'YYYY-MM-DD' (from <input type=date>) -> serial
export function isoToSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return dateToSerial(new Date(Date.UTC(y, m - 1, d)));
}

export function serialToIso(s) {
  const d = serialToDate(s);
  return d ? d.toISOString().slice(0, 10) : '';
}

export function fmtDate(s) {
  const d = serialToDate(s);
  return d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '—';
}

export function fmtMonth(s) {
  const d = serialToDate(s);
  return d ? `${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}` : '—';
}

export const todaySerial = () => {
  const n = new Date();
  return dateToSerial(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
};

/* ---------- A1 notation ---------- */

export function colLetter(idx) {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// zero-based row/col -> 'Tab'!A1
export const a1 = (tab, row, col) => `'${tab.replace(/'/g, "''")}'!${colLetter(col)}${row + 1}`;
