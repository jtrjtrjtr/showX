---
id: "B001-005"
critic_started_at: "2026-06-05T11:40:00Z"
critic_completed_at: "2026-06-05T11:45:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **AssetServer starts on port 5300 default; `port()` reports bound; `baseUrl()` returns `http://<host>:<port>`** → `src/main/src/shared/AssetServer.ts:45-55` (`start()` uses `opts.port ?? 5300`), `:66-70` (`port()` reads `server.address()`), `:72-75` (`baseUrl()` with `0.0.0.0 → localhost` rewrite). Verified `tests/unit/shared/AssetServer.test.ts:99-101`.
- [x] **Prod mode: serves PWA from `pwa/dist`; dev mode: proxies to Vite** → `AssetServer.ts:133-156` (`installPwaServing()`). Prod uses `express.static(pwaDir)` + SPA fallback at `:137-145`; dev uses `createProxyMiddleware` at `:148-154`. Verified `AssetServer.test.ts:135-161` (dev-mode proxy with stub Vite).
- [x] **`GET /system/health` returns `{status:'ok', version, uptimeMs}`** → `AssetServer.ts:125-127`. Verified `AssetServer.test.ts:29-34`.
- [x] **`GET /system/version` returns `{version, build, electron}`** → `AssetServer.ts:128-130`. Returns version + build + electron + node. Verified `AssetServer.test.ts:36-42`.
- [x] **CORS allows localhost + RFC1918; rejects external** → `defaultCorsOrigin` at `AssetServer.ts:175-188` covers `localhost`, `127.0.0.1`, `::1`, `10.x`, `192.168.x`, `172.16-31.x`. Sync predicate wrapped at `:117-120` for `cors()` callback form. Verified `AssetServer.test.ts:123-133` (live request) + `:164-200` (9 unit cases including 172.32 rejection).
- [x] **`registerStaticRoute(slug, dir)` mounts under `/modules/<slug>/`; Subscription unmounts** → `AssetServer.ts:82-86` + `dispatchModuleRequest` at `:160-172` (lookup at request time, no router rebuild). Verified `AssetServer.test.ts:44-54` (mount serves file) + `:77-89` (unmount → 404).
- [x] **`registerApiRoute(method, path, handler)` adds JSON route under `/api/`; Subscription removes** → `AssetServer.ts:88-111`. Wrapped handler checks `apiMounts.some(m => m.id === id)` → 404 if removed (line 97-100). Verified `AssetServer.test.ts:56-69` (GET + POST body) + `:91-97` (unsubscribe → 404) + `:71-75` (handler throw → 500).
- [x] **`start()` → `stop()` → `start()` re-binds cleanly** → `AssetServer.ts:45-64`. `stop()` nulls `this.server` (line 60) and calls `closeAllConnections()` to drain keep-alive (line 62). Verified `AssetServer.test.ts:103-114` (full cycle).
- [x] **`MdnsService` wraps `bonjour-service`; `advertise(name, port, txt)` publishes `_showx._tcp.local`; `browse()` returns Subscription** → `MdnsService.ts:57-77`. Service type constant `'showx'` at line 40 produces `_showx._tcp.local`. Verified `MdnsService.test.ts:36-43, 53-60`.
- [x] **TXT record per spec §8** → `MdnsService.advertise()` is generic; caller passes `txt` map. JSDoc at `MdnsService.ts:51-56` documents required keys (`role`, `tier`, `version`, `hostname`, `fingerprint`) per task spec. Verified `MdnsService.test.ts:92-98` (TXT passthrough). Note: actual `protocol_dictionary.md §8` lists a different superset including `protocol`, `show_id`, `lock_state`; this is correctly the caller's responsibility (B001-011 shell boot).
- [x] **`stop()` un-publishes every advertisement + tears down browse** → `MdnsService.ts:79-85` iterates browses, ads, then destroys bonjour. Verified `MdnsService.test.ts:70-79`.
- [x] **≥14 vitest cases; AssetServer uses supertest; MdnsService uses mocked bonjour** → 22 AssetServer tests (13 in main describe + 9 in `defaultCorsOrigin` describe) + 7 MdnsService tests = **29 total**. supertest import at `AssetServer.test.ts:7`. Mock `BonjourLike` factory at `MdnsService.test.ts:6-33` — no real network mDNS in tests.
- [x] **`pnpm --filter showx-main typecheck` passes** → Ran locally: passes (showx-shared builds, tsc --noEmit clean).
- [x] **`pnpm vitest run tests/unit/shared/AssetServer tests/unit/shared/MdnsService` passes 100%** → Ran locally: **78/78 shared tests pass** (22 AssetServer + 7 MdnsService + 49 prior). No flakes.

## Code review notes

- `closeAllConnections()` call at `AssetServer.ts:62` is the right fix for keep-alive drain on `stop()` — prevents test hangs and matches Node ≥18.2 semantics. Optional-chained so older Node won't crash.
- `dispatchModuleRequest` (`:160-172`) cleanly handles per-request mount lookup without mutating Express router internals. URL slicing at `:162-167` correctly preserves and restores `req.url` for the static handler. Subtle but correct.
- API route short-circuit pattern (`:96-100`) is defensible — `apiMounts.some()` is O(n) but n is small (per-shell routes). Live handler stays in Express stack permanently; re-registering the same `(method, path)` after unsubscribe would hit the old short-circuited handler first and return 404. Not exercised by the spec/tests, not in AC; flag for B001-009 PairingStore route registration if it ever re-registers under the same path.
- `_resetVersionCache()` export at `version.ts:32-34` is appropriate for test isolation; not used yet but cheap insurance.
- `MdnsService` defines its own `BonjourLike`/`BonjourServiceLike`/`BonjourBrowserLike` interfaces (lines 6-23) to bypass the CJS/ESM `export = Bonjour` type-import friction. Reasonable; documented in done report decision #5.
- `createRequire(import.meta.url)` for default factory at `MdnsService.ts:103` keeps the actual `bonjour-service` import out of the test path. Clean.
- CORS test at `AssetServer.test.ts:123-133` reads `access-control-allow-origin` header — correct way to verify cors() decision since the preflight isn't sent on simple GET.

## Known follow-ups (not blocking)

1. **`implements AssetServerIface` omitted**: The shared `AssetServer` interface in `src/shared/src/types/services.ts:96-101` uses `ApiHandler = (req: AssetReq) => Promise<AssetResp>` while the concrete class accepts Express `(req: Request, res: Response)` handlers. Forge correctly flagged this in done report decision #4 — the shared interface and the implementation are not structurally compatible for `registerApiRoute`. `ModuleContext.assets: AssetServer` at `context.ts:25` will need either an adapter or a shared-interface update in **B001-010 (module loader)** or **B001-011 (shell)**. Out of scope for B001-005.
2. **TXT key divergence with spec §8**: JSDoc on `MdnsService.advertise()` cites task-spec-required keys (`role/tier/version/hostname/fingerprint`); the canonical `protocol_dictionary.md §8` table actually mandates a different superset (`version/protocol/role/tier/show_id/show_title/stations_online/pairing_open/lock_state/bundle_id`). Forge's behaviour is correct (service is generic, caller supplies map) — but B001-011 shell boot needs to use the §8 keys, not the JSDoc list. Flag for B001-011 spec.
3. **Root `package.json` scope expansion**: Forge added `supertest` + `@types/supertest` to root devDeps (not in `target_files`) because vitest resolves from workspace root. Minor and justified; documented in done report.

## Verdict rationale

All 13 acceptance criteria verified with file:line citations. 78/78 unit tests pass, typecheck passes. Implementation is clean, the two judgment calls Forge made within scope (route dispatch by lookup vs. router rebuild; short-circuit removal vs. router stack mutation) are sound and documented. The deferred `AssetServerIface` reconciliation is a real cross-task concern but explicitly out of B001-005's `target_files` and AC — it belongs to B001-010/B001-011.

**Verdict: accepted.**
