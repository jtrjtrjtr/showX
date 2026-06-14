---
id: "B007-002"
title: "Deterministic caller generator + simultaneous-mark aggregation"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-14T03:25:00Z"
review_round: 1
---

## Verdict
**accepted**

## Acceptance criteria audit

1. **Pure `generateCallerLines(cue)` → CallerLineGroup: standby `{Dept} — standby for {cue_number} {label}`, go `{depts} — GO`. Deterministic, no LLM, no network** — ✅
   - `src/modules/cuelist-core/src/caller/generateCallerLines.ts:24-38` — sync pure function over `Cue`. No imports beyond shared types. No `fetch`, no async, no I/O.
   - Standby template `${dept} — standby for ${ref}` (line 34) where `ref` is `cue_number` + `label` joined by space (`cueRef` lines 4-9). Falls back to `'cue'` when both missing — safer than empty string.
   - GO template `${depts.join(', ')} — GO` via `formatGo` (line 11-15). Bare `'GO'` when no departments.
   - Spec signature `generateCallerLines(cue, cuelistContext)` reduced to `(cue)` — acceptable: single-cue deterministic generation needs only `Cue` fields. The cuelist-context concern is handled by the separate `aggregateCallerLines` entry point per AC2.

2. **`aggregate.ts` produces combined line over simultaneous cues / compound cue** — ✅
   - `src/modules/cuelist-core/src/caller/aggregate.ts:24-61` — pure function over `readonly Cue[]`.
   - Department merge preserves insertion order with `Set`-based dedup (lines 33-43); deterministic given input order.
   - Per-dept standby uses combined `{allDepts} — standby for {refs}` (line 54) — matches "Lights, pyro, sound — standby…" example.
   - Combined GO `{allDepts} — GO` (line 57). Optional `aggregate` summary string `{allDepts} — standby for {refs} → GO` (line 58).
   - Single-cue path delegates to `generateCallerLines` (line 29-31) — no aggregate field in that branch, mirroring single-cue semantics.
   - Empty-input + all-empty-depts paths covered (lines 25-27, 45-47) returning `aggregate: null`.
   - Compound vs adjacent-trigger grouping is correctly delegated to caller — the function operates on a pre-grouped flat array. Aligns with pure-function design.

3. **UI "Generate from sheet" + bulk action in CallerLinesEditor; writes via B007-001 helper** — ✅
   - `pwa/src/components/cuelist/CallerLinesEditor.tsx:124-133` "Generate from sheet" button gated on `cue` prop.
   - `handleGenerate` (lines 59-68) calls `generateCallerLines(cue)` and emits via `onChange` — parent (`CueEditDialog`) routes through `updateCueFields → setCueCallerLines` per B007-001 wiring.
   - `CallerLinesEditor.tsx:134-143` bulk "Generate for all cues" button delegates to parent via `onBulkGenerate?` callback — keeps editor pure; bulk traversal lives at cuelist scope where ID list is available.
   - Backward compat: both props optional; CueEditDialog continues to render without `cue` prop until wired by the consumer.

4. **Idempotent + non-destructive overwrite confirmation** — ✅
   - `handleGenerate` (lines 62-68) routes to `pendingGenerated` state when `value != null`; applies directly only when slot is null.
   - Confirmation UI lines 148-179 ("Replace" / "Keep manual") — inline state-based, no `window.confirm`, jsdom-friendly.
   - `handleApplyGenerated` (lines 70-75) commits; `handleDiscardGenerated` (lines 77-79) dismisses without `onChange` — verified `not.toHaveBeenCalled` in test.
   - Re-running generate is idempotent (pure function over same cue → same group). ✅

5. **Unit test coverage: single-dept/multi-dept/compound/cue_number-label interpolation/empty** — ✅
   - `tests/unit/modules/cuelist-core/caller/generateCallerLines.test.ts`: 13 tests covering single-dept (lines 29-59), multi-dept (61-81), empty (83-90), cue_number interpolation (92-104), batch helper (106-121).
   - `tests/unit/modules/cuelist-core/caller/aggregate.test.ts`: 9 tests covering empty (26-33), single-cue delegation (35-44), multi-cue merge + dedup + aggregate field (46-104), compound cue path (107-117).
   - `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx`: extended to 22 tests — 11 new for generate/confirm/bulk flows (lines 122-222). Confirm-replace, confirm-keep, null-value direct apply, disabled state all verified.

6. **pnpm --filter showx-pwa build clean, pnpm -r typecheck clean, tests pass; no edits outside target_files** — ✅
   - `pnpm -r typecheck` ran clean (verified by Critic, 03:22Z): src/shared, apps/marketing, cuelist-core, src/main, pwa all `Done`.
   - 44/44 caller tests pass in isolated run (Critic, 03:22Z). Forge reports full 2059-test suite green.
   - Working-tree diff for B007-002 limited to:
     - `src/modules/cuelist-core/src/caller/{generateCallerLines,aggregate}.ts` (new) — in scope
     - `pwa/src/components/cuelist/CallerLinesEditor.tsx` (mod: generate buttons + confirm UI) — in scope (file created in B007-001, extended here per spec target_files)
     - `tests/unit/modules/cuelist-core/caller/{generateCallerLines,aggregate}.test.ts` (new) — in scope (`tests/unit/**`)
     - `tests/unit/pwa/components/cuelist/CallerLinesEditor.test.tsx` (mod) — in scope (`tests/unit/**`)
   - No production-side scope creep into main process, IPC, document module, or shared types beyond what B007-001/004 already landed.

## Code review notes

- **`cueRef` duplication** — defined identically in `generateCallerLines.ts:4-9` and `aggregate.ts:5-10`. Minor DRY breach; could be extracted to a shared helper but each instance is 5 lines and self-contained. Not a blocker.
- **Aggregate single-cue path** — delegates to `generateCallerLines`, which omits the `aggregate` field. Tests assert `result.aggregate` is `undefined` for single-cue (aggregate.test.ts:42). The type `aggregate?: string | null` accepts both undefined and null, so this dual semantics is type-safe but worth a follow-up if showcaller code starts asserting `aggregate === null` to mean "single cue path". Not blocking.
- **`cueRef` fallback to `'cue'`** — if both `cue_number` and `label` are absent the standby reads `LX — standby for cue`. Reasonable default; covered by sensible test seed-cues. Could be empty string instead, but current behavior is safer (no awkward trailing whitespace).
- **Department order in aggregate** — first-appearance insertion is deterministic and matches operator intent ("the order I added them"). ✅
- **Non-canonical departments** — generator faithfully fills `standby[dept]` for any dept tag (including non-canonical). The editor's canonical list still hides them from the UI; Forge notes this as known behavior. Acceptable for F4 scope — non-canonical dept editing was never an F4 deliverable.
- **`window.confirm` avoided** — inline confirmation state aligns with project pattern and earlier feedback re: jsdom-testability.
- **No edits to setCueCallerLines / CueFieldPatch** — generator emits via `onChange`; persistence lives in B007-001 layer. Clean separation.

## Verdict rationale

All 6 acceptance criteria satisfied with traceable file:line citations. Unit suite 44/44 green, typecheck clean, working-tree diff stays inside declared target_files. UI affordance respects SHOW-mode lock via inherited `disabled` prop, and overwrite confirmation prevents silent loss of hand-edited caller lines (AC4). Pure generator + pure aggregator are LLM-free, network-free, and deterministic — exactly the "covers most cues for free" payoff the F4 design called for.

No blocking issues. No changes requested.
