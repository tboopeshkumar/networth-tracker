// Google Picker: you choose the spreadsheet once. With the drive.file scope,
// picking it is what grants this app access to that single file — the app
// can't see anything else in your Drive.

import { loadScript } from './auth';

export interface PickedSheet { id: string; name: string }

const STORE = 'nwt.sheet';

export async function pickSpreadsheet(opts: { apiKey: string; appId: string; token: string }): Promise<PickedSheet | null> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => gapi.load('picker', () => resolve()));
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setMode(google.picker.DocsViewMode.LIST);
    new google.picker.PickerBuilder()
      .setAppId(opts.appId)
      .setOAuthToken(opts.token)
      .setDeveloperKey(opts.apiKey)
      .setTitle('Choose your net worth sheet')
      .addView(view)
      .setCallback((data: google.picker.ResponseObject) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS]![0];
          resolve({ id: doc[google.picker.Document.ID], name: doc[google.picker.Document.NAME] ?? '' });
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}

// The chosen sheet is remembered per Google account in this browser only.
// A spreadsheet ID is an address, not a key: Google still checks access.
export function rememberedSheet(email: string): PickedSheet | null {
  try {
    return (JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, PickedSheet>)[email] ?? null;
  } catch {
    return null;
  }
}

export function rememberSheet(email: string, sheet: PickedSheet | null): void {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, PickedSheet>;
    if (sheet) all[email] = sheet;
    else delete all[email];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* storage unavailable: pick again next time */ }
}
