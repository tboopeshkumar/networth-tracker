// Google Picker: you choose the spreadsheet once. With the drive.file scope,
// picking it is what grants this app access to that single file - the app
// cannot see anything else in your Drive.

import { loadScript } from './auth.js';

const STORE = 'nwt.sheet';

export async function pickSpreadsheet({ apiKey, appId, token }) {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((resolve) => gapi.load('picker', resolve));
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setMode(google.picker.DocsViewMode.LIST);
    new google.picker.PickerBuilder()
      .setAppId(appId)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setTitle('Choose your net worth sheet')
      .addView(view)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve({ id: data.docs[0].id, name: data.docs[0].name });
        if (data.action === google.picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

// The chosen sheet is remembered per Google account in this browser only.
// A spreadsheet ID is an address, not a key: Google still checks access.
export function rememberedSheet(email) {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}')[email] || null; } catch { return null; }
}

export function rememberSheet(email, sheet) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (sheet) all[email] = sheet; else delete all[email];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* storage unavailable: pick again next time */ }
}
