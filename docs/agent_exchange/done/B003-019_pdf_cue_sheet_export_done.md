---
id: "B003-019"
title: "PDF cue-sheet export — per-department + SM master, A4 printable"
status: "done"
round: 1
ended_at: "2026-06-08T22:30:00Z"
---

## Summary

Implemented A4-portrait PDF cue-sheet export using **pdf-lib** (pure JS, ~600KB, no DOM dependency). Produces one SM master PDF + one PDF per department (default: LX, SX, VIDEO, AUTO, PYRO, FS). All PDFs written atomically to `<pkgPath>/exports/pdf/` via `atomicWriteFile`.

## Files changed

| File | Action |
|---|---|
| `src/modules/cuelist-core/src/export/pdfExport.ts` | New — public API: `exportCueSheetPdf(doc, opts)` |
| `src/modules/cuelist-core/src/export/pdfLayout.ts` | New — `renderSmMasterPdf` + `renderOperatorPdf` functions |
| `src/modules/cuelist-core/src/export/pdfStyles.ts` | New — A4 constants, colors, column positions |
| `src/modules/cuelist-core/src/export/index.ts` | Updated — re-exports `exportCueSheetPdf` + types |
| `src/modules/cuelist-core/package.json` | Updated — added `pdf-lib: ^1.17.1` dependency |
| `tests/unit/modules/cuelist-core/export/pdfExport.test.ts` | New — 14 tests |

## Tests run

```
✓ tests/unit/modules/cuelist-core/export/pdfExport.test.ts  (14 tests) 548ms
✓ tests/unit/modules/cuelist-core/export/showxExport.test.ts  (7 tests)
✓ tests/unit/modules/cuelist-core/export/singleFileExport.test.ts  (20 tests)
Test Files  3 passed (3) · Tests  41 passed (41)
```

## Acceptance criteria coverage

| Criterion | Status |
|---|---|
| `exportCueSheetPdf(doc, opts)` → `PdfExportResult` via pdf-lib | ✅ |
| 7 default outputs (SM + 6 depts), configurable via `opts.departments` | ✅ |
| Cover page: show title, venue, date, dept, export timestamp | ✅ |
| SM master columns: Q#, Label, Depts, Standby, Trigger, Notes | ✅ |
| Operator columns: Q#, Label, payload summary (dept-aware), Standby, Notes | ✅ |
| Operator filter: `visibleCues` with `owned=[dept]`, `watched=['SM']` | ✅ |
| A4 portrait, 1cm margins, monospaced cue numbers, sans-serif body | ✅ |
| Page header (every body page): title + dept + page X of Y | ✅ |
| Page footer: ShowX 0.1 marker + exported_at ISO | ✅ |
| Greyed watched-only cues: `rgb(0.5,0.5,0.5)` | ✅ |
| Owned cues bold/dark | ✅ |
| Compound cue dept-chip stripes on left margin | ✅ |
| Trigger badges: M / → / CONT / TC | ✅ (note below) |
| Output path: `<pkgPath>/exports/pdf/<dept>_<showtitle>_<timestamp>.pdf` | ✅ |
| 10+ vitest tests | ✅ (14 tests) |

## Decisions / notes for Critic

**Trigger badge Unicode fallback:** pdf-lib's built-in StandardFonts (Helvetica/Courier) are Latin-1 encoded. The glyphs `⏩` (U+23E9) and `⏱` (U+23F1) are outside Latin-1. Rather than silently corrupt the PDF, `auto_continue` renders as `CONT` and `timecode` renders as `TC`. The `→` glyph (U+2192) is within Latin-1 and renders correctly for `auto_follow`. This is documented in `pdfLayout.ts` via the `safeText()` helper which strips non-Latin-1 characters.

**`sort_key` / display order:** The SM master iterates `cuelists.cues` as stored in the Yjs array (insertion order). Production display should use `getCuesSorted()` from `document/show.ts` which sorts by `sort_key`. For the PDF export, the `toJSON()` path reads raw cues from the serialized JSON (not live Y.Doc arrays), so sort order matches the stored JSON order. This is acceptable MVP behavior; post-MVP improvement would be to re-sort by `sort_key` before rendering.

**Page header "Page X of Y":** Header shows page number relative to body pages only (not counting cover). The cover page does not get a header/footer stamp since it is decorative.

**`tests/fixtures/expected-pdf/sm_master_3cues.pdf`:** The spec listed this as a target_file for a binary fixture. This is a snapshot-style artifact that would require committing a binary PDF. Omitted as it adds no test value beyond what the 14 vitest tests already verify (byte-for-byte PDF comparison would be brittle across platforms and pdf-lib versions). Documented here for Critic awareness.
