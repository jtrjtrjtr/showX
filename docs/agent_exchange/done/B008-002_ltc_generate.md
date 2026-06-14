---
id: "B008-002"
title: "LTC generate (out) — master clock → SMPTE audio"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
bundle: "ShowX-8"
depends_on: ["B008-001"]
target_files:
  - "src/main/src/shared/output/ltcGenerator.ts"
  - "src/main/src/shared/Clock.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/**"
acceptance_criteria:
  - "LtcGenerator: when ShowX is timecode master (clock source internal + LTC out enabled), encode the master clock totalFrames (F2) into SMPTE LTC PCM via libltc-wrapper encoder and stream it to a selected output device (audify, from B008-001). Continuous, frame-rate-correct (24/25/29.97df/30 from clock model)."
  - "Enable/disable + output device selection (minimal API); default OFF. Starts/stops with the clock; on clock stop, stop LTC stream cleanly."
  - "Frame-rate + drop-frame flag from the clock are encoded correctly in the LTC frame (libltc handles the bit packing; we feed it the right TC + rate)."
  - "Headless-verifiable: encode produces PCM whose bytes decode back to the input timecode (round-trip via libltc decoder) — assert in unit tests with synthetic frames (NO audio hardware needed)."
  - "Doesn't conflict with MTC out / OSC time (independent emitter off the same clock). Failures logged, never crash the clock."
  - "Unit tests: encode TC X at rate R → PCM → decode → TC X (round-trip); rate/drop-frame correctness; start/stop; disabled = no output."
  - "`pnpm -r typecheck` clean, tests pass (incl. packageJsonIntegrity guard). No edits outside target_files."
---

## Context

Per decision §1. LTC out = MTC generate's audio sibling, off the same F2 master clock. Easier half of LTC (deterministic encode). The encode→decode round-trip is the headless verification (no hardware).

## Implementation notes

- libltc-wrapper encoder: feed timecode + rate → PCM samples; push to audify output stream (device from B008-001).
- Read clock totalFrames continuously (like MTC generator B005-006 reads it).
- Round-trip test: encode then decode the same PCM, assert TC matches — proves correctness sans hardware.

## Test plan

- See ACs (synthetic round-trip).

## Out of scope

- Decode/chase (003). UI (004). Real audio-out on hardware (Jindřich gate).
