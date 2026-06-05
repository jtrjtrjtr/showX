// ShowX service worker — placeholder, no caching yet.
// TODO(ShowX-6): cache app shell + show data for full offline support.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough */ });
