---
id: "B005-007"
title: "Show time OSC broadcast out"
type: "implementation"
estimated_size_lines: 260
priority: "P1"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/main/src/shared/output/showTimeOsc.ts"
  - "src/main/src/shared/dispatcher/oscClient.ts"
  - "src/main/src/shared/Clock.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "Optional periodic OSC broadcast of the show time from the MasterClock. Sends an OSC message (configurable address, default e.g. /showx/time, args: HH,MM,SS,FF ints + a string 'HH:MM:SS:FF' + running bool) at a configurable rate (default ~10Hz, capped). Via existing oscClient.sendOn (seam map oscClient.ts)."
  - "Configurable target device/route (reuse routing/device pattern) + enable/disable; default OFF. When clock stopped, either stop sending or send running=false (documented choice)."
  - "Rate-limited and non-blocking; failures logged, never crash the clock."
  - "Unit tests (mock oscClient): running clock emits OSC time at configured rate with correct args; disable stops; address configurable."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Kobbi mail: show time / timecode 'se může pouštět případně nějaký další externí zařízení' — broadcasting the show clock over OSC lets external systems (countdown displays, automation, other apps) follow ShowX. Per design §C.

## Implementation notes

- Reuse oscClient pooled send. Don't reinvent OSC encoding.
- Keep cadence capped (≤10Hz) — this is for external displays, not frame-accurate sync (that's MTC/LTC).

## Test plan

- Clock running → OSC /showx/time emitted ~10Hz with TC args.
- Disable → no send.

## Out of scope

- MTC/LTC (separate). Inbound OSC time (chase is MTC).
