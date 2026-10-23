// The service worker (sw/service-worker.js), run against stand-ins for the
// browser's cache and network: what it answers from the device, what it
// fetches, and what it never touches.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'vitest';

const SCOPE = 'https://example.github.io/networth-tracker/';

type Handler = (e: unknown) => void;

/** Loads the worker with a fake network that answers `served[path]` and counts requests. */
function worker(served: Record<string, string>, caches = new Map<string, Map<string, string>>()) {
  const handlers: Record<string, Handler> = {};
  const fetched: { url: string; cache?: string }[] = [];
  let online = true;
  const fakeFetch = async (input: string | { url: string }, init?: { cache?: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    fetched.push({ url, cache: init?.cache });
    if (!online) throw new TypeError('offline');
    const path = new URL(url).pathname.replace('/networth-tracker/', '') || './';
    return path in served ? new Response(served[path], { status: 200 }) : new Response('missing', { status: 404 });
  };
  const store = (name: string) => {
    if (!caches.has(name)) caches.set(name, new Map());
    const m = caches.get(name)!;
    const key = (r: string | Request | { url: string }) => (typeof r === 'string' ? r : r.url);
    return {
      match: async (r: string | { url: string }) => (m.has(key(r)) ? new Response(m.get(key(r))) : undefined),
      put: async (r: string | { url: string }, res: Response) => { m.set(key(r), await res.text()); },
      addAll: async (reqs: { url: string }[]) => { for (const r of reqs) { const res = await fakeFetch(r.url); m.set(r.url, await res.text()); } },
    };
  };
  const ctx = {
    self: { registration: { scope: SCOPE }, addEventListener: (n: string, h: Handler) => { handlers[n] = h; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async (n: string) => store(n), keys: async () => [...caches.keys()], delete: async (n: string) => caches.delete(n) },
    fetch: fakeFetch, Request: class { url: string; constructor(u: string | URL) { this.url = String(u); } }, Response, URL, Promise,
  };
  const code = readFileSync(new URL('../sw/service-worker.js', import.meta.url), 'utf8');
  runInNewContext(`const VERSION = 'v2'; const PRECACHE = ['./', 'assets/index-abc.js'];\n${code}`, ctx);

  /** Dispatches a fetch; resolves to the response, or null when the worker let it pass through. */
  const request = async (url: string, opts: { mode?: string; cache?: string } = {}) => {
    let answer: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({
      request: { url, method: 'GET', mode: opts.mode ?? 'cors', cache: opts.cache ?? 'default' },
      respondWith: (p: Promise<Response>) => { answer = p; },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const res = answer ? await answer : null;
    await Promise.all(waits);
    return res ? await (res as Response).text() : null;
  };
  const lifecycle = async (name: 'install' | 'activate') => {
    const waits: Promise<unknown>[] = [];
    handlers[name]({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  return { request, lifecycle, fetched, caches, goOffline: () => { online = false; }, served };
}

test('installing stores the first screen; activating clears earlier builds\' stores', async () => {
  const caches = new Map([['networth-v1', new Map([['old', 'x']])]]);
  const w = worker({ './': 'page v2', 'assets/index-abc.js': 'js' }, caches);
  await w.lifecycle('install');
  assert.deepEqual([...caches.get('networth-v2')!.values()], ['page v2', 'js']);
  await w.lifecycle('activate');
  assert.deepEqual([...caches.keys()], ['networth-v2']);
});

test('opening the app shows the stored page at once, and refreshes it behind for next time', async () => {
  const w = worker({ './': 'page v2', 'assets/index-abc.js': 'js' });
  await w.lifecycle('install');
  w.served['./'] = 'page v3'; // a new build went live
  assert.equal(await w.request(SCOPE, { mode: 'navigate' }), 'page v2', 'the stored page, not the network');
  assert.equal(await w.request(SCOPE, { mode: 'navigate' }), 'page v3', 'the next launch has the newer page');
});

test('a reload (the Reload button, pull to refresh) goes to the network first, and works offline', async () => {
  const w = worker({ './': 'page v2' });
  await w.lifecycle('install');
  w.served['./'] = 'page v3';
  // The Reload button first fetches the page with cache: "reload", then reloads
  assert.equal(await w.request(SCOPE, { cache: 'reload' }), 'page v3');
  assert.equal(await w.request(SCOPE, { mode: 'navigate' }), 'page v3', 'the reload lands on the new page');
  assert.equal(await w.request(SCOPE, { mode: 'navigate', cache: 'no-cache' }), 'page v3');
  w.goOffline();
  assert.equal(await w.request(SCOPE, { mode: 'navigate', cache: 'no-cache' }), 'page v3', 'offline: the stored page');
});

test('build files come from the device once stored', async () => {
  const w = worker({ './': 'p', 'assets/index-abc.js': 'js', 'assets/pdf-xyz.js': 'pdf' });
  await w.lifecycle('install');
  const before = w.fetched.length;
  assert.equal(await w.request(`${SCOPE}assets/index-abc.js`), 'js');
  assert.equal(w.fetched.length, before, 'no network for a stored file');
  assert.equal(await w.request(`${SCOPE}assets/pdf-xyz.js`), 'pdf', 'a file used later is fetched once');
  w.goOffline();
  assert.equal(await w.request(`${SCOPE}assets/pdf-xyz.js`), 'pdf', '…and then available offline');
});

test('Google, the Sheets API and the update check are never touched', async () => {
  const w = worker({ './': 'p' });
  await w.lifecycle('install');
  for (const url of [
    'https://sheets.googleapis.com/v4/spreadsheets/abc/values:batchGet?ranges=x',
    'https://accounts.google.com/gsi/client',
    `${SCOPE}version.json?t=123`,
    'https://example.github.io/another-site/',
  ]) {
    assert.equal(await w.request(url), null, url);
  }
});
