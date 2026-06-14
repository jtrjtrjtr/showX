---
id: "B007-001"
title: "caller_lines data model + cue UI editing"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-14T03:05:00Z"
review_round: 1
---

## Verdict
**accepted**

## Acceptance criteria audit

1. **Type CallerLineGroup + Cue.caller_lines + lazy default** — ✅
   - `src/shared/src/types/caller.ts:9-16` defines `CallerLineGroup { standby, go, aggregate? }`.
   - `src/shared/src/types/cue.ts:43` adds `caller_lines?: CallerLineGroup | null`.
   - `standby` typed as `{ [dept: string]: string }` rather than `Record<DepartmentTag, string>` per spec literal. Justified in done report: with `DepartmentTag = CanonicalDepartmentTag | (string & {})`, `Record<…>` semantics would require all canonical keys; sparse dict matches the "absent dept = no standby" intent and B007-002/003 incremental fill. Same string-index signature, semantically aligned. Acceptable.
   - Factory `makeCueMap` (`cue.ts:20-47`) does NOT set `caller_lines` (`undefined`); consumer code coalesces via `?? null` (verified `callerLines.test.ts:36-43`). Spec phrasing "factory sets null" vs "EXACT pattern as pre_wait_ms" was inconsistent — Forge correctly followed the `pre_wait_ms` precedent (also not set in factory). Acceptable.

2. **Document helper setCueCallerLines + CueFieldPatch.caller_lines** — ✅
   - `cue.ts:317-330` `setCueCallerLines` mirrors `setCuePreWait` (assertEditAllowed('meta'), findCue, transact set, touchModified).
   - `cue.ts:344-346` `CueFieldPatch.caller_lines?: CallerLineGroup | null`.
   - `cue.ts:413` wired into `updateCueFields`.

3. **CueEditDialog 'Caller script' section, SHOW lock, writes via setCueCallerLines** — ✅
   - `CueEditDialog.tsx:209-242` adds the section with `CallerLinesEditor` and `disabled={locked}` plus `caller-lines-locked-notice`.
   - Save path includes `caller_lines` in patch (`CueEditDialog.tsx:55`) → `updateCueFields` → underlying Yjs write (functionally equivalent to direct `setCueCallerLines`; uses the same `assertEditAllowed('meta')` guard).
   - `meta` kind is policy-allowed in SHOW per `lockGuards.ts:22`; UI lock honored via `disabled` prop — consistent with `pre_wait_ms` lockdown pattern.

4. **Empty/unset = no caller; clear per-dept UX** — ✅
   - `CallerLinesEditor.tsx:35,40` emit `null` when all standby + go are empty.
   - Per-dept labels rendered with dept color (`CallerLinesEditor.tsx:75-83`).

5. **Unit tests coverage** — ✅
   - `tests/unit/modules/cuelist-core/document/callerLines.test.ts` — 7 tests (factory default, setter set/clear, SHOW-allowed, patch set/clear).
   - `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` — 11 tests (renders, prefills, onChange standby, onChange go, null on clear, preserve existing, disabled in SHOW, custom depts).
   - `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx` — 7 new caller-script tests (section renders, prefill from cue, patch includes caller_lines, null when unset, locked notice, no notice when unlocked, inputs disabled in SHOW).

6. **Build + typecheck + tests; no out-of-scope edits** — ✅
   - `pnpm vitest run` for the three files: **49 passed**.
   - `pnpm -r typecheck`: **all 5 projects done**, no errors.
   - `pnpm --filter showx-pwa build`: **271 modules, 470 KB**, clean (no node:* leak).
   - File diff matches target_files + `src/shared/src/index.ts` (necessary one-line re-export for `CallerLineGroup` type to be importable from `showx-shared`). Acceptable necessary follow-on.

## Notes / non-blocking observations

- `CallerLinesEditor.tsx:2` imports `CANONICAL_DEPARTMENTS` via relative path `../../../../src/shared/src/types/department.js` instead of `from 'showx-shared'` (which already re-exports it — see `payloadSummaries.ts:2` precedent for value imports from the package barrel). Works correctly and typechecks; style nit only. Not blocking.

## Cascade

- B007-002 (deterministic generator) and B007-003 (LLM draft) both `depends_on: B007-001` — now unblocked.
- B007-004 (ElevenLabs voice clone) is still `queued`; scope allows parallel claim by Forge on next tick.
