---
id: "B003-701"
title: "Cue authoring v browseru — add / insert-after / delete / drag-reorder"
type: "implementation"
estimated_size_lines: 350
priority: "P0"
bundle: "ShowX-3.7"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/AddCueButton.tsx"
  - "pwa/src/hooks/useCuelist.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Engine functions addCue / insertCueAfter / removeCue / reorderCues (document/cue.ts — EXISTUJÍ, otestované) exposed through cuelist-core package exports map and wired to UI. NO new engine logic."
  - "EmptyState '+ Add cue' button WORKS (currently dead): creates first cue (label 'New cue', manual trigger) + selects it + opens inline label edit."
  - "Selected row: hover/selected actions gain '+ below' (insertCueAfter) and '🗑' (removeCue with 2s undo toast — NO confirm dialog, undo pattern instead). Keyboard: Cmd/Ctrl+N = insert after selection."
  - "Drag-reorder: rows draggable in rehearsal mode (HTML5 DnD or pointer-based; drop indicator line between rows; calls reorderCues). Works on touch via long-press drag. SHOW mode: all authoring locked."
  - "New cues propagate live to second station; reorder propagates; delete propagates. Verify in done report."
  - "All authoring rehearsal-mode + paired-station only (any role — collaborative editing per data_model.md; SHOW mode locks)."
  - "`pnpm -r typecheck` clean, tests pass, `pnpm --filter showx-pwa build` succeeds."
  - "No edits outside target_files."
---

## Context
M1 completion: z browseru musí jít show POSTAVIT, ne jen odbavit. Engine je hotový (addCue/insertCueAfter/reorderCues v document/cue.ts), chybí UI. Pozor na sort_key semantiku — čti document/cue.ts:39 komentář.
