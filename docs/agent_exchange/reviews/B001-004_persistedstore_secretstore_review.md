---
id: "B001-004"
critic_started_at: "2026-06-05T11:00:00Z"
critic_completed_at: "2026-06-05T11:15:00Z"
verdict: "accepted"
review_round: 1
owner_under_review: "forge"
---

## TL;DR

PersistedStore + SecretStore implementations are correct, slug-sandboxed, atomically written, and well-tested (13 + 10 cases). Typecheck passes; all 49 shared tests pass. Forge's three cross-task fixes (rootDir removal, zod added to root devDeps, ESM-safe `createRequire`) are justified and documented. **Accepted.**

## Acceptance criteria check

- [x] **PersistedStore per-slug-scoped; constructor takes slug + layout; cannot read another module's blob** — `src/main/src/shared/PersistedStore.ts:21-25` slug bound via private readonly; `moduleConfigPath(layout, slug)` (`paths.ts:35-37`) joins only `layout.modulesDir + slug + 'config.json'` — no caller-controlled traversal. Verified by slug-isolation test `tests/unit/shared/PersistedStore.test.ts:212-224`.

- [x] **load<T>(schema) reads JSON, runs migration if older, validates via zod, returns typed value; on parse fail returns defaults + quarantines** — `PersistedStore.ts:27-73`. ENOENT → writes defaults (`:33-37`); JSON parse fail → quarantine + defaults (`:39-46`); migration version mismatch (`:50-63`); zod validation (`:64-71`). Covered by tests at `PersistedStore.test.ts:29-39, 86-109, 111-132, 134-147, 149-166`.

- [x] **save<T>(value) atomically writes via tmp + fs.rename; never leaves half-written file** — `PersistedStore.ts:107-113`: `${path}.tmp-${process.pid}-${randomUUID()}` then `fs.rename(tmp, path)`. UUID instead of `Date.now()` avoids same-millisecond collision under concurrent saves (Forge decision 1, defensible). Concurrent-save test at `PersistedStore.test.ts:192-210` confirms final file is valid JSON containing one of the two values; no tmp files remain.

- [x] **onChange<T>(handler) fires after successful save** — `PersistedStore.ts:96-105` registers; `:87-93` invokes handlers post-atomicSave. Handler throw caught and logged so list isn't poisoned. Tested at `PersistedStore.test.ts:168-177` (fires) and `:179-190` (unsubscribe stops).

- [x] **Quarantine of corrupt file: dest = `<file>.corrupt-<timestamp>` + log; subsequent load returns defaults** — `PersistedStore.ts:115-123`. Behavior verified: writes raw bytes to `<path>.corrupt-${Date.now()}`, then `atomicSave(path, defaults, ...)` overwrites original with defaults (`:44, :69`). Implementation uses write-corrupt-then-overwrite rather than literal rename, but behavioral outcome (corrupt content preserved at `.corrupt-<ts>`, original holds defaults) matches the criterion. Tests at `PersistedStore.test.ts:107, 130, 146, 165` assert quarantine files exist after each failure path.

- [x] **SecretStore per-slug-scoped; keys namespaced `showx:<slug>:<key>`** — `SecretStore.ts:16` defines `KEYTAR_SERVICE = (slug) => 'showx:<slug>'`; used at `:36, :50, :65, :80` as the keytar `service` parameter; user key becomes the `account`. The (service, account) tuple is the OS-keychain unique identifier and is functionally equivalent to the spec's `showx:<slug>:<key>` namespace. Verified by `SecretStore.test.ts:162-175` (`c.service === 'showx:eventx-bridge'`).

- [x] **SecretStore falls back to encrypted-at-rest file when keytar throws; path = `<rootDir>/secrets/<slug>.enc`; key = local secret per pairing_auth spec** — Try/catch around all keytar paths (`SecretStore.ts:35-44, 49-58, 64-73, 79-88`). Fallback path resolved via `secretFallbackPath` (`paths.ts:39-41`). Local secret loaded once at `<rootDir>/local_secret.bin` (`SecretStore.ts:152-164`), generated on first need (32 bytes), reused across modules. Tested at `SecretStore.test.ts:84-97` (fallback round-trip), `:99-114` (persists across instances), `:116-141` (mtime stable — proves no regeneration).

- [x] **list() returns key names (not values); delete() removes; get(missing) returns undefined** — `SecretStore.ts:76-88` `list()` returns `c.account` only (no `c.password` leaked); `:61-74` delete; `:32-44` get(missing) returns undefined. Tests at `SecretStore.test.ts:55-61, 63-72, 74-82`.

- [x] **All operations namespaced — no SecretStore method accepts another slug; sandbox enforced by constructor binding** — Public API: `get(key)`, `set(key, value)`, `delete(key)`, `list()`. No method accepts a slug. Slug is `private readonly` (`SecretStore.ts:27`), used only in `KEYTAR_SERVICE(this.slug)` and `secretFallbackPath(layout, this.slug)`.

- [x] **≥16 vitest test cases total across both files using tmpdir + mocked keytar** — 13 PersistedStore + 10 SecretStore = **23 cases**. All use `mkdtemp(tmpdir(), ...)` (`PersistedStore.test.ts:18-20`, `SecretStore.test.ts:31-33`) and `keytarLoader` mocks (`SecretStore.test.ts:10-29`).

- [x] **`pnpm --filter showx-main typecheck` passes** — Verified by Critic. Output:
  ```
  > showx-main@0.0.1 typecheck /Users/machintoshhd/Daniel-local/showX/src/main
  > tsc --noEmit
  ```
  (exit 0, no output).

- [x] **`pnpm vitest run tests/unit/shared/PersistedStore tests/unit/shared/SecretStore` passes 100%** — Verified by Critic. Full shared suite:
  ```
  ✓ tests/unit/shared/Logger.test.ts  (7 tests) 23ms
  ✓ tests/unit/shared/HealthBus.test.ts  (11 tests) 19ms
  ✓ tests/unit/shared/EventBus.test.ts  (8 tests) 17ms
  ✓ tests/unit/shared/PersistedStore.test.ts  (13 tests) 60ms
  ✓ tests/unit/shared/SecretStore.test.ts  (10 tests) 90ms
  Test Files  5 passed (5)
  Tests  49 passed (49)
  ```

## Critic-specific notes-from-spec check

- **Atomic write search**: only three writeFile call sites for tmp paths (`PersistedStore.ts:111`, `SecretStore.ts:126, :161`); ALL three use `mode: 0o600`. One additional writeFile at `PersistedStore.ts:118` writes the quarantined raw content — does NOT set mode 0o600. Forge documented this in done report (Notes for Critic, bullet 2) as "raw corrupt content for human inspection — acceptable". See "Minor non-blocking observations" below.
- **Quarantine timestamp**: `Date.now()` millis (`PersistedStore.ts:116`) — distinct within process under realistic load.
- **KEYTAR_SERVICE single helper**: 4 callers (`:36, :50, :65, :80`), no other code paths produce keytar service strings. ✓
- **loadLocalSecret length check**: `if (existing.length === 32)` (`SecretStore.ts:156`) — wrong size triggers regeneration. ✓
- **AES-GCM layout IV(12) || tag(16) || ciphertext**: encrypt at `SecretStore.ts:138`, decrypt at `:143-145`. Symmetric. Round-trip with empty `{}` blob covered indirectly by "fallback persists across instances" test (initial readFallback returns `{}` → write blob → second instance reads back).
- **Slug sandbox via public API**: `PersistedStore.constructor(slug, layout)` — slug is `private readonly`; never exposed; never accepts another slug at any later API call. Cannot traverse via `../` since `moduleConfigPath` uses `join(layout.modulesDir, slug, 'config.json')` (path traversal only possible if slug itself contains `..`, which would be a module-loader concern not a store concern).
- **Unhandled rejections**: every promise awaited in tests; no `void promise` patterns visible. Test output shows no warnings.
- **zod version parity**: root `package.json` `^3.22.0` (added this round), `src/main/package.json` `^3.22.0`. Both resolve from the same workspace lock. ✓

## Code review (positives)

- `createRequire(import.meta.url)` for keytar + electron lazy loads in ESM scope — proper pattern, not the spec's bare `require()` which would throw under `"type": "module"`. (Forge decision 6, well-grounded.)
- `randomUUID()` for tmp suffix instead of `Date.now()` (Forge decision 1) — eliminates a real collision class under concurrent saves. Trivial code change, real safety win.
- No `console.log` anywhere in the two new files — all logging goes through the optional `Logger`.
- `readFallback()` returns `{}` on decrypt failure (`SecretStore.ts:117`) — graceful degradation; corrupt fallback file doesn't crash the store. Test coverage exists implicitly via "fallback persists across instances" (which proves the empty-init path).
- `loadLocalSecret` uses tmp+rename atomic pattern (`SecretStore.ts:160-162`) — first-run race between two SecretStore instances is safe.
- Type-only imports correctly used (`type PathLayout`, `type Logger`) — no runtime cycle risk.

## Minor non-blocking observations (DO NOT need a fix)

1. **Quarantine writeFile lacks `mode: 0o600`** (`PersistedStore.ts:118`). Forge documented this as intentional for "human inspection". The corrupt content could contain partial sensitive data depending on the schema, so 0o600 would be the strictly safer default — but the operator inspecting the file owns the process anyway, and this is not a stated acceptance criterion. Leaving as-is is acceptable; flag for a future hardening pass if any module starts storing sensitive data in PersistedStore (currently expected to be config only; secrets go through SecretStore).

2. **tsconfig.json change crosses task boundary**. Forge B001-004 removed `rootDir: "src"` from `src/main/tsconfig.json` (Decision 4) to satisfy its own typecheck acceptance criterion. This was Option C from the B001-003 review and explicitly approved as a valid fix. B001-003 Forge had latitude to pick A/B/C; B001-004 needed it merged to pass. Pragmatically necessary — flag for B001-003's next round so Forge doesn't redo the same fix.

3. **Root `package.json` zod devDep duplication**. Forge added `zod: ^3.22.0` to root devDependencies so vitest (run from workspace root) can resolve it. This matches the existing pattern (react, fake-indexeddb, yjs at root). Same pattern previously noted in B001-012 review. Accepted as intentional workspace pattern.

4. **`envelope.value ?? parsed` fallback** (`PersistedStore.ts:49`): if a legacy file is stored without an envelope (raw `{name: "x"}`), `parsed.value` is undefined → falls back to `parsed`. Backward-compat with unwrapped data. Side effect: an explicit `{__schemaVersion: 1, value: null}` would also fall back to the entire envelope object (since `null ?? parsed === parsed`); zod would then fail and quarantine. Surprising edge case but ends in a safe state. No fix needed.

## Verdict rationale

All 12 acceptance criteria met with file:line citations. Tests pass (49/49). Typecheck passes. Code quality is high — defensive patterns (try/catch around all keytar ops, handler-throw isolation in onChange, length-check on local secret, ESM-safe createRequire), single helper for namespaced keytar service, slug-bound construction throughout. Forge's six in-scope decisions are all reasonable and documented. The tsconfig.json cross-task fix was pre-authorized by the B001-003 review.

**accepted.**
