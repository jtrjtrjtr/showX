---
id: "B003-601"
title: "Timing & trigger UI — trigger cell, duration column, follow/continue glyphs in station cuelist"
type: "implementation"
estimated_size_lines: 350
priority: "P0"
bundle: "ShowX-3.6"
depends_on: []
target_files:
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/TriggerCell.tsx"
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/CueTypeBadge.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "tests/unit/pwa/**"
  - "tests/unit/modules/cuelist-core/**"
acceptance_criteria:
  - "updateCueFields (document/cue.ts) extended to accept `trigger` (validated against Trigger union — kind + per-kind fields; auto_follow.prev_cue_id must reference an existing cue in the same cuelist; auto_continue.delay_ms >= 0; timecode.time_ms >= 0) and `duration_hint_ms` (null or >= 0). Unit tests for valid/invalid patches."
  - "CueRow gains a Duration column rendering duration_hint_ms as M:SS.t (e.g. 0:05.0); em-dash when null. Column header row added to SMMasterView list (sticky)."
  - "New TriggerCell component (MagicQ 'Halt' pattern — one editable cell): displays glyph + short text: manual='GO' (⏵), auto_follow='follow' (→ + prev cue label truncated), auto_continue='+{delay}s' (⏩), timecode='TC {mm:ss}' (⏱). Click in rehearsal mode (SM role) opens a popover: kind selector + per-kind fields (delay seconds input, timecode mm:ss.t input, prev-cue auto-set to previous cue in list order). Writes via updateCueFields."
  - "Eos-style `>` marker: cues whose trigger is NOT manual render a dim `>` glyph on the row's left gutter — operator scans list shape at a glance (which cues fire themselves)."
  - "CueEditDialog (B003-506) gains Duration field (seconds, decimal 0.1 precision) editing duration_hint_ms."
  - "SHOW mode: TriggerCell and duration editing locked (no-op, lock glyph behavior consistent with existing payload lock)."
  - "CueTypeBadge stays as the compact glyph in the right column (no regression); TriggerCell replaces nothing — it's a new mid column between label/description and badges."
  - "All edits propagate live to second connected station (CRDT) — verify in done report."
  - "`pnpm -r typecheck` clean, all tests pass, `pnpm --filter showx-pwa build` succeeds (production build gate — node:fs chain regression guard)."
  - "No edits outside target_files."
---

## Context

Competitive research 2026-06-11 (`xlab-strategy/docs/showx_competitive_feature_map.md`): the single highest-value operator feature across QLab/Eos/MagicQ/ONYX is **visible + editable cue chaining and timing in the list itself**. Engine already has the full Trigger union (B003-007) and duration_hint_ms — this task is UI + the validated write path. NO data model changes.

MagicQ pattern chosen for the trigger UX (one cell, click to edit) over QLab's separate continue-column because we have one combined Trigger union, not pre/post-wait composition (pre/post-wait = M2 data-model discussion, NOT this task).

## Watch out

- Trigger write must go through cuelist-core `updateCueFields` (library-owned, tested) — never ad-hoc Y.Map sets in components (3.4 Y-type trap).
- auto_follow.prev_cue_id: when cues get reordered later, stale refs are possible — validation only checks existence, not adjacency (engine semantics own that).
- Keep data-testid attributes for E2E gate (B003-606): `trigger-cell`, `duration-cell`.
