# 13 — Import & export

CSV import (QLab / Eos / generic) + JSON .showx export + PDF cue-sheet.

## CSV import

`src/import/csvImport.ts`:

```ts
export function importCsv(
  csvText: string,
  cuelist: Y.Map<unknown>,
  ctx: { actorId: string }
): ImportResult

type ImportResult = {
  imported: number          // cues actually added
  skipped: number           // invalid rows
  warnings: string[]
  dialect: 'qlab' | 'eos' | 'generic'
}
```

### Pipeline

```
1. Parse CSV (RFC-4180 pure-TS parser — handles quoted commas, no csv-parse dep)
2. Detect dialect (csvDialects.ts)
3. Apply per-dialect heuristic (csvHeuristics.ts) → array of cue init shapes
4. For each shape: addCue + handle warnings
5. Return result
```

### Dialect detection

`src/import/csvDialects.ts`:

```ts
export function detectDialect(headers: string[]): 'qlab' | 'eos' | 'generic' {
  if (headers.includes('Q Number') && headers.includes('Pre-wait')) return 'qlab'
  if (headers.includes('Cue') && headers.some(h => /Sub|Effect|Time/.test(h))) return 'eos'
  return 'generic'
}
```

### QLab heuristic

Maps QLab export columns:

- `Q Number` → cue label prefix
- `Q List` → cuelist
- `Type` → trigger heuristic (Audio/Video/Light → cue, Continue → trigger)
- `Continue` + `Pre-wait` → trigger kind:
  - Both present → `auto_continue(pre_wait_ms)` (pre-wait wins for delay value)
  - Continue only → `auto_follow`
  - Pre-wait only → `auto_continue(pre_wait_ms)`
  - Neither → `manual`
- `Notes` → cue.notes (with `.trim()` — B003-017 round 2 fix for QLab notes consistency)

### Eos heuristic

Eos text exports use a structured layout per console. Heuristic:

- `Cue` column → cue number (e.g., `1.5`, `47`)
- Validate cue number against `/^\d+(\.\d+)?$/` — invalid rows skipped (counted in `result.skipped`)
- Generates LX_REF payload with `cue_list = 1` and `cue_number = parsed`

**Critical fix (B003-017 round 2 — Critic catch):** `csvImport.ts:189` originally had `skipped++` referencing an undefined variable in a dead branch. Fixed to `innerSkipped++`. Otherwise compiles fine but TypeScript catches the undefined name.

### Generic heuristic

Expects headers: `label, department, duration_ms, notes`. Maps directly. No trigger heuristic — defaults to `manual`.

### Tests

- `tests/unit/modules/cuelist-core/import/csvDialects.test.ts` — detection across 4 fixtures
- `tests/unit/modules/cuelist-core/import/csvHeuristics.test.ts` — per-dialect mapping
- `tests/unit/modules/cuelist-core/import/csvImport.test.ts` — full pipeline + warnings

Fixtures in `tests/fixtures/csv/`:

- `qlab_export_minimal.csv` — 3 cues
- `qlab_export_compound.csv` — compound cue with multi-dept
- `eos_export_minimal.csv` — 5 cues
- `generic_cuelist.csv` — vanilla 5-row spec

## JSON export

`src/export/showxExport.ts`:

```ts
export async function exportShowxPackage(
  doc: Y.Doc,
  destPath: string,
  opts?: { stripHistory?: boolean; stripSnapshots?: boolean; stripMedia?: boolean }
): Promise<void>
```

Delegates to `saveShowxPackage` (from [03 persistence]) with field-strip filters. Used for "Export show to send to colleague" — strip the heavy bits (history.jsonl could be megabytes).

Collision check: uses `fs.realpath` to detect when destPath is the same as source path (overwriting current show file would corrupt during the write). Throws if collision.

### Single-file export

`src/export/singleFileExport.ts`:

```ts
export async function exportSingleFile(
  doc: Y.Doc,
  destPath: string
): Promise<void>

export async function importSingleFile(
  filePath: string,
  doc: Y.Doc
): Promise<{ format, version, importedAt }>
```

Single-file is one JSON envelope:

```json
{
  "format": "showx-single-file",
  "version": 1,
  "exported_at": "2026-06-06T12:00:00Z",
  "doc_yjs_base64": "AAAA..."
}
```

`doc_yjs_base64` is `Y.encodeStateAsUpdate(doc)` base64-encoded. On import: decode, `Y.applyUpdate(targetDoc, bytes)`. Idempotent on re-import.

Use case: email forwarding a show without bundling the whole directory.

## PDF cue-sheet

`src/export/pdfExport.ts` — `exportCueSheetPdf(doc, opts)`.

Library: `pdf-lib` (pure JS — works in Electron main without native dep). Latin-1 StandardFonts only — Unicode trigger glyphs ⏩ / ⏱ fall back to ASCII `CONT` / `TC`. Trade-off documented (avoids embedding 500KB Unicode font for 2 glyphs).

### Layout types

`src/export/pdfLayout.ts`:

- `renderSmMasterPdf(doc, opts)` — every cue, full info, multi-page
- `renderOperatorPdf(doc, opts, dept)` — filters via `visibleCues({ owned: [dept], watched: ['SM'] })`

A4 dimensions in `src/export/pdfStyles.ts`. Two-pass page-numbering (first pass count pages, second pass render with "Page X of Y").

### safeText defense

```ts
function safeText(s: string): string {
  return s.replace(/[-￿]/g, '?')   // strip non-Latin-1
}
```

Protects against pdf-lib crashes on Unicode (Czech ě, š, etc. → `?` in PDF). Trade-off: PDF for Czech labels is ASCII-fallback. Resolve in 0.2 by embedding a Unicode subset font.

### Tests

- `tests/unit/modules/cuelist-core/export/showxExport.test.ts` (7 tests) — collision check, strip filters, atomic write
- `tests/unit/modules/cuelist-core/export/singleFileExport.test.ts` (20 tests) — encode/decode roundtrip, version check, applyUpdate idempotency
- `tests/unit/modules/cuelist-core/export/pdfExport.test.ts` (14 tests) — empty list, 3-cue, 200-cue (multipage), per-dept filter, compound cue, atomic write, `%PDF-` magic bytes

## Open issues

- Czech / Unicode in PDF (0.2) — embed Unicode subset
- Webhook payload summary in PDF — currently shows URL, no body preview
- USITT ASCII import (theatre lighting design exchange) — 0.4
- Export to QLab format — 0.3+
