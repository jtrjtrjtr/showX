---
id: "B005-001"
title: "Master clock service (internal, totalFrames model)"
type: "implementation"
estimated_size_lines: 450
priority: "P0"
bundle: "ShowX-5"
depends_on: []
target_files:
  - "src/main/src/shared/Clock.ts"
  - "src/shared/src/types/timecode.ts"
  - "src/shared/src/types/context.ts"
  - "src/main/src/Shell.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "New `MasterClock` service in src/main/src/shared/Clock.ts. Canonical state = { rate: 24|25|29.97|30, dropFrame: boolean, totalFrames: number, running: boolean, source: 'internal'|'mtc'|'ltc' }. Free-run increments totalFrames off a monotonic timer (NOT wall-clock Date — use process.hrtime/performance.now per repo constraint)."
  - "Timecode types in src/shared/src/types/timecode.ts: Timecode model + pure helpers framesToTc(totalFrames, rate, dropFrame) -> {hh,mm,ss,ff} and tcToFrames(...) and formatTc(...) -> 'HH:MM:SS:FF' (';' separator when dropFrame). Correct 29.97 drop-frame math (drop :00/:01 each minute except every 10th)."
  - "API: start(), stop(), locate(totalFrames|tc), setRate(rate,dropFrame), getState(), and an event/emitter for state changes + a way for emitters (MTC gen, OSC, broadcast) to read current totalFrames cheaply. source defaults 'internal'."
  - "Registered in Shell boot (after SyncBroker per seam map Shell.ts:305-306) and exposed on ModuleContext/SharedServices (extend src/shared/src/types/context.ts) so cuelist-core can subscribe."
  - "chase mode stub: setSource('mtc'|'ltc') marks clock as externally-driven (actual feed wired by B005-005); in chase mode free-run increment is suspended (clock value set by external feed via locate-like updates)."
  - "Unit tests: framesToTc/tcToFrames round-trip for 24/25/30/29.97DF; drop-frame boundary cases (minute rollover, 10th-minute exception); free-run advances totalFrames at rate (fake timers); locate/start/stop; format string."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision 2026-06-13_f2_time_layer_architecture §1. The clock is the single source of truth for all time emitters (display, MTC, OSC, triggers). totalFrames integer model avoids ms rounding at 29.97.

## Implementation notes

- Study how MdnsService/SyncBroker are constructed + registered in Shell.ts:261-391 (seam map). Mirror lifecycle (start/stop, logger injection).
- Keep the clock service pure of UI/broadcast concerns — it just maintains authoritative time + emits state. Broadcast is B005-002.
- Drop-frame is a LABELING scheme only — totalFrames is continuous; DF math applies at format time.
- Represent rate 29.97 as the value 29.97 (or a tagged enum) but compute with 30000/1001 for accuracy.

## Test plan

- 25fps: 25 frames advance = 1 second; format '00:00:01:00'.
- 29.97DF: minute-rollover drops :00/:01 except 10th minute; assert known reference timecodes.
- locate to '01:00:00:00' → getState totalFrames correct.

## Out of scope

- Broadcast (002), display (003), MTC (005/006), OSC (007), trigger firing (004).
