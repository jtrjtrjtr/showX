---
id: "B003-019"
title: "PDF cue-sheet export — per-department + SM master, A4 printable"
verdict: "accepted"
reviewer: "critic"
review_round: 1
reviewed_at: "2026-06-08T22:55:00Z"
---

## Verdict: ACCEPTED

PDF cue-sheet export implements all functional requirements via pdf-lib. Two documented spec deviations (trigger badge Latin-1 fallback, cover page lacks header/footer) are reasonable engineering trade-offs and are explicitly flagged in the done report for Architect awareness.

## Acceptance criteria verification

| # | Criterion | Citation | Status |
|---|---|---|---|
| 1 | `exportCueSheetPdf(doc, opts)` API using pdf-lib | `src/modules/cuelist-core/src/export/pdfExport.ts:27-79` + `package.json:19` (`pdf-lib ^1.17.1`) | ✅ |
| 2 | 7 default outputs (SM + 6 depts), configurable via `opts.departments` | `pdfExport.ts:25` `DEFAULT_DEPARTMENTS`, `:31,60-67,69-76` | ✅ |
| 3 | Cover page: title, venue, date, dept, export timestamp | `pdfLayout.ts:79-101` `renderCoverPage` | ✅ |
| 4 | SM master columns: Q#, Label, Depts, Standby, Trigger, Notes | `pdfLayout.ts:172-181` — Label/Depts/Trigger/Standby + secondary description row | ✅ (Q# embedded in `cue.label` text per spec sample code) |
| 5 | Operator columns: Q#, Label, dept payload summary, Standby, Notes | `pdfLayout.ts:244-253` | ✅ |
| 6 | Operator filter: `visibleCues` with `owned=[dept]`, `watched=['SM']` | `pdfLayout.ts:215-218` | ✅ |
| 7 | A4 portrait, 1cm margins, monospaced cue numbers, sans-serif body, 10-12pt | `pdfStyles.ts:3-9` (`PAGE_W=595.276`, `PAGE_H=841.89`, `MARGIN=28.35`, `BODY=11`, `SMALL=9`, Courier for trigger badge in `pdfLayout.ts:174`) | ✅ |
| 8 | Page header (every body page): title + dept + page X of Y | `pdfLayout.ts:105-114,188-191,259-263` | ⚠️ Cover page omitted (documented) |
| 9 | Page footer: ShowX 0.1 marker + exported_at ISO | `pdfLayout.ts:116-120,191,263` | ⚠️ Cover page omitted (documented) |
| 10 | Greyed watched-only cues at rgb(0.5,0.5,0.5) | `pdfStyles.ts:18` `COLOR_GREY`, `pdfLayout.ts:240` | ✅ |
| 11 | Owned cues bold/dark | `pdfLayout.ts:244` `font: isOwned ? bold : regular`, color `COLOR_BLACK` | ✅ |
| 12 | Compound cue dept-chip stripes on left margin | `pdfLayout.ts:124-133,170,242` `renderDeptChips`, only when `department.length > 1` | ✅ |
| 13 | Trigger badges M / → / ⏩ / ⏱ | `pdfLayout.ts:26-35` — M / → / CONT / TC (Latin-1 fallback documented) | ⚠️ Fallback accepted |
| 14 | Output path `<pkgPath>/exports/pdf/<dept>_<showtitle>_<timestamp>.pdf` | `pdfExport.ts:52-56,63-65,72-74` | ✅ |
| 15 | 10+ vitest tests (SM master, per-dept, empty, large, cover, file write) | `tests/unit/modules/cuelist-core/export/pdfExport.test.ts` — 14 tests | ✅ |

## Code quality observations

- **Atomic writes** confirmed via `atomicWriteFile` (`atomicWrite.ts:9-19`) — tmp + fsync + rename. Partial PDFs never visible to consumers. ✅
- **TS typing** — strict types throughout: `Cue`, `PDFFont`, `PDFPage`, `RGB`. No `any` leakage except one cast `dept as any` (`pdfLayout.ts:239`) — minor, acceptable for MVP.
- **Promise.all** used to embed three fonts in parallel (`pdfLayout.ts:139-143,205-209`) — sensible.
- **Module exports** wired correctly through `src/modules/cuelist-core/src/export/index.ts:5-6`.
- **Page-numbering** done in a two-pass style (collect body pages, then stamp header/footer with final total) — correct, avoids forward-reference issue.
- **safeText helper** consistently applied to user-text drawTexts (`pdfLayout.ts:37-41`) — prevents pdf-lib WinANSI encoding errors when titles/notes contain emoji or CJK.

## Documented deviations (accepted)

1. **Trigger badge fallback** (`pdfLayout.ts:31-32`): `⏩` and `⏱` are outside Latin-1 (WinANSI) — pdf-lib's StandardFonts cannot embed them without a custom Unicode font. Forge substituted ASCII `CONT` / `TC`. Reasonable trade-off; documented in done report. Alternative would have been embedding a Noto/Symbol font (+~500KB bundle), not worth it for two glyphs.
2. **Cover page header/footer**: Spec said "every page". Forge skipped on cover (decorative) — see done report. Minor inconsistency: empty-cuelist case DOES stamp header on the cover (`pdfLayout.ts:151-152,221-222`) since there are no body pages. Not blocking, but Architect may want to revisit if cover-page branding wanted in v0.2.
3. **`tests/fixtures/expected-pdf/sm_master_3cues.pdf`** target file omitted. Justification valid: byte-for-byte PDF fixture brittle across pdf-lib versions/platforms. 14 vitest tests cover behavioral contract.
4. **Sort order** uses raw Yjs `toJSON()` insertion order, not `sort_key`. Documented as MVP. Post-MVP work for B003-020+ or polish bundle.

## Test coverage assessment

14 tests in `pdfExport.test.ts`:
- Default 7-output count (line 77) ✅
- PDF magic bytes (`%PDF-`) (94) ✅
- Non-zero byte size (106) ✅
- SM master pagination (≥2 pages for 3 cues) (117) ✅
- Empty cuelist → cover-only (128) ✅
- 200-cue cuelist multi-page (139) ✅
- Output path under `pkgPath/exports/pdf/` (150) ✅
- `opts.departments` override (163) ✅
- `generateSmMaster=false` skips SM (179) ✅
- Operator filter divergence vs SM (194) ✅
- Compound cue in both LX+SX operator PDFs (208) ✅
- SM cue surfaces in LX operator PDF (watched context) (224) ✅
- `size_bytes` matches `fs.stat` (238) ✅
- Page count internally consistent (250) ✅

Coverage hits all explicit spec test requirements. No explicit text-content extraction (would require pdf-parse — out of scope for MVP).

## Dependencies

- `pdf-lib@^1.17.1` added to `src/modules/cuelist-core/package.json:19`. Lockfile updated (visible in `pnpm-lock.yaml` diff). Symlink resolves: `src/modules/cuelist-core/node_modules/pdf-lib → ../../.pnpm/pdf-lib@1.17.1/...`. ✅

## Verdict reasoning

All 15 acceptance criteria met or accepted-with-documented-deviation. Three new source files (~280 LOC), one updated index, one updated package.json, 14 passing tests. Architecture clean (pure functions for payload summaries + render helpers, two-pass page-count finalization, safeText defense for fonts). Forge made sensible engineering choices for two Latin-1 / cover-page edge cases and called them out for Architect.

**Accepted.**
