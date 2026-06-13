---
id: "B005-005"
title: "MTC decode — chase in (master clock follows external MTC)"
type: "implementation"
estimated_size_lines: 420
priority: "P1"
bundle: "ShowX-5"
depends_on: ["B005-001"]
target_files:
  - "src/main/src/shared/input/mtcDecoder.ts"
  - "src/main/src/shared/input/midiIn.ts"
  - "src/main/src/shared/InputRegistrar.ts"
  - "src/main/src/shared/Clock.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "MtcReceiver/decoder (new mtcDecoder.ts) decodes MIDI Time Code: (a) quarter-frame messages (status 0xF1, 8 QF = one full HH:MM:SS:FF, frame-rate from top bits of hours piece) and (b) full-frame SysEx (F0 7F <dev> 01 01 hh mm ss ff F7). Pure, unit-testable, fed raw bytes."
  - "midiIn.ts parseMidi recognizes 0xF1 quarter-frame (currently likely lumped into sysex) so QF bytes reach the decoder; full-frame SysEx already arrives as raw. Decoder subscribes via InputRegistrar.subscribeMidi (seam map InputRegistrar.ts:133-182)."
  - "When MTC chase is enabled (source='mtc'), the MasterClock FOLLOWS decoded MTC: on lock, clock.setSource('mtc') + continuously locate to decoded timecode; clock reports locked=true. On MTC signal loss (timeout ~ a few frames), report lock lost (locked=false) but hold last value (no jump to 0)."
  - "Frame-rate from incoming MTC sets clock rate. Quarter-frame reassembly tolerates starting mid-sequence (waits for a clean 8-piece set before first lock)."
  - "Enable/disable chase is controllable (which MIDI input port, on/off) — minimal API; default OFF (internal free-run)."
  - "Unit tests (inject raw bytes): 8 QF reassemble to correct TC; full-frame parse; frame-rate detection; mid-sequence start waits for clean set; lock-loss timeout; clock follows decoded TC."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §3. MTC = hand-roll (no new deps; reuse @julusian/midi). Chase = ShowX clock follows an external timecode master (common: a DAW or video server is the master). Research confirmed ~100-150 LOC state machine; bit-packing reference from jzz smpte.js (MIT) allowed.

## Implementation notes

- Quarter-frame: 0xF1 <0nnn dddd>; nnn = piece index 0-7, dddd = 4 payload bits. 8 pieces = frames-low, frames-high, sec-low, sec-high, min-low, min-high, hours-low, (hours-high|rate bits). Reassemble on completing a set. Account for the 1-frame offset convention (QF sequence completes 1 frame after the represented time).
- midiIn.ts already has _injectForTest — use it for tests.
- Lock state: need N consecutive consistent frames before declaring lock; timeout to drop lock.

## Test plan

- Feed 8 QF for 01:00:00:00 → decoder emits that TC; clock (chase on) locates there, locked=true.
- Full-frame SysEx parse.
- Stop feeding → lock lost after timeout, value held.

## Out of scope

- MTC generate (006). LTC (deferred). UI for enabling chase beyond minimal control.
