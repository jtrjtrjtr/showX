---
id: "B004-007"
title: "Disarm cue — skip-but-advance + hatched UI"
type: "implementation"
estimated_size_lines: 360
priority: "P1"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/shared/src/types/cue.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/go/**"
  - "src/modules/cuelist-core/src/trigger/triggerEngine.ts"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Cue gains `armed: boolean` (default true; lazy default true on read for cues missing the field). A disarmed cue (armed:false) is SKIPPED when reached by GO or auto-trigger: its payloads do NOT dispatch, but the cue chain advances as if it completed (QLab disarm semantics)."
  - "Manual GO on a disarmed cue: skip dispatch, advance playhead to next cue, and if the next cue is auto-triggered relative to this one, continue the chain (so a disarmed cue in an auto-follow chain doesn't break the chain)."
  - "UI: disarmed cue row rendered with hatched/dimmed styling + a disarm toggle (arm/disarm). Toggle editable in REHEARSAL (and SHOW? — NO, treat arming as structure: locked in SHOW, consistent with other structural edits). Writes via document helper with lock guard."
  - "Disarm toggle reachable from CueRow (small control) — does not collide with selection/playhead click zones (respect the click=select / gutter=playhead convention from layout hotfix)."
  - "Unit tests: disarmed cue skips dispatch but advances; disarmed cue in auto_continue chain keeps chain going; arm/disarm persists; lazy default armed=true; SHOW mode locks toggle."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

QLab disarm (competitive map P1): operator marks a cue disarmed so GO skips its action but keeps the cue in the list and keeps the chain intact. Common for rehearsing without firing pyro/SFX. Audit: not implemented.

## Implementation notes

- `armed` is structural (like trigger), so SHOW-mode locked.
- The skip logic lives in the dispatch/GO executor: when about to dispatch a cue, if !armed → emit a 'skipped' marker (Dispatch Log: [DISARMED]) instead of transport sends, then proceed exactly as if it fired (so TriggerEngine.onCueFire still runs to schedule the next cue, and onCueComplete semantics still hold for auto_follow chains).
- Be careful the chain-advance still emits cue-fire (so the next cue schedules) — disarm suppresses OUTPUT, not chain progression.

## Test plan

- Cue B disarmed, GO reaches B → no payload dispatch, playhead advances to C.
- A→B(auto_continue 0)→C, B disarmed → C still fires.
- Toggle persists across reload; SHOW mode disables toggle.

## Out of scope

- "Skip-if-disarmed vs hard-skip" variants. Audition (B004-008).
