---
id: "B003-003"
title: ".showx package read/write — atomic save + recovery fallback"
status: "done"
owner: "forge"
review_round: 2
started_at: "2026-06-06T17:30:00Z"
ended_at: "2026-06-06T17:40:00Z"
---

## Summary (round 2)

Round 1 had one blocking issue: when `applied.length > 0`, `openShowxPackage` loaded the pre-migration `doc.yjs` binary and then overwrote disk with un-migrated state, silently discarding the migration result. This has been fixed and validated. All 451 tests pass.

## Critic issues addressed

### Issue 1 (P1, blocking) — migration path bypassed when doc.yjs is present

**Fix location:** `src/modules/cuelist-core/src/persistence/showxPackage.ts`

Restructured the doc-load branching to check `applied.length > 0` **first**, before checking `docYjsExists`. When migrations ran, `doc.yjs` is unconditionally skipped and Y.Doc is rebuilt from `migrated.show` + `migrated.cuelists` (per `data_model.md §11.3`). Only when no migrations applied does the path fall through to prefer `doc.yjs` or recover from JSON as before.

**New logic:**
```ts
if (applied.length > 0) {
  // Migrations ran — JSON is now authoritative; doc.yjs holds pre-migration state and must be discarded.
  doc = await rebuildDocFromJson(pkgPath, migrated.show, migrated.cuelists);
} else if (docYjsExists) {
  try { ... load doc.yjs ... }
  catch { ... recover from JSON ... }
} else {
  ... recover from JSON ...
}
```

**Required test added:** New file `tests/unit/modules/cuelist-core/persistence/showxPackageMigration.test.ts` (3 tests) using `vi.mock` to inject a dummy migration via a controlled `activeMigrations` array:

1. **Migration mutates Y.Doc** — saves doc with `applied_migrations = []`, reopens with dummy migration, asserts:
   - `appliedMigrations` contains the dummy ID
   - `getMeta(doc).get('title')` shows the migration's title mutation on the live Y.Doc (not just on disk)
   - `doc.getMap('schema').get('applied_migrations')` contains the dummy ID

2. **Migration is idempotent** — after the first open (migration applies + saves), a second open with the same dummy migration in `activeMigrations` returns `appliedMigrations = []` because the ID is already in `show.applied_migrations` on disk.

3. **No migration → doc.yjs preferred, recoveredFromJson false** — baseline guard.

## Files changed

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/persistence/showxPackage.ts` | Fix: check `applied.length > 0` before `docYjsExists` in `openShowxPackage` |
| `tests/unit/modules/cuelist-core/persistence/showxPackageMigration.test.ts` | New — 3 migration-path tests using vi.mock injection seam |

## Tests run

```
pnpm vitest run tests/unit/modules/cuelist-core/persistence/
  ✓ atomicWrite.test.ts         9 tests
  ✓ recovery.test.ts            7 tests
  ✓ showxPackageMigration.test.ts  3 tests  (NEW)
  ✓ showxPackage.test.ts        27 tests
  4 files, 46 tests — all passed

pnpm vitest run (full suite)
  42 files, 451 tests — all passed (3.80s)
```

## Notes for Critic

- The fix is minimal: 4 lines of structural change in `openShowxPackage`, no logic elsewhere altered.
- `rebuildDocFromJson` logs a `recovery_from_json` history event — this event will now also fire during a migration rebuild. That side-effect is correct per spec (§11.3 says "rebuild from JSON" in both cases).
- The dummy migration's `up()` function must add its ID to `show.applied_migrations` itself; `runMigrations` does not inject it automatically. The test dummy does this, consistent with how real migrations should be authored.
- Minor Critic observations from round 1 (dead `cues.sort((a,b) => 0)`, cuelist file naming, per-file atomic vs all-rename, `appendFile` POSIX atomicity, `&apos;` in plist) are not blocking — left for follow-up per round 1 verdict.
