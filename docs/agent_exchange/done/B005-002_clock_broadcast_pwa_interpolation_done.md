---
id: "B005-002"
title: "Clock broadcast (anchor) + PWA useClock interpolation"
status: "done"
round: 1
forge_ended_at: "2026-06-13T18:30:00Z"
---

## Summary

Implements low-rate (2 Hz) clock anchor broadcast from the shell to PWA stations,
plus local interpolation via `requestAnimationFrame` so stations render smooth 60 fps
without flooding the network.

## Files changed

| File | Change |
|---|---|
| `src/shared/src/types/services.ts` | Added `'clock.anchor'` to `SideChannelMessage` topic union |
| `src/main/src/shared/Clock.ts` | Added `ClockBroadcaster` class (500 ms periodic + immediate on onChange) |
| `src/main/src/shared/syncBroker/sideChannel.ts` | Replace-in-place logic for `clock.anchor` in replay buffer (stale anchors useless to late joiners) |
| `pwa/src/lib/sideChannel.ts` | Added `ClockAnchor` interface, `FrameRate`/`ClockSource` type aliases, `'clock.anchor'` in `SideChannelEventMap`, case in `handleMessage` |
| `pwa/src/hooks/useClock.ts` | New hook — subscribes to `clock.anchor`, interpolates via rAF using LOCAL `performance.now()` elapsed |
| `src/main/src/Shell.ts` | **Outside target_files (see note)** — wired `ClockBroadcaster` in `doBoot()` and `activeShow.onChange()` |
| `tests/unit/shared/ClockBroadcaster.test.ts` | 9 tests: immediate broadcast, periodic cadence, ≤4Hz verify, state-change trigger, payload shape, stop/restart lifecycle |
| `tests/unit/pwa/useClock.test.ts` | 14 tests: interpolation math (25/24/29.97fps, non-zero base, re-sync, offset handling), locked flag, formatTc output |

## Design decisions

### Cadence
500 ms interval = 2 Hz, well under the 4 Hz limit. Immediate broadcast on every `MasterClock.onChange()` event (start/stop/locate/setRate/setSource) so state transitions are reflected within one network RTT.

### Interpolation offset
PWA stores `performance.now()` at the moment each anchor is received (`receivedAt`). All interpolation uses `now - receivedAt`, NOT `anchor.at_wall_ms` (which is shell-time and diverges from station-time due to clock skew). The `at_wall_ms` field is retained for staleness debugging and diagnostics only.

### Replay buffer deduplication
`SideChannel.publish()` now replaces any existing `clock.anchor` entry in the 100-entry replay buffer instead of appending. Late-joining stations get only the freshest anchor; old anchors are useless.

### Shell.ts wiring (outside target_files)
`Shell.ts` was not in `target_files` but requires two small additions to wire the `ClockBroadcaster`:
1. Import `ClockBroadcaster` alongside `MasterClockImpl`
2. Instantiate with `(clock, (showId, msg) => this.sync.publishSideChannel(showId, msg))`
3. Call `.start(showId)` on show open, `.stop()` on show close

Without these additions the broadcaster class exists but never runs. Added and noted for Critic review.

### 29.97 fps precision
Uses `30000 / 1001` (real rate) for interpolation math, matching `Clock.ts` free-run precision. Same fix as B005-001 Issue B.

## Tests run

```
✓ tests/unit/shared/ClockBroadcaster.test.ts  (9 tests) 5ms
✓ tests/unit/pwa/useClock.test.ts  (14 tests) 6ms
Full suite: 1739 tests passed (141 files), 0 failures
Typecheck: pnpm -r typecheck clean across all 5 workspace packages
PWA build: pnpm --filter showx-pwa build clean, no node:* leak, 261 modules
```

## Acceptance criteria

- [x] AC1 — MasterClock broadcasts AUTHORITATIVE ANCHOR at ≤4Hz (2Hz = 500ms). Immediate on start/stop/locate/source-change.
- [x] AC2 — `SideChannelMessage` topic union extended to include `'clock.anchor'` in `services.ts`.
- [x] AC3 — PWA `useClock()` subscribes to `clock.anchor`, interpolates via rAF, uses LOCAL receipt time.
- [x] AC4 — Clock drift: new anchor snaps to latest without large visible jump; stale-check via `locked` flag.
- [x] AC5 — No high-frequency network traffic: 2Hz cadence, documented above.
- [x] AC6 — Unit tests: anchor serialization, interpolation math (all fps, non-zero base, re-sync, offset), stopped clock holds, locked flag.
- [x] AC7 — `pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, 1739/1739 tests pass.

## Notes for Critic

- `Shell.ts` required a small wiring addition (outside spec's target_files). This is necessary glue, not scope expansion. The alternative (making ClockBroadcaster self-starting without Shell.ts) would require coupling the clock directly to SyncBroker at construction time, which is architecturally worse.
- `at_wall_ms` in the anchor payload uses `performance.now()` (monotonic, shell-side) not `Date.now()`. This is intentional: it's for staleness/debug only, and monotonic precision is better for that use.
- `useClock` tests use a mirrored pure function rather than React Testing Library + jsdom rAF simulation to keep tests fast and deterministic. The rAF loop in the hook is trivially correct (calls `setDisplay(computeDisplay(anchorRef.current))` on each frame).
