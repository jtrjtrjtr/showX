---
id: "B008-003"
title: "LTC decode (in / chase) — SMPTE audio → master clock"
type: "implementation"
estimated_size_lines: 450
priority: "P1"
bundle: "ShowX-8"
depends_on: ["B008-001"]
target_files:
  - "src/main/src/shared/input/ltcDecoder.ts"
  - "src/main/src/shared/Clock.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/**"
acceptance_criteria:
  - "LtcDecoder: read PCM from a selected input device (audify, B008-001) → libltc-wrapper LTCDecoder → timecode + rate. When LTC chase enabled (clock source 'ltc'), the master clock FOLLOWS decoded LTC: on lock, setSource('ltc') + continuously locate to decoded TC; locked=true. On signal loss (timeout ~ a few frames), lock lost (locked=false), hold last value (no jump to 0). Mirror MTC chase (B005-005)."
  - "Lock state machine: N consecutive consistent frames → locked before driving the clock; timeout drops lock. Frame-rate detected from the stream sets clock rate."
  - "Enable/disable + input device selection; default OFF (internal free-run). Does not fight LTC out / MTC (only one chase source active)."
  - "Headless-verifiable WITHOUT hardware: synthetic LTC PCM (encode known TC via libltc, B008-002) → feed decoder → assert decoded TC + lock. Round-trip is the test; real-signal lock = Jindřich/Kobbi later (documented)."
  - "Graceful: no input device / no signal → no lock, internal clock continues; no crash."
  - "Unit tests: synthetic PCM → decode TC; lock after N frames; lock-loss timeout holds value; rate detection; clock chase follows; no-signal graceful."
  - "`pnpm -r typecheck` clean, tests pass (incl. packageJsonIntegrity guard). No edits outside target_files."
---

## Context

Per decision §1/§4. LTC decode = MTC chase's audio sibling. The fiddly half (biphase clock recovery) is handled by libltc; we feed PCM + drive the clock. No hardware now → synthetic-PCM round-trip is the verification; real lock validated by Jindřich/Kobbi.

## Implementation notes

- audify input stream → PCM buffers → libltc LTCDecoder.write() → poll decoded frames.
- Clock chase identical pattern to MTC (B005-005): lock gate, timeout, hold-on-loss, setSource.
- Test via B008-002 encoder producing known PCM (no mic needed).

## Test plan

- See ACs (synthetic round-trip + lock state).

## Out of scope

- Generate (002). UI (004). Real hardware signal (Jindřich gate).
