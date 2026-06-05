---
id: "B003-008"
title: "GO event side-channel publish — pub/sub on /events/<show_id> with idempotency + replay window"
status: "done"
round: 2
---

## Round 2 — Critic items addressed

### 1. Wire `mode.transition` topic (Criterion 2 — Option A)

`GoEventChannel.start()` now subscribes to `'show-mode-change'` on `deps.events` (the EventBus emitted by B003-004's `transitions.ts`). On each event, a `ModeTransition` payload is built, allocated a `seq`, pushed to `rings['mode.transition']`, and broadcast to all stations.

New interface exported from `goEventChannel.ts`:
```ts
export interface ModeTransition {
  topic: 'mode.transition';
  show_id: string;
  from: ShowMode;
  to: ShowMode;
  by_operator_id: string;
}
```

Two new tests cover the round-trip: transition fires → broadcast envelope produced with correct payload; ring populated → resume replays to reconnecting station.

### 2. Resume replay targets requesting station (Criterion 10)

`ResumeRequest` now requires `station_id: string`. `onResume` sends all replayed messages via `deps.publishToStation(req.station_id, ...)` instead of `deps.broadcast(...)`. A station reconnect no longer floods all other connected stations.

Existing resume tests updated to supply `station_id: 'station-replay'` and assert against `toStation` instead of `broadcasts`.

### 3. Gap envelope when `since_seq` predates retained window (Criterion 10 + spec test #26)

Before replaying ring items, `onResume` now computes:
```ts
const oldestRetainedSeq = ring.all()[0]._seq;
if (oldestRetainedSeq > since + 1) {
  deps.publishToStation(req.station_id, { type: 'gap', topic, from_seq: since, to_seq: oldestRetainedSeq - 1 });
}
```

Gap is sent before replayed messages so the station can trigger a Yjs full sync before applying the partial replay.

New test: channel constructed with `ringCapacity: 5`; 10 cues fired (ring retains last 5); resume from `since_seq: 0` → gap envelope emitted with correct `topic`, `from_seq`, `to_seq`.

### Other changes

- `GoEventChannel` constructor accepts `opts.ringCapacity` (default 1024) to enable gap tests with small buffers without affecting production behavior.
- `ShowModeChangeEvent` and `ShowMode` imported from `showx-shared`.

## Files changed

- `src/modules/cuelist-core/src/go/goEventChannel.ts` — imports, `ModeTransition` interface, `station_id` in `ResumeRequest`, `ringCapacity` constructor opt, `onModeChange` handler, `start()` wired to `show-mode-change`, `onResume` gap detection + `publishToStation`
- `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts` — updated 2 resume tests, added 3 new tests (mode.transition ×2, gap ×1)

## Test run output

```
✓ tests/unit/modules/cuelist-core/go/goEventChannel.test.ts  (27 tests)
✓ tests/unit/modules/cuelist-core/go/idempotencyStore.test.ts (11 tests)
✓ tests/unit/modules/cuelist-core/go/authority.test.ts        (12 tests)
✓ tests/unit/modules/cuelist-core/go/replayWindow.test.ts     (12 tests)

Test Files  4 passed (4)
     Tests  62 passed (62)
```

Full suite: 694/694 pass (64 test files).

## Acceptance criteria coverage

| Criterion | Round 1 | Round 2 |
|---|---|---|
| 1. Side-channel envelope `{topic, seq, ts, payload}` | ✅ | ✅ unchanged |
| 2. All 7 topics implemented | ⚠️ `mode.transition` unwired | ✅ wired via EventBus `show-mode-change` |
| 3. `SequenceCounter` monotonic per process | ✅ | ✅ unchanged |
| 4. `IdempotencyStore` LRU, default 1000, configurable | ✅ | ✅ unchanged |
| 5. Replay window 5s | ✅ | ✅ unchanged |
| 6. Transport-agnostic `GoChannelDeps` | ✅ | ✅ unchanged |
| 7. `authorise()` all 4 modes | ✅ | ✅ unchanged |
| 8. Accepted GO → `cue-fire`; `cue-complete` → broadcast `go.dispatched` | ✅ | ✅ unchanged |
| 9. Rejected GO → `publishToStation` only | ✅ | ✅ unchanged |
| 10. Ring buffer 1024/topic; `resume{since_seq}` → per-station replay + gap envelope | ⚠️ broadcast instead of station; no gap | ✅ per-station replay + gap envelope |
| 11. GO events never in Y.Doc; `DesignViolationError` guard | ✅ | ✅ unchanged |
| 12. 30+ vitest tests | ✅ 59 | ✅ 62 |

## Notes for Critic

- `mode.transition` is wired via EventBus subscription (Option A). B003-004's `transitions.ts` already publishes `show-mode-change` — no changes needed to B003-004.
- `opts.ringCapacity` is an extension to the constructor; default is 1024, no production behavioral change.
- The gap envelope shape is `{ type: 'gap', topic, from_seq, to_seq }` sent via `publishToStation` before the replayed ring items.
- Integration gap (SyncBroker per-station addressing) noted in round 1 done report is unchanged — separate adapter concern.
