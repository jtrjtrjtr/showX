---
id: "B004-008"
title: "Audition / Preview GO — dry-run dispatch"
type: "implementation"
estimated_size_lines: 360
priority: "P1"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/dispatch/payloadDispatch.ts"
  - "src/modules/cuelist-core/src/go/**"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/GoButton.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Dispatch pipeline gains an 'audition' mode flag: when a cue is fired in audition mode, the full resolve+route pipeline runs (device resolution, validation, payload iteration) BUT no real transport send happens (no OSC/MIDI/DMX/webhook bytes leave). Each payload produces a Dispatch Log entry prefixed [AUDITION] showing what WOULD have been sent (address/port/channels)."
  - "Audition does NOT advance the playhead, does NOT trigger the auto chain, does NOT change current cue — it is a side-effect-free preview of a single cue."
  - "UI: SM view exposes an Audition action (e.g. modifier-click on a cue, or a dedicated 'Audition' button) that fires the SELECTED cue in audition mode. Visually distinct from real GO (no armed-green; an 'AUDITION' affordance)."
  - "Audition allowed in both REHEARSAL and SHOW (it's safe by definition — no output). SM authority only."
  - "Unit tests: audition runs resolve pipeline; transport send NOT called (spy asserts zero real sends); Dispatch Log gets [AUDITION] entries; playhead/chain unchanged; works in show mode."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

QLab audition/preview GO (competitive map P1): fire a cue to check what it does WITHOUT sending to devices. Critical for FOH confidence ('what does this cue actually output?'). Builds on the Dispatch Log (already exists from ShowX-3.5).

## Implementation notes

- Thread an `audition: boolean` through the dispatch call. At the transport-send boundary (the point that calls oscClient/midiOut/dmxOut/webhookOut), short-circuit when audition: build the same log entry but skip the actual `.send()`.
- The cleanest seam: a single dispatch entrypoint that all payloads pass through — add the flag there, not in each transport.
- Keep audition strictly read-only: no cue-fire event, no playhead change, no awareness update beyond the log.

## Test plan

- Audition cue with osc+dmx payloads → transport spies show 0 sends; Dispatch Log has 2 [AUDITION] entries with resolved targets.
- Audition does not move current cue or schedule next.
- Audition works while mode==='show'.

## Out of scope

- Disarm (B004-007). Real GO behavior unchanged.
