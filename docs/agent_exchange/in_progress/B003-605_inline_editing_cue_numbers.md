---
id: "B003-605"
title: "Single-key inline editing + free-text cue numbers (QLab pattern)"
type: "implementation"
estimated_size_lines: 350
priority: "P1"
bundle: "ShowX-3.6"
depends_on: ["B003-601", "B003-602"]
target_files:
  - "src/shared/src/types/cue.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/migrations/**"
  - "src/modules/cuelist-core/src/catalog/summarize.ts"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/InlineEdit.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/hooks/useKeyboardShortcuts.ts"
  - "tests/unit/pwa/**"
  - "tests/unit/modules/cuelist-core/**"
acceptance_criteria:
  - "Cue gains OPTIONAL `cue_number: string | null` (QLab semantics: free-text display string, NOT ordering — list order stays array order; '1' ≠ '1.0'). Migration adds field defaulting null to existing shows (follow existing migrations/ pattern + bump applied_migrations). CueCatalog summarize includes cue_number."
  - "updateCueFields accepts cue_number (trimmed, max 8 chars, null to clear). No uniqueness constraint (QLab relaxed model) — but done report documents this decision."
  - "CueRow renders cue_number in a narrow left column (mono, ink_secondary); empty when null."
  - "Single-key inline editing on the SELECTED row (selection from B003-602), rehearsal mode + SM role only: N=cue number, Q=label, D=duration, O=standby note. Pressing the key swaps the cell for an inline input (InlineEdit component: Enter commits via updateCueFields, Esc cancels, Tab commits + moves to next editable cell on same row). Keys ignored when a dialog/input already has focus."
  - "Existing shortcuts (Space/Q-standby/arrows/Esc/E/?) keep working — NOTE: 'Q' currently = standby playhead cue; REMAP standby to 'S' and document in HelpOverlay (QLab muscle memory wins for Q=name... actually inverse). DECISION: keep our existing Q=standby (already shipped), use L=label instead of Q. Final map: N=number, L=label, D=duration, O=note. HelpOverlay updated."
  - "All inline edits propagate to second station live; SHOW mode locks all inline editing."
  - "`pnpm -r typecheck` clean, tests pass (incl. migration test on fixture show), `pnpm --filter showx-pwa build` succeeds."
  - "No edits outside target_files."
---

## Context

QLab's single-key column editing is the fastest cue programming UX in the industry (research). Cue numbers: operators communicate in numbers ('standby LX 10'), our cues only have labels — free-text number column closes that gap without touching ordering semantics.

## Watch out

- THIS TASK TOUCHES THE DATA MODEL (the only one in 3.6) — migration discipline: read existing migrations/ pattern first; round-trip test load old fixture → migrate → save → reload.
- showx-shared type change ripples: rebuild shared before dependent typechecks (pnpm -r build order).
- InlineEdit must not fight CueEditDialog dblclick (B003-506) — single-key only on selection, no click binding.
