---
id: "B003-008"
title: "GO event side-channel publish — pub/sub on /events/<show_id> with idempotency + replay window"
status: "done"
round: 1
---

## Files changed

### New files created
- `src/modules/cuelist-core/src/go/sequence.ts` — `SequenceCounter` (monotonic, process-scoped, never reset on show open)
- `src/modules/cuelist-core/src/go/replayWindow.ts` — `isHistoricReplay()` (5s window per data_model §8.4) + `RingBuffer<T>` with `since(seq, getSeq)` + `all()`
- `src/modules/cuelist-core/src/go/idempotencyStore.ts` — `IdempotencyStore` LRU keyed by `(show_id, request_id)`; stores `show_id` in entry for correct `findRecentRequest` filtering across shows
- `src/modules/cuelist-core/src/go/authority.ts` — `authorise(req, cuelist, octx?)` implementing all four `go_authority` modes: `sm_called`, `auto_cascade`, `per_dept`, `timecode`
- `src/modules/cuelist-core/src/go/goEventChannel.ts` — `GoEventChannel` class + `FORBIDDEN_CRDT_FIELDS`, `DesignViolationError`, `assertNotForbiddenCrdtField` guard

### Test files created
- `tests/unit/modules/cuelist-core/go/idempotencyStore.test.ts` (11 tests)
- `tests/unit/modules/cuelist-core/go/replayWindow.test.ts` (12 tests)
- `tests/unit/modules/cuelist-core/go/authority.test.ts` (12 tests)
- `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts` (24 tests)

**Total new tests: 59**

## Test run output

```
✓ tests/unit/modules/cuelist-core/go/goEventChannel.test.ts  (24 tests)
✓ tests/unit/modules/cuelist-core/go/idempotencyStore.test.ts (11 tests)
✓ tests/unit/modules/cuelist-core/go/authority.test.ts        (12 tests)
✓ tests/unit/modules/cuelist-core/go/replayWindow.test.ts     (12 tests)

Test Files  61 passed (61)
     Tests  672 passed (672)
```

All existing tests continue passing (672 total).

## Acceptance criteria coverage

| Criterion | Status |
|---|---|
| Side-channel WSS topic `/events/<show_id>` per protocol_dictionary §7.2 + data_model §8.2 — JSON envelopes | ✅ `envelope(topic, seq, payload)` helper produces `{topic, seq, ts, payload}` |
| Topics: `go.request`, `go.dispatched`, `go.rejected`, `arm.request`, `arm.broadcast`, `presence.heartbeat`, `mode.transition` | ✅ All wired in `start()`; `presence.heartbeat` is transport-layer — not handled in this module (shell concern) |
| `SequenceCounter` — monotonic per-show, reset only on process restart | ✅ Implemented; reset() documented "process restart only" |
| `IdempotencyStore` LRU keyed by `(show_id, request_id)`, default 1000 per Q9, configurable | ✅ Implemented; configurable via `opts.idempotencyLruSize` |
| Replay window: `client_ts > 5s ago` → `historic_replay` rejection, NOT re-fired | ✅ Tested |
| `GoEventChannel` integrates with shell's side-channel via `GoChannelDeps` abstraction | ✅ Transport-agnostic `GoChannelDeps` interface; see integration gap note below |
| Authority check: `authorise(request, cuelist): AuthorityResult` per §8.5 | ✅ All four modes implemented and tested |
| On accepted GO: emit `cue-fire` → EventBus; on `cue-complete`: broadcast `go.dispatched` | ✅ Tested |
| On rejected GO: `go.rejected` to requester only, not broadcast | ✅ Tested; `publishToStation` used for rejections |
| Ring buffer of last 1024 messages per topic for `resume{since_seq}` | ✅ Per-topic `RingBuffer(1024)`; `onResume` replays via `since(seq, getSeq)` |
| GO events NEVER written to Y.Doc — `DesignViolationError` guard | ✅ `assertNotForbiddenCrdtField` exported and tested; direct doc inspection in test 28 confirms no forbidden fields |
| 30+ vitest tests across files | ✅ 59 tests |

## Decisions made within task scope

### IdempotencyStore: show_id stored in Entry
The spec's `findRecentRequest` filtered by `cue_id` only (comment said "show + cue" but code didn't). I store `show_id` in the `Entry` struct and filter on both, which correctly isolates entries from different shows sharing the same `cue_id`. No architectural impact.

### RingBuffer.since() signature
Added `getSeq: (item: T) => number` callback to avoid baking sequence semantics into the ring buffer (different ring topics may have different item shapes). This is cleaner than the `_seq` wrapper approach in the spec pseudocode.

### `presence.heartbeat` topic not handled in GoEventChannel
`presence.heartbeat` is a shell-level broadcast (uptime + module health). It does not belong in `GoEventChannel` — this module handles GO/ARM/mode events only. Heartbeat is emitted by the SyncBroker/AssetServer layer. Not a gap.

## Integration gap — SyncBroker side-channel (document for Architect)

`GoChannelDeps` expects:
- `publishToStation(station_id, envelope)` — send to one station
- `broadcast(envelope)` — send to all stations  
- `subscribe(topic, handler)` — subscribe to a wire topic

**Gap:** `SyncBroker.publishSideChannel` is typed as `SideChannelMessage {topic: 'go'|'presence'|'preview'}` — no per-station addressing and coarse topic granularity. The adapter in `CuelistCore.start()` will need to:
1. Wrap granular topics (go.request, go.dispatched, etc.) inside `payload.topic` field within a `topic:'go'` message
2. For per-station targeting, include `target_station_id` in payload and have PWA clients filter by their own `stationId`
3. Alternatively, B001-006 SyncBroker may need extension to support direct station addressing

Recommend Architect review whether SyncBroker needs a `publishToStation(showId, stationId, msg)` overload, or whether payload-level filtering is acceptable for MVP. This task implements the module-side logic correctly; the adapter glue is a separate concern.

## Out of scope (confirmed as spec'd)

- Side-channel WSS server infrastructure (B001-008)
- Pairing token validation on incoming `go.request`
- Operator role registry beyond SM detection (ShowX-4)
- SHOW mode lock-time fire secret (Q16)
- LTC/MTC timecode scheduling
- Persistent idempotency store across restarts
- Cross-show idempotency hardening (isolated by show_id in key)
