// ShowX PWA Service Worker — v0.1.4 fix
//
// LAN-FIRST: no asset caching. The service worker is registered only for PWA
// installability (Add to Home Screen / standalone mode). Caching Vite-generated
// assets causes a hard loading hang after every Electron update:
//   1. SW caches old index.html (pointing to old hash-named bundle).
//   2. After a Vite rebuild, the bundle filename changes.
//   3. SW serves stale index.html → browser requests missing bundle → 503 Offline
//      → React never mounts → blank "Loading…" screen forever.
// Fix: network-only for all navigations/assets + clear any stale caches left by
// older SW versions on activate.

const BYPASS_PREFIXES = ['/yjs/', '/sync/', '/events/', '/pairing/', '/_showx/'];

self.addEventListener('install', () => {
  // Skip waiting immediately so this SW takes over without requiring all old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Clear ALL caches from prior SW versions (they may contain stale index.html +
  // missing bundle combinations that cause the loading hang).
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Live protocol / API paths must bypass the SW entirely (let the browser handle them).
  if (BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;
  // Network-only: pass every request directly to the network. If the Electron server
  // is unreachable the browser shows its native error, which is far better than serving
  // a stale index.html that references a missing Vite chunk.
  e.respondWith(fetch(e.request));
});
