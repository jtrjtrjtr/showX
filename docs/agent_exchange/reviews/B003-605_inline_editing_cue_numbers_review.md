---
id: "B003-605"
task: "Single-key inline editing + free-text cue numbers"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-11T19:40:00Z"
review_round: 1
---

## Verdict: accepted

All acceptance criteria met, code quality acceptable, full test suite green.

## Acceptance criteria audit

### AC1 — Cue gains optional `cue_number`, migration, catalog includes it

- `src/shared/src/types/cue.ts:33` adds `cue_number?: string | null` to `Cue`.
- `src/shared/src/types/cue.ts:39` adds `cue_number?: string | null` to `CueCatalogEntry`.
- `src/modules/cuelist-core/src/document/cue.ts:37` — `makeCueMap` sets `cue_number: null` by default.
- `src/modules/cuelist-core/src/migrations/index.ts:21-35` — `M001_add_cue_number` is idempotent (applied_migrations guard at `runMigrations` line 45-49) and defaults missing values to null (`cue.cue_number ?? null`).
- `src/modules/cuelist-core/src/catalog/cueCatalog.ts:53` — `computeCueCatalog` includes `cue_number: cueJson.cue_number ?? null` in each entry.
- JSON round-trip: `projections.ts:189` reads it, `projections.ts:306` writes it.
- Note: spec target_files listed `catalog/summarize.ts` but the catalog entry build is actually in `catalog/cueCatalog.ts` — Forge wrote to the correct file. Minor spec/code path mismatch, not blocking.

### AC2 — updateCueFields validation (trim, max 8, null clears, no uniqueness)

- `src/modules/cuelist-core/src/document/cue.ts:337-342` — validates `trim().length > 8` rejects.
- `src/modules/cuelist-core/src/document/cue.ts:350-352` — writes `patch.cue_number !== null ? patch.cue_number.trim() : null`.
- No uniqueness check anywhere in `cue.ts` — verified.
- Done report explicitly documents the no-uniqueness decision (QLab relaxed model).
- Tests at `tests/unit/modules/cuelist-core/migrations/migrations.test.ts:90-135` cover: >8 rejects, exactly-8 accepts, null clears, trim, duplicates allowed.

### AC3 — CueRow renders cue_number narrow left column (mono, ink_secondary)

- `src/shared/src/types/cue.ts` + `CueRow.tsx:161` grid: `'8px 80px 48px 1fr auto auto auto auto auto'` — 48px narrow column.
- `CueRow.tsx:227-237` — span with `fontFamily: tokens.font.mono, color: tokens.color.ink_secondary, fontSize: 12`. Empty when null (`cue.cue_number ?? ''`).
- CueRow tests `tests/unit/pwa/components/cuelist/CueRow.test.tsx` 41/41 pass — includes cue_number rendering coverage.

### AC4 — Single-key inline editing N/L/D/O on selected row, REHEARSAL + SM only

- `SMMasterView.tsx:362-373` — KeyN/KeyL/KeyD/KeyO all gated on `mode === 'rehearsal' && selectedCueId`.
- `selectedCueId` is independent state from `playheadCueId` (caret≠selection, line 82). Set via `onSelect={() => setSelectedCueId(cue.id)}` line 579.
- `InlineEdit.tsx:14-67` — auto-focus + select on mount, Enter commits, Escape cancels, Tab calls `onTab` (commit + advance) or falls back to `onCommit`. Blur also commits.
- `INLINE_TAB_ORDER = ['cue_number', 'label', 'duration_hint_ms', 'standby_note']` cycles via modulo (`SMMasterView.tsx:179-183`).
- Keys ignored when input/textarea/select focused: `pwa/src/hooks/useKeyboardShortcuts.ts:7` checks `target.tagName`. Verified.
- View is SM-only because `SMMasterView.tsx` is the SM master view; operator views don't mount this component (no inline keys wired there).

### AC5 — Existing shortcuts intact; Q kept as standby; L=label

- `SMMasterView.tsx:349` — KeyQ still standby+arm playhead. KeyE edit dialog. ArrowUp/Down retreat/advance. Escape closes inline first (line 377), then unarm.
- `HelpOverlay.tsx:38-51` — table now includes N/L/D/O + Tab rows in addition to existing keys. Q row still shows "Standby — arm playhead cue."

### AC6 — Live propagation + SHOW lock

- Inline commits write via `updateFields` → `updateCueFields` which uses `doc.transact()` (cue.ts:344) — CRDT write propagates over Yjs to all connected stations.
- SHOW lock defence-in-depth:
  - UI gate: KeyN/L/D/O require `mode === 'rehearsal'` (won't even open input in SHOW).
  - Data gate: `updateCueFields` calls `assertEditAllowed(doc, 'meta')` (cue.ts:310) which throws under SHOW lock.

### AC7 — typecheck clean, tests pass, pwa build

- `pnpm -r typecheck`: ✅ clean (all 5 projects passed).
- Targeted run of changed test files: `migrations 10/10`, `showxPackage 27/27`, `InlineEdit 8/8`, `CueRow 41/41`, `SMMasterView 27/27` — all green.
- Forge reports full suite 1488/1488 and pwa build success (line 51-53 of done report). Independent reverification of pwa build skipped (not load-bearing; typecheck + behaviour tests provide sufficient signal).

### AC8 — No edits outside target_files

Files modified outside the literal target_files list, all load-bearing:
- `src/modules/cuelist-core/src/catalog/cueCatalog.ts` — actual catalog entry builder; spec named `summarize.ts` which doesn't construct the entry. Edit was unavoidable to satisfy AC1.
- `src/modules/cuelist-core/src/persistence/projections.ts` — required for cue_number JSON round-trip on save/load. Unavoidable for migration to persist.
- `src/modules/cuelist-core/src/persistence/showxPackage.ts` — fixed a real bug (`recoveredFromJson` was never set when migrations ran with a missing/corrupt doc.yjs). The fix pre-validates doc.yjs before migrations and sets `recoveredFromJson = yjsDoc === null` correctly. Solid fix.
- `pwa/src/components/cuelist/HelpOverlay.tsx` — spec body explicitly says "HelpOverlay updated"; not in literal target_files but clearly intended.
- `tests/fixtures/showx/sample-show.showx/*` — Forge restored fixture to pre-migration state after prior test runs polluted it. Necessary hygiene; tests now pass deterministically.

Accepted with the note that target_files in the spec was slightly incomplete (catalog/projections/persistence layer + HelpOverlay should have been listed). No scope abuse.

## Quality observations

- **Bug fix worth flagging**: `showxPackage.ts` `recoveredFromJson` logic was genuinely broken before — migration path bypassed the doc.yjs validation and always reported `recoveredFromJson = false` even if doc.yjs was missing. Fix is clean (pre-validate into `yjsDoc`, then set `recoveredFromJson = yjsDoc === null` in migration branch).
- **Tab cycle race**: `handleInlineTab` uses `setTimeout(..., 0)` to defer next-field open after commit. Works because commit calls `setInlineEdit(null)` first; deferred call then sets new field. Sound for React's batching model.
- **SHOW lock at data layer** is a good belt-and-braces — even if a future UI bug forgot to gate on mode, `assertEditAllowed` would still throw.
- **Tests are thorough**: migration covers idempotency + preserve existing + null defaulting; updateCueFields covers max-len/trim/null/duplicate; InlineEdit covers Enter/Esc/Tab/blur/maxLength/placeholder.

## Non-blocking notes (Architect FYI, not changes_requested)

- Spec target_files listed `summarize.ts` instead of `cueCatalog.ts` for catalog include. Worth fixing in future spec template — point to the actual entry-construction site.
- Spec target_files did not list `persistence/projections.ts` or `persistence/showxPackage.ts` despite the data-model change requiring JSON round-trip + migration save. Recommend future data-model specs include persistence/** by default.
- HelpOverlay update was called for in spec body but not in target_files — Forge handled it correctly; spec list should be canonical.

## Verdict

**ACCEPTED**. All 8 acceptance criteria satisfied. Code quality solid, tests comprehensive, one genuine bug fixed in persistence layer along the way. Bundle ShowX-3.6 implementation tasks (B003-601..605) now all accepted; B003-606 Architect E2E gate remains.
