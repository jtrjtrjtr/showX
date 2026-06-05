---
id: "B001-012"
title: "PWA workspace bootstrap (Vite + React + Yjs + IndexedDB)"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
depends_on: ["B001-001"]
target_files:
  - "pwa/src/main.tsx"
  - "pwa/src/App.tsx"
  - "pwa/src/lib/discovery.ts"
  - "pwa/src/lib/syncClient.ts"
  - "pwa/src/lib/auth.ts"
  - "pwa/src/lib/types.ts"
  - "pwa/src/components/DiscoveryView.tsx"
  - "pwa/src/components/PairingView.tsx"
  - "pwa/src/components/PlaceholderShowView.tsx"
  - "pwa/src/components/AppShell.tsx"
  - "pwa/src/styles.css"
  - "pwa/public/manifest.webmanifest"
  - "pwa/public/sw.js"
  - "pwa/package.json"
  - "tests/unit/pwa/syncClient.test.tsx"
  - "tests/unit/pwa/auth.test.ts"
  - "tests/unit/pwa/App.test.tsx"
acceptance_criteria:
  - "PWA entry pwa/src/main.tsx mounts <App /> on #root"
  - "App.tsx is a mode router: 'discover' (no host selected) → 'pair' (host selected, no token) → 'show' (token present)"
  - "Mode also driven by URL query `?mode=shell` (Electron shell renders the App in 'shell' mode rendering a different placeholder)"
  - "discovery.ts attempts probe via fetch to `GET /system/health` (defined in B001-005 AssetServer) on known LAN ranges OR falls back to manual host entry. Allows CORS origins from 192.168.*, 10.*, 172.16-31.*"
  - "syncClient.ts creates a Y.Doc with y-indexeddb provider (always-on local cache) + y-websocket provider connecting to `ws://<host>:<port>/yjs/<show_id>?token=<device_token>` per protocol_dictionary.md §7.1"
  - "syncClient supports reconnect with exponential backoff (1s, 2s, 4s, capped at 30s)"
  - "sideChannel.ts connects to `ws://<host>:<port>/events/<show_id>` for GO + presence (NOT in CRDT) per protocol_dictionary.md §7.2"
  - "auth.ts stores/reads the device token in IndexedDB under DB 'showx-auth', store 'tokens', key = host. Token encrypted via Web Crypto SubtleCrypto AES-GCM with per-install device key"
  - "PairingView shows PIN entry input + display_name input + department selectors; calls POST /pairing/claim with full payload `{ offer_id, pin, display_name, owned_departments[], watched_departments[], client_pubkey }` per pairing_auth.md §5.2"
  - "PairingView long-polls `/pairing/<request_id>/status` until SM allow/refuse"
  - "PlaceholderShowView shows a 'Connected to <host> as <display_name>' panel with the current Y.Doc sync status indicator + last GO event from side-channel"
  - "manifest.webmanifest declares name, short_name, icons, theme_color, display: standalone"
  - "sw.js registers + caches the PWA shell + assets for offline first-load; does NOT cache cuelist data (Yjs+IndexedDB owns that)"
  - "Vitest tests pass for syncClient (Y.Doc lifecycle + reconnect), sideChannel (pub/sub + idempotency), auth (round-trip token storage via fake-indexeddb), App (mode router happy paths)"
---

## Context

The PWA is what runs on every station device: SM iPad, LX laptop, video op phone, audience-facing display, etc. It connects to the ShowX FOH Mac over LAN, pairs once, then receives the show document via Yjs and renders the per-department view.

This task scaffolds the PWA so subsequent bundles (ShowX-3 Cuelist Core) can build the real UI on top. The actual cuelist UI is explicitly OUT of scope — this task creates the discovery + pairing + sync plumbing + a placeholder show view.

The PWA serves dual duty: it runs as a true PWA on stations, AND the Electron shell loads the SAME bundle but renders the shell-side UI when `?mode=shell` is in the URL (per B001-011). One Vite build, two render trees behind a small mode switch.

## Implementation notes

### Dependencies (add to `pwa/package.json`)

```
"dependencies": {
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "showx-shared": "workspace:*",
  "yjs": "^13.6.10",
  "y-websocket": "^2.0.3",
  "y-indexeddb": "^9.0.12"
},
"devDependencies": {
  "@types/react": "^18.2.0",
  "@types/react-dom": "^18.2.0",
  "@vitejs/plugin-react": "^4.2.0",
  "typescript": "^5.4.0",
  "vite": "^5.2.0",
  "fake-indexeddb": "^5.0.2",
  "@testing-library/react": "^14.2.0",
  "@testing-library/jest-dom": "^6.4.0",
  "jsdom": "^24.0.0"
}
```

Vitest config (root `vitest.config.ts` already exists from B001-001) needs to recognize the PWA tests — add a `test.environment` override per file via `// @vitest-environment jsdom` pragma at the top of `.test.tsx` files, OR add a projects entry in vitest config. Keep simple: top-of-file pragma.

### `pwa/src/lib/types.ts`

```ts
export interface DiscoveredHost {
  host: string;            // ip or hostname
  port: number;
  name?: string;           // mDNS instance name if available
  pairingAvailable: boolean;
}

export interface PairedSession {
  host: string;
  port: number;
  token: string;
  display_name: string;
  device_id: string;
  paired_at: number;
}

export type AppMode = 'discover' | 'pair' | 'show' | 'shell';

export interface SyncStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  attempts: number;
  lastError?: string;
}
```

### `pwa/src/lib/auth.ts`

Token storage in IndexedDB (NOT localStorage — IDB survives more clear-data scenarios on mobile Safari, and the rest of Yjs uses IDB anyway).

```ts
const DB_NAME = 'showx-auth';
const STORE = 'tokens';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(s: PairedSession): Promise<void> {
  const db = await openDb();
  await idbPut(db, STORE, s, s.host);
}

export async function loadSession(host: string): Promise<PairedSession | null> {
  const db = await openDb();
  return idbGet(db, STORE, host);
}

export async function listSessions(): Promise<PairedSession[]> { ... }

export async function clearSession(host: string): Promise<void> { ... }
```

Small `idbGet`/`idbPut`/`idbDelete` helpers wrapping the imperative IDB API in promises. Don't pull in `idb-keyval` — keep dependency count low; the helpers are 20 lines total.

### `pwa/src/lib/discovery.ts`

Browser cannot do mDNS directly. Two paths:

1. **Same-host discovery** (when PWA is served from ShowX itself, common after pairing): `window.location.origin` IS the host. Return immediately.
2. **Cross-host discovery**: probe a small list of likely LAN IPs by fetching `/system/health` with a timeout. The ping endpoint is served by AssetServer (B001-005) and returns `{ service: 'showx', port, version }`.
3. **Manual fallback**: a form input for host/port.

```ts
export interface DiscoveryResult {
  hosts: DiscoveredHost[];
  source: 'origin' | 'probe' | 'manual';
}

export async function discoverFromOrigin(): Promise<DiscoveryResult | null> {
  try {
    const r = await fetchWithTimeout(`${window.location.origin}/system/health`, 1500);
    if (!r.ok) return null;
    const body = await r.json();
    return { hosts: [{ host: window.location.hostname, port: Number(window.location.port) || 80, pairingAvailable: true }], source: 'origin' };
  } catch { return null; }
}

export async function probeLan(hints: string[]): Promise<DiscoveredHost[]> {
  // hints: ['192.168.1.10', '10.0.0.5', ...]
  const probes = hints.map(async (host) => {
    try {
      const r = await fetchWithTimeout(`http://${host}:8088/system/health`, 800);
      if (r.ok) {
        const body = await r.json();
        return { host, port: body.port ?? 8088, name: body.name, pairingAvailable: true };
      }
    } catch {}
    return null;
  });
  return (await Promise.all(probes)).filter((x): x is DiscoveredHost => x !== null);
}

export function manualHost(host: string, port: number): DiscoveredHost {
  return { host, port, pairingAvailable: true };
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, mode: 'cors' }); } finally { clearTimeout(t); }
}
```

The hints list for `probeLan` is hardcoded for v1: a small set of common LAN ranges. The Cuelist Core / production UI later will read this from saved sessions / user input. Comment with a TODO.

### `pwa/src/lib/syncClient.ts`

```ts
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';

export interface SyncClient {
  doc: Y.Doc;
  status: SyncStatus;
  onStatusChange(cb: (s: SyncStatus) => void): () => void;
  destroy(): void;
}

export function createSyncClient(opts: {
  docName: string;                // e.g. "default" or showId
  host: string; port: number; token: string;
  awareness?: { user: string };
}): SyncClient {
  const doc = new Y.Doc();
  const idb = new IndexeddbPersistence(opts.docName, doc);
  const wsUrl = `ws://${opts.host}:${opts.port}/sync`;
  const status: SyncStatus = { state: 'connecting', attempts: 0 };
  const listeners = new Set<(s: SyncStatus) => void>();

  let provider: WebsocketProvider | null = null;
  let backoffMs = 1000;
  let stopped = false;

  function connect() {
    if (stopped) return;
    status.state = status.attempts === 0 ? 'connecting' : 'reconnecting';
    emit();
    provider = new WebsocketProvider(wsUrl, opts.docName, doc, {
      params: { token: opts.token },
      connect: true,
    });
    provider.on('status', (e: { status: string }) => {
      if (e.status === 'connected') {
        status.state = 'connected';
        backoffMs = 1000;
        status.attempts = 0;
        emit();
      } else if (e.status === 'disconnected') {
        status.state = 'reconnecting';
        status.attempts += 1;
        emit();
        scheduleReconnect();
      }
    });
    provider.on('connection-error', (e: Error) => {
      status.lastError = e.message;
      emit();
    });
  }

  function scheduleReconnect() {
    if (stopped) return;
    setTimeout(() => {
      if (stopped) return;
      provider?.destroy();
      backoffMs = Math.min(backoffMs * 2, 30_000);
      connect();
    }, backoffMs);
  }

  function emit() { for (const l of listeners) l({ ...status }); }
  connect();

  return {
    doc,
    get status() { return { ...status }; },
    onStatusChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    destroy() { stopped = true; provider?.destroy(); idb.destroy(); doc.destroy(); listeners.clear(); },
  };
}
```

Awareness layer is not yet used (no presence UI in this task). Provider supports awareness out of the box for ShowX-3 to consume.

### `pwa/src/App.tsx`

```tsx
import { useEffect, useState } from 'react';
import { DiscoveryView } from './components/DiscoveryView.js';
import { PairingView } from './components/PairingView.js';
import { PlaceholderShowView } from './components/PlaceholderShowView.js';
import { AppShell } from './components/AppShell.js';
import { listSessions } from './lib/auth.js';
import type { AppMode, PairedSession, DiscoveredHost } from './lib/types.js';

function modeFromUrl(): AppMode | null {
  const u = new URLSearchParams(window.location.search);
  const m = u.get('mode');
  if (m === 'shell') return 'shell';
  return null;
}

export function App() {
  const [mode, setMode] = useState<AppMode>('discover');
  const [host, setHost] = useState<DiscoveredHost | null>(null);
  const [session, setSession] = useState<PairedSession | null>(null);

  useEffect(() => {
    const urlMode = modeFromUrl();
    if (urlMode === 'shell') { setMode('shell'); return; }
    // Try to load most recent session
    listSessions().then((sessions) => {
      const latest = sessions.sort((a, b) => b.paired_at - a.paired_at)[0];
      if (latest) {
        setSession(latest);
        setHost({ host: latest.host, port: latest.port, pairingAvailable: false });
        setMode('show');
      }
    });
  }, []);

  if (mode === 'shell') return <AppShell title="ShowX Shell" subtitle="Module sidebar — UI in later bundle" />;
  if (mode === 'discover') return <DiscoveryView onPick={(h) => { setHost(h); setMode('pair'); }} />;
  if (mode === 'pair' && host) return <PairingView host={host} onPaired={(s) => { setSession(s); setMode('show'); }} />;
  if (mode === 'show' && session) return <PlaceholderShowView session={session} />;
  return <DiscoveryView onPick={(h) => { setHost(h); setMode('pair'); }} />;
}
```

### `pwa/src/components/DiscoveryView.tsx`

Component shows: spinner → discovered hosts list (clickable) → manual entry form. Calls `discoverFromOrigin()` then `probeLan(['192.168.1.1', '192.168.0.1', '10.0.0.1', '10.0.0.5'])` as a starter hint set. Minimal styling via `styles.css`. ~80 lines.

### `pwa/src/components/PairingView.tsx`

Form: display name input + 6-digit PIN input + Pair button. On submit:
```ts
const r = await fetch(`http://${host.host}:${host.port}/pairing/claim`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin, display_name }),
});
if (!r.ok) { setError(r.status === 401 ? 'PIN invalid or expired' : 'pairing failed'); return; }
const { token, device } = await r.json();
const session: PairedSession = { host: host.host, port: host.port, token, display_name, device_id: device.device_id, paired_at: Date.now() };
await saveSession(session);
onPaired(session);
```
~80 lines.

### `pwa/src/components/PlaceholderShowView.tsx`

Mounts a `useSyncClient(session)` hook that constructs the SyncClient and renders:
```
Connected to <host:port>
Display name: <display_name>
Sync status: ● connected | ◌ reconnecting | × disconnected
Doc size: <n> keys
[Sign out] [Force reconnect]
```
~60 lines including hook. The hook:
```ts
function useSyncClient(s: PairedSession) {
  const [status, setStatus] = useState<SyncStatus>({ state: 'connecting', attempts: 0 });
  const clientRef = useRef<SyncClient | null>(null);
  useEffect(() => {
    const c = createSyncClient({ docName: 'default', host: s.host, port: s.port, token: s.token });
    clientRef.current = c;
    const unsub = c.onStatusChange(setStatus);
    return () => { unsub(); c.destroy(); };
  }, [s.host, s.port, s.token]);
  return { client: clientRef.current, status };
}
```

### `pwa/src/components/AppShell.tsx`

Placeholder shell-mode UI: dark-themed div with a sidebar mock + "modules loaded" placeholder. ~30 lines.

### `pwa/src/styles.css`

Minimal — system font stack, dark background `#0a0a0a`, light text, basic spacing. Don't try to match production design here.

### `pwa/public/manifest.webmanifest`

```json
{
  "name": "ShowX",
  "short_name": "ShowX",
  "description": "XLAB live show control station",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Icons MAY be placeholder PNGs (solid black squares) for this task. Note in done report that real icons come from B001-013 / brand later.

### `pwa/public/sw.js`

```js
// ShowX service worker — placeholder, no caching yet.
// TODO(ShowX-6): cache app shell + show data for full offline support.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough */ });
```

Register the SW in `main.tsx`:
```ts
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
```

### `pwa/index.html` updates

The HTML created in B001-001 needs:
- `<link rel="manifest" href="/manifest.webmanifest" />`
- `<meta name="theme-color" content="#0a0a0a" />`

Edit `pwa/index.html` minimally; do not re-author it.

## Refer to specs

- `docs/specs/data_model.md` — Y.Doc shape for the show document (this task creates a Y.Doc but does not yet populate shape — ShowX-3 owns).
- `docs/specs/protocol_dictionary.md` — section on WSS endpoint `/sync` confirms the URL used by `createSyncClient`.
- `docs/specs/pairing_auth.md` — confirms `POST /pairing/claim` request/response shape used by PairingView.

## Test plan

`tests/unit/pwa/auth.test.ts`
- Uses `fake-indexeddb` polyfill (`import 'fake-indexeddb/auto'` at top).
- saveSession + loadSession round-trip → equal.
- listSessions returns all saved.
- clearSession removes one.
- loadSession for unknown host returns null.

`tests/unit/pwa/syncClient.test.tsx`
- Mock `y-websocket.WebsocketProvider` via Vitest.
- createSyncClient → Y.Doc is a real Y.Doc instance.
- Provider emits `{status:'connected'}` → SyncClient.status → 'connected'.
- Provider emits `{status:'disconnected'}` → SyncClient.status → 'reconnecting'; next attempt scheduled with backoff (fake timers + advance 1000ms → reconnect called).
- destroy() → provider destroyed + idb destroyed + listeners cleared.

`tests/unit/pwa/App.test.tsx`
- Render <App /> with no saved sessions → DiscoveryView shown.
- Render <App /> with URL `?mode=shell` → AppShell shown.
- Mock listSessions to return one session → PlaceholderShowView shown.
- Mock global fetch for `/pairing/claim` to return {token,device} → after submitting PairingView, App switches to 'show' mode.

Use `@testing-library/react` for rendering + `jsdom` environment (top-of-file pragma `// @vitest-environment jsdom`).

Run: `pnpm --filter showx-pwa typecheck && pnpm test tests/unit/pwa`

Plus a smoke `pnpm --filter showx-pwa build` MUST succeed (no TypeScript errors, Vite emits `pwa/dist/`).

## Out of scope

- Cuelist UI / cuelist data model in Yjs (ShowX-3)
- Real PWA caching strategy (ShowX-6)
- Cross-origin auth flow nuances (Same-origin assumption for v1)
- Awareness presence UI
- Production icon set
- mDNS via WebTransport / multicast hack (browser limitation, will require manual entry or origin-based discovery in v1)
- Form validation styling (functional only)
- Accessibility audit (later polish)
- Mobile-first responsive design (later polish)
- Offline mode beyond y-indexeddb local cache

## Notes for Critic

- Verify that the same Vite build serves both the PWA experience AND the Electron shell mode — the mode router in App.tsx is what distinguishes. Confirm there are no separate build outputs.
- syncClient backoff math: 1s → 2s → 4s → 8s → 16s → 30s → 30s capped. Confirm `Math.min` is applied AFTER the doubling.
- `fake-indexeddb/auto` import must be at the top of EVERY test file that touches IndexedDB, BEFORE any other import that might touch IDB. Common mistake: ordering imports wrong.
- The PWA serves itself from ShowX's AssetServer in production; CORS / fetch issues won't appear because origin matches. But the probe step (`probeLan`) DOES cross origins — confirm AssetServer's `/system/health` route returns `Access-Control-Allow-Origin: *` (or this task adds a note that B001-005 should). If route doesn't exist yet, comment the path in code and flag in done report.
- Service worker placeholder must NOT cache anything yet. A naive `cache.add(...)` here will pin the dev build into IDB and break iteration. Confirm sw.js fetch handler is truly passthrough.
- Confirm `<App />` doesn't try to connect to ShowX during tests (no real fetch). All network paths should be behind injected/mocked helpers OR guarded by mode.
- `WebsocketProvider` options: confirm `params: { token }` is forwarded as a query string (`?token=...`), which is how y-websocket's URL builder works. The server side (B001-006 SyncBroker) needs to read it from there. Note as integration concern in done report.
