const SHELL_CACHE = 'showx-shell-v1';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];
// Bypass these prefixes — live protocol/API paths that must not be cached
const BYPASS_PREFIXES = ['/yjs/', '/sync/', '/events/', '/pairing/', '/_showx/'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;
  // Network-first with cache fallback for shell assets
  e.respondWith(
    fetch(e.request).catch(async () => {
      const cached = await caches.match(e.request);
      return cached ?? new Response('Offline', { status: 503 });
    }),
  );
});
