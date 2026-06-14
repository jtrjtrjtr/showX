---
id: "B007-001"
title: "caller_lines data model + cue UI editing"
status: "done"
owner: "forge"
started_at: "2026-06-14T02:53:00Z"
ended_at: "2026-06-14T02:58:00Z"
review_round: 1
---

## Files changed

- `src/shared/src/types/caller.ts` — NEW: `CallerLineGroup` interface with `standby: { [dept: string]: string }`, `go: string`, `aggregate?: string | null`
- `src/shared/src/types/cue.ts` — Added `caller_lines?: CallerLineGroup | null` to `Cue` interface; re-exports `CallerLineGroup`
- `src/shared/src/index.ts` — Added `export type { CallerLineGroup }` from caller.ts
- `src/modules/cuelist-core/src/document/cue.ts` — Added `setCueCallerLines()` (mirrors setCuePreWait pattern, uses `assertEditAllowed(doc, 'meta')`); added `caller_lines?: CallerLineGroup | null` to `CueFieldPatch`; wired into `updateCueFields`
- `pwa/src/components/cuelist/CallerLinesEditor.tsx` — NEW: per-department standby inputs + GO input; emits `null` when all cleared; `disabled` prop for SHOW lock
- `pwa/src/components/cuelist/CueEditDialog.tsx` — Added "Caller script" section with `CallerLinesEditor`; pre-fills from `cue.caller_lines`; emits `caller_lines` in save patch; shows locked notice + disables editor when `locked=true`

## Tests run

```
Test Files  157 passed (157)
     Tests  2002 passed (2002)
  Duration  14.09s
```

New tests added:
- `tests/unit/modules/cuelist-core/document/callerLines.test.ts` — 7 tests: factory default null, setCueCallerLines set/clear/SHOW-allowed, CueFieldPatch set/clear
- `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` — 11 tests: renders all depts, pre-fills, onChange per-dept standby, onChange GO, null on clear, preserves existing standby, disabled in SHOW, custom departments
- `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx` — 7 new tests added: section renders, pre-fills from cue, included in save patch, null when unset, locked notice, no notice when unlocked, inputs disabled in SHOW

## Decisions made

- `standby` type changed from `Record<DepartmentTag, string>` (spec literal) to `{ [dept: string]: string }` (sparse dict, same intent). `Record<DepartmentTag, string>` with `DepartmentTag = CanonicalDepartmentTag | (string & {})` required all canonical keys to be present, contradicting "departments not present = no standby" spec note. Sparse `{ [dept: string]: string }` is correct and aligns with B007-002/003 that fill fields incrementally.
- `assertEditAllowed(doc, 'meta')` per spec — meta edits are allowed in SHOW mode per policy (§lockGuards.ts). UI lock is enforced via `disabled={locked}` in CallerLinesEditor, consistent with pre_wait_ms pattern.
- No node:* imports; PWA build clean (271 modules, 470 KB).

## Notes for Critic

- B007-004 (ElevenLabs client) is parallel — scope allows both. This task is complete.
- Cascade for B007-002 (deterministic generator) and B007-003 (LLM draft) both depend on B007-001 — now unblocked.
- `aggregate` field on CallerLineGroup is optional, reserved for B007-002/003 output.
