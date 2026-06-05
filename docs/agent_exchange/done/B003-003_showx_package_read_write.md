---
id: "B003-003"
title: ".showx package read/write — atomic save + recovery fallback"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B003-002"]
target_files:
  - "src/modules/cuelist-core/src/persistence/showxPackage.ts"
  - "src/modules/cuelist-core/src/persistence/atomicWrite.ts"
  - "src/modules/cuelist-core/src/persistence/projections.ts"
  - "src/modules/cuelist-core/src/persistence/historyJsonl.ts"
  - "src/modules/cuelist-core/src/persistence/recovery.ts"
  - "src/modules/cuelist-core/src/persistence/infoPlist.ts"
  - "tests/unit/modules/cuelist-core/persistence/showxPackage.test.ts"
  - "tests/unit/modules/cuelist-core/persistence/atomicWrite.test.ts"
  - "tests/unit/modules/cuelist-core/persistence/recovery.test.ts"
  - "tests/fixtures/showx/sample-show.showx/**"
acceptance_criteria:
  - "`openShowxPackage(path: string): Promise<{ doc: Y.Doc; appliedMigrations: string[]; recoveredFromJson: boolean }>` reads `.showx` directory per data_model.md §3.1 layout"
  - "Load procedure: validate `show.json` `format_version`, prefer `doc.yjs` binary, fall back to JSON projections if missing/corrupt (logged as `recovery_from_json`); rebuild Y.Doc from JSON when fallback"
  - "`saveShowxPackage(doc: Y.Doc, path: string): Promise<void>` writes the four-step atomic save procedure per data_model.md §3.8: encode update → write .tmp → fsync → atomic rename → append history.jsonl"
  - "JSON projections derived from Y.Doc: `show.json`, `cuelists/cl_<id>.json` (one per cuelist), `routing.json`, `operators.json` — match JSON schemas in data_model.md §3.2-§3.5 exactly"
  - "`doc.yjs` binary is `Y.encodeStateAsUpdate(doc)` raw Uint8Array; ShowX prefers this on load"
  - "Atomic write helper `atomicWriteFile(path, data)`: write to `path + '.tmp'`, `fsync`, `rename` — partial failure leaves prior file untouched"
  - "`appendHistoryEvent(path, event: HistoryEvent)`: append JSON line + newline; create `history.jsonl` if missing; rotate at config `history_rotation_size_bytes` (gzip prior file to `history.<n>.jsonl.gz`)"
  - "`Info.plist` written via `infoPlist.ts` helper — minimal macOS bundle hint declaring UTI `cz.xlab.showx.package`"
  - "Open detects + runs pending migrations from `src/modules/cuelist-core/migrations/<id>.ts` registry — migrations applied to JSON projections, then Y.Doc rebuilt from JSON to avoid CRDT drift (per data_model.md §11.3)"
  - "Round-trip test: create Y.Doc → save → open → encoded states are equivalent (after Yjs garbage collect) and JSON projections diff-clean"
  - "Recovery test: delete `doc.yjs` → open succeeds from JSON; reload `doc.yjs` is byte-equivalent after first save"
  - "Failure semantics: if any `.tmp` write fails before all renames complete, prior package state preserved; no orphan `.tmp` files allowed in success path"
---

## Context

The `.showx` package is the on-disk source of truth for show persistence. While Y.Doc + IndexedDB hold the live model across stations, when ShowX shuts down (or crashes) the disk package is the recovery surface. This task implements the file-system bridge between Y.Doc and the directory bundle format defined in data_model.md §3.

The double-representation (binary `doc.yjs` + JSON projections) is deliberate per §3.1: `doc.yjs` is the canonical CRDT state; JSON projections satisfy human-diff + emergency-edit needs. They MUST stay synchronized — save derives JSON from Y.Doc; load prefers Y.Doc; recovery rebuilds Y.Doc from JSON when binary is corrupt.

## Implementation notes

### File tree to implement

```
src/modules/cuelist-core/src/persistence/
├── showxPackage.ts        # public API: openShowxPackage, saveShowxPackage
├── atomicWrite.ts         # fsync + rename helper
├── projections.ts         # Y.Doc ↔ JSON projection conversion
├── historyJsonl.ts        # append + rotate
├── recovery.ts            # JSON → Y.Doc rebuild fallback
└── infoPlist.ts           # macOS bundle Info.plist writer
```

### Public API

```ts
// src/modules/cuelist-core/src/persistence/showxPackage.ts
import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from './atomicWrite';
import { docToProjections, projectionsToDoc, type ShowJson, type CuelistJson } from './projections';
import { appendHistoryEvent, rotateHistoryIfNeeded } from './historyJsonl';
import { writeInfoPlist } from './infoPlist';
import { runMigrations } from '../migrations';

export interface OpenResult {
  doc: Y.Doc;
  appliedMigrations: string[];
  recoveredFromJson: boolean;
}

export async function openShowxPackage(pkgPath: string): Promise<OpenResult> {
  await fs.stat(pkgPath); // throws if missing
  const showJson = JSON.parse(await fs.readFile(path.join(pkgPath, 'show.json'), 'utf8')) as ShowJson;
  if (!isSupportedFormatVersion(showJson.format_version)) {
    throw new UnsupportedFormatError(showJson.format_version);
  }

  // Load each cuelist
  const cuelists: CuelistJson[] = [];
  for (const entry of showJson.cuelist_index) {
    const cl = JSON.parse(await fs.readFile(path.join(pkgPath, entry.file), 'utf8'));
    cuelists.push(cl);
  }

  // Apply migrations on JSON projections
  const { migrated, applied } = await runMigrations({ show: showJson, cuelists });
  const recoveredFromJson = await !(await fileExists(path.join(pkgPath, 'doc.yjs')));

  const doc = new Y.Doc();
  if (!recoveredFromJson) {
    try {
      const bin = await fs.readFile(path.join(pkgPath, 'doc.yjs'));
      Y.applyUpdate(doc, new Uint8Array(bin));
    } catch (err) {
      // CRC fail / corrupt → fall back to JSON
      projectionsToDoc(doc, migrated.show, migrated.cuelists);
      return { doc, appliedMigrations: applied, recoveredFromJson: true };
    }
  } else {
    projectionsToDoc(doc, migrated.show, migrated.cuelists);
  }

  // If migrations changed JSON, save back so disk + Yjs converge
  if (applied.length > 0) {
    await saveShowxPackage(doc, pkgPath, { reason: 'migration_applied' });
  }

  return { doc, appliedMigrations: applied, recoveredFromJson };
}

export interface SaveOpts {
  reason: 'autosave' | 'explicit' | 'mode_transition' | 'pre_close' | 'migration_applied';
  by_operator_id?: string;
}

export async function saveShowxPackage(
  doc: Y.Doc, pkgPath: string, opts: SaveOpts,
): Promise<void> {
  await fs.mkdir(pkgPath, { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'cuelists'), { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'snapshots'), { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'media'), { recursive: true });

  // 1. Encode Y.Doc to binary
  const docUpdate = Y.encodeStateAsUpdate(doc);

  // 2. Derive JSON projections
  const { show, cuelists, routing, operators } = docToProjections(doc);

  // 3. Atomic writes
  await atomicWriteFile(path.join(pkgPath, 'doc.yjs'), Buffer.from(docUpdate));
  await atomicWriteFile(path.join(pkgPath, 'show.json'), JSON.stringify(show, null, 2) + '\n');
  for (const [id, cl] of Object.entries(cuelists)) {
    await atomicWriteFile(path.join(pkgPath, 'cuelists', `cl_${id}.json`), JSON.stringify(cl, null, 2) + '\n');
  }
  await atomicWriteFile(path.join(pkgPath, 'routing.json'), JSON.stringify(routing, null, 2) + '\n');
  await atomicWriteFile(path.join(pkgPath, 'operators.json'), JSON.stringify(operators, null, 2) + '\n');

  // 4. Info.plist (idempotent)
  await writeInfoPlist(pkgPath, show.meta.title);

  // 5. Append save event to history.jsonl (one of several event kinds)
  // Note: most history events are appended at the action site; this just records the save itself
  await appendHistoryEvent(pkgPath, {
    ts: new Date().toISOString(),
    kind: 'save',
    reason: opts.reason,
    by: opts.by_operator_id ?? 'system',
  });
  await rotateHistoryIfNeeded(pkgPath, /* config */ { maxBytes: 50_000_000, maxAgeDays: 10 });
}
```

### Atomic write helper

```ts
// src/modules/cuelist-core/src/persistence/atomicWrite.ts
import { promises as fs } from 'node:fs';

export async function atomicWriteFile(target: string, data: Buffer | string): Promise<void> {
  const tmp = `${target}.tmp`;
  const fd = await fs.open(tmp, 'w');
  try {
    await fd.writeFile(data);
    await fd.sync();
  } finally {
    await fd.close();
  }
  await fs.rename(tmp, target);
}
```

Failure semantics: if `fd.writeFile` throws, the `.tmp` file remains (next save overwrites). The `rename` is atomic on POSIX — either old or new file present, never partial. On failure, the prior `target` is preserved.

Cleanup pass at save start: scan `pkgPath` for orphan `*.tmp` files older than 5 minutes; delete them with WARN log.

### Projections

```ts
// src/modules/cuelist-core/src/persistence/projections.ts
import * as Y from 'yjs';

export interface ShowJson {
  $schema: string;
  format_version: '1.0';
  schema_version: 1;
  show_id: string;
  meta: ShowMetaJson;
  cuelist_index: Array<{ id: string; name: string; file: string }>;
  snapshot_index: Array<{ id: string; cuelist_id: string; taken_at: string; file: string }>;
  applied_migrations: string[];
}

export interface CuelistJson {
  id: string; name: string; default_trigger: string; go_authority: string;
  sm_offline_policy: unknown;
  playhead: { cue_id: string | null; armed_cue_id: string | null };
  show_snapshot_id: string | null;
  cues: CueJson[];
}

export function docToProjections(doc: Y.Doc): {
  show: ShowJson;
  cuelists: Record<string, CuelistJson>;
  routing: unknown;
  operators: unknown;
} {
  const meta = doc.getMap('meta').toJSON() as ShowMetaJson;
  // ... iterate cuelists Y.Array, convert each Y.Map<unknown> to plain JSON object
  // ... including nested cues + payloads
}

export function projectionsToDoc(
  doc: Y.Doc, show: ShowJson, cuelists: CuelistJson[],
): void {
  doc.transact(() => {
    const meta = doc.getMap('meta');
    for (const [k, v] of Object.entries(show.meta)) meta.set(k, v);
    const cuelistArr = doc.getArray<Y.Map<unknown>>('cuelists');
    for (const cl of cuelists) cuelistArr.push([rebuildCuelistMap(cl)]);
    // ... routing, operators, schema, applied_migrations
  });
}
```

### History.jsonl

```ts
// src/modules/cuelist-core/src/persistence/historyJsonl.ts
import { promises as fs } from 'node:fs';
import { createGzip } from 'node:zlib';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';

export type HistoryEvent = Record<string, unknown> & { ts: string; kind: string };

export async function appendHistoryEvent(pkgPath: string, event: HistoryEvent): Promise<void> {
  const line = JSON.stringify(event) + '\n';
  // Atomic for writes < PIPE_BUF on POSIX (4096 bytes)
  await fs.appendFile(path.join(pkgPath, 'history.jsonl'), line, 'utf8');
}

export async function rotateHistoryIfNeeded(
  pkgPath: string, opts: { maxBytes: number; maxAgeDays: number },
): Promise<void> {
  const histPath = path.join(pkgPath, 'history.jsonl');
  let stat;
  try { stat = await fs.stat(histPath); } catch { return; }
  const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
  if (stat.size < opts.maxBytes && ageDays < opts.maxAgeDays) return;

  // Find next index
  const files = await fs.readdir(pkgPath);
  const maxN = files
    .map(f => f.match(/^history\.(\d+)\.jsonl\.gz$/)?.[1])
    .filter(Boolean).map(Number);
  const nextN = (maxN.length ? Math.max(...maxN) : 0) + 1;

  const gzPath = path.join(pkgPath, `history.${nextN}.jsonl.gz`);
  await pipeline(createReadStream(histPath), createGzip(), createWriteStream(gzPath));
  await fs.unlink(histPath);
}
```

### Info.plist

Minimal XML; `LSItemContentTypes` declaring `cz.xlab.showx.package` UTI per Q12. Forge uses string concatenation, not a plist library, to avoid an extra dependency.

### Recovery flow

`recovery.ts` is invoked when `doc.yjs` is missing or `Y.applyUpdate` throws. Strategy: rebuild Y.Doc from JSON projections via `projectionsToDoc`, log `recovery_from_json` to history.jsonl and module logger. Replay history check (count `cue_fired` events from history.jsonl) for UI display "Loaded show with N historical fires" per data_model.md §3.9.

### Format version validation

```ts
function isSupportedFormatVersion(v: string): boolean {
  const [major] = v.split('.').map(Number);
  return major === 1; // MVP supports 1.x
}

export class UnsupportedFormatError extends Error {
  constructor(public readonly version: string) {
    super(`unsupported .showx format_version ${version} — upgrade ShowX or rebuild from cloud backup`);
  }
}
```

## Test plan

### Round-trip

1. `initShowDoc` → add 3 cues with payloads → `saveShowxPackage` → `openShowxPackage` → assert `meta.show_id` matches; assert cuelist + cue + payload counts match; assert `doc.yjs` binary present.

### Atomic write

2. Mock `fs.open` to throw mid-`writeFile` → assert `target` file untouched; `.tmp` file may remain but original preserved.
3. Concurrent saves (two `saveShowxPackage` calls in parallel) → assert final state is one of the two, not corrupted (Forge documents that save is not concurrent-safe; caller must serialize).

### Recovery

4. Save package → delete `doc.yjs` → `openShowxPackage` succeeds; assert `recoveredFromJson === true`; resave produces identical `doc.yjs`.
5. Save → truncate `doc.yjs` to 0 bytes → open falls back to JSON; resave produces non-empty `doc.yjs`.
6. Save → corrupt `doc.yjs` (overwrite last 100 bytes with garbage) → open falls back to JSON.

### JSON projections

7. `docToProjections` produces JSON matching data_model.md §3.2-§3.5 schemas (test with sample fixture).
8. `projectionsToDoc` is inverse: roundtrip JSON → Doc → JSON yields equal JSON.
9. Snapshot/snapshot_index entries empty by default.

### History.jsonl

10. Append 3 events → file contains 3 lines of valid JSON.
11. Rotation: write history >maxBytes → next append rotates: `history.1.jsonl.gz` exists, `history.jsonl` empty.
12. `history.<n>` numbering increments past existing archives.

### Format version

13. `show.json` with `format_version: '2.0'` throws `UnsupportedFormatError` on open.
14. `format_version: '1.5'` accepts (minor version skew allowed per §11.2 — read-only mode is a UI concern).

### Sample fixture

Create `tests/fixtures/showx/sample-show.showx/` with realistic minimal show (3 cues, mixed payloads, history with 5 events). Used by multiple downstream tests (B003-017 CSV import comparisons, B003-020 multiop).

## Out of scope

- Migration script execution mechanics (B003-002 establishes migrations folder convention; this task wires up `runMigrations` glue but the script catalog is empty in MVP).
- SHOW-mode snapshots (B003-004 writes snapshot files; this task just creates the `snapshots/` directory).
- Media import / asset bundling (post-MVP).
- Cloud Sync upload (Cloud Sync module, ShowX-4+).
- Compression of `doc.yjs` (not needed at MVP size).
- Conflict resolution between concurrent saves (caller must serialize).

## Notes for Critic

- Verify `atomicWriteFile` actually calls `fsync` before rename — without `fsync`, kernel write buffer may not have flushed to disk, defeating the atomicity guarantee.
- Verify the four-step save order: encode → write .tmp → fsync → rename (per data_model.md §3.8).
- Confirm `doc.yjs` is loaded preferentially over JSON; JSON only on missing/corrupt.
- Confirm migration applies BEFORE Y.Doc reconstruction (so doc reflects migrated state).
- Confirm rotation does NOT delete archives — appendix archives kept indefinitely per Q5.
- Confirm directory creation is idempotent (`mkdir -p` semantics).
- Verify cleanup pass removes orphan `.tmp` files older than 5 minutes — Forge should NOT remove `.tmp` files younger than 5 min (might be concurrent save in progress).
- Confirm Info.plist is written but its absence is non-fatal on load (some users may strip it).
