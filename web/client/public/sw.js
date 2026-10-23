// Tasks service worker: the app opens and works with no connection.
// - Every file of this build is saved when the worker installs (the build fills in
//   PRECACHE and BUILD below), so any screen works offline, even one not opened before.
// - Page loads: the network if it answers within a few seconds, else the saved app.
// - API calls are never cached here: the app keeps its own offline copy (IndexedDB).
const BUILD = 'dev';
const PRECACHE = [];
const SHELL = `tasks-shell-${BUILD}`;
const ASSETS = `tasks-assets-${BUILD}`;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/privacypolicy.html'];
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));
    const assets = await caches.open(ASSETS);
    // Assets an earlier build already saved are reused; the rest are fetched now.
    for (const url of PRECACHE) {
      const hit = await caches.match(url);
      if (hit) await assets.put(url, hit);
      else await assets.add(new Request(url, { cache: 'reload' }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** The network, but give up after `ms` so a weak signal doesn't leave the app blank. */
function fetchWithin(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return;

  if (req.mode === 'navigate') {
    // Only real app pages become the offline copy (not a JSON/JS/image file opened in a tab).
    const isAppPage = !/\.[a-z0-9]+$/i.test(url.pathname);
    event.respondWith((async () => {
      try {
        const res = await fetchWithin(req, NAV_TIMEOUT_MS);
        const html = (res.headers.get('content-type') || '').includes('text/html');
        if (res.ok && html && isAppPage) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
        }
        return res;
      } catch {
        const saved = isAppPage ? await caches.match('/', { cacheName: SHELL }) : await caches.match(req);
        return saved || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed file names never change: saved copy first.
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(ASSETS)).put(req, res.clone());
      return res;
    })());
    return;
  }

  if (SHELL_FILES.includes(url.pathname)) {
    // Saved copy at once, refreshed in the background.
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const fresh = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit || Response.error());
      return hit || fresh;
    })());
  }
});
