---
id: "B005-006"
title: "MTC generate — out (master clock drives MTC)"
type: "implementation"
estimated_size_lines: 360
priority: "P1"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/main/src/shared/output/mtcGenerator.ts"
  - "src/main/src/shared/dispatcher/midiOut.ts"
  - "src/main/src/shared/Clock.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "MtcGenerator emits MIDI Time Code from the MasterClock when running as master (source='internal'): continuous quarter-frame messages [0xF1, (piece<<4)|nibble] at the correct cadence (8 QF per 2 frames), plus a full-frame SysEx (F0 7F 7F 01 01 hh mm ss ff F7) on locate/seek and on start."
  - "Sends via existing MidiOutPool.claim(portName,'time-layer').send({bytes}) (seam map midiOut.ts:55-79). Claims a configurable MIDI output port; releases on stop/disable."
  - "Quarter-frame sequence encodes the running timecode + frame-rate bits in the hours-high piece, matching standard MTC so a receiver (DAW/another ShowX) locks. Respect the 1-frame lookahead convention so emitted TC aligns with clock."
  - "Enable/disable + port selection (minimal API); default OFF. Does not conflict with cue MIDI payloads (port ownership via claim; handle ClaimConflict gracefully — log, don't crash)."
  - "Stops cleanly: on clock stop, stop QF stream (optionally emit nothing or a final full-frame); release port on disable."
  - "Unit tests (mock midiOut send): running clock at 25fps emits QF in correct piece order at correct cadence (fake timers); full-frame on locate; rate bits correct; port claim conflict handled; stop halts stream."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §3. ShowX as MTC MASTER so external gear (lighting consoles, media servers, DAWs) chases ShowX's show clock. Mirror image of B005-005.

## Implementation notes

- QF cadence: at 25fps a frame is 40ms; 8 QF span 2 frames = 80ms → one QF every 10ms. Drive from a timer reading clock.totalFrames; emit the appropriate piece for the current QF slot.
- Use the existing MidiOutPool claim/send; bytes = number[].
- Reference jzz smpte.js (MIT) for bit-packing if helpful; do not add the dependency.

## Test plan

- Clock running 25fps → QF emitted every ~10ms, pieces cycle 0-7, encode current TC.
- locate → full-frame SysEx sent.
- Port already claimed by cue payload → ClaimConflict logged, no crash.

## Out of scope

- MTC decode (005). LTC. Frame-rate UI.
