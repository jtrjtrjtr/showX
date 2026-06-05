---
id: "B003-008"
title: "GO event side-channel publish — pub/sub on /events/<show_id> with idempotency + replay window"
verdict: "changes_requested"
review_round: 1
reviewed_at: "2026-06-07T16:25:00Z"
reviewer: "critic"
---

## Summary

Strong core implementation. GO request → fire → dispatched broadcast, GO rejection paths, idempotency LRU, replay window, authority modes, and the CRDT-guard helper are all correct, well-tested (59/59 pass), and match spec. Three concrete gaps prevent acceptance: the `mode.transition` topic is reserved but unwired; resume replay broadcasts instead of targeting the reconnecting station; and the gap-envelope behaviour required by protocol_dictionary §7.2 and spec test #26 is missing.

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Side-channel envelope `{topic, seq, ts, payload}` | ✅ | `goEventChannel.ts:115-117` `envelope()` helper |
| 2 | All 7 topics implemented | ⚠️ | go/arm/resume wired; `presence.heartbeat` correctly deferred to shell; **`mode.transition` reserved in rings (`goEventChannel.ts:135`) but no subscribe handler, no emit, no public method** |
| 3 | `SequenceCounter` monotonic per process | ✅ | `sequence.ts:1-16`; `reset()` doc'd "process restart only" |
| 4 | `IdempotencyStore` LRU keyed by `(show_id, request_id)`, default 1000, configurable | ✅ | `idempotencyStore.ts:15-33`; `goEventChannel.ts:140` `opts?.idempotencyLruSize ?? 1000` |
| 5 | Replay window: `client_ts > 5s` → `historic_replay` reject | ✅ | `replayWindow.ts:1-6`; test `replayWindow.test.ts:7-26` |
| 6 | Transport-agnostic `GoChannelDeps` abstraction | ✅ | `goEventChannel.ts:99-111`; gap to SyncBroker documented in done report |
| 7 | `authorise(req, cuelist, octx?)` per §8.5 — all 4 modes | ✅ | `authority.ts:23-50`; 12 tests in `authority.test.ts` |
| 8 | Accepted GO → `cue-fire`; on `cue-complete` → broadcast `go.dispatched` | ✅ | `goEventChannel.ts:208-221` (cue-fire), `:224-244` (cue-complete → broadcast) |
| 9 | Rejected GO → `publishToStation` (requester only), not broadcast | ✅ | `goEventChannel.ts:280-286`; test `goEventChannel.test.ts:313-321` |
| 10 | Ring buffer 1024/topic for `resume{since_seq}` per protocol §7.2 | ⚠️ | Ring buffers exist (`goEventChannel.ts:131-136`), `since(seq, getSeq)` filter works (`replayWindow.ts:23-25`), **but `onResume` broadcasts replay to all stations instead of `publishToStation` and never emits `gap` envelope when since_seq predates the retained window** |
| 11 | GO events never in Y.Doc; `DesignViolationError` guard | ✅ | `goEventChannel.ts:11-32`; test `goEventChannel.test.ts:401-415` directly inspects cue Y.Map |
| 12 | 30+ vitest tests | ✅ | 59 tests across 4 files |

## Required changes

### 1. Wire `mode.transition` topic (acceptance criterion 2)

Spec §8.2 (data_model.md:915) lists `mode.transition` as a SM → all topic with `ModeTransition` payload, and the acceptance criterion explicitly enumerates it. The ring buffer is reserved (`goEventChannel.ts:135`) but nothing populates it. Pick one:

- **Option A (preferred)** — `GoEventChannel.start()` subscribes to a `mode-transition` event on `ctx.events` (emitted by B003-004's `transitions.ts`), allocates a `seq`, pushes to `rings['mode.transition']`, and `broadcast`s an envelope. Requires B003-004 to publish such an event on EventBus, which it currently does not.
- **Option B** — Expose a public method `broadcastModeTransition(payload: ModeTransition): void` for the shell/CuelistCore adapter to call when B003-004's state machine reports a transition.

Either way: add a vitest for the round-trip (transition input → ring entry + broadcast envelope with seq).

### 2. Resume replay must target the requesting station (acceptance criterion 10)

`onResume` at `goEventChannel.ts:262-278` calls `this.deps.broadcast(envelope(...))` for every replayed message. This floods all connected stations with history every time any one of them reconnects. The protocol intent (§7.2, protocol_dictionary.md:815-823) is per-station replay.

Fix:

- Add `station_id: string` to `ResumeRequest` (`goEventChannel.ts:82-86`).
- In `onResume`, send replays via `this.deps.publishToStation(req.station_id, envelope(...))` rather than `broadcast`.
- Update the test at `goEventChannel.test.ts:323-355` to provide `station_id`, assert against `toStation` rather than `broadcasts`.

### 3. Emit `gap` envelope when `since_seq` predates retained window (criterion 10 + spec test #26)

protocol_dictionary §7.2 (line 821): *"Older messages return `{ "type": "gap", "from_seq": 4220, "to_seq": 4231 }` — station should reconcile via Yjs full sync."* Spec test plan #26 mirrors this. Current `onResume` returns whatever is in the ring with no gap signal, so a station that lost ~2000 messages silently receives only the most recent 1024 and never knows it missed the rest.

Fix:

- In `onResume`, for each ring with non-empty contents, compute `oldestRetainedSeq = ring.all()[0]._seq`.
- If `oldestRetainedSeq > since_seq + 1`, emit a `{ type: 'gap', topic, from_seq: since_seq, to_seq: oldestRetainedSeq - 1 }` envelope to the requesting station *before* the replayed messages.
- Add a vitest: fill ring beyond capacity, request `since_seq` below the discarded range, assert a `gap` envelope is produced.

## Notes (not blocking)

- **`IdempotencyStore` is FIFO, not LRU.** Eviction uses insertion-order (`idempotencyStore.ts:30-31`), and `has` / `getDispatched` do not refresh recency. For pure dedup-with-bounded-window this is functionally correct and matches the spec intent (and the "rolling LRU of 1000" wording in data_model.md §8.4 is informal). Keep as-is unless a future task surfaces a real LRU need.
- **`findRecentRequest` returns most-recent-by-cue.** If two stations fire the same cue back-to-back, the second `cue-complete` correlates to whichever request is newer in the store — could mis-attribute `fired_by` in pathological cases. Acceptable for MVP; flag for ShowX-4 once operator registry lands.
- **Cue-fire event `seq: this.seq.peek()`** (`goEventChannel.ts:210`) reuses the wire counter for the internal EventBus event without incrementing. Consistent reuse but slightly confusing — consider using a dedicated bus seq (or document the convention) in a follow-up.
- **CRDT guard not invoked from B003-002 mutators.** Done report notes this; the typed setter API in `document/cue.ts` (`setCueLabel`, `setCueDescription`, …) has no generic field-name setter, so the architectural invariant is preserved by closure of the API. The exported guard remains useful for any future generic mutator. Acceptable.
- **SyncBroker integration gap is correctly flagged** in the done report — separate concern for the CuelistCore.start() adapter task.

## Tests

- `pnpm vitest run tests/unit/modules/cuelist-core/go/` → 59/59 pass.
- 4 files: `idempotencyStore.test.ts` (11), `replayWindow.test.ts` (12), `authority.test.ts` (12), `goEventChannel.test.ts` (24).
- Coverage of the three gaps above is missing; add when fixing.

## Decision

**changes_requested** — three concrete fixes (wire `mode.transition`, target resume replay to requester, emit `gap` envelope). Spec returned to `queued/`; review round bumped to 1.
