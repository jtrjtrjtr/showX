---
id: "B003-018"
critic_started_at: "2026-06-08T20:35:00Z"
critic_completed_at: "2026-06-08T20:55:00Z"
verdict: "accepted"
review_round: 1
---

# B003-018 Review — JSON .showx export + single-file portable export

## Acceptance criteria check

- [x] `exportShowxPackage(doc, targetPath, opts?): Promise<{path; size_bytes}>` writes fresh `.showx` directory by delegating to B003-003 `saveShowxPackage` → `src/modules/cuelist-core/src/export/showxExport.ts:22-39` (saveShowxPackage call at :33, returns `{path, size_bytes}` at :38)
- [x] `exportSingleFile(doc, targetPath, opts?)` writes structured JSON envelope `{format, version, exported_at, show, cuelists, routing, operators, doc_yjs_base64}` → `singleFileExport.ts:33-98` (envelope construction :48-58)
- [x] Single-file embeds `doc.yjs` as base64 → `singleFileExport.ts:57` `Buffer.from(docUpdate).toString('base64')`; round-trip equality verified by test → `tests/unit/modules/cuelist-core/export/singleFileExport.test.ts:77-90`
- [x] Single-file size profile suitable for email/git → confirmed by structure (compact JSON projections + base64 doc); test 5 verifies file size matches reported size_bytes (`singleFileExport.test.ts:116-125`)
- [x] `importSingleFile(jsonText, targetPkgPath?)` decodes base64, reconstructs Y.Doc, optionally writes .showx package → `singleFileExport.ts:105-147`. Note: return is `{doc, envelope}` instead of bare `Y.Doc` — enhancement over spec, documented in done report §2
- [x] `opts.includeHistory` — default false in single-file (singleFileExport.ts:60 — only embeds when explicitly true); default true in .showx export (showxExport.ts:34 — only strips when `=== false`) → matches spec semantics
- [x] `opts.includeSnapshots` — default false for single-file → `singleFileExport.ts:70-83`
- [x] `opts.includeMedia` — default false; warns on >10MB → `singleFileExport.ts:85-93`, `console.warn` at :89; verified by test 18 → `singleFileExport.test.ts:188-203` (writes 12MB raw → base64 inflates to ~16MB → warning fires)
- [x] Collision check (canonical path) → `showxExport.ts:28-32` + `:41-56` `canonicalizePath` uses `fs.realpath` with `path.resolve` fallback; test verifies rejection → `showxExport.test.ts:136-144`
- [x] Atomic write via B003-003 helper → `singleFileExport.ts:96` `atomicWriteFile(targetPath, jsonText)`; `.showx` path delegates to `saveShowxPackage` which uses `atomicWriteFile` internally
- [x] Roundtrip test (encoded state byte-equality) → `singleFileExport.test.ts:318-328` `Buffer.compare(originalState, importedState) === 0`; reopen-from-pkg test → `:330-345`
- [x] 15+ vitest tests covering all scenarios → 27 tests total (7 in `showxExport.test.ts` + 20 in `singleFileExport.test.ts`), all passing locally:
  ```
   ✓ showxExport.test.ts  (7 tests) 585ms
   ✓ singleFileExport.test.ts  (20 tests) 817ms
   Test Files  2 passed (2)  Tests  27 passed (27)
  ```

## Code review notes

**Architecture clean.** `exportShowxPackage` is a thin wrapper that delegates to `saveShowxPackage` + optional strips — no duplicated save logic, matches spec note "delegates to B003-003 saveShowxPackage and does NOT duplicate save logic." Shared types (`ExportOpts`, `ExportResult`, `pathCollidesWithCurrentShow`) live in `showxExport.ts` and are reused by `singleFileExport.ts` — sensible without needing a separate shared module.

**Validation order correct.** `importSingleFile` validates `envelope.format` (:111-113) and `envelope.version` (:114-116) BEFORE `Y.applyUpdate` (:119). Tests 16-17 verify both error paths (`singleFileExport.test.ts:347-355`).

**Path canonicalization handles edge cases.** `canonicalizePath` (`showxExport.ts:50-56`) uses `fs.realpath` for symlink resolution + `..` collapsing; falls back to `path.resolve` when the path doesn't yet exist (export target won't exist yet — fallback is required and correct).

**Strip helpers recreate empty dirs.** `stripSnapshots` / `stripMedia` (`showxExport.ts:66-84`) `rm -rf` then `mkdir` — preserves the canonical .showx structure (matches `saveShowxPackage`'s contract that always creates these dirs). Note: `stripHistory` only deletes the file (no recreate) — minor inconsistency, but defensible since `history.jsonl` is regenerated on next save.

**Media warning threshold on base64 size.** `singleFileExport.ts:87-92` measures `m.content_base64.length` (base64 bytes ≈ 4/3 raw). Forge's documented decision aligns with spec note "Watch for base64 size inflation (×1.33)." Test 18 confirms warning fires for 12MB raw (≈16MB base64).

**History line order preservation.** Export does `text.split('\n').filter(Boolean)` (singleFileExport.ts:64) — preserves order. Import does `envelope.history.join('\n')` (singleFileExport.ts:126) — preserves order. Correct by construction.

**Optional collision check.** When caller omits `currentPkgPath`, collision check is skipped. This is a caller-responsibility contract documented in done report §2. Acceptable: the PWA/shell wiring task will be expected to thread current package path through.

## Verdict rationale

All 12 acceptance criteria met with file:line citations. Tests exceed the 15+ minimum (27 total, all pass). Code adheres to spec pseudocode and respects B003-003 boundaries (no duplicate save logic; uses `atomicWriteFile`). Six judgment calls documented in done report are all reasonable and within task scope. Roundtrip is verified by byte-equal CRDT update comparison plus reopen-from-pkg test. No regressions touched outside the export module. Pre-existing `cueCatalog.test.ts` failure confirmed unrelated (no diff in catalog files).

**Verdict: accepted.**
