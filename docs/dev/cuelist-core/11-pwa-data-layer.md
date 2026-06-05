# 11 — PWA data layer

How the PWA (React on iPad / laptop browser) connects to the FOH Mac and stays in sync.

## Connection model

```
PWA (browser)                    FOH Mac (Electron)
─────────────                    ──────────────────
y-websocket client  ◄────────►   y-websocket broker (embedded)
side-channel WS     ◄────────►   GO event channel
HTTP fetch          ◄────────►   AssetServer (media files)
```

Two WebSockets per station:

1. **y-websocket** — Yjs CRDT sync (cuelist data)
2. **side-channel** — GO/ARM/MODE events (out-of-band signals per [08])

## connectToShow

`pwa/src/lib/cuelistData.ts`:

```ts
export function connectToShow(opts: {
  url: string                 // ws://foh-ip:5300
  pairingToken: string
  stationId: string
}): ShowConnection {
  const doc = new Y.Doc()
  const wsProvider = new WebsocketProvider(`${opts.url}/yjs`, opts.stationId, doc, { params: { token: opts.pairingToken } })
  const sideChannel = new SideChannelClient(`${opts.url}/events/${opts.showId}?token=${opts.pairingToken}`)
  const awareness = wsProvider.awareness
  return { doc, sideChannel, awareness, disconnect: () => { /* clean both */ } }
}
```

The `ShowConnection` object is React Context (`ConnectionProvider`). Hooks consume it.

## SideChannelClient

`pwa/src/lib/sideChannel.ts`:

```ts
class SideChannelClient extends EventEmitter {
  constructor(url: string, opts?: { _WebSocket?: typeof WebSocket }) { /* ... */ }

  sendGoRequest(req: { cue_id, override? }): { request_id: string } { /* ... */ }
  sendArmRequest(req: { cue_id }): { request_id: string } { /* ... */ }
  resumeFrom(seq: number): void { /* sent on reconnect */ }
  disconnect(): void
}
```

Emits events: `dispatched`, `rejected`, `arm`, `mode`, `gap`, `historic`.

### Backoff

Exponential reconnect: `[1000, 2000, 5000, 10000, 30000, 30000]` ms (caps at 30s). Reset on successful connection. Fake-timer-friendly for tests (`_WebSocket` injection seam).

### Historic vs live

On reconnect + resume, FOH replays missed events. Each carries the original `ts`. Client classifies:

```ts
const HISTORIC_THRESHOLD_MS = 5000

emit('dispatched', envelope, isHistoric)
emit('rejected', envelope, isHistoric)
```

Hooks like `useGoChannel` ignore historic events for visual state (no shake animation on a 30-second-old rejection).

### Disconnect cleanup

`disconnect()` clears the reconnect timer and closes the socket. Tests assert no further reconnect attempts.

## Hooks

All hooks use `useSyncExternalStore` for safe React 18 concurrent rendering. The pattern:

```ts
export function useSomething<T>(selector: (doc: Y.Doc) => T): T {
  const { doc } = useShowConnection()
  const cacheRef = useRef<T | typeof UNSET>(UNSET)
  return useSyncExternalStore(
    (cb) => {
      const observer = () => { cacheRef.current = UNSET; cb() }
      doc.on('updateV2', observer)
      return () => doc.off('updateV2', observer)
    },
    () => {
      if (cacheRef.current === UNSET) cacheRef.current = selector(doc)
      return cacheRef.current
    }
  )
}
```

**Critical (B003-012 round 2 fix):** the snapshot function MUST return the same reference across renders when value hasn't changed. Otherwise React throws "getSnapshot should be cached" warnings + can render-storm.

`UNSET` is a sentinel (`Symbol('UNSET')`) — distinct from valid `null` / `undefined`. Cache cleared on change, computed lazily on read.

### Available hooks (`pwa/src/hooks/`):

| Hook | Returns | Updates on |
|---|---|---|
| `useShow` | Y.Map (meta) | any meta change |
| `useCuelist(id)` | Y.Map (cuelist) | cuelist field change |
| `useCue(cuelistId, cueId)` | Y.Map (cue) or `null` | this cue's field change |
| `useDepartment({ owned, watched })` | `{ visible, actionable, contextOnly }` | view filter changes |
| `useStations` | `Awareness.Station[]` | awareness change |
| `useMode` | `'REHEARSAL' \| 'SHOW'` | meta.mode change |
| `useGoChannel` | `{ go, arm, lastRejected, lastDispatched, historic }` | side-channel events |
| `useKeyboardShortcuts(map)` | (side-effect) | input-guarded global keydown |
| `usePlayhead` | `{ playhead, setPlayhead, advance, retreat, arm, unarm }` | playhead state via Yjs |

### useDepartment memoization

```ts
test('useDepartment returns referentially equal results across re-renders', () => {
  const { result, rerender } = renderHook(...)
  const r0 = result.current
  rerender()
  const r1 = result.current
  expect(Object.is(r0.visible, r1.visible)).toBe(true)
  expect(Object.is(r0.actionable, r1.actionable)).toBe(true)
})
```

The `Object.is` assertion is the contract React relies on.

## Awareness

`pwa/src/lib/awareness.ts` writes the station's identity to Yjs awareness on connect:

```ts
awareness.setLocalStateField('station', {
  id: stationId,
  role: 'sm' | 'operator',
  name: displayName,
  departments,
  color,        // SM-assigned, optional
  presence_state: 'online' | 'idle' | 'away',
})
```

Other stations observe `awareness.getStates()` → presence indicators on cue rows. Offline detection via awareness timeout (default 30s).

## ConnectionProvider

React Context wrapper:

```tsx
<ConnectionProvider url={url} token={token} stationId={id} showId={showId}>
  <App />
</ConnectionProvider>
```

Internally instantiates `connectToShow`. All hooks below this provider have access.

## Tests

- `tests/unit/pwa/cuelistData.test.ts` — connectToShow integration
- `tests/unit/pwa/sideChannel.test.ts` — backoff sequence with fake timers, resume, historic classification, disconnect
- `tests/unit/pwa/useCuelist.test.tsx` — Yjs subscription correctness
- `tests/unit/pwa/useDepartment.test.tsx` — memoization (`Object.is` assertions)
- `tests/unit/pwa/useShow.test.tsx`
- `tests/unit/pwa/useGoChannel.test.tsx` — historic suppression
- `tests/unit/pwa/useHooksSmoke.test.tsx` — 10 smoke tests for useStations / useMode / useCue empty-state + re-render + referential equality

## Open issues

- Awareness color palette (Q11): null in 0.1; SM-assignable at pairing in 0.2.
- Multi-cuelist support in hooks — currently `useCuelist(id)` returns a single cuelist; show-with-multiple cuelists API TBD for ShowX-4.
- Offline buffering: PWA does NOT queue go.requests when disconnected. They fail silently. Add offline queue in 0.2.
