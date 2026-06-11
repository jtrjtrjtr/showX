---
id: "B003-605"
title: "Single-key inline editing + free-text cue numbers (QLab pattern)"
status: "done"
started_at: "2026-06-11T20:30:00Z"
ended_at: "2026-06-11T19:25:00Z"
---

## What was done

All acceptance criteria met. Task was a continuation from a prior partial Forge run; all feature code was already implemented. This run fixed the remaining test failures.

### Feature implementation (already complete from prior run)

**Data model:**
- `src/shared/src/types/cue.ts`: `Cue.cue_number?: string | null`, `CueCatalogEntry.cue_number?: string | null`
- `src/modules/cuelist-core/src/document/cue.ts`: `makeCueMap` sets `cue_number: null`; `updateCueFields` validates (trim, max 8 chars, null to clear, no uniqueness constraint)
- `src/modules/cuelist-core/src/migrations/index.ts`: `M001_add_cue_number` adds `cue_number: null` to all existing cues; idempotent via `applied_migrations` guard
- `src/modules/cuelist-core/src/catalog/cueCatalog.ts`: `computeCueCatalog` includes `cue_number`
- `src/modules/cuelist-core/src/persistence/projections.ts`: `CueJson.cue_number`, `cueMapToJson`, `rebuildCueMap` all handle `cue_number`

**PWA components:**
- `pwa/src/components/cuelist/InlineEdit.tsx`: Auto-focused input, selects all on mount. Enter=commit, Escape=cancel, Tab=commit+advance, blur=commit
- `pwa/src/components/cuelist/CueRow.tsx`: `cue_number` narrow left column (mono, ink_secondary). Exposes `InlineEditField = 'cue_number' | 'label' | 'duration_hint_ms' | 'standby_note'`
- `pwa/src/components/cuelist/SMMasterView.tsx`: `inlineEdit` state, `INLINE_TAB_ORDER`, keyboard shortcuts N/L/D/O (rehearsal + selectedCueId gate), `handleInlineCommit`, Escape clears inline edit before unarming
- `pwa/src/components/cuelist/HelpOverlay.tsx`: N/L/D/O shortcuts documented; Q remains standby (not remapped — existing shipped behavior kept; L=label is the QLab-muscle-memory compromise)
- `pwa/src/hooks/useGoChannel.ts`: `useKeyboardShortcuts` already ignores keydown when `INPUT/TEXTAREA/SELECT` has focus

**Key design decision recorded:** No uniqueness constraint on `cue_number` — QLab relaxed model. Operators can have duplicate numbers (e.g., '1' and '1.0' are different strings). Sorting/ordering is still by array position, not cue_number.

### Test fixes (this run)

**Root cause:** `openShowxPackage` never set `recoveredFromJson = true` when migrations ran AND `doc.yjs` was missing/corrupt. The migration path always rebuilt from JSON regardless of doc.yjs state, but `recoveredFromJson` was only set in the non-migration path.

**Fix in `src/modules/cuelist-core/src/persistence/showxPackage.ts`:**
- Pre-validate `doc.yjs` BEFORE running migrations (attempt `Y.applyUpdate` on a scratch doc)
- Store result as `yjsDoc: Y.Doc | null`
- In the migration branch: `recoveredFromJson = yjsDoc === null` — correctly true when doc.yjs was missing/corrupt
- Removed now-unused `fileExists` helper

**Fix in `tests/unit/modules/cuelist-core/persistence/showxPackage.test.ts`:**
- Updated "appliedMigrations is empty" test: M001 now runs on first open of a freshly-saved doc → `toHaveLength(1)` + `toContain('M001_add_cue_number')`
- Fixed "Sample fixture" test: copies fixture to a temp dir before opening so `saveShowxPackage` (called when M001 runs) does not mutate the original fixture on disk

**Fixture restore:** `tests/fixtures/showx/sample-show.showx/` was polluted by prior test runs. Restored to pre-migration state: `applied_migrations: []`, no `cue_number` on cue objects, deleted test-generated `doc.yjs` and `Info.plist`.

## Test results

- `tests/unit/modules/cuelist-core/migrations/migrations.test.ts`: 10/10 ✅
- `tests/unit/modules/cuelist-core/persistence/showxPackage.test.ts`: 27/27 ✅
- Full suite: **1488/1488 passed (128 files)** ✅
- `pnpm -r typecheck`: clean ✅
- `pnpm --filter showx-pwa build`: success ✅

## Files changed

- `src/modules/cuelist-core/src/persistence/showxPackage.ts` — pre-validate doc.yjs before migrations; set recoveredFromJson correctly; remove fileExists helper
- `tests/unit/modules/cuelist-core/persistence/showxPackage.test.ts` — fix appliedMigrations expectation; isolate Sample fixture test via temp copy
- `tests/fixtures/showx/sample-show.showx/show.json` — restored to pre-migration state
- `tests/fixtures/showx/sample-show.showx/cuelists/cl_01907d2e-0000-7000-8000-000000000010.json` — restored to pre-migration state (no cue_number on cue objects)
- `tests/fixtures/showx/sample-show.showx/history.jsonl` — trimmed to clean 5-line baseline
- `tests/fixtures/showx/sample-show.showx/operators.json` — restored op_fixture operator

All other feature files (`cue.ts`, `migrations/index.ts`, `cueCatalog.ts`, `projections.ts`, `CueRow.tsx`, `InlineEdit.tsx`, `SMMasterView.tsx`, `HelpOverlay.tsx`, `useGoChannel.ts`) were already correct from the prior partial run.
