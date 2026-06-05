---
id: "B003-012"
title: "PWA cuelist data layer — Yjs hooks, awareness, reconnect"
type: "implementation"
estimated_size_lines: 700
priority: "P0"
depends_on: ["B003-002"]
target_files:
  - "pwa/src/lib/cuelistData.ts"
  - "pwa/src/lib/yProviders.ts"
  - "pwa/src/lib/sideChannel.ts"
  - "pwa/src/lib/awareness.ts"
  - "pwa/src/hooks/useShow.ts"
  - "pwa/src/hooks/useCuelist.ts"
  - "pwa/src/hooks/useCue.ts"
  - "pwa/src/hooks/useDepartment.ts"
  - "pwa/src/hooks/useStations.ts"
  - "pwa/src/hooks/useMode.ts"
  - "pwa/src/hooks/useGoChannel.ts"
  - "pwa/tests/unit/lib/cuelistData.test.ts"
  - "pwa/tests/unit/hooks/useShow.test.tsx"
  - "pwa/tests/unit/hooks/useCuelist.test.tsx"
  - "pwa/tests/unit/hooks/useDepartment.test.tsx"
acceptance_criteria:
  - "`cuelistData.ts` exposes `connectToShow({wsUrl, showId, pairingToken, sideChannelUrl}): Promise<{doc, awareness, sideChannel}>` — opens y-websocket provider + y-indexeddb persistence + side-channel WSS"
  - "Y.Doc provider stack: `WebsocketProvider` from y-websocket (canonical URL pattern `ws://showx.local:5300/yjs/<show_id>?token=...` per protocol_dictionary.md §7.1 / Q28) + `IndexeddbPersistence` for offline replica"
  - "Side-channel WSS client: connects to `/events/<show_id>?token=...` per protocol_dictionary.md §7.2; sends `go.request`, `arm.request`, `presence.heartbeat`; receives `go.dispatched`, `go.rejected`, `arm.broadcast`, `mode.transition`, `heartbeat`, `system`"
  - "Awareness publish: each station writes its `StationAwareness` (per data_model.md §2.10) — operator_id, station_id, display_name, owned_departments, watched_departments, current_view, presence_color, last_heartbeat_at"
  - "Reactive hooks: `useShow(): ShowState`, `useCuelist(id): {cuelist, cues}`, `useCue(cuelistId, cueId): Cue | null`, `useDepartment(ctx: FilterContext): {visible, actionable}`, `useStations(): StationAwareness[]`, `useMode(): {mode, canToggle, transition}`, `useGoChannel(): {go, standby, lastDispatched}`"
  - "Hooks subscribe via Yjs `observeDeep` and React 18 `useSyncExternalStore` for tear-free updates"
  - "Reconnect handling: on WSS close, exponential backoff (1s, 2s, 5s, 10s, 30s max); reconnect resumes Yjs sync state; side-channel `resume{since_seq}` requested on reconnect"
  - "Replay window: side-channel `go.dispatched` events with ts > 5s old rendered as 'history' (per data_model.md §8.4) — do not animate cue-fire visuals"
  - "Offline mode: when WSS closes, hooks continue reading from local IndexedDB replica; UI shows offline banner; user can browse but cannot GO (side-channel offline)"
  - "Awareness disconnect: on tab close / connection lost, awareness state evaporates per data_model.md §2.10"
  - "Hook subscribers receive referential-equal arrays/objects when underlying data unchanged (memoization) — React useMemo + Yjs observer diff detection"
  - "25+ vitest + RTL tests across files: connection happy path, hook reactivity, reconnect, offline browsing, replay window classification, awareness publishing"
---

## Context

This task is the PWA-side bridge between the React UI and the Yjs document hosted on the FOH shell. The actual UI components (SM view, operator view, GO button, cue editor) consume these hooks. Forge MUST get the reactive primitives right: bad subscription patterns lead to render storms during multi-operator sessions, which is catastrophic for performance during a real show.

The dependency on B003-005 filter logic is via re-export — `useDepartment` composes the pure `visibleCues` / `highlightedPayloads` functions. The dependency on B003-002 Y.Doc model is via shared types (showx-shared) — the PWA never imports cuelist-core internals directly.

## Implementation notes

### Connection layer

```ts
// pwa/src/lib/cuelistData.ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { SideChannelClient } from './sideChannel';
import { Awareness } from 'y-protocols/awareness';

export interface ConnectOpts {
  wsUrl: string;             // e.g. ws://showx.local:5300/yjs/<show_id>
  sideChannelUrl: string;    // ws://showx.local:5300/events/<show_id>
  showId: string;
  pairingToken: string;
  displayName: string;
  operatorId: string;
  stationId: string;
  ownedDepartments: string[];
  watchedDepartments: string[];
  presenceColor: string;
}

export interface Connection {
  doc: Y.Doc;
  provider: WebsocketProvider;
  persistence: IndexeddbPersistence;
  awareness: Awareness;
  sideChannel: SideChannelClient;
  disconnect(): void;
}

export async function connectToShow(opts: ConnectOpts): Promise<Connection> {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(`show:${opts.showId}`, doc);
  await persistence.whenSynced;

  const wsUrlWithToken = `${opts.wsUrl}?token=${encodeURIComponent(opts.pairingToken)}`;
  const provider = new WebsocketProvider(wsUrlWithToken, '', doc, { connect: true });
  const awareness = provider.awareness;
  awareness.setLocalState({
    operator_id: opts.operatorId,
    station_id: opts.stationId,
    display_name: opts.displayName,
    owned_departments: opts.ownedDepartments,
    watched_departments: opts.watchedDepartments,
    current_view: { cuelist_id: '', focus_cue_id: null },
    presence_color: opts.presenceColor,
    cursor: { cue_id: null, field: null },
    last_heartbeat_at: new Date().toISOString(),
  });

  const sideChannel = new SideChannelClient({
    url: `${opts.sideChannelUrl}?token=${encodeURIComponent(opts.pairingToken)}`,
    showId: opts.showId,
    stationId: opts.stationId,
    operatorId: opts.operatorId,
  });
  await sideChannel.connect();

  // Heartbeat awareness every 1s
  const hb = setInterval(() => {
    awareness.setLocalStateField('last_heartbeat_at', new Date().toISOString());
  }, 1000);

  return {
    doc, provider, persistence, awareness, sideChannel,
    disconnect: () => {
      clearInterval(hb);
      sideChannel.disconnect();
      provider.disconnect();
    },
  };
}
```

### SideChannelClient

```ts
// pwa/src/lib/sideChannel.ts
import EventEmitter from 'eventemitter3';
import { v7 as uuidv7 } from 'uuid';

export interface SideChannelOpts {
  url: string; showId: string; stationId: string; operatorId: string;
}

export interface GoDispatched {
  topic: 'go.dispatched'; request_id: string; cue_id: string; cuelist_id: string;
  sequence: number; dispatched_at: string; payloads_dispatched: number; payloads_failed: string[];
  fired_by: { station_id: string; operator_id: string };
}

export class SideChannelClient extends EventEmitter<{
  'go.dispatched': [GoDispatched & { historic: boolean }];
  'go.rejected': [{ request_id: string; reason: string; detail?: string }];
  'arm.broadcast': [{ cuelist_id: string; cue_id: string; standby_note: string }];
  'mode.transition': [{ mode: 'rehearsal' | 'show'; by_operator_id: string }];
  'heartbeat': [{ uptime_ms: number; module_health: Record<string, string> }];
  'connection': ['open' | 'close' | 'error'];
}> {
  private ws?: WebSocket;
  private reconnectDelay = 1000;
  private lastSeq: Record<string, number> = {};
  private maxBackoff = 30000;
  private stopped = false;

  constructor(private opts: SideChannelOpts) { super(); }

  async connect(): Promise<void> {
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      this.emit('connection', 'open');
      this.reconnectDelay = 1000;
      // Resume from last seen seq
      for (const topic of Object.keys(this.lastSeq)) {
        ws.send(JSON.stringify({ type: 'resume', topic, since_seq: this.lastSeq[topic] }));
      }
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onclose = () => {
      this.emit('connection', 'close');
      if (!this.stopped) setTimeout(() => this.connect().catch(() => {}), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxBackoff);
    };
    ws.onerror = () => this.emit('connection', 'error');
  }

  private handleMessage(data: string | ArrayBuffer): void {
    const env = JSON.parse(data.toString());
    this.lastSeq[env.topic] = env.seq;
    if (env.topic === 'go.dispatched') {
      const ageMs = Date.now() - new Date(env.payload.dispatched_at).getTime();
      const historic = ageMs > 5000;
      this.emit('go.dispatched', { ...env.payload, historic });
    } else if (env.topic === 'go.rejected') {
      this.emit('go.rejected', env.payload);
    } else if (env.topic === 'arm.broadcast') {
      this.emit('arm.broadcast', env.payload);
    } else if (env.topic === 'mode.transition') {
      this.emit('mode.transition', env.payload);
    } else if (env.topic === 'heartbeat') {
      this.emit('heartbeat', env.payload);
    }
  }

  sendGoRequest(cuelistId: string, cueId: string, override = false): string {
    const requestId = uuidv7();
    this.ws?.send(JSON.stringify({
      topic: 'go.request', request_id: requestId, cue_id: cueId, cuelist_id: cuelistId,
      station_id: this.opts.stationId, operator_id: this.opts.operatorId,
      client_ts: new Date().toISOString(), override,
    }));
    return requestId;
  }

  sendArmRequest(cuelistId: string, cueId: string): void {
    this.ws?.send(JSON.stringify({
      topic: 'arm.request', cuelist_id: cuelistId, cue_id: cueId,
      station_id: this.opts.stationId, operator_id: this.opts.operatorId,
    }));
  }

  disconnect(): void { this.stopped = true; this.ws?.close(); }
}
```

### Hooks

```ts
// pwa/src/hooks/useShow.ts
import { useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { useConnection } from './ConnectionProvider';

export interface ShowState {
  show_id: string;
  title: string;
  venue: string | null;
  date: string | null;
  mode: 'rehearsal' | 'show';
  active_cuelist_id: string;
  departments: string[];
}

export function useShow(): ShowState | null {
  const conn = useConnection();
  return useSyncExternalStore(
    (cb) => {
      const meta = conn.doc.getMap('meta');
      meta.observe(cb);
      return () => meta.unobserve(cb);
    },
    () => {
      const meta = conn.doc.getMap('meta');
      if (!meta.has('show_id')) return null;
      return meta.toJSON() as ShowState;
    },
    () => null,
  );
}
```

```ts
// pwa/src/hooks/useCuelist.ts
export function useCuelist(cuelistId: string): { cuelist: CuelistJson | null; cues: Cue[] } {
  const conn = useConnection();
  return useSyncExternalStore(
    (cb) => {
      const cuelists = conn.doc.getArray('cuelists');
      cuelists.observeDeep(cb);
      return () => cuelists.unobserveDeep(cb);
    },
    () => {
      const cl = getCuelist(conn.doc, cuelistId);
      if (!cl) return { cuelist: null, cues: [] };
      const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray().map((m) => m.toJSON() as Cue);
      return { cuelist: cl.toJSON() as CuelistJson, cues };
    },
    () => ({ cuelist: null, cues: [] }),
  );
}
```

```ts
// pwa/src/hooks/useDepartment.ts
import { visibleCues, isActionable, highlightedPayloads } from 'showx-shared/views';

export function useDepartment(cuelistId: string, ctx: FilterContext) {
  const { cues } = useCuelist(cuelistId);
  return useMemo(() => {
    const visible = visibleCues(cues, ctx);
    const actionable = new Set(visible.filter((c) => isActionable(c, ctx.owned)).map((c) => c.id));
    return { visible, actionable, ctx };
  }, [cues, ctx.owned, ctx.watched]);
}
```

```ts
// pwa/src/hooks/useGoChannel.ts
export function useGoChannel(cuelistId: string) {
  const conn = useConnection();
  const [lastDispatched, setLast] = useState<GoDispatched | null>(null);
  useEffect(() => {
    const handler = (env: GoDispatched & { historic: boolean }) => {
      if (env.historic) return; // render historic separately if desired
      setLast(env);
    };
    conn.sideChannel.on('go.dispatched', handler);
    return () => { conn.sideChannel.off('go.dispatched', handler); };
  }, [conn]);

  return {
    go: (cueId: string, override = false) => conn.sideChannel.sendGoRequest(cuelistId, cueId, override),
    standby: (cueId: string) => conn.sideChannel.sendArmRequest(cuelistId, cueId),
    lastDispatched,
  };
}
```

### ConnectionProvider context

```tsx
// pwa/src/lib/ConnectionProvider.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const ConnectionContext = createContext<Connection | null>(null);

export const ConnectionProvider: React.FC<{ opts: ConnectOpts; children: React.ReactNode }> = ({ opts, children }) => {
  const [conn, setConn] = useState<Connection | null>(null);
  useEffect(() => {
    let active = true;
    connectToShow(opts).then(c => { if (active) setConn(c); });
    return () => { active = false; conn?.disconnect(); };
  }, [opts.wsUrl, opts.showId, opts.pairingToken]);
  if (!conn) return <div>Connecting…</div>;
  return <ConnectionContext.Provider value={conn}>{children}</ConnectionContext.Provider>;
};

export const useConnection = () => {
  const c = useContext(ConnectionContext);
  if (!c) throw new Error('useConnection outside ConnectionProvider');
  return c;
};
```

## Test plan

### `cuelistData.test.ts`

1. `connectToShow` opens WebsocketProvider with token query param.
2. IndexedDB persistence syncs before returning.
3. Awareness setLocalState includes all required fields.
4. `disconnect` clears interval, closes WSS, closes provider.

### `useShow.test.tsx`

5. Renders null initially; populated after meta loaded.
6. Re-renders on `meta.title` change.
7. Returns null when no show open.

### `useCuelist.test.tsx`

8. Returns `{cuelist, cues}` for existing cuelist.
9. Re-renders when cue added to cuelist.
10. Returns `{cuelist: null, cues: []}` for unknown cuelist id.

### `useDepartment.test.tsx`

11. Filters cues by SM profile: all visible.
12. Filters by LX op: only LX-touching cues visible.
13. Re-renders on cue dept change.
14. Memoizes — same cues + same ctx → referentially equal result.

### `sideChannel.test.ts`

15. `connect` opens WSS to URL with token.
16. `sendGoRequest` produces unique request_ids.
17. Reconnect on close uses exponential backoff (1s, 2s, 5s, 10s, 30s cap).
18. Reconnect re-sends `resume{since_seq}` per topic.
19. go.dispatched with old ts marked historic.
20. Disconnect stops reconnect attempts.

### `useGoChannel.test.tsx`

21. `go(cueId)` sends go.request envelope.
22. Receiving go.dispatched fires lastDispatched update.
23. Historic go.dispatched does NOT update lastDispatched (rendered separately).

### Reconnect resilience

24. WSS close → IndexedDB still readable; useCuelist returns cached data.
25. After reconnect → side-channel resumes with no missed messages assuming ring buffer holds.

## Out of scope

- UI rendering (B003-013 SM view, B003-014 operator view, B003-015 GO button).
- Cue editor (B003-016).
- Pairing flow (ShowX-1 B001-012 + B001-018; pairingToken assumed already obtained).
- Offline GO queue (not supported in MVP — GO requires connection).
- IndexedDB encryption (post-MVP).
- Cross-tab coordination via BroadcastChannel (post-MVP).

## Notes for Critic

- Verify WSS URL pattern matches protocol_dictionary.md §7.1 exactly: `ws://<host>:5300/yjs/<show_id>?token=...`.
- Verify side-channel URL pattern matches §7.2: `/events/<show_id>?token=...`.
- Confirm awareness includes all StationAwareness fields per data_model.md §2.10.
- Confirm heartbeat interval is 1Hz (1000ms).
- Confirm reconnect uses exponential backoff (NOT immediate retry which can DDoS).
- Verify replay window classification — `ageMs > 5000` (matches data_model.md §8.4).
- Confirm hooks use `useSyncExternalStore` (React 18 concurrent-safe), not legacy `useState + useEffect` patterns that may tear.
- Verify memoization in useDepartment uses primitive deps (ctx.owned reference identity may not work — Forge should use stable sets or content-hash).
- Confirm IndexedDB key matches `show:<show_id>` per Yjs data_model.md §2.2 convention.
- Verify Connection cleanup on unmount — no leak across show changes.
