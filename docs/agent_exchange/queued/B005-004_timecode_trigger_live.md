---
id: "B005-004"
title: "Timecode trigger live — fire from master clock"
type: "implementation"
estimated_size_lines: 380
priority: "P0"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/modules/cuelist-core/src/trigger/scheduler.ts"
  - "src/modules/cuelist-core/src/trigger/triggerEngine.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "Timecode-trigger cues (trigger.kind==='timecode', time_ms or timecode value) FIRE when the master clock crosses their trigger time. Replace the scheduler.ts:49-51 'return null' deferral + triggerEngine.ts:64-69 'deferred' log with real behavior."
  - "TriggerEngine subscribes to MasterClock (injected via deps/ModuleContext per B005-001). On clock advancing past an armed timecode cue's time → publish 'cuelist-go' (by_operator_id:'timecode'), exactly like auto triggers do. Honors the existing chain-depth/runaway guard."
  - "Only fires when clock is RUNNING. Does NOT fire on locate/scrub backward (no spurious fires when jumping the clock). Re-arming: locating BEFORE a timecode cue re-arms it; firing is once-per-pass while running forward."
  - "source semantics: a timecode cue fires off whatever drives the active clock (internal free-run OR mtc chase). 'ltc' source cues remain inert until LTC ships (no crash; logged as 'ltc source not available')."
  - "Multiple timecode cues at/near same time → fire in cuelist order, deterministic."
  - "Unit tests (fake clock): cue at TC 00:00:05:00 fires when clock crosses it running forward; does NOT fire when stopped; does NOT fire on backward locate; re-arms after locate-before; ltc-source cue inert; ordering."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §5. Audit G1: timecode trigger UI exists (TriggerCell, ShowX-3.6) but engine returns null. B005-001 provides the clock; this task wires firing.

## Implementation notes

- Seam map: scheduler.ts:49-51 (null), triggerEngine.ts onCueFire/onCueComplete emit 'cuelist-go' (lines 33-114). The timecode path is NOT chain-driven (not relative to prev cue) — it's clock-driven, so it needs a clock subscription in TriggerEngine, separate from the cue-fire chain logic.
- Maintain a set of armed timecode cues; on each clock advance (or a periodic check tied to clock state), fire any crossed-and-running cues. Avoid O(n) per high-freq tick — the clock anchor cadence or a coarse check is fine (frame-accurate firing not required for MVP; within ~1 frame acceptable).
- Verify the 'cuelist-go' → 'cue-fire' bridge so GoExecutor dispatches (seam map note: GoExecutor listens cue-fire; cuelist-core bridges cuelist-go→cue-fire).

## Test plan

- Clock running, cue armed at 5s → fires once when crossed.
- Stopped clock → no fire. Locate back before cue → re-arm; locate past → no retro-fire.

## Out of scope

- Clock service (001). MTC feed (005). UI (exists).
