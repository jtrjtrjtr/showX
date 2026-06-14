---
id: "B007-002"
title: "Deterministic caller generator + simultaneous-mark aggregation"
status: "done"
round: 1
forge_ended_at: "2026-06-14T03:45:00Z"
---

## Summary

Implemented the deterministic caller line generator and simultaneous-cue aggregation logic, plus the "Generate from sheet" UX in CallerLinesEditor. All pure functions, no LLM, no network.

## Files changed

### New files
- `src/modules/cuelist-core/src/caller/generateCallerLines.ts` — `generateCallerLines(cue)` + `generateAllCallerLines(cues[])`
- `src/modules/cuelist-core/src/caller/aggregate.ts` — `aggregateCallerLines(cues[])`
- `tests/unit/modules/cuelist-core/caller/generateCallerLines.test.ts` — 13 tests
- `tests/unit/modules/cuelist-core/caller/aggregate.test.ts` — 9 tests

### Modified files
- `pwa/src/components/cuelist/CallerLinesEditor.tsx` — added `cue?`, `onBulkGenerate?` props + generate button + overwrite confirmation UI
- `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` — extended with 13 new tests for generate behavior (total 22 tests)

## Implementation decisions

**generateCallerLines format:**
- standby per dept: `{Dept} — standby for {cue_number} {label}` (cue_number omitted if null/undefined)
- GO: `{dept1}, {dept2}, ... — GO`
- Empty department array → `{ standby: {}, go: 'GO' }`

**aggregateCallerLines format:**
- Collects unique departments across all cues in order of first appearance
- Each dept's standby: `{allDepts} — standby for {ref1}, {ref2}` (all depts share same combined text)
- GO: `{allDepts} — GO`
- aggregate field: `{allDepts} — standby for {refs} → GO`
- Single-cue input: delegates to `generateCallerLines` (no aggregate field)
- Empty input: `{ standby: {}, go: 'GO', aggregate: null }`

**Non-destructive generate UX:**
- When `cue` prop is provided, "Generate from sheet" button appears
- If `value` is null → applies directly (no friction)
- If `value` is non-null → shows inline confirmation: "Replace" or "Keep manual"
- No `window.confirm` used (inline state-based UI, testable in jsdom)
- `onBulkGenerate?: () => void` prop shows "Generate for all cues" button; delegate to parent

**Backward compatibility:**
- All new props on CallerLinesEditor are optional; existing callsites (CueEditDialog) continue working without changes
- Generate button only appears when `cue` prop is passed

## Tests run

```
✓ tests/unit/modules/cuelist-core/caller/generateCallerLines.test.ts  (13 tests) 3ms
✓ tests/unit/modules/cuelist-core/caller/aggregate.test.ts  (9 tests) 3ms
✓ tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx  (22 tests) 104ms

Test Files  3 passed (3)
     Tests  44 passed (44)
```

Full suite: 162 test files, 2059 tests, all pass.

`pnpm --filter showx-pwa build` clean.
`pnpm -r typecheck` clean.

## Notes for Critic

- `generateCallerLines` is a single-file pure function, easy to verify
- `aggregateCallerLines` imports `generateCallerLines` for the single-cue path (avoids code duplication)
- `departments` prop on CallerLinesEditor is still respected — generate button fills only the cue's actual departments into standby, not all canonical ones; the canonical list still shows for manual editing
- No edits outside target_files confirmed
