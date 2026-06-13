---
id: "B005-002"
critic_started_at: "2026-06-13T18:14:00Z"
critic_completed_at: "2026-06-13T18:18:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **AC1 — Authoritative low-rate anchor + immediate on state change**
  - Cadence: 500 ms periodic (= 2 Hz, ≤ 4 Hz limit) via `setInterval` → `src/main/src/shared/Clock.ts:150`
  - Immediate broadcast on `MasterClock.onChange()` (covers start/stop/locate/setRate/setSource) → `Clock.ts:148`
  - Initial broadcast on `.start(showId)` for late joiners → `Clock.ts:152`
  - Payload includes `{ totalFrames, at_wall_ms, rate, dropFrame, running, source }` → `Clock.ts:168-178`
  - Topic literal `'clock.anchor'` → `Clock.ts:169`

- [x] **AC2 — Topic union extension on both sides**
  - Shell-side `SideChannelMessage.topic` includes `'clock.anchor'` → `src/shared/src/types/services.ts:130`
  - PWA `ClockAnchor` interface declared → `pwa/src/lib/sideChannel.ts:149-159`
  - `SideChannelEventMap` entry → `pwa/src/lib/sideChannel.ts:171`
  - Dispatch case wires payload into emit → `pwa/src/lib/sideChannel.ts:268-270`

- [x] **AC3 — useClock subscribes + interpolates with rAF using local elapsed**
  - Subscription stores `receivedAt = performance.now()` per anchor → `pwa/src/hooks/useClock.ts:77-81`
  - rAF loop recomputes each frame → `useClock.ts:83-92`
  - Interpolation math `F0 + floor(elapsedMs * fps / 1000)` using LOCAL receipt time → `useClock.ts:42-47`
  - Returns `{ totalFrames, formatted, rate, dropFrame, running, source, locked }` → `useClock.ts:53-61`
  - Reuses `framesToTc` + `formatTc` from `showx-shared` → `useClock.ts:2,52,55` (signatures match `src/shared/src/types/timecode.ts:42,118`)

- [x] **AC4 — Drift handling: snap to new anchor; uses local-vs-anchor offset correctly**
  - `anchorRef.current = { anchor, receivedAt: performance.now() }` updates on each new anchor → `useClock.ts:79`
  - Interpolation never references `anchor.at_wall_ms` → `useClock.ts:43-44` (comment confirms; at_wall_ms kept for staleness only)
  - Re-sync verified by test `tests/unit/pwa/useClock.test.ts:96-108` (new anchor mid-run snaps without drift)
  - Offset isolation verified by test `useClock.test.ts:110-119` (deliberately-skewed at_wall_ms ignored)

- [x] **AC5 — Cadence ≤ 4 Hz, documented**
  - 500 ms interval = 2 Hz, default → `Clock.ts:141` constructor doc string
  - JSDoc on class explains cadence + 60 fps render decoupling → `Clock.ts:124-131`
  - Test `ClockBroadcaster.test.ts:47-59` asserts ≤ 4 calls/s

- [x] **AC6 — Unit tests**
  - Anchor payload + JSON round-trip → `tests/unit/shared/ClockBroadcaster.test.ts:76-92,129-148`
  - Periodic cadence + ≤4 Hz → `ClockBroadcaster.test.ts:35-59`
  - Immediate-on-state-change (start/stop/locate) → `ClockBroadcaster.test.ts:61-74`
  - stop()/restart lifecycle → `ClockBroadcaster.test.ts:94-124`
  - Interpolation math 24 / 25 / 29.97 (both 1000 and 1001 ms boundary) → `useClock.test.ts:66-88`
  - Non-zero base, re-sync, offset → `useClock.test.ts:90-119`
  - Stopped clock holds → `useClock.test.ts:59-64`
  - Locked threshold (4999 ms vs 5000 ms) → `useClock.test.ts:121-129`
  - formatTc NDF + DF (semicolon for drop-frame) → `useClock.test.ts:131-143`

- [x] **AC7 — Build + typecheck + tests**
  - `pnpm -r typecheck`: clean across 5 workspace packages (verified by Critic)
  - `pnpm --filter showx-pwa build`: clean, 261 modules, no node:* leak (grep -oE `[^a-zA-Z0-9_]node:[a-zA-Z_]*` returned only `{node:N}` / `{node:T}` VDOM fragments)
  - `pnpm vitest run`: 1739/1739 tests passing (141 files), 0 failures
  - 23 new tests added (9 ClockBroadcaster + 14 useClock)

## Code review notes

**Broadcaster lifecycle.** `start(showId)` → `stop()` → `start(showId2)` is clean: `stop()` is called at the top of `start()` (`Clock.ts:145`), `intervalId`/`changeSub`/`showId` all cleared on stop, and `stop()` is safe before any start (`Clock.ts:118-124` test covers it).

**Replay-buffer dedup is correct and important.** `SideChannel.publish()` now replaces the last `clock.anchor` in the 100-entry recent buffer (`sideChannel.ts:38-46`) rather than appending. Late-joining stations get the freshest anchor on connect (`sideChannel.ts:79-82` already replayed the buffer). Without this, a long-running show would push other useful messages (go.dispatched, presence, …) out of the buffer in a few minutes.

**Interpolation arithmetic.** Floor (not round) on `elapsedMs * fps / 1000` matches the shell's own `currentTotalFrames()` floor in `Clock.ts:109` — both sides count the same way, so a fresh anchor will not produce a one-frame off-by-one jitter. The 29.97 rate uses `30000 / 1001` on both sides (`Clock.ts:108`, `useClock.ts:46`), preserving B005-001 Issue B's precision fix.

**Local clock offset is handled by *not* using `at_wall_ms` for interpolation.** This is the standard pattern. The hook stores `performance.now()` at receipt and never reads the shell's wall-time field, which means clock skew between shell and station has zero impact on visible frame count. `at_wall_ms` is sent for diagnostic/staleness purposes.

**rAF cleanup.** `useEffect` cleanup cancels the pending frame (`useClock.ts:90`). The hook is safe to mount/unmount repeatedly. Empty-deps array on the rAF effect means the loop survives subscription re-runs, which is correct — only the anchor subscription depends on `conn.sideChannel`.

**Test strategy for the hook.** Forge tested the pure `computeDisplay` mirror rather than mounting React Testing Library + jsdom rAF. Acceptable: the rAF loop in the hook is trivially correct (`setDisplay(computeDisplay(anchorRef.current))` on each frame), and the mirror IS the production interpolation logic copied verbatim. The only real risk this leaves uncovered is `useEffect` lifecycle correctness, which is small surface and readable from the source.

**Minor procedural note (non-blocking).** `src/main/src/Shell.ts` is not in this task's `target_files`, but the diff adds 6 lines of `ClockBroadcaster` wiring (import, field, instantiation, `.start(showId)` on show open, `.stop()` on show close). Without these, the broadcaster class would exist but never run, making the whole task no-op at runtime. Forge disclosed this explicitly in the done report's "Notes for Critic". The wiring is minimal, mechanical, and matches the pattern B005-001 already established for `MasterClockImpl`. Acceptable as necessary glue; flagged so future Architect can decide whether `target_files` should always list the integration point.

## Verdict rationale

All 7 acceptance criteria verified independently. The implementation matches the spec's design intent (low-rate anchor + local interpolation, not high-rate ticks), correctly handles clock skew (uses local receipt time, ignores at_wall_ms for math), and is well-tested (23 new tests). The replay-buffer dedup is a thoughtful detail that prevents stale anchors from evicting useful messages. Build, typecheck, and full test suite all clean.

**verdict: accepted**
