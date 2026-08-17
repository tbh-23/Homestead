// Homestead service worker — makes the app installable and resilient to flaky
// connections. Strategy:
//   • Navigations: network-first, falling back to the cached shell when offline.
//   • Static assets (our own JS/CSS/icons, the curriculum from jsdelivr, fonts,
//     Tailwind): stale-while-revalidate, so repeat loads are instant and work
//     offline once seen.
//   • Everything else — the Puter SDK, auth, KV, workers/API — is never touched,
//     so account data and sign-in always go straight to the network.
//
// Bump CACHE when the caching logic changes to retire old entries.
const CACHE = 'homestead-cache-v1';

// Hosts whose GET assets are safe to cache. Deliberately excludes js.puter.com
// and every api.puter.com endpoint (auth/data must stay live).
const ALLOW_HOSTS = [
  self.location.host,
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isCacheable(request, url) {
  return request.method === 'GET' && ALLOW_HOSTS.includes(url.host);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch { return; }

  // App navigations: try the network, fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstDoc(request));
    return;
  }
  if (!isCacheable(request, url)) return; // leave Puter API/SDK etc. untouched
  event.respondWith(staleWhileRevalidate(request));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return cached || (await network) || fetch(request);
}

async function networkFirstDoc(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put('shell', res.clone());
    return res;
  } catch {
    return (await cache.match('shell')) || (await cache.match(request)) || Response.error();
  }
}
