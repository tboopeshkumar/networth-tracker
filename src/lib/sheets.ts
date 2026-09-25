// Google Sheets API client, and the interface the demo backend also implements.

import type { Grids } from './model';

export interface SheetMeta { title: string; sheetId: number }
export interface SheetData { values: Grids; formulas: Grids }

interface GridRange { sheetId: number; startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number }
export interface UserEnteredValue { numberValue?: number; stringValue?: string; boolValue?: boolean; formulaValue?: string }

/** The subset of spreadsheets.batchUpdate requests this app sends. */
export type BatchRequest =
  | { insertDimension: { range: { sheetId: number; dimension: 'ROWS'; startIndex: number; endIndex: number }; inheritFromBefore: boolean } }
  | { copyPaste: { source: GridRange; destination: GridRange; pasteType: 'PASTE_NORMAL' } }
  | { updateCells: { start: { sheetId: number; rowIndex: number; columnIndex: number }; rows: { values: { userEnteredValue?: UserEnteredValue }[] }[]; fields: 'userEnteredValue' } }
  | { deleteRange: { range: GridRange; shiftDimension: 'ROWS' } }
  | { insertRange: { range: GridRange; shiftDimension: 'ROWS' } };

export interface SheetsBackend {
  readonly title: string;
  meta(): Promise<SheetMeta[]>;
  read(tabs: readonly string[]): Promise<SheetData>;
  /** Applies all requests atomically. */
  batchUpdate(requests: BatchRequest[]): Promise<unknown>;
}

export class AuthError extends Error {}
export class AccessError extends Error {}

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export class GoogleSheets implements SheetsBackend {
  title = 'your sheet';

  constructor(private readonly id: string, private readonly getToken: () => string | null) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    if (!token) throw new AuthError('Not signed in');
    const res = await fetch(`${API}/${encodeURIComponent(this.id)}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) throw new AuthError('Your Google session expired');
    if (res.status === 403 || res.status === 404) {
      throw new AccessError('This Google account can’t open that sheet — or can only view it. Pick it again, or check how it is shared with you.');
    }
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }

  async meta(): Promise<SheetMeta[]> {
    const r = await this.call<{ properties: { title: string }; sheets: { properties: SheetMeta }[] }>(
      '?fields=properties.title,sheets.properties(sheetId,title)');
    this.title = r.properties.title;
    return r.sheets.map((s) => s.properties);
  }

  async read(tabs: readonly string[]): Promise<SheetData> {
    type Resp = { valueRanges: { values?: Grids[string] }[] };
    const get = (render: 'UNFORMATTED_VALUE' | 'FORMULA') => {
      const p = new URLSearchParams({ valueRenderOption: render, dateTimeRenderOption: 'SERIAL_NUMBER' });
      tabs.forEach((t) => p.append('ranges', quote(t)));
      return this.call<Resp>(`/values:batchGet?${p}`);
    };
    const [vals, forms] = await Promise.all([get('UNFORMATTED_VALUE'), get('FORMULA')]);
    const pack = (r: Resp): Grids => Object.fromEntries(tabs.map((t, i) => [t, r.valueRanges[i]?.values ?? []]));
    return { values: pack(vals), formulas: pack(forms) };
  }

  batchUpdate(requests: BatchRequest[]) {
    return this.call(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
  }
}
