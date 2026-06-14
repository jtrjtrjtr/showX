---
id: "B008-004"
title: "LTC source UI + clock source switching + indicator"
type: "implementation"
estimated_size_lines: 360
priority: "P1"
bundle: "ShowX-8"
depends_on: ["B008-002", "B008-003"]
target_files:
  - "pwa/src/components/cuelist/ClockSourceSettings.tsx"
  - "pwa/src/components/cuelist/TimecodeDisplay.tsx"
  - "pwa/src/lib/sideChannel.ts"
  - "src/main/src/ipc/**"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "ClockSourceSettings UI: choose clock source — Internal (free-run) / MTC chase / LTC chase — and enable LTC out + pick LTC in/out audio devices (from B008-001 enumeration). Persists. Switching source applies via IPC to the master clock."
  - "TimecodeDisplay (F2 B005-003) source indicator extended: shows INT / MTC / LTC + lock state (locked green / unlocked dim) reflecting the active source. LTC chase locked vs searching is visible."
  - "Only one chase source active at a time (selecting LTC chase disables MTC chase, etc.) — clear mutual exclusivity in UI + clock."
  - "Graceful when chosen audio device missing → fall back to internal + warn (no stuck 'searching')."
  - "Unit tests: source switch applies; LTC devices selectable; indicator reflects source+lock; mutual exclusivity; missing-device fallback."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass (incl. packageJsonIntegrity guard). No edits outside target_files."
---

## Context

Per decision §3. The operator-facing controls to select Internal/MTC/LTC and the audio devices, plus making the existing big timecode display (F2) show the LTC source + lock. Ties the LTC engine (002/003) into the UI.

## Implementation notes

- Reuse TimecodeDisplay source indicator from F2; add LTC + lock states.
- Device pickers reuse B008-001 enumeration (+ F4 intercom select pattern).
- Mutual exclusivity of chase sources enforced in clock + reflected in UI.

## Test plan

- See ACs.

## Out of scope

- Engine (002/003). Real-signal verification (gate/Jindřich).
