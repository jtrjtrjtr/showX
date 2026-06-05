---
id: "B003-003"
title: ".showx package read/write — atomic save + recovery fallback"
reviewer: "critic"
reviewed_at: "2026-06-06T14:25:00Z"
review_round: 2
verdict: "accepted"
---

## Summary

Round 1's one blocking issue (migration-driven Y.Doc rebuild bypassed when `doc.yjs` was present) is fully resolved. The fix is structurally minimal and semantically correct, the new dedicated test file exercises the previously-uncovered migration code path, and the full suite (42 files, 451 tests) stays green. Accepting.

## Round-1 issues — resolution check

### Issue 1 (P1, blocking) — migration path bypassed when `doc.yjs` present → **FIXED**

**Code fix** (`src/modules/cuelist-core/src/persistence/showxPackage.ts:72-100`):

```ts
if (applied.length > 0) {
  // Migrations ran — JSON is now authoritative; doc.yjs holds pre-migration state and must be discarded.
  doc = await rebuildDocFromJson(pkgPath, migrated.show, migrated.cuelists);
} else if (docYjsExists) {
  try {
    const bin = await fs.readFile(docYjsPath);
    doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(bin));
  } catch {
    doc = await rebuildDocFromJson(pkgPath, migrated.show, migrated.cuelists);
    recoveredFromJson = true;
  }
} else {
  doc = await rebuildDocFromJson(pkgPath, migrated.show, migrated.cuelists);
  recoveredFromJson = true;
}

if (applied.length > 0) {
  await saveShowxPackage(doc, pkgPath, { reason: 'migration_applied' });
}
```

The `applied.length > 0` branch is now first, unconditionally rebuilding the Y.Doc from the migrated JSON regardless of `doc.yjs` presence. The follow-up save then persists the rebuilt CRDT state. This matches `data_model.md:1308` ("doc.yjs is rebuilt from JSON post-migration to avoid CRDT drift").

Note: `recoveredFromJson` stays `false` when the rebuild is migration-driven. That keeps the existing signal contract intact ("loaded from JSON because binary was missing or corrupt") and is consistent with the round-1 advisory ("optional distinct flag — not required"). Acceptable.

**Test coverage** (`tests/unit/modules/cuelist-core/persistence/showxPackageMigration.test.ts`, 3 tests):

| # | Test | Verifies | Evidence |
|---|---|---|---|
| 1 | "migration mutates Y.Doc — change is visible on the live doc, not just on disk" | Migrated state is on the returned Y.Doc, not just JSON on disk. Asserts `getMeta(doc).get('title') === 'Migration Test Show [migrated]'` and `schema.applied_migrations` contains the dummy ID. | `showxPackageMigration.test.ts:89-127` |
| 2 | "migration is idempotent — second open does not re-apply" | After first open persists `applied_migrations` to disk, second open with same dummy in the registry returns `applied = []`. Catches the un-migration loop the round-1 bug would have caused. | `showxPackageMigration.test.ts:129-161` |
| 3 | "no migrations apply → doc.yjs is preferred, recoveredFromJson is false" | Baseline regression guard for the non-migration path. | `showxPackageMigration.test.ts:163-172` |

The injection seam (`vi.mock` of `migrations/index.js` plus a per-test mutable `activeMigrations` array, `:11-40`) is clean, well-scoped, and resets in `afterEach`. The mock contract (`{ migrated, applied }`) matches the real `runMigrations` signature exactly.

## Acceptance criteria — full re-audit

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `openShowxPackage` returns `{ doc, appliedMigrations, recoveredFromJson }` | ✅ | `showxPackage.ts:34-38, 48-108` |
| 2 | Load: validate version, prefer doc.yjs, fall back to JSON, log `recovery_from_json` | ✅ | `showxPackage.ts:54-56, 79-100`; `recovery.ts:23-31` |
| 3 | Four-step atomic save: encode → .tmp → fsync → rename → history | ✅ | `showxPackage.ts:141-176`; `atomicWrite.ts:9-19` |
| 4 | JSON projections match `data_model.md` §3.2-§3.5 | ✅ | `projections.ts:77-130`; tests `showxPackage.test.ts:163-187` |
| 5 | `doc.yjs` = `Y.encodeStateAsUpdate(doc)`; preferred on load | ✅ | `showxPackage.ts:141, 147, 79-83` |
| 6 | `atomicWriteFile`: .tmp → fsync → rename; failure preserves original | ✅ | `atomicWrite.ts:9-19`; test `atomicWrite.test.ts:57-85` |
| 7 | `appendHistoryEvent` appends JSON line, creates file if missing | ✅ | `historyJsonl.ts:13-16` |
| 8 | `rotateHistoryIfNeeded` gzips at threshold; archives kept | ✅ | `historyJsonl.ts:28-58`; test `showxPackage.test.ts:398-414` |
| 9 | `Info.plist` writer; UTI `cz.xlab.showx.package` | ✅ | `infoPlist.ts:10-41`; test `showxPackage.test.ts:202-209` |
| 10 | Migrations applied to JSON, then Y.Doc rebuilt from JSON post-migration | ✅ | `showxPackage.ts:66, 75-78, 103-105`; tests `showxPackageMigration.test.ts:89-161` |
| 11 | Round-trip: save → open → counts match; `doc.yjs` present | ✅ | tests `showxPackage.test.ts:91-161` |
| 12 | Recovery: delete `doc.yjs` → open succeeds; resave yields non-empty `doc.yjs` | ✅ | tests `showxPackage.test.ts:238-262` |
| 13 | Failure semantics: prior file preserved on `.tmp` write failure; no orphan in success path | ✅ | tests `atomicWrite.test.ts:41-47, 57-85` |

All 13 criteria met.

## Code review notes — round 2 delta

- The fix is exactly as scoped — no collateral edits to the other persistence files. `recovery.ts`, `projections.ts`, `atomicWrite.ts`, `historyJsonl.ts`, `infoPlist.ts` are unchanged from round 1.
- `rebuildDocFromJson` logs a `recovery_from_json` history event even on the migration-rebuild path. The done report flagged this (and §11.3 endorses "rebuild from JSON" terminology for both cases) — acceptable, low-priority future tweak if a distinct `migration_rebuild` event kind becomes desirable.
- Minor round-1 observations (`projections.ts:140-145` no-op `cues.sort`, UUID-vs-human-readable cuelist filenames, per-file atomic vs all-fsync-then-all-rename, `appendFile` POSIX atomicity for ≥ PIPE_BUF, `&apos;` in plist) remain — all explicitly non-blocking per round 1, left for follow-up.

## Tests run

```
pnpm vitest run tests/unit/modules/cuelist-core/persistence/
  ✓ atomicWrite.test.ts             9 tests
  ✓ recovery.test.ts                7 tests
  ✓ showxPackageMigration.test.ts   3 tests  (NEW)
  ✓ showxPackage.test.ts           27 tests
  4 files, 46 tests passed (1.20s)

pnpm vitest run  (full suite)
  42 files, 451 tests passed (2.61s)
```

Typecheck still requires user approval — not run. Vitest's esbuild transform succeeded on all source + test files.

## Decision

**Verdict: `accepted`** — round 2.

Task complete. Move spec to `done/`. Update `state.json`: `status = accepted`, `reviewed_at = 2026-06-06T14:25:00Z`, `review_round = 2`.
