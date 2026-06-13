---
id: "B004-002"
title: "Pre-wait UI + armed-waiting countdown"
type: "implementation"
estimated_size_lines: 360
priority: "P0"
bundle: "ShowX-4"
depends_on: ["B004-001"]
target_files:
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/PlaybackHeader.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Cue row shows pre-wait value when >0 (compact, e.g. 'PRE 2.0s' near the trigger/duration cells). Inline-editable in REHEARSAL mode only (mirror duration_hint_ms edit pattern in CueRow), writes via B004-001 document helper. Format M:SS.S like duration."
  - "CueEditDialog timing section exposes pre_wait_ms field (ms or M:SS.S input) alongside duration + trigger. Locked in SHOW mode."
  - "Armed-waiting visual: while a cue is in pre_wait (dispatched-but-waiting), the row shows a distinct 'waiting' indicator + live countdown of remaining pre_wait (reuse the existing per-cue countdown ticker from CueRow/SMMasterView, don't add a second ticker)."
  - "pre_wait_ms===0 → no PRE badge, no waiting indicator (zero visual noise, no regression)."
  - "Dark FOH theme tokens (no light backgrounds; reuse existing tokens). Glyph/label legible per E2E gate visual bar."
  - "Unit tests: PRE badge renders only when >0; inline edit writes value; waiting countdown renders during pre_wait state; SHOW mode disables edit."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

B004-001 adds `pre_wait_ms` + dispatch behavior. This task surfaces it in the operator UI: editable value + a clear "armed, waiting Ns before fire" state so the operator knows the cue was GO'd but hasn't dispatched yet (QLab pre-wait UX).

## Implementation notes

- Mirror the existing `duration_hint_ms` inline-edit affordance in CueRow.tsx (M:SS.S format, REHEARSAL-only).
- The waiting countdown: the engine state for "cue is in pre_wait" must be observable in the PWA. Coordinate with B004-001's state — if the firing/awareness layer exposes a "waiting until" timestamp, render remaining = waiting_until - now via the existing tick. If not exposed, add a minimal awareness/side-channel field (smallest possible) — but prefer reusing whatever playhead/awareness signal B004-001 already emits.
- Keep one ticker. SMMasterView already ticks ~10Hz for countdown; reuse.

## Test plan

- Cue pre_wait 0 → no PRE badge. Cue pre_wait 2000 → 'PRE 2.0s'.
- Inline edit 'PRE' field in rehearsal → value persists; in show → disabled.
- Simulate cue in waiting state → countdown 2.0→0 visible.

## Out of scope

- Engine timing (B004-001). Timecode display (F2).
