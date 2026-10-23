// Keeps this app's own files on the device, so opening it doesn't wait on the
// network. Built into sw.js by vite.config.ts, which defines VERSION and
// PRECACHE (the files the first screen needs) above this code.
//
// Only this site's files are kept. Requests anywhere else — Google sign-in,
// the Sheets API — pass straight through, so nothing from your sheet is ever
// stored here.
//
//   Opening the app      the stored page at once; a fresh copy is fetched
//                        behind it for next time
//   Reload button, pull  the page from the network first (stored copy only
//   to refresh           if offline)
//   assets/*             stored on first use; their names change with every
//                        build, so a stored one is never out of date
//   version.json         always the network: it's how the app spots an update

/* global VERSION, PRECACHE */
const CACHE = `networth-${VERSION}`;
const scope = () => new URL(self.registration.scope);
const pageKey = () => scope().href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((path) => new Request(new URL(path, scope()), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

// Each build has its own store; the previous builds' are cleared
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('networth-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const base = scope();
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  if (url.pathname.endsWith('/version.json')) return;

  const isPage = req.mode === 'navigate' || url.pathname === base.pathname || url.pathname === `${base.pathname}index.html`;
  if (isPage) {
    // A reload asks for a fresh page ("no-cache" or "reload"); a launch doesn't
    const fresh = req.cache === 'reload' || req.cache === 'no-cache';
    event.respondWith(page(event, fresh));
  } else if (url.pathname.startsWith(`${base.pathname}assets/`)) {
    event.respondWith(stored(req));
  } else {
    event.respondWith(storedThenRefreshed(event));
  }
});

/** The app's page: stored at once on a launch, from the network first on a reload. */
async function page(event, fresh) {
  const cache = await caches.open(CACHE);
  const network = fetch(pageKey(), { cache: 'no-cache' }).then((res) => {
    if (res.ok) return cache.put(pageKey(), res.clone()).then(() => res);
    return res;
  });
  if (fresh) return network.catch(async () => (await cache.match(pageKey())) ?? Response.error());
  const cached = await cache.match(pageKey());
  if (!cached) return network;
  event.waitUntil(network.catch(() => {}));
  return cached;
}

/** Build files: named by their content, so a stored copy is always right. */
async function stored(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

/** Icons, logos, the manifest: the stored copy now, refreshed behind it. */
async function storedThenRefreshed(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) return cache.put(event.request, res.clone()).then(() => res);
    return res;
  });
  if (!hit) return network;
  event.waitUntil(network.catch(() => {}));
  return hit;
}
