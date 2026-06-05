# 03 — Persistence

How a `.showx` package is stored on disk and how the runtime reads / writes it without losing data.

## Package layout

`.showx` is a directory bundle:

```
my-show.showx/
├── show.json                    JSON projection (root meta + cuelist refs)
├── cuelists/
│   └── cl_<uuid>.json          one file per cuelist
├── operators.json               paired stations (projection)
├── routing.json                 routing table (projection)
├── history.jsonl                append-only event log
├── doc.yjs                      CRDT binary snapshot
├── snapshots/                   pre-mode-flip + manual snapshots
│   └── 2026-06-06T12-34-56.json
└── media/                       user assets
    └── .cache/
        └── cue-catalog.json    published by [10]
```

The `.showx` extension + Info.plist registration (UTI `cz.xlab.showx.package`) gives macOS the right "package" semantics — Finder shows it as a single bundle.

## Why both JSON projection AND doc.yjs

The CRDT (`doc.yjs`) is the source of truth at runtime; the JSON projection (`show.json` + `cuelists/*.json`) is a human-readable mirror for inspection, diff, version control, and migration.

On `open`: load `doc.yjs` → run any pending migrations → derive projection.
On `save`: write `doc.yjs` + projection atomically.

If `doc.yjs` is missing or corrupt at open: rebuild from JSON projection (degraded mode — some CRDT history lost, but state preserved). Migration applied to JSON, then Y.Doc rebuilt from migrated JSON (this is the path B003-003 round 2 fixed).

## Atomic writes

`src/persistence/atomicWrite.ts`:

```ts
export async function atomicWriteFile(path: string, data: Buffer): Promise<void> {
  const tmp = `${path}.tmp-${Date.now()}`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, path)    // POSIX atomic on same filesystem
}
```

Every persistence write (snapshot, doc.yjs, projection, cue-catalog cache) goes through this. Crash at any point leaves either the old version or the new — never a half-written file.

Tradeoff: requires temp file space (≈ file size). On near-full disks, atomic write can fail before rename. We accept that — the alternative (truncate + write) corrupts on partial write.

## history.jsonl

Append-only log of mutations and events:

```jsonl
{"ts":"2026-06-06T12:00:00Z","actor":"sm-ipad","type":"cue.added","cue_id":"cue_01..."}
{"ts":"2026-06-06T12:00:30Z","actor":"sm-ipad","type":"mode.transition","from":"REHEARSAL","to":"SHOW"}
{"ts":"2026-06-06T12:01:00Z","actor":"sm-ipad","type":"go.dispatched","cue_id":"cue_01..."}
```

Used for: audit trail, last-100-line recovery report when sending to support, future history snapshots feature (SHOW mode 0.2).

Rotation: when file size > `history_rotation_size_bytes` (default 50 MB) OR age > `history_rotation_max_age_days` (10), file is renamed to `history-<ts>.jsonl` and a new empty `history.jsonl` started.

## Migration system

`migrations/index.ts` is currently an empty registry stub:

```ts
export const MIGRATIONS: ShowMigration[] = []
```

Future migrations add entries:

```ts
{
  id: '001-add-cue-script-line-ref',
  applies_after: 1,
  apply: (showJson) => { /* mutate JSON */ }
}
```

`openShowxPackage` flow when `applied.length > 0`:

1. Apply migration to JSON projection
2. Rebuild Y.Doc from migrated JSON (Y.applyUpdate from fresh encode)
3. Write back doc.yjs + updated projection
4. Persist applied migration IDs in `show.json`

**Critical fix (B003-003 round 2):** the `applied.length > 0` branch must run UNCONDITIONALLY before any `doc.yjs` load. Otherwise an existing `doc.yjs` overrides the migrated JSON on save, silently un-applying migrations. Test: `tests/unit/modules/cuelist-core/persistence/showxPackageMigration.test.ts`.

## Recovery

`src/persistence/recovery.ts` handles three failure modes:

1. **Missing doc.yjs** — rebuild Y.Doc from JSON projection. Recover everything except in-flight transactions.
2. **Corrupt doc.yjs** (decode fails) — same as missing. Logged as `degraded_mode`.
3. **Corrupt JSON** (parse fails) — last resort: load last good snapshot from `snapshots/`. If no snapshot, fail open with empty doc + warning.

Auto-recovery is invisible to the user but reported to HealthBus as `degraded` until next clean save.

## Seam: ShowFilePicker

The Electron panel's New / Open buttons (`src/ui/ShowFilePicker.tsx`) call IPC handlers in the main process:

- `cuelist-core/show.new` — creates fresh `.showx` skeleton via factory + atomic writes
- `cuelist-core/show.open` — validates `.showx` shape, opens via `openShowxPackage`
- `cuelist-core/show.close` — saves pending mutations + closes

These IPC channels are registered in `src/CuelistCore.ts`'s `start()` (TODO B003-011 wiring — the panel exists, but IPC plumbing landed as part of `cuelist-core/<verb>` convention).

## Test patterns

- Atomic write: simulate crash mid-write (kill before rename), assert old file intact
- Migration: register dummy migration, open old doc, assert state migrated + idempotent on reopen
- Recovery: corrupt doc.yjs, open, assert rebuild from JSON works
- Round-trip: encode Y.Doc → JSON → rebuild Y.Doc → byte-equal `Y.encodeStateAsUpdate`
