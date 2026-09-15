// Two interchangeable backends with the same interface:
//   meta()                -> [{ title, sheetId }]
//   read(tabs)            -> { values: {tab: grid}, formulas: {tab: grid} }
//   batchUpdate(requests) -> applies spreadsheets.batchUpdate requests atomically
//
// GoogleSheets talks to the real API with the signed-in user's token.
// DemoSheets holds a local fixture in memory (localhost only) so the write
// path can be exercised without credentials.

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class AuthError extends Error {}
export class AccessError extends Error {}

const quote = (tab) => `'${tab.replace(/'/g, "''")}'`;

export class GoogleSheets {
  constructor(spreadsheetId, getToken) {
    this.id = spreadsheetId;
    this.getToken = getToken;
  }

  async call(path, init = {}) {
    const token = this.getToken();
    if (!token) throw new AuthError('Not signed in');
    const res = await fetch(`${API}/${encodeURIComponent(this.id)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) throw new AuthError('Your Google session expired');
    if (res.status === 403 || res.status === 404) {
      throw new AccessError('This Google account can’t open that sheet. Pick it again, or check it is shared with you.');
    }
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }

  async meta() {
    const r = await this.call('?fields=properties.title,sheets.properties(sheetId,title)');
    this.title = r.properties.title;
    return r.sheets.map((s) => s.properties);
  }

  async read(tabs) {
    const q = (render) => {
      const p = new URLSearchParams({ valueRenderOption: render, dateTimeRenderOption: 'SERIAL_NUMBER' });
      tabs.forEach((t) => p.append('ranges', quote(t)));
      return this.call(`/values:batchGet?${p}`);
    };
    const [vals, forms] = await Promise.all([q('UNFORMATTED_VALUE'), q('FORMULA')]);
    const pack = (resp) => Object.fromEntries(tabs.map((t, i) => [t, resp.valueRanges[i].values || []]));
    return { values: pack(vals), formulas: pack(forms) };
  }

  async batchUpdate(requests) {
    return this.call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}

/* ---------------------------------------------------------------------------
 * Demo backend. Emulates the three request types the app sends. Formulas are
 * shifted like a Sheets copy-paste, and simple arithmetic ones (=G5-F5) are
 * evaluated so a demo write shows sensible numbers.
 * ------------------------------------------------------------------------- */

const clone = (x) => JSON.parse(JSON.stringify(x));
const isFormula = (v) => typeof v === 'string' && v.startsWith('=');

const colToIdx = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Shift relative row references outside string literals.
export function shiftRows(formula, delta) {
  return formula.replace(/("[^"]*")|(?<![A-Za-z0-9_$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g,
    (m, str, cAbs, col, rAbs, row) => (str ? str : `${cAbs}${col}${rAbs}${rAbs ? row : Number(row) + delta}`));
}

// Evaluates + - * / ( ) over numbers and same-sheet cell refs. No eval: the
// page's CSP forbids it, and anything fancier returns '' in the demo.
function evalSimple(formula, grid) {
  const toks = formula.slice(1).match(/\$?[A-Z]{1,3}\$?\d+|\d+(?:\.\d+)?|[+\-*/()]|\S/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const atom = () => {
    const t = toks[i++];
    if (t === '(') { const v = sum(); if (toks[i++] !== ')') throw 0; return v; }
    if (t === '-') return -atom();
    if (/^\d/.test(t)) return Number(t);
    const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(t || '');
    if (!m) throw 0;
    const v = (grid[Number(m[2]) - 1] || [])[colToIdx(m[1])];
    return typeof v === 'number' ? v : 0;
  };
  const prod = () => { let v = atom(); while (peek() === '*' || peek() === '/') v = toks[i++] === '*' ? v * atom() : v / atom(); return v; };
  const sum = () => { let v = prod(); while (peek() === '+' || peek() === '-') v = toks[i++] === '+' ? v + prod() : v - prod(); return v; };
  try {
    const v = sum();
    return i === toks.length && Number.isFinite(v) ? v : '';
  } catch { return ''; }
}

export class DemoSheets {
  constructor(fixture) {
    this.f = clone(fixture);
    this.title = 'Demo (local fixture)';
    this.log = [];
  }

  static async load(url = './demo/fixture.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error('No demo fixture. Run: python3 tools/make_fixture.py <your.xlsx>');
    return new DemoSheets(await res.json());
  }

  async meta() { return clone(this.f.sheets); }

  async read(tabs) {
    return {
      values: Object.fromEntries(tabs.map((t) => [t, clone(this.f.values[t] || [])])),
      formulas: Object.fromEntries(tabs.map((t) => [t, clone(this.f.formulas[t] || [])])),
    };
  }

  tabOf(sheetId) {
    const s = this.f.sheets.find((x) => x.sheetId === sheetId);
    if (!s) throw new Error(`demo: unknown sheetId ${sheetId}`);
    return s.title;
  }

  async batchUpdate(requests) {
    const snapshot = clone(this.f); // all-or-nothing, like the real API
    try {
      for (const req of requests) this.apply(req);
      this.log.push(...clone(requests));
    } catch (e) {
      this.f = snapshot;
      throw e;
    }
    return { replies: requests.map(() => ({})) };
  }

  apply(req) {
    const [type, body] = Object.entries(req)[0];
    if (type === 'insertDimension') {
      const t = this.tabOf(body.range.sheetId);
      const at = body.range.startIndex;
      for (const g of [this.f.values[t], this.f.formulas[t]]) {
        while (g.length < at) g.push([]);
        g.splice(at, 0, []);
      }
      return;
    }
    if (type === 'copyPaste') {
      const t = this.tabOf(body.source.sheetId);
      const src = body.source.startRowIndex;
      const dst = body.destination.startRowIndex;
      const fg = this.f.formulas[t];
      const vg = this.f.values[t];
      fg[dst] = (fg[src] || []).map((v) => (isFormula(v) ? shiftRows(v, dst - src) : v));
      vg[dst] = fg[dst].map((v) => (isFormula(v) ? '' : v));
      return;
    }
    if (type === 'updateCells') {
      const t = this.tabOf(body.start.sheetId);
      const { rowIndex: r, columnIndex: c } = body.start;
      const uev = body.rows[0].values[0].userEnteredValue || {};
      const fg = this.f.formulas[t];
      const vg = this.f.values[t];
      for (const g of [fg, vg]) { while (g.length <= r) g.push([]); while (g[r].length <= c) g[r].push(''); }
      if ('formulaValue' in uev) { fg[r][c] = uev.formulaValue; vg[r][c] = ''; } else {
        const v = uev.numberValue ?? uev.stringValue ?? uev.boolValue ?? '';
        fg[r][c] = v; vg[r][c] = v;
      }
      // re-evaluate simple formulas on the touched row
      fg[r].forEach((v, i) => { if (isFormula(v)) vg[r][i] = evalSimple(v, vg); });
      return;
    }
    throw new Error(`demo: unsupported request ${type}`);
  }
}
