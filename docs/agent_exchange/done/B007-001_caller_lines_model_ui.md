---
id: "B007-001"
title: "caller_lines data model + cue UI editing"
type: "implementation"
estimated_size_lines: 380
priority: "P0"
bundle: "ShowX-7"
depends_on: []
target_files:
  - "src/shared/src/types/cue.ts"
  - "src/shared/src/types/caller.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/CallerLinesEditor.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "New type CallerLineGroup (src/shared/src/types/caller.ts): { standby: Record<DepartmentTag,string>, go: string, aggregate?: string|null }. Cue gains `caller_lines?: CallerLineGroup | null` (cue.ts), lazy default null, factory sets null — EXACT pattern as pre_wait_ms/armed."
  - "Document helper setCueCallerLines(doc, cuelistId, cueId, callerLines, modifiedBy) with assertEditAllowed(doc,'meta') + touchModified (mirror setCuePreWait). CueFieldPatch gains caller_lines."
  - "CueEditDialog gains a 'Caller script' section: editable per-department standby text + go text (CallerLinesEditor). Locked in SHOW mode (consistent with other cue meta edits being rehearsal-only at UI). Writes via setCueCallerLines."
  - "Empty/unset caller_lines = no caller for that cue (no behavior change). Clear UX: which depts have standby text."
  - "Unit tests: type + setter + lazy default null; CueFieldPatch; editor renders/edits per-dept standby + go; SHOW lock; persists."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §1. The data substrate for the AI caller — what each cue says, per department. Cheap (Yjs field + UI), delivers value even before voice (showcaller sees/edits the script). Pattern identical to pre_wait_ms (B004-001).

## Implementation notes
- Mirror setCuePreWait exactly (document/cue.ts).
- DepartmentTag already exists; standby keyed by dept.
- Keep editor simple; generation (B007-002/003) fills these fields.

## Test plan
- Set caller_lines on a cue → persists; per-dept standby editable; go editable; SHOW locks.

## Out of scope
- Generation (002/003), TTS (004+), playback (006).
