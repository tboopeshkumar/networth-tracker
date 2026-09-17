import { CONFIG } from './config.js';
import { disconnect, getEmail, getToken, initAuth, signIn, signOut } from './auth.js';
import { pickSpreadsheet, rememberSheet, rememberedSheet } from './picker.js';
import { AccessError, AuthError, DemoSheets, GoogleSheets } from './sheets.js';
import { execute, loadAll } from './writer.js';
import { renderDashboard } from './dashboard.js';
import { openEditor } from './edit.js';
import { html, mount } from './util.js';

const $ = (s) => document.querySelector(s);
const VIEWS = ['setup', 'signin', 'pick', 'loading', 'main'];
const state = { adapter: null, model: null, data: null, title: '', canEdit: true };

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const DEMO = isLocal && new URLSearchParams(location.search).has('demo');

function show(view) {
  for (const v of VIEWS) $(`#v-${v}`).hidden = v !== view;
  $('#bar-actions').hidden = view !== 'main';
}

function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 8000 : 3000);
}

// Drop the token and every trace of the data from the page.
function lock(message) {
  signOut();
  Object.assign(state, { adapter: null, model: null, data: null, title: '', canEdit: true });
  $('#dash').replaceChildren();
  $('#who').textContent = '';
  $('#who-menu').textContent = '';
  $('#sheet-name').textContent = '';
  const dlg = $('#dlg');
  if (dlg.open) dlg.close();
  if (DEMO) { location.reload(); return; }
  show('signin');
  if (message) toast(message, 'info');
}

async function load({ quiet = false } = {}) {
  if (!quiet) show('loading');
  const { data, model } = await loadAll(state.adapter);
  Object.assign(state, { data, model, title: state.adapter.title || 'your sheet' });
  $('#sheet-name').textContent = state.title;
  renderDashboard($('#dash'), state);
  show('main');
}

async function openSheet(sheet) {
  state.adapter = new GoogleSheets(sheet.id, getToken);
  try {
    await load();
  } catch (e) {
    if (e instanceof AccessError) {
      rememberSheet(getEmail(), null);
      show('pick');
      toast(e.message, 'err');
      return;
    }
    throw e;
  }
}

async function afterSignIn() {
  const email = getEmail();
  const allowed = CONFIG.allowedEmails.map((e) => e.toLowerCase());
  if (allowed.length && !allowed.includes(email.toLowerCase())) {
    signOut();
    throw new Error(`${email} isn't set up for this app.`);
  }
  // UI-level role. The real limit on writing is the sheet's own sharing:
  // a Viewer's write is refused by Google with a 403.
  const editors = CONFIG.editors.map((e) => e.toLowerCase());
  state.canEdit = !editors.length || editors.includes(email.toLowerCase());

  $('#who').textContent = email;
  $('#who-menu').textContent = state.canEdit ? email : `${email} (view only)`;
  const sheet = rememberedSheet(email);
  if (sheet) await openSheet(sheet);
  else show('pick');
}

function fail(e) {
  console.error(e);
  if (e instanceof AuthError) { lock('Your session expired — sign in again to continue.'); return; }
  if (!state.model) show(getToken() ? 'pick' : (CONFIG.clientId ? 'signin' : 'setup'));
  toast(e.message || String(e), 'err');
}

/* ---------- wiring ---------- */

$('#btn-signin').addEventListener('click', () => {
  $('#btn-signin').disabled = true;
  signIn().then(afterSignIn).catch(fail).finally(() => { $('#btn-signin').disabled = false; });
});

$('#btn-pick').addEventListener('click', async () => {
  try {
    if (!getToken()) throw new AuthError('expired');
    const sheet = await pickSpreadsheet({ apiKey: CONFIG.apiKey, appId: CONFIG.appId, token: getToken() });
    if (!sheet) return;
    rememberSheet(getEmail(), sheet);
    await openSheet(sheet);
  } catch (e) { fail(e); }
});

$('#btn-refresh').addEventListener('click', () => {
  if (!DEMO && !getToken()) { lock('Your session expired — sign in again to continue.'); return; }
  load({ quiet: true }).then(() => toast('Up to date')).catch(fail);
});

$('#btn-signout').addEventListener('click', () => lock('Signed out.'));

$('#btn-switch').addEventListener('click', () => {
  if (DEMO) return;
  rememberSheet(getEmail(), null);
  Object.assign(state, { model: null, data: null });
  $('#dash').replaceChildren();
  show('pick');
});

$('#btn-disconnect').addEventListener('click', () => {
  if (DEMO) return;
  if (!confirm('Revoke this app’s access to your Google account? You will need to sign in and pick the sheet again.')) return;
  rememberSheet(getEmail(), null);
  disconnect();
  lock('Access revoked.');
});

$('#dash').addEventListener('click', (e) => {
  const el = e.target.closest('[data-edit], [data-add]');
  if (!el || !state.model) return;
  if (!state.canEdit) { toast('This account has view-only access.', 'err'); return; }
  if (!DEMO && !getToken()) { lock('Your session expired — sign in again to continue.'); return; }
  const d = el.dataset;
  const request = d.add ? { add: d.add }
    : d.edit === 'cell' ? { path: d.path.split('.') }
      : d.edit === 'link' ? { link: d.sheet }
        : { id: d.id, key: d.key };
  openEditor($('#dlg'), state, request, {
    onWrite: async (plan) => {
      await execute(state.adapter, plan);
      await load({ quiet: true });
      toast('Saved to your sheet');
    },
  });
});

/* ---------- idle lock ---------- */

let lastActive = Date.now();
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
}
const idleCheck = () => {
  if (!DEMO && state.model && Date.now() - lastActive > CONFIG.idleMinutes * 60000) {
    lock(`Signed out after ${CONFIG.idleMinutes} minutes of inactivity.`);
  }
};
setInterval(idleCheck, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) idleCheck(); });

/* ---------- boot ---------- */

(async () => {
  if (DEMO) {
    // ?demo&viewer previews the read-only view that non-editor accounts get
    state.canEdit = !new URLSearchParams(location.search).has('viewer');
    $('#demo-banner').hidden = false;
    $('#who').textContent = 'demo';
    $('#who-menu').textContent = state.canEdit ? 'demo mode' : 'demo mode (view only)';
    try {
      state.adapter = await DemoSheets.load();
      await load();
    } catch (e) {
      show('setup');
      mount($('#setup-msg'), html`<b>Demo mode:</b> ${e.message}`);
    }
    return;
  }
  if (!CONFIG.clientId) { show('setup'); return; }
  show('signin');
  $('#btn-signin').disabled = true;
  try {
    await initAuth(CONFIG.clientId);
    $('#btn-signin').disabled = false;
  } catch (e) { fail(e); }
})();
