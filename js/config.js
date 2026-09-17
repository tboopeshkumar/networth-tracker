// Public configuration. Everything here is safe to commit to a public repo:
//
// - clientId: OAuth client IDs for browser apps are public by design. Google
//   only honours sign-ins started from the "Authorized JavaScript origins"
//   you register, so a copied ID is useless on another site.
// - apiKey: used only to render the Google Picker. Restrict it in Cloud
//   Console to your site's URL and to the Picker API.
// - appId: your Google Cloud project NUMBER. The Picker needs it so that
//   picking the sheet grants this app access to that one file (drive.file).
//
// The real access control is enforced by Google, not by this file:
//   1. OAuth consent screen in "Testing" with only your accounts as test users
//   2. drive.file scope: the app can open only the sheet you picked
//   3. The sheet's own sharing settings
//
// allowedEmails is a courtesy check that shows a clear message to anyone else.
// It is not a security boundary: page code can be edited in the browser.

export const CONFIG = {
  clientId: '538488751327-v30dbpt1ff24fbtia4ocdrfsn1h843gs.apps.googleusercontent.com',
  apiKey: 'AIzaSyChN4D1ByozbJTGCfrWciSsJh4Oygg-uWk',
  appId: '538488751327',
  allowedEmails: [],

  // Accounts that get the Edit and Add buttons. Everyone else signs in to a
  // read-only view. Leave empty to let every allowed account edit.
  //
  // THIS IS A UI SETTING, NOT A SECURITY CONTROL. Page code can be changed in
  // the browser, and anyone signed in can call the Sheets API directly. To
  // actually stop someone writing, share the sheet with them as **Viewer** in
  // Google Sheets — then Google refuses their writes with a 403.
  editors: [],

  // Sign out and clear data from the page after this much inactivity.
  idleMinutes: 20,
};
