---
id: "B003-018"
title: "JSON .showx export + single-file portable export"
type: "implementation"
estimated_size_lines: 300
priority: "P1"
depends_on: ["B003-003"]
target_files:
  - "src/modules/cuelist-core/src/export/showxExport.ts"
  - "src/modules/cuelist-core/src/export/singleFileExport.ts"
  - "src/modules/cuelist-core/src/export/index.ts"
  - "tests/unit/modules/cuelist-core/export/showxExport.test.ts"
  - "tests/unit/modules/cuelist-core/export/singleFileExport.test.ts"
acceptance_criteria:
  - "`exportShowxPackage(doc, targetPath, opts?): Promise<{path; size_bytes}>` writes a fresh `.showx` directory bundle by delegating to B003-003 `saveShowxPackage` (this is essentially Save As)"
  - "`exportSingleFile(doc, targetPath, opts?): Promise<{path; size_bytes}>` writes a single JSON file containing all show data as a structured envelope: `{format: 'showx-single-file', version: '1.0', exported_at, show, cuelists, routing, operators, doc_yjs_base64}`"
  - "Single-file format embeds `doc.yjs` as base64-encoded string under `doc_yjs_base64` so the file is self-contained + roundtrippable"
  - "Single-file format suitable for email attachment, git commit, archive — typical size <500KB for small shows, <5MB for large theatre productions"
  - "`importSingleFile(jsonText, targetPkgPath): Promise<Y.Doc>` reverse operation: parses single-file, decodes doc.yjs.base64, reconstructs Y.Doc + optionally writes to .showx package directory"
  - "Export options: `opts.includeHistory?: boolean` (default false — exclude history.jsonl from single-file to reduce size; .showx export always includes)"
  - "Export options: `opts.includeSnapshots?: boolean` (default false for single-file)"
  - "Export options: `opts.includeMedia?: boolean` (default false; if true, base64-embeds files from media/ subdir — warns if >10MB)"
  - "Validation: target path must not collide with current show file (warn + reject if same path)"
  - "Atomic write via B003-003 atomicWriteFile helper"
  - "Single-file roundtrip test: export → import → save → diff with original .showx; assert doc state equivalent"
  - "15+ vitest tests covering full .showx export, single-file export, single-file import, roundtrip, options handling, error cases"
---

## Context

Export is the user-side affordance: "Save As" to a different location, "Share this show" via single file, "Backup" via single-file archive. The .showx package export is just `saveShowxPackage` to a new path (delegated); the single-file format is a new format optimized for portability.

This task does NOT add UI; PWA + shell wire the export in a small follow-up task. Core logic + roundtrip tests are the deliverable.

## Implementation notes

### Public API

```ts
// src/modules/cuelist-core/src/export/showxExport.ts
import * as Y from 'yjs';
import { saveShowxPackage } from '../persistence/showxPackage';

export interface ExportOpts {
  includeHistory?: boolean;
  includeSnapshots?: boolean;
  includeMedia?: boolean;
}

export interface ExportResult {
  path: string;
  size_bytes: number;
}

export async function exportShowxPackage(
  doc: Y.Doc, targetPath: string, opts: ExportOpts = {},
): Promise<ExportResult> {
  if (await pathCollidesWithCurrentShow(targetPath)) {
    throw new Error(`target path ${targetPath} collides with current show`);
  }
  await saveShowxPackage(doc, targetPath, { reason: 'explicit', by_operator_id: 'export' });
  // Optionally trim history/snapshots/media if opts.include* false
  if (opts.includeHistory === false) await stripHistory(targetPath);
  if (opts.includeSnapshots === false) await stripSnapshots(targetPath);
  if (opts.includeMedia === false) await stripMedia(targetPath);
  const size = await computeDirSize(targetPath);
  return { path: targetPath, size_bytes: size };
}
```

### Single-file export

```ts
// src/modules/cuelist-core/src/export/singleFileExport.ts
import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite';
import { docToProjections } from '../persistence/projections';

export interface SingleFileEnvelope {
  format: 'showx-single-file';
  version: '1.0';
  exported_at: string;
  source: string; // ShowX version
  show: Record<string, unknown>;
  cuelists: Record<string, unknown>;
  routing: unknown;
  operators: unknown;
  doc_yjs_base64: string;
  history?: string[];        // optional
  snapshots?: Array<{ name: string; content: string }>;  // optional
  media?: Array<{ name: string; content_base64: string }>;  // optional
}

export async function exportSingleFile(
  doc: Y.Doc, targetPath: string, opts: ExportOpts = {}, currentPkgPath?: string,
): Promise<ExportResult> {
  const { show, cuelists, routing, operators } = docToProjections(doc);
  const docUpdate = Y.encodeStateAsUpdate(doc);
  const envelope: SingleFileEnvelope = {
    format: 'showx-single-file',
    version: '1.0',
    exported_at: new Date().toISOString(),
    source: 'cuelist-core@0.1.0',
    show,
    cuelists,
    routing,
    operators,
    doc_yjs_base64: Buffer.from(docUpdate).toString('base64'),
  };

  if (opts.includeHistory && currentPkgPath) {
    const histPath = path.join(currentPkgPath, 'history.jsonl');
    try { envelope.history = (await fs.readFile(histPath, 'utf8')).split('\n').filter(Boolean); } catch {}
  }
  if (opts.includeSnapshots && currentPkgPath) {
    const snapDir = path.join(currentPkgPath, 'snapshots');
    try {
      const files = await fs.readdir(snapDir);
      envelope.snapshots = await Promise.all(files.map(async (f) => ({
        name: f, content: await fs.readFile(path.join(snapDir, f), 'utf8'),
      })));
    } catch {}
  }
  if (opts.includeMedia && currentPkgPath) {
    envelope.media = await collectMediaBase64(path.join(currentPkgPath, 'media'));
    const totalSize = envelope.media.reduce((s, m) => s + m.content_base64.length, 0);
    if (totalSize > 10 * 1024 * 1024) {
      console.warn(`media payload >10MB (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
    }
  }

  const jsonText = JSON.stringify(envelope, null, 2) + '\n';
  await atomicWriteFile(targetPath, jsonText);
  return { path: targetPath, size_bytes: Buffer.byteLength(jsonText, 'utf8') };
}

export async function importSingleFile(
  jsonText: string, targetPkgPath?: string,
): Promise<{ doc: Y.Doc; envelope: SingleFileEnvelope }> {
  const envelope = JSON.parse(jsonText) as SingleFileEnvelope;
  if (envelope.format !== 'showx-single-file') {
    throw new Error('not a ShowX single-file export');
  }
  if (envelope.version !== '1.0') {
    throw new Error(`unsupported single-file version ${envelope.version}`);
  }
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(envelope.doc_yjs_base64, 'base64'));

  if (targetPkgPath) {
    // Optionally write back as .showx package
    await saveShowxPackage(doc, targetPkgPath, { reason: 'explicit' });
    if (envelope.history) {
      const histPath = path.join(targetPkgPath, 'history.jsonl');
      await fs.writeFile(histPath, envelope.history.join('\n') + '\n', 'utf8');
    }
    if (envelope.snapshots) {
      const snapDir = path.join(targetPkgPath, 'snapshots');
      await fs.mkdir(snapDir, { recursive: true });
      for (const s of envelope.snapshots) {
        await fs.writeFile(path.join(snapDir, s.name), s.content, 'utf8');
      }
    }
    if (envelope.media) {
      const mediaDir = path.join(targetPkgPath, 'media');
      await fs.mkdir(mediaDir, { recursive: true });
      for (const m of envelope.media) {
        await fs.writeFile(path.join(mediaDir, m.name), Buffer.from(m.content_base64, 'base64'));
      }
    }
  }

  return { doc, envelope };
}
```

### Strip helpers

```ts
async function stripHistory(pkgPath: string): Promise<void> {
  try { await fs.unlink(path.join(pkgPath, 'history.jsonl')); } catch {}
}
async function stripSnapshots(pkgPath: string): Promise<void> {
  try { await fs.rm(path.join(pkgPath, 'snapshots'), { recursive: true, force: true }); } catch {}
  await fs.mkdir(path.join(pkgPath, 'snapshots'));
}
async function stripMedia(pkgPath: string): Promise<void> {
  try { await fs.rm(path.join(pkgPath, 'media'), { recursive: true, force: true }); } catch {}
  await fs.mkdir(path.join(pkgPath, 'media'));
}
async function computeDirSize(p: string): Promise<number> {
  // recursive dir size
}
```

### Collisions

`pathCollidesWithCurrentShow(targetPath)` returns true if targetPath resolves to the same canonical path as the currently-open package. Prevents accidental overwrite of source.

## Test plan

### `showxExport.test.ts`

1. Export full .showx to new path: directory exists with all expected files.
2. Export with includeHistory=false: no history.jsonl in target.
3. Export with includeSnapshots=false: empty snapshots dir.
4. Export with includeMedia=false: empty media dir.
5. Export to same path as source: throws collision error.
6. Export size reported correctly.

### `singleFileExport.test.ts`

7. Export single file: JSON valid, envelope format='showx-single-file', version='1.0'.
8. doc_yjs_base64 is valid base64 → decodes to Y.encodeStateAsUpdate output.
9. show.meta.title matches Y.Doc meta.
10. Import single file: Y.Doc reconstructed equal to source.
11. Import + write to .showx: directory created with all files.
12. Import with embedded history → history.jsonl written.
13. Import with embedded snapshots → snapshots dir populated.
14. Import with embedded media → media files restored byte-identical.
15. Roundtrip: original → export single-file → import → save .showx → diff with original (Yjs encoded state equal modulo GC).
16. Wrong format string → throw on import.
17. Wrong version → throw on import.
18. Media >10MB warning logged.

## Out of scope

- PWA / shell file picker UI (small follow-up task).
- Compressed export (gzipped JSON — post-MVP).
- Cloud Sync export (Cloud Sync module owns this).
- Sharing URL / cloud-hosted backup link (post-MVP).
- Cue catalog standalone export (B003-010 writes cache file; separate concern).
- Selective export (subset of cuelists) — post-MVP.

## Notes for Critic

- Verify single-file format includes doc_yjs_base64 (canonical CRDT state); JSON projections are redundant but preserved for human-diff outside ShowX.
- Verify roundtrip preserves Y.Doc client IDs and update history (Yjs encoded state should survive).
- Confirm includeMedia default false (size concern).
- Verify collision check uses path canonicalization (resolve symlinks + .. resolution).
- Verify export uses atomicWriteFile (no partial files on failure).
- Verify importSingleFile validates format + version BEFORE attempting Y.applyUpdate.
- Confirm history embed preserves line order on import.
- Watch for base64 size inflation (×1.33) — media warning threshold may need tuning.
- Verify .showx export delegates to B003-003 saveShowxPackage and does NOT duplicate save logic.
