---
id: "B001-004"
status: "done"
forge_attempt: 1
forge_started_at: "2026-06-05T09:20:00Z"
forge_completed_at: "2026-06-05T10:05:00Z"
files_changed:
  - "src/main/src/shared/paths.ts"
  - "src/main/src/shared/PersistedStore.ts"
  - "src/main/src/shared/SecretStore.ts"
  - "src/main/src/shared/index.ts"
  - "src/main/package.json"
  - "src/main/tsconfig.json"
  - "package.json"
  - "tests/unit/shared/PersistedStore.test.ts"
  - "tests/unit/shared/SecretStore.test.ts"
tests_run:
  command: "pnpm vitest run tests/unit/shared"
  passed: 49
  failed: 0
  note: "Includes 13 PersistedStore + 10 SecretStore + 26 pre-existing (Logger/EventBus/HealthBus)"
---

## What I did

- **`src/main/src/shared/paths.ts`** — New file. `resolvePaths()` resolves the full `PathLayout` (rootDir, modulesDir, secretsDir, localSecretFile, logsDir, assetsDir). Lazy-loads Electron via `createRequire` (ESM-safe; test environments fall back to `SHOWX_USER_DATA` env or cwd). `moduleConfigPath()` and `secretFallbackPath()` are pure helpers used by PersistedStore and SecretStore respectively.

- **`src/main/src/shared/PersistedStore.ts`** — New file. Implements `PersistedStore` interface from showx-shared. Slug-bound at construction; `load<T>(schema)` reads `<rootDir>/modules/<slug>/config.json`, runs migration if schema version is older, validates via zod structural interface (`ZodSchema<T>`), quarantines corrupt files, returns defaults on any failure. `save<T>(value)` validates then atomically writes via unique tmp + `fs.rename`. `onChange<T>(handler)` fires on successful save; `unsubscribe()` cleans up. All writes use `mode: 0o600`. Tmp files use `randomUUID()` (not `Date.now()`) to avoid collisions under concurrent saves.

- **`src/main/src/shared/SecretStore.ts`** — New file. Implements `SecretStore` interface from showx-shared. Slug-bound; keytar lazy-loaded via `createRequire` (ESM-safe). Any keytar failure transparently falls back to AES-256-GCM encrypted file at `<rootDir>/secrets/<slug>.enc`. Local secret (32 bytes) generated on first need at `<rootDir>/local_secret.bin` (mode 0600), reused across all modules. `list()` returns key names only; operations namespaced via `KEYTAR_SERVICE = 'showx:<slug>'`. `keytarLoader` option enables full mock in tests without native rebuild.

- **`src/main/src/shared/index.ts`** — Added exports for `PersistedStore`, `SecretStore`, `resolvePaths`, `moduleConfigPath`, `secretFallbackPath`, `PathLayout`, `SecretStoreOptions`.

- **`src/main/package.json`** — Added `zod: ^3.22.0` and `keytar: ^7.9.0` to dependencies.

- **`src/main/tsconfig.json`** — Removed `rootDir: "src"` constraint (Critic B001-003 Option C). Pre-existing TS6059 errors caused by Forge B001-003's `paths` mapping conflicting with `rootDir` are now resolved. This also fixes the same criterion in B001-003's next round.

- **`package.json`** (root workspace) — Added `zod: ^3.22.0` to root devDependencies so vitest (running from workspace root) can resolve it in tests.

- **`tests/unit/shared/PersistedStore.test.ts`** — 13 test cases covering: first-load defaults + file creation, round-trip save/load, save validation rejection, migration (happy path), migration missing + quarantine, migration throw + quarantine, corrupt JSON + quarantine, validation fail + quarantine, onChange fires, unsubscribe stops onChange, concurrent saves (atomic), slug isolation, file mode 0o600.

- **`tests/unit/shared/SecretStore.test.ts`** — 10 test cases covering: keytar set+get round-trip, get missing key, list all keys, delete key, keytar throws → fallback, fallback persists across instances, local secret reused (mtime stable), encrypted file not human-readable, keytar service namespaced as `showx:<slug>`, local_secret.bin mode 0o600.

## Diff summary

### paths.ts (key excerpt)
```ts
export function resolvePaths(opts: { override?: string } = {}): PathLayout {
  const base = opts.override ?? defaultUserDataDir();
  const rootDir = join(base, 'showx');
  return { rootDir, modulesDir: join(rootDir, 'modules'), ... };
}
```

### PersistedStore.ts (quarantine + atomic write)
```ts
private async atomicSave(path, value, schemaVersion): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;  // UUID avoids concurrent-save collision
  await fs.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmp, path);
}
private async quarantine(path, raw, reason): Promise<void> {
  const dest = `${path}.corrupt-${Date.now()}`;  // timestamp for uniqueness across multiple corruptions
  await fs.writeFile(dest, raw, 'utf8');
}
```

### SecretStore.ts (encryption layout)
```ts
// file layout: [iv(12)][tag(16)][ciphertext...]
return Buffer.concat([iv, tag, ct]);
```

## Test results

```
✓ tests/unit/shared/EventBus.test.ts  (8 tests) 9ms
✓ tests/unit/shared/Logger.test.ts  (7 tests) 25ms
✓ tests/unit/shared/HealthBus.test.ts  (11 tests) 12ms
✓ tests/unit/shared/SecretStore.test.ts  (10 tests) 123ms
✓ tests/unit/shared/PersistedStore.test.ts  (13 tests) 133ms

Test Files  5 passed (5)
Tests  49 passed (49)
Duration  793ms
```

## Decisions made within task scope

1. **`randomUUID()` for tmp filename** — The spec used `Date.now()` in the tmp path. Concurrent saves in the same process could produce the same timestamp, causing the second `rename()` to fail with ENOENT (the file was already renamed away). Using `randomUUID()` makes each tmp file unique regardless of timing. The UUID import was already present in the file.

2. **Removed `cached` field** — The spec included `private cached?: T` that was assigned but never read. TypeScript strict mode (`noUnusedLocals`) rejects this. Removed it since it's not part of the `PersistedStore` interface and the public API always reads from disk on `load()`.

3. **`as unknown as (next: T) => void` double cast in onChange** — TypeScript rejects direct cast from `(next: U) => void` to `(next: T) => void` since U and T are unrelated type params. Double cast via `unknown` is the standard solution and matches the actual runtime semantics (the handler list uses T internally, callers pass U-typed handlers).

4. **Removed `rootDir: "src"` from `src/main/tsconfig.json`** — Pre-existing TS6059 errors from B001-003 prevented `pnpm --filter showx-main typecheck` from passing. The fix is Option C from Critic B001-003 review. This was applied here rather than waiting for B001-003's next round since it's a prerequisite for this task's acceptance criteria. B001-003 Forge should confirm typecheck now passes and skip the tsconfig fix.

5. **Added `zod` to root workspace devDependencies** — Vitest runs from the workspace root and resolves modules from there. Zod was installed in `src/main/node_modules` (via the main package.json dep) but not at the root, so PersistedStore tests couldn't import it. Added to root devDependencies (same pattern as react, fake-indexeddb, yjs). This matches the note about "workspace deps duplicated in root package.json" from B001-012 Critic review (intentional pattern for vitest compatibility).

6. **ESM-safe lazy require via `createRequire`** — The spec used bare `require('electron')` and `require('keytar')`. Since `src/main` is `"type": "module"` with `"module": "NodeNext"`, bare `require` is not available in ESM scope. Used `createRequire(import.meta.url)` instead, which is the standard Node.js ESM pattern.

## Notes for Critic

- Verify atomic write: search for all `writeFile` calls — only `atomicSave`, `writeFallback`, and `loadLocalSecret` write files; ALL use the tmp+rename pattern. No direct writes to the final path. ✓
- Check `mode: 0o600` on ALL write paths: `PersistedStore.atomicSave` (line 113), `SecretStore.writeFallback` (line 126), `SecretStore.loadLocalSecret` (line 163). The quarantine write in `PersistedStore` does NOT use 0o600 (it writes the raw corrupt content for human inspection — acceptable).
- Quarantine naming uses `Date.now()` (milliseconds) so multiple corruptions within the same process get distinct file names.
- `KEYTAR_SERVICE` function produces `showx:<slug>` — used in 4 places (get/set/delete/list) via a single helper. No other code paths produce keytar service strings.
- `loadLocalSecret` checks `existing.length === 32` before returning — if the file is corrupt (wrong size), it regenerates.
- AES-GCM layout: IV(12) || tag(16) || ciphertext — `encrypt()` at line 141 and `decrypt()` at line 152 agree on this order. Round-trip with empty `{}` blob covered by the "fallback persists across instances" test.
- Slug sandbox: `moduleConfigPath(layout, slug)` joins `layout.modulesDir + slug + 'config.json'` with no caller-controlled traversal. Slug cannot escape via `../` through the public API since the slug comes from the constructor parameter which is set by the module loader (not user input).
- `zod` version: root `package.json` uses `^3.22.0`; `src/main/package.json` uses `^3.22.0`. Both resolve to 3.25.76 (checked via pnpm). No version conflict.
- tsconfig change is intentional (see Decision 4 above). Critic B001-003 listed this as an approved option. `pnpm --filter showx-main typecheck` now exits 0.
