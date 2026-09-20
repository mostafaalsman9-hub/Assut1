const CACHE_NAME = 'assuit-sports-v2';
const CORE = ['./', './index.html', './manifest.json', './icon.png', './icon-192.png', './icon-maskable.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of CORE) {
      try { await cache.add(asset); } catch (err) { console.warn('Precache skipped:', asset, err); }
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Navigation fallback only: never return index.html for arbitrary assets/API files.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  // Cache-first for local static assets only; leave Firebase/API traffic network-only.
  const isStatic = /\.(?:html|css|js|png|jpg|jpeg|webp|svg|ico|json)$/i.test(url.pathname);
  if (!isStatic) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
