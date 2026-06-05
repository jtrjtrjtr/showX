---
id: "B003-018"
slug: "json_showx_export"
status: "done"
round: 1
---

# B003-018 Done Report — JSON .showx export + single-file portable export

## Summary

Implemented full export module for ShowX cuelist-core. Provides three public functions:

- `exportShowxPackage(doc, targetPath, opts?, currentPkgPath?)` — Save As to new .showx directory, delegates to `saveShowxPackage`, with optional strip of history/snapshots/media
- `exportSingleFile(doc, targetPath, opts?, currentPkgPath?)` — Single portable JSON file with Yjs state encoded as base64, optional history/snapshots/media embed
- `importSingleFile(jsonText, targetPkgPath?)` — Reconstruct Y.Doc from single-file, optionally write back as .showx package

## Files Changed

| File | Action |
|---|---|
| `src/modules/cuelist-core/src/export/showxExport.ts` | Created — exportShowxPackage + helpers |
| `src/modules/cuelist-core/src/export/singleFileExport.ts` | Created — exportSingleFile + importSingleFile |
| `src/modules/cuelist-core/src/export/index.ts` | Created — re-exports all public symbols |
| `tests/unit/modules/cuelist-core/export/showxExport.test.ts` | Created — 7 tests |
| `tests/unit/modules/cuelist-core/export/singleFileExport.test.ts` | Created — 20 tests |

## Tests Run

```
 ✓ tests/unit/modules/cuelist-core/export/showxExport.test.ts  (7 tests) 544ms
 ✓ tests/unit/modules/cuelist-core/export/singleFileExport.test.ts  (20 tests) 829ms

 Test Files  2 passed (2)
      Tests  27 passed (27)
```

27 tests, all passing. Covers all 18 scenarios from the task spec test plan.

Pre-existing failure in `cueCatalog.test.ts` confirmed not related to this task (JSON parse error in concurrent cache write test, pre-dates this work).

## Decisions Made Within Task Scope

1. **`ExportOpts`, `ExportResult`, `pathCollidesWithCurrentShow`** defined in `showxExport.ts`, imported by `singleFileExport.ts` — avoids duplication without extra shared file.

2. **`currentPkgPath` as optional 4th param on `exportShowxPackage`** — spec pseudocode didn't show it but collision check requires knowing the current path; added symmetrically with `exportSingleFile`.

3. **Collision check uses `fs.realpath` with `path.resolve` fallback** — handles symlinks, `..` path components, and nonexistent paths gracefully.

4. **Media >10MB warning threshold based on base64 payload size** (not raw file size) — base64 encoding inflates by ~1.33x, so a 10MB raw file becomes ~13MB in JSON. The threshold is applied to the base64 string length, matching spec note "Watch for base64 size inflation".

5. **`stripSnapshots` / `stripMedia`** recreate empty directories after `rm -rf` — preserves expected .showx structure even when export opts strip content.

6. **`computeDirSize` exported** from index — useful for callers (shell UI) to report export size without re-stat.

## Notes for Critic

- Verify `exportShowxPackage` delegates entirely to `saveShowxPackage` — no duplicate save logic.
- Verify `importSingleFile` validates `format` and `version` BEFORE calling `Y.applyUpdate`.
- Verify collision check uses `fs.realpath` (resolves symlinks + `..`).
- Verify `includeHistory` default behavior: absent from single-file unless `opts.includeHistory === true`; always in .showx export unless `opts.includeHistory === false`.
- Verify atomic write is used for single-file output (`atomicWriteFile` from B003-003).
- Verify media >10MB warning fires on `console.warn` (test 18 confirms with spy).
- Note: `cueCatalog.test.ts` failure is pre-existing (JSON parse error in cache write test), confirmed by git diff showing no modification to catalog files.
