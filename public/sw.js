// Offline support for the IFRS 9 ECL Calculator.
// Pages: network first (so new releases arrive), cached copy when offline.
// App files (hashed, never change): cache first.
// World Bank data: network first, last good copy when offline.
const CACHE = 'ifrs9-ecl-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // also cache the JS/CSS files the page refers to, so the very first visit is enough to work offline
    try {
      const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(m => m[1]);
      await cache.addAll(assets);
    } catch (e) { /* cached later on use */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const networkFirst = async (req, fallbackKey) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(fallbackKey || req);
    if (hit) return hit;
    throw e;
  }
};

self.addEventListener('fetch', event => {
  const req = event.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === 'https://api.worldbank.org') { event.respondWith(networkFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, './index.html')); return; }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req); if (hit) return hit;
    const res = await fetch(req);
    if (res && res.ok && (url.pathname.includes('/assets/') || /\.(png|svg|webmanifest|html)$/.test(url.pathname))) cache.put(req, res.clone());
    return res;
  })());
});
