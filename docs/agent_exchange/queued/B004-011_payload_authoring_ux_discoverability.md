---
id: "B004-011"
title: "Payload authoring discoverability + cue-edit affordance"
type: "implementation"
estimated_size_lines: 300
priority: "P1"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/PayloadList.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Cue rows expose a VISIBLE edit affordance (e.g. a ✎ / edit glyph button on hover or always-on in a row gutter) that opens CueEditDialog — discovering payload editing must NOT depend on knowing to double-click. Double-click keeps working; this adds a discoverable entry point."
  - "In CueEditDialog, the Payloads section is visible WITHOUT scrolling for a typical cue (reorder so Payloads is not buried below long description; or give Payloads its own always-visible region). Empty state shows a clear '+ Add payload' call-to-action with one-line hint ('OSC, MIDI, DMX, MSC… — add an action this cue sends')."
  - "Payload count badge on the cue row (e.g. '3 payloads' / icon) so operators see at a glance which cues actually DO something — addresses 'nefunguje, nic se neděje' perception."
  - "If gate (B004-012) reveals an ACTUAL packed-app bug in payload create/edit (not just discoverability), that fix lands here (this task is the flex slot for Jindřich's v0.2.1 test feedback on authoring). Document any such fix in the done report."
  - "Dark FOH theme; touch-friendly on iPad; no regression to selection/playhead click zones."
  - "Unit tests: edit glyph opens dialog; empty-state CTA renders; payload count badge reflects count; add-payload reachable from empty state."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Jindřich (v0.2.1 test): "nefunguje nám ani vytváření payloadů na nic." Audit 2026-06-13 found the code complete + 1509 tests green → the failure is most likely DISCOVERABILITY (payload editing hidden behind double-click + scroll) or a packed-app-only bug. This task fixes discoverability proactively and reserves space for a real-bug fix if the gate finds one.

## Implementation notes

- Don't rebuild editors — they exist and work (B003-702). Add a visible door to them.
- The payload count badge doubles as a 'this cue is empty / does nothing' signal, which is what an operator clicking around would want to see.
- Coordinate visual placement with B004-002 (pre-wait badge) and existing trigger/duration cells so the row doesn't get cramped — check CueRow layout from the 2026-06-11 layout hotfix (NO|CUE|DESC|TRIGGER|DUR grid).

## Test plan

- Hover/click edit glyph → dialog opens with Payloads visible.
- Cue with 0 payloads → empty-state CTA. Cue with 3 → badge '3'.

## Out of scope

- New payload types (B004-003/004). Engine behavior.
