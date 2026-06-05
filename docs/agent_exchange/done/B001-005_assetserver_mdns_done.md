---
id: "B001-005"
status: "done"
forge_attempt: 1
forge_started_at: "2026-06-05T12:00:00Z"
forge_completed_at: "2026-06-05T12:45:00Z"
files_changed:
  - "src/main/src/shared/version.ts"
  - "src/main/src/shared/AssetServer.ts"
  - "src/main/src/shared/MdnsService.ts"
  - "src/main/package.json"
  - "package.json"
  - "tests/unit/shared/AssetServer.test.ts"
  - "tests/unit/shared/MdnsService.test.ts"
tests_run:
  command: "pnpm vitest run tests/unit/shared"
  passed: 29
  failed: 0
  note: "22 AssetServer + 7 MdnsService; existing 49 shared tests continue passing (78 total)"
---

## What I did

- **`version.ts`** — `shellVersion()` reads `src/main/package.json` at boot (with try/catch fallback to `0.0.0`), caches result. Exported `_resetVersionCache()` for test isolation.
- **`AssetServer.ts`** — Express HTTP server implementing all acceptance criteria:
  - `/system/health` and `/system/version` routes
  - CORS via cors() with sync-predicate wrapper (see decisions)
  - Dynamic module dispatch at `/modules/<slug>/*` (no router rebuild on unmount)
  - API router with dead-route short-circuit (removed route IDs → 404)
  - Prod mode: express.static + SPA fallback; dev mode: http-proxy-middleware
  - `httpServer(): Server` getter for SyncBroker (B001-006) WebSocket upgrade
  - `stop()` calls `closeAllConnections()` before `close()` to drain keep-alive connections
- **`MdnsService.ts`** — bonjour-service wrapper with injectable `BonjourLike` factory for tests. Uses `createRequire` in default factory to avoid CJS/ESM type import issues. All types defined locally (no direct bonjour-service type imports).
- **`src/main/package.json`** — added runtime deps: express, cors, bonjour-service, http-proxy-middleware; dev deps: @types/express, @types/cors, supertest, @types/supertest.
- **`package.json` (root)** — added supertest + @types/supertest as root devDeps (vitest runs from root and resolves imports from root node_modules).

## Decisions made within task scope

1. **`cors()` origin wrapper**: The spec shows `corsOrigin?: (origin) => boolean` but `cors()` requires a callback-style function `(origin, callback) => void`. Wrapped the sync predicate: `(origin, cb) => cb(null, predicate(origin))`. The exported `defaultCorsOrigin` remains a plain sync predicate usable in tests without the cors package.

2. **Dynamic module dispatch instead of Router rebuild**: Instead of rebuilding an Express Router on every unmount (complex, fragile), `dispatchModuleRequest()` reads `this.staticMounts` at request time. When a mount is removed (unsubscribe), the next request naturally returns 404 via fallthrough. Simpler and correct.

3. **API route removal via id check**: Registered routes stay in the apiRouter permanently; their wrapped handler checks `this.apiMounts.some(m => m.id === id)` and returns 404 if removed. This avoids Express router stack mutation.

4. **No `implements AssetServerIface`**: The shared `AssetServerIface` has `registerApiRoute(method: 'GET' | 'POST', handler: ApiHandler)` where `ApiHandler = (req: AssetReq) => Promise<AssetResp>`. The actual implementation uses Express `Request/Response` and supports PUT/DELETE. Using `implements` would cause a TypeScript type error. The class is structurally compatible for `port()`, `baseUrl()`, `registerStaticRoute()`. **Follow-up needed**: update `AssetServerIface` in `showx-shared` to align with actual handler type, or create a separate adapter type (B001-011 shell wiring task is the right time to sort this out).

5. **`bonjour-service` import strategy**: The package uses CJS `export = Bonjour` style. With NodeNext ESM, importing `Service`/`BrowserConfig` types directly caused TypeScript errors. Resolved by defining `BonjourLike`/`BonjourServiceLike`/`BonjourBrowserLike` interfaces locally and using `createRequire` in the default factory.

## Test results

```
✓ tests/unit/shared/AssetServer.test.ts  (22 tests) 160ms
✓ tests/unit/shared/MdnsService.test.ts  (7 tests) 13ms
All 78 shared unit tests pass.
pnpm --filter showx-main typecheck: PASS
```

## Notes for Critic

- **`httpServer()` getter**: Verify it returns the live `http.Server` (not the Express app), throws before `start()`, and works after `start()`.
- **Port 0 binding**: `port()` returns the OS-assigned port; confirmed by `start() → stop() → start()` cycle test.
- **CORS**: `defaultCorsOrigin` tested for localhost, 127.0.0.1, 10.x, 192.168.x, 172.16.x–172.31.x (allowed) and 172.32.x, external domain (rejected).
- **Static fallthrough**: `express.static` is called with `{ fallthrough: true, index: false }`. When no file matches in the mount dir, `next()` is called so SPA fallback can handle `/`.
- **`stop()` idempotency**: calling twice resolves without error (second call returns early because `this.server === null`).
- **mDNS factory injection**: `MdnsService` test never exercises real bonjour-service network. Default factory via `createRequire` is production-only.
- **Root `package.json` change**: Added `supertest` and `@types/supertest` as root devDeps. This was necessary because vitest resolves modules from root workspace, not from `src/main/node_modules`. Minor scope expansion (one file not in target_files), but required to make tests pass.
