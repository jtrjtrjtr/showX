---
id: "B005-002"
title: "Clock broadcast (anchor) + PWA useClock interpolation"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/main/src/shared/Clock.ts"
  - "src/main/src/shared/syncBroker/sideChannel.ts"
  - "src/shared/src/types/services.ts"
  - "pwa/src/lib/sideChannel.ts"
  - "pwa/src/hooks/useClock.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "MasterClock broadcasts an AUTHORITATIVE ANCHOR over the side-channel at LOW rate (~2-4 Hz), NOT a high-frequency tick. Anchor message (new topic 'clock.anchor'): { totalFrames, at_wall_ms, rate, dropFrame, running, source }. Also broadcast IMMEDIATELY on start/stop/locate/source-change (not only on the 2-4Hz cadence)."
  - "Extend SideChannelMessage topic union (src/shared/src/types/services.ts:129-133) + PWA side-channel client topics (pwa/src/lib/sideChannel.ts) to carry 'clock.anchor'."
  - "PWA hook useClock() subscribes to clock.anchor and INTERPOLATES locally via requestAnimationFrame: when running, displayFrames = anchor.totalFrames + round((performance.now() - localReceiptOffset) ... ) using rate; when stopped, holds anchor value. Returns { totalFrames, formatted, rate, dropFrame, running, source, locked }. Reuse framesToTc/formatTc from showx-shared (B005-001)."
  - "Clock drift handling: when a new anchor arrives, snap/ease to it (no visible jump > a few frames in normal operation). Account for the local-vs-anchor wall-clock offset (do NOT assume station clock == shell clock; anchor at_wall_ms is shell time — interpolate from LOCAL receipt time + elapsed)."
  - "NO high-frequency network traffic: verify the broadcast cadence is ≤4Hz regardless of internal clock resolution. Document the cadence."
  - "Unit tests: anchor serialization; useClock interpolation math (fake timers + fake rAF) advances between anchors; stopped clock holds; new anchor re-syncs; offset handling."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §2. The naive approach (broadcast every clock tick at 30Hz) floods the side-channel (30 stations × 30Hz = 900 msg/s). Instead broadcast a low-rate authoritative anchor; each station renders smooth 60fps locally by interpolating from the anchor.

## Implementation notes

- Side-channel publish API: SyncBroker.publishSideChannel(showId, msg) (seam map SyncBroker.ts:92-94); PWA subscribe: SideChannelClient.on(topic, cb) (sideChannel.ts:170-305).
- The hard part is the local interpolation offset: station receives anchor at LOCAL performance.now()=T0 with anchor.totalFrames=F0; thereafter displayFrames = F0 + (performance.now()-T0)*rate/1000. Do NOT use anchor.at_wall_ms directly for interpolation (clock skew between machines) — use it only for staleness/debug. This is the standard pattern; get it right.
- Keep one rAF loop in the hook.

## Test plan

- Anchor F0 at t=0, running, 25fps → at t=1000ms useClock returns totalFrames≈F0+25.
- Stopped anchor → value held.
- New anchor mid-run → re-sync without large jump.

## Out of scope

- Display component (003). MTC feed (005).
