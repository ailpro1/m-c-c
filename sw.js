/* Service worker: keeps the app self-updating.

   Strategy is network-first for same-origin GETs. Whatever the server has
   wins whenever the network is reachable, so a deploy lands on the next
   load without any manual cache-busting; the cache exists purely as an
   offline fallback. skipWaiting + clients.claim mean a new worker takes
   over immediately rather than waiting for every tab to close, and the
   page reloads itself once it does (see app.js). */

const CACHE = 'commitment-checklist-v1';

const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './icon.svg',
  './favicon-32.png',
  './apple-touch-icon.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      // A failed precache must not block activation — the fetch handler
      // will populate the cache as pages are visited.
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // 'reload' bypasses the HTTP cache, so an update is never masked by a
      // still-fresh cached copy of styles.css or app.js.
      const fresh = await fetch(req, { cache: 'reload' });
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
