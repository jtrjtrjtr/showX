---
id: "B001-006"
title: "SyncBroker service (embedded y-websocket + side-channel)"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B001-002", "B001-003", "B001-005"]
target_files:
  - "src/main/src/shared/SyncBroker.ts"
  - "src/main/src/shared/syncBroker/yWebsocketAdapter.ts"
  - "src/main/src/shared/syncBroker/sideChannel.ts"
  - "src/main/src/shared/syncBroker/authGate.ts"
  - "src/main/package.json"
  - "tests/unit/shared/SyncBroker.test.ts"
  - "tests/unit/shared/sideChannel.test.ts"
acceptance_criteria:
  - "`SyncBroker.attach(httpServer)` binds a Yjs WebSocket server to the existing AssetServer HTTP server (no new port)"
  - "WebSocket upgrade on path matching `/yjs/<show_id>` opens a Yjs sync session; other paths handed to next handler"
  - "WebSocket upgrade on path matching `/events/<show_id>` opens a side-channel pub/sub session (GO events + presence, NOT in CRDT)"
  - "`openDocument(name)` returns a `YDocHandle` wrapping a server-side `Y.Doc`; `closeDocument(handle)` tears down and removes from registry"
  - "Auth gate on WS upgrade: bearer token from `?token=` query OR `Authorization` header validated via injected `PairingValidator`; missing/invalid → 401 close"
  - "Persistence hook: per-document, `SyncBroker.registerPersistence(name, { load, save })` lets modules hydrate doc on open and persist on update (throttled)"
  - "Side channel: messages broadcast to all subscribers of the same show_id; in-memory only; NOT replicated to CRDT; bounded buffer (last 100 messages) for late joiners"
  - "`subscribeAwareness(name, handler)` exposes Yjs awareness updates to server-side observers (for cuelist presence UI)"
  - "≥12 vitest test cases total; uses in-memory `ws` server + `Y.Doc` clients, no real network"
  - "`pnpm --filter showx-main typecheck` passes"
  - "`pnpm vitest run tests/unit/shared/SyncBroker tests/unit/shared/sideChannel` passes 100%"
---

## Context

ShowX modules collaborate via Yjs CRDT documents (cuelist edits, REHEARSAL mode, multi-station awareness). The Cuelist Core module (ShowX-3) opens a doc per show; PWA stations connect via y-websocket and sync transparently. **One** y-websocket server runs in the Electron main process, embedded into the same HTTP server AssetServer (B001-005) already exposes — single port, single signed binary, single auth surface.

A side-channel exists for transient signals that must NOT be in the CRDT: cue-fire events (single fact, not a state mutation) and presence (operator's current cursor, their pinned cue) — these are pub/sub messages, not document history. Side-channel lives at `ws://<host>:<port>/events/<show_id>`.

Read `docs/specs/data_model.md` §8 (Yjs document layout per show) and `docs/specs/protocol_dictionary.md` §7 (side-channel message envelope + auth). Auth integration with PairingStore (B001-009) is deferred — for B001-006, the auth gate is a typed callback interface; B001-011 wires the real PairingStore validator in.

## Implementation notes

### Package deps to add to `src/main/package.json`

```json
{
  "dependencies": {
    "ws": "^8.16.0",
    "yjs": "^13.6.10",
    "y-protocols": "^1.0.6",
    "lib0": "^0.2.88"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10"
  }
}
```

We do NOT add `y-websocket` package as a dependency — its server bin assumes its own HTTP server. Instead we vendor the message protocol (sync + awareness messages from `y-protocols/sync` and `y-protocols/awareness`). y-websocket repo's `bin/utils.js` is the reference implementation; we adapt it.

### Architecture

```
AssetServer.httpServer()                  (B001-005)
        |
        v
SyncBroker.attach(httpServer)             (this task)
        |
   server.on('upgrade', ...)
        |
   route by URL path:
     /yjs/<show_id>    → YWebsocketAdapter (Y.Doc sync + awareness)
     /events/<show_id> → SideChannel (pub/sub)
   else              → leave for next listener (PairingStore B001-009)
```

### `src/main/src/shared/syncBroker/yWebsocketAdapter.ts`

Vendored Yjs sync protocol over `ws`. Implementation outline (Forge: adapt y-websocket's `bin/utils.js` patterns):

```ts
import * as Y from 'yjs';
import { WebSocketServer, WebSocket } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import type { Logger } from '../Logger.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export interface YDocEntry {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Set<WebSocket>;
  persistence?: PersistenceHook;
}

export interface PersistenceHook {
  load(doc: Y.Doc): Promise<void>;          // hydrate doc on first open
  save(doc: Y.Doc, update: Uint8Array): Promise<void>;   // called on update (throttled)
}

export class YWebsocketAdapter {
  private docs = new Map<string, YDocEntry>();
  private wss: WebSocketServer;

  constructor(private readonly log?: Logger) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  handleUpgrade(req: any, socket: any, head: Buffer, docName: string): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any)._showxDocName = docName;
      this.wss.emit('connection', ws, req);
    });
  }

  registerPersistence(name: string, hook: PersistenceHook): void {
    const entry = this.getOrCreateDoc(name);
    entry.persistence = hook;
  }

  openDocument(name: string): YDocEntry {
    return this.getOrCreateDoc(name);
  }

  closeDocument(name: string): void {
    const entry = this.docs.get(name);
    if (!entry) return;
    for (const ws of entry.conns) try { ws.close(1000, 'doc_closed'); } catch {}
    entry.doc.destroy();
    this.docs.delete(name);
  }

  private getOrCreateDoc(name: string): YDocEntry {
    let entry = this.docs.get(name);
    if (entry) return entry;
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    entry = { name, doc, awareness, conns: new Set() };
    this.docs.set(name, entry);
    // hydrate
    Promise.resolve().then(async () => {
      try {
        await entry!.persistence?.load(doc);
      } catch (err) {
        this.log?.error('y-doc load failed', { name, error: String(err) });
      }
    });
    // persist on update (throttled)
    let timer: NodeJS.Timeout | null = null;
    let pendingUpdate: Uint8Array | null = null;
    doc.on('update', (update: Uint8Array) => {
      pendingUpdate = pendingUpdate ? Y.mergeUpdates([pendingUpdate, update]) : update;
      if (timer) return;
      timer = setTimeout(async () => {
        const u = pendingUpdate!;
        pendingUpdate = null;
        timer = null;
        try { await entry!.persistence?.save(doc, u); } catch (err) {
          this.log?.error('y-doc save failed', { name, error: String(err) });
        }
      }, 250);
    });
    return entry;
  }

  private onConnection(ws: WebSocket, _req: any) {
    const docName = (ws as any)._showxDocName as string;
    const entry = this.getOrCreateDoc(docName);
    entry.conns.add(ws);

    // initial sync
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, entry.doc);
    ws.send(encoding.toUint8Array(enc));

    ws.on('message', (data: Buffer) => {
      try {
        const dec = decoding.createDecoder(new Uint8Array(data));
        const type = decoding.readVarUint(dec);
        if (type === MSG_SYNC) {
          const reply = encoding.createEncoder();
          encoding.writeVarUint(reply, MSG_SYNC);
          syncProtocol.readSyncMessage(dec, reply, entry.doc, ws);
          if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(entry.awareness, decoding.readVarUint8Array(dec), ws);
        }
      } catch (err) {
        this.log?.error('y-doc message error', { docName, error: String(err) });
      }
    });

    // broadcast doc updates to other conns
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === ws) return;
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_SYNC);
      syncProtocol.writeUpdate(e, update);
      const out = encoding.toUint8Array(e);
      for (const peer of entry.conns) if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(out);
    };
    entry.doc.on('update', updateHandler);

    const awHandler = ({ added, updated, removed }: any) => {
      const changed = added.concat(updated, removed);
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MSG_AWARENESS);
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(entry.awareness, changed));
      const out = encoding.toUint8Array(e);
      for (const peer of entry.conns) if (peer.readyState === WebSocket.OPEN) peer.send(out);
    };
    entry.awareness.on('update', awHandler);

    ws.on('close', () => {
      entry.conns.delete(ws);
      entry.doc.off('update', updateHandler);
      entry.awareness.off('update', awHandler);
      awarenessProtocol.removeAwarenessStates(entry.awareness, [entry.awareness.clientID], ws);
    });
  }
}
```

### `src/main/src/shared/syncBroker/sideChannel.ts`

```ts
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { SideChannelMessage, Subscription } from 'showx-shared';
import type { Logger } from '../Logger.js';

interface Topic {
  showId: string;
  subscribers: Set<WebSocket>;
  serverSubscribers: Map<string, (m: SideChannelMessage) => void>;
  recent: SideChannelMessage[];      // last 100, for late joiners
}

const MAX_RECENT = 100;

export class SideChannel {
  private topics = new Map<string, Topic>();
  private wss: WebSocketServer;

  constructor(private readonly log?: Logger) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  handleUpgrade(req: any, socket: any, head: Buffer, showId: string): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any)._showxShowId = showId;
      this.wss.emit('connection', ws, req);
    });
  }

  publish(showId: string, msg: SideChannelMessage): void {
    const t = this.getOrCreate(showId);
    t.recent.push(msg);
    if (t.recent.length > MAX_RECENT) t.recent.shift();
    const payload = JSON.stringify({ ...msg, _ts: Date.now() });
    for (const sub of t.subscribers) {
      if (sub.readyState === WebSocket.OPEN) sub.send(payload);
    }
    for (const fn of t.serverSubscribers.values()) {
      try { fn(msg); } catch (err) {
        this.log?.error('side-channel server handler threw', { showId, error: String(err) });
      }
    }
  }

  subscribeServer(showId: string, fn: (m: SideChannelMessage) => void): Subscription {
    const t = this.getOrCreate(showId);
    const id = randomUUID();
    t.serverSubscribers.set(id, fn);
    return { id, unsubscribe: () => t.serverSubscribers.delete(id) };
  }

  close(showId: string): void {
    const t = this.topics.get(showId);
    if (!t) return;
    for (const ws of t.subscribers) try { ws.close(1000, 'topic_closed'); } catch {}
    this.topics.delete(showId);
  }

  private onConnection(ws: WebSocket, _req: any) {
    const showId = (ws as any)._showxShowId as string;
    const t = this.getOrCreate(showId);
    t.subscribers.add(ws);
    // replay recent buffer to late joiner
    for (const msg of t.recent) {
      ws.send(JSON.stringify({ ...msg, _replay: true }));
    }
    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString('utf8')) as SideChannelMessage;
        if (!parsed || typeof parsed.topic !== 'string') return;
        this.publish(showId, parsed);
      } catch (err) {
        this.log?.warn('side-channel bad message', { showId, error: String(err) });
      }
    });
    ws.on('close', () => t.subscribers.delete(ws));
  }

  private getOrCreate(showId: string): Topic {
    let t = this.topics.get(showId);
    if (!t) {
      t = { showId, subscribers: new Set(), serverSubscribers: new Map(), recent: [] };
      this.topics.set(showId, t);
    }
    return t;
  }
}
```

### `src/main/src/shared/syncBroker/authGate.ts`

```ts
import type { PairingClaims } from 'showx-shared';

export interface PairingValidator {
  validate(token: string): Promise<PairingClaims | null>;
}

// default permissive validator for tests/dev; B001-011 swaps in real PairingStore.
export class PermissiveValidator implements PairingValidator {
  async validate(_token: string): Promise<PairingClaims> {
    return { deviceId: 'dev', roles: ['*'], tier: 'pro', expiresAt: Date.now() + 86_400_000 };
  }
}

export function extractToken(req: { headers: Record<string, string | string[] | undefined>; url?: string }): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.url) {
    const url = new URL(req.url, 'http://x');
    const t = url.searchParams.get('token');
    if (t) return t;
  }
  return null;
}
```

### `src/main/src/shared/SyncBroker.ts`

```ts
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type {
  SyncBroker as SyncBrokerIface, YDocHandle, SideChannelMessage,
  Subscription, AwarenessHandler,
} from 'showx-shared';
import { YWebsocketAdapter, type PersistenceHook } from './syncBroker/yWebsocketAdapter.js';
import { SideChannel } from './syncBroker/sideChannel.js';
import { type PairingValidator, PermissiveValidator, extractToken } from './syncBroker/authGate.js';
import type { Logger } from './Logger.js';

const YJS_PATH = /^\/yjs\/([A-Za-z0-9_-]+)$/;
const EVENTS_PATH = /^\/events\/([A-Za-z0-9_-]+)$/;

export interface SyncBrokerOptions {
  validator?: PairingValidator;
  log?: Logger;
}

export class SyncBroker implements SyncBrokerIface {
  private yjs: YWebsocketAdapter;
  private events: SideChannel;
  private attached: HttpServer | null = null;
  private validator: PairingValidator;

  constructor(opts: SyncBrokerOptions = {}) {
    this.yjs = new YWebsocketAdapter(opts.log);
    this.events = new SideChannel(opts.log);
    this.validator = opts.validator ?? new PermissiveValidator();
  }

  attach(server: HttpServer): void {
    if (this.attached) throw new Error('SyncBroker already attached');
    this.attached = server;
    server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
  }

  setValidator(v: PairingValidator): void { this.validator = v; }

  openDocument(name: string): YDocHandle {
    const entry = this.yjs.openDocument(name);
    return {
      name,
      doc: entry.doc,
      destroy: () => this.yjs.closeDocument(name),
    };
  }

  closeDocument(handle: YDocHandle): void { this.yjs.closeDocument(handle.name); }

  registerPersistence(name: string, hook: PersistenceHook): void {
    this.yjs.registerPersistence(name, hook);
  }

  subscribeAwareness(name: string, handler: AwarenessHandler): Subscription {
    const entry = this.yjs.openDocument(name);
    const wrap = ({ added, updated, removed }: any, _origin: unknown) => {
      const states = entry.awareness.getStates();
      for (const id of added.concat(updated)) {
        handler(id, states.get(id) ?? null);
      }
      for (const id of removed) handler(id, null);
    };
    entry.awareness.on('update', wrap);
    return {
      id: `aw-${name}-${Date.now()}`,
      unsubscribe: () => entry.awareness.off('update', wrap),
    };
  }

  publishSideChannel(showId: string, msg: SideChannelMessage): void {
    this.events.publish(showId, msg);
  }

  subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription {
    return this.events.subscribeServer(showId, handler);
  }

  private async onUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const url = req.url ?? '';
    const yMatch = url.match(/^\/yjs\/([A-Za-z0-9_-]+)(\?|$)/);
    const eMatch = url.match(/^\/events\/([A-Za-z0-9_-]+)(\?|$)/);
    if (!yMatch && !eMatch) return;   // let other upgrade listeners handle

    const token = extractToken(req as any);
    if (!token) return this.reject(socket, 401, 'missing_token');
    const claims = await this.validator.validate(token);
    if (!claims) return this.reject(socket, 401, 'invalid_token');

    if (yMatch) {
      this.yjs.handleUpgrade(req, socket, head, yMatch[1]);
    } else if (eMatch) {
      this.events.handleUpgrade(req, socket, head, eMatch[1]);
    }
  }

  private reject(socket: Socket, code: number, reason: string) {
    const body = `HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`;
    try { socket.write(body); } catch {}
    try { socket.destroy(); } catch {}
  }
}
```

## Test plan

### `tests/unit/shared/SyncBroker.test.ts` (≥7 cases)

Use a real `http.createServer()` listening on port 0, attach SyncBroker, then drive with `ws` clients + manual Yjs sync. Or simpler: directly call `openDocument()` and test that two `Y.Doc`s reach same state when updates routed.

- `openDocument('test')` returns same handle for repeat calls (same Y.Doc instance).
- Two client WebSockets to `/yjs/abc` sync content: client A writes to its Y.Doc.getMap, client B sees it after sync round-trip.
- Auth gate: WS with no token → connection rejected with 401.
- Auth gate: WS with valid mock token → accepted.
- `registerPersistence(name, hook)`: `hook.load` called once on first open; `hook.save` called within 500ms of update (throttle window).
- `subscribeAwareness` invoked with clientID + state when a client updates awareness.
- `closeDocument` closes all client sockets with code 1000.
- `subscribeAwareness` unsubscribe stops further notifications.
- Routing: WS upgrade to `/random-path` ignored by SyncBroker (no rejection — other listeners can handle).

### `tests/unit/shared/sideChannel.test.ts` (≥5 cases)

- `publish(showId, msg)` broadcasts to all subscribers in that show.
- Subscribers for OTHER showId don't receive.
- Server-side `subscribeServer` receives published messages.
- `unsubscribe` stops further server-side handler calls.
- Late joiner receives recent buffer (push 5 messages, then connect — joiner sees 5).
- Buffer caps at 100: push 150 messages, joiner sees last 100.
- WS message from client is re-broadcast to other subscribers in same showId.
- Bad JSON from client logged + ignored (no crash).

## Out of scope

- Y.Doc persistence to disk — `PersistenceHook` is the interface; concrete LevelDB or SQLite-backed persistence is module-owned (Cuelist Core in ShowX-3 will provide it).
- Real PairingStore integration — `PairingValidator` is a typed slot; B001-009 ships the real impl; B001-011 wires it.
- Y.Doc snapshotting / history — relies on `Y.encodeSnapshot()` at module layer; not in shared.
- y-indexeddb on the PWA side — that's pwa workspace, not main.
- Multi-broker federation (cloud Yjs provider) — Cloud Sync module in ShowX-4 layers a second provider.
- Rate limiting on side-channel publishes (per docs/specs/protocol_dictionary.md §7 GO event rate cap — defer to a layer above).
- Authorization beyond bearer-token validation (per-role access to specific show docs) — claims field reserved; enforced at module layer in ShowX-3 Cuelist Core.

## Notes for Critic

- Verify `SyncBroker.attach(httpServer)` does NOT create its own port — it ONLY hooks `server.on('upgrade')`. The HTTP server is owned by AssetServer (B001-005).
- Upgrade path matching uses anchored regex (`^/yjs/...$`) so paths like `/yjs/abc/extra` don't match. Critic: add a negative test if missing.
- Side-channel late-joiner replay: messages tagged `_replay: true` so client UI can distinguish from live.
- Throttled persist: 250ms window is a Forge choice; document it; verify Critic test uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(250)`.
- Y.Doc destroy on close: confirm no memory leak via repeated open/close cycle test.
- `extractToken`: tests must cover (a) bearer header, (b) `?token=` query, (c) neither.
- Yjs version: 13.6.10 ships ESM. `import * as Y from 'yjs'` works under NodeNext. Confirm tsconfig `"module": "NodeNext"` (B001-001) compiles this without issue.
- Reject path: writing HTTP/1.1 401 then closing is non-trivial; verify a client receives a clean close with proper code (use `ws` client with error listener in test).
- `awareness.on('update', ...)` signature: `({added, updated, removed}, origin) => void`. Forge must pass through awareness updates from clients to other clients (already in adapter); SubscribeAwareness server-side should NOT receive its own publishes (use origin check if needed).
