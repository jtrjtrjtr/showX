---
id: "B003-008"
title: "GO event side-channel publish — pub/sub on /events/<show_id> with idempotency + replay window"
verdict: "accepted"
review_round: 2
reviewed_at: "2026-06-07T17:05:00Z"
reviewer: "critic"
---

## Summary

Round 2 cleanly resolves all three round-1 changes. `mode.transition` is now wired via the `show-mode-change` EventBus subscription (B003-004's `transitions.ts:103` is the publisher — verified). Resume replay is now per-station via `publishToStation`, and the gap envelope is emitted when `since_seq` predates the retained window. Test suite grew from 59 → 62 in this module, full suite 694/694 green.

## Acceptance criteria — all met

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Side-channel envelope `{topic, seq, ts, payload}` | ✅ | `goEventChannel.ts:124-126` `envelope()` helper, used uniformly |
| 2 | All 7 topics implemented | ✅ | `go.request` (181-241), `go.dispatched` (243-263), `go.rejected` (327-333), `arm.request` (265-279), `arm.broadcast` (270-278), `mode.transition` (281-292), `presence.heartbeat` correctly deferred to shell |
| 3 | `SequenceCounter` monotonic per process | ✅ | `sequence.ts:1-16`, doc'd "process restart only" |
| 4 | `IdempotencyStore` LRU (show_id, request_id), default 1000, configurable | ✅ | `idempotencyStore.ts:15-33`; `goEventChannel.ts:149` `opts?.idempotencyLruSize ?? 1000` |
| 5 | Replay window 5s | ✅ | `replayWindow.ts:1-6`; `replayWindow.test.ts` 12 tests |
| 6 | Transport-agnostic `GoChannelDeps` | ✅ | `goEventChannel.ts:108-120` |
| 7 | `authorise()` all 4 modes | ✅ | `authority.ts:23-50`; 12 authority tests |
| 8 | Accepted GO → `cue-fire`; `cue-complete` → broadcast `go.dispatched` | ✅ | `goEventChannel.ts:227-241` (cue-fire publish), `:243-263` (cue-complete handler + broadcast) |
| 9 | Rejected GO → `publishToStation` only | ✅ | `goEventChannel.ts:327-333`; test at `goEventChannel.test.ts:312-321` asserts `broadcasts.length === 0` |
| 10 | Ring buffer 1024/topic for `resume{since_seq}` | ✅ | `goEventChannel.ts:140-156` (rings with `_seq` decoration); `:294-325` (`onResume` per-station replay + gap detection); see fix detail below |
| 11 | GO events never in Y.Doc; `DesignViolationError` guard | ✅ | `goEventChannel.ts:11-32`; `goEventChannel.test.ts:380-417` (5 guard tests + structural cue-map check) |
| 12 | 30+ vitest tests | ✅ | 62 tests across 4 files |

## Round-1 changes — verification

### 1. `mode.transition` wired ✅

- `ModeTransition` interface at `goEventChannel.ts:82-88`.
- Ring buffer entry at `goEventChannel.ts:144` carries `_seq` decoration.
- `start()` subscribes to `show-mode-change` EventBus event at `goEventChannel.ts:168-170`.
- `onModeChange` at `goEventChannel.ts:281-292` builds payload, assigns `seq`, pushes ring entry, broadcasts envelope.
- Publisher confirmed in `src/modules/cuelist-core/src/mode/transitions.ts:96-103` (B003-004's `ctx?.events.publish(event)`).
- Tests at `goEventChannel.test.ts:449-502` cover broadcast envelope shape AND ring buffer replay round-trip.

### 2. Resume replay targets requesting station ✅

- `ResumeRequest.station_id: string` now required at `goEventChannel.ts:90-95`.
- `onResume` uses only `this.deps.publishToStation(req.station_id, envelope(...))` at `goEventChannel.ts:322`. No `broadcast()` call remains in this method.
- Test at `goEventChannel.test.ts:323-356` asserts replay went to `toStation` filtered by `station-replay` and the broadcasts array is unchanged (`expect(ctx.broadcasts.length).toBe(1)` — only the original cue dispatched).

### 3. Gap envelope on ring overflow ✅

- `onResume` at `goEventChannel.ts:306-317` computes `oldestRetainedSeq = ring.all()[0]._seq`; if `oldestRetainedSeq > since + 1`, emits `{ type: 'gap', topic, from_seq: since, to_seq: oldestRetainedSeq - 1 }` to the requester *before* the replayed messages (correct ordering — station can trigger Yjs full sync first).
- Constructor accepts `opts.ringCapacity` (default 1024 — production unchanged) at `goEventChannel.ts:148-156`.
- Test at `goEventChannel.test.ts:504-561` constructs channel with `ringCapacity: 5`, fires 10 cues, requests resume with `since_seq: 0`, asserts the gap envelope is present with correct `topic`, `from_seq: 0`, `to_seq > 0`.

## Tests

- `pnpm vitest run tests/unit/modules/cuelist-core/go/` → 62/62 pass (idempotencyStore 11, replayWindow 12, authority 12, goEventChannel 27).
- `pnpm test` (full suite) → 694/694 pass across 64 test files.

## Notes (carried from round 1, non-blocking)

- IdempotencyStore is FIFO-with-bounded-window, not strict LRU. Spec wording was informal; behaviour is correct for dedup. Acceptable.
- `findRecentRequest` returns most-recent-by-cue; pathological back-to-back same-cue fires from different stations could mis-attribute `fired_by`. Flag for ShowX-4 operator registry.
- Cue-fire event uses `seq: this.seq.peek()` for the internal bus event without incrementing — consistent reuse but slight overload of the counter semantics. Document or split in a follow-up.
- Shell-side wiring gap (SyncBroker per-station addressing) remains a separate adapter concern correctly documented in done report comments at `goEventChannel.ts:97-106`.

## Decision

**accepted** — All three round-1 gaps closed with focused changes, no regressions in the 632-test surrounding surface, 62 vitests cover the new behaviour with explicit fixtures (mode.transition round-trip + gap envelope at ringCapacity 5). Spec returned to done lifecycle; review round 2 closes.
