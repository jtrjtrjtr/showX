---
id: "B001-012"
reviewer: "critic"
critic_started_at: "2026-06-05T13:35:00Z"
critic_completed_at: "2026-06-05T13:45:00Z"
verdict: "accepted"
review_round: 3
---

## Acceptance criteria check (round 3)

- [x] PWA entry `pwa/src/main.tsx` mounts `<App />` on `#root` — unchanged from accepted round-2 portion
- [x] App.tsx mode router 'discover' → 'pair' → 'show' — App.test.tsx 4/4 pass
- [x] Mode driven by URL query `?mode=shell` — verified in App.test.tsx
- [x] **discovery.ts probes `GET /system/health`** — pwa/src/lib/discovery.ts:20 (`discoverFromOrigin`) and pwa/src/lib/discovery.ts:44 (`probeLan`) BOTH probe `/system/health`. Stale TODO comment removed (file head now jumps straight to `fetchWithTimeout` helper at line 8). Matches accepted B001-005 AssetServer route. ✓ FIXED.
- [x] syncClient.ts URL → `ws://<host>:<port>/yjs/<docName>?token=<token>` — pwa/src/lib/syncClient.ts:31 builds `ws://host:port/yjs`; y-websocket appends `/<docName>` and `?token=…`. Unchanged.
- [x] syncClient exponential backoff 1s→2s→4s capped at 30s — pwa/src/lib/syncClient.ts:43-52. `delay = backoffMs` captured BEFORE doubling; `backoffMs = Math.min(backoffMs*2, 30_000)` applied after. First disconnect uses 1000ms, then 2000ms, etc. Test `backoff doubles and caps at 30s` exercises path.
- [x] sideChannel.ts connects to `ws://<host>:<port>/events/<showId>?token=...` — unchanged; sideChannel.test.tsx 4/4 pass.
- [x] auth.ts AES-GCM token encryption with per-install device key — unchanged; auth.test.ts 5/5 pass.
- [x] PairingView claim payload full per pairing_auth.md §5.2 — unchanged.
- [x] PairingView long-polls `/pairing/<request_id>/status` until SM allow/refuse — unchanged.
- [x] PlaceholderShowView shows connection panel + Y.Doc sync status + last GO event — unchanged.
- [x] manifest.webmanifest declares name, short_name, icons, theme_color, display: standalone — unchanged.
- [x] sw.js registers + caches PWA shell + assets for offline first-load; does NOT cache cuelist data — unchanged.
- [x] **Vitest tests pass** for syncClient + auth + sideChannel + App — `pnpm vitest run tests/unit/pwa` → **18 passed (18 total)**:
   - `tests/unit/pwa/auth.test.ts` — 5/5 pass ✓
   - `tests/unit/pwa/syncClient.test.tsx` — 9/9 pass ✓ (includes 4 sideChannel + 5 createSyncClient)
   - `tests/unit/pwa/App.test.tsx` — 4/4 pass ✓
   - Re-verified by Critic: `pnpm vitest run tests/unit/pwa` returns "Test Files 3 passed (3) | Tests 18 passed (18)"

## Other findings

1. **typecheck PASSES** — `pnpm -r typecheck` across `src/shared`, `src/main`, `pwa` workspaces returns Done with no errors.

2. **Provider injection pattern (`_providerFactory`) is a clean test seam.** pwa/src/lib/syncClient.ts:27 exposes an optional `_providerFactory` opt parameter; pwa/src/lib/syncClient.ts:58-60 uses it as `opts._providerFactory ?? ((url, room, doc, pOpts) => new WebsocketProvider(...))`. Production callers omit the parameter and get the real `WebsocketProvider` unchanged — no behavioral diff in production path. Test callers inject a factory that calls `MockWebsocketProvider(...)` as a call counter and returns `mockProviderInstance`. The underscore prefix + JSDoc clearly mark it as test-only. This is the correct architectural fix for the `vi.mock('y-websocket')` ESM unreliability observed in round 2.

3. **ProviderHandle abstraction is sound.** pwa/src/lib/syncClient.ts:6-9 defines the minimal contract used by `connect()`/`destroy()` — `on(event, cb)` + `destroy()`. Widening `provider` from `WebsocketProvider | null` to `ProviderHandle | null` keeps production behavior intact (real `WebsocketProvider` satisfies the structural type) and the previously needed `(provider as any).on('connection-error', …)` escape hatch is removed (now plain `provider.on('connection-error', …)` at pwa/src/lib/syncClient.ts:78).

4. **Status event typing change to `(e: unknown)` + internal cast is defensible.** Forge widened `(e: { status: string })` to `(e: unknown)` then narrowed via `const ev = e as { status: string }` (lines 64-65, 78). This satisfies the structural typing of `ProviderHandle.on(event: string, cb: (e: unknown) => void)`. The behavior is unchanged; only the type annotation moved.

5. **Done-report verification ritual was applied.** The round-3 done report claims all 18 tests pass, claims `/system/health` is in both discovery.ts probe sites, and Critic verified both claims by reading the files AND re-running the test suite. The round-2 "claim vs reality" gap is closed.

6. **Backoff math re-verified.** pwa/src/lib/syncClient.ts:43-52:
   - First disconnect: `delay = 1000`, schedule reconnect in 1000ms, then `backoffMs = 2000`.
   - Second: `delay = 2000`, schedule in 2000ms, then `backoffMs = 4000`.
   - …
   - Eventually: `delay = 30_000`, then `Math.min(60_000, 30_000) = 30_000` — capped.
   Matches `1s, 2s, 4s, ..., capped at 30s`.

7. **Test isolation re-verified.** `beforeEach` (test file lines 101-108) does `vi.clearAllMocks()` then re-installs `mockProviderInstance.on.mockImplementation(...)` that pushes handlers to local `statusHandlers`. `statusHandlers` is reset on line 103. Each `it` block creates a fresh client via `makeClient(docName)` and the handler registration happens synchronously inside `connect()`, so by the time the test reads `statusHandlers['status']`, the handlers are present. Verified by green tests.

8. **No new lint suppression introduced.** The previous `// eslint-disable-next-line @typescript-eslint/no-explicit-any` at the old `(provider as any).on('connection-error', …)` site is gone. Net change: -1 disable comment.

9. **Out-of-scope failures noted** — `tests/unit/shared/SyncBroker.test.ts` + sideChannel-equivalent shared tests still fail due to B001-006 (in_progress, `ws` Vite resolution). Forge's done report correctly flags these as outside B001-012 scope. Critic confirms — those files do not belong to B001-012's `target_files` list.

## Verdict rationale

`accepted`.

Round 3 closes both round-2 blockers cleanly:

1. **discovery.ts** — both probe sites now use `/system/health`, stale TODO removed. Matches the ratified spec body and the accepted B001-005 AssetServer route. The done report's claim is now backed by code.

2. **syncClient tests** — all 4 previously failing tests now pass via the `_providerFactory` injection pattern. The fix is architecturally clean (test seam, not a hack), production behavior is unchanged (verified: same `new WebsocketProvider(...)` call path when `_providerFactory` is omitted), and the underscore prefix + JSDoc make the test-only nature unambiguous.

The full 18/18 PWA test pass + clean typecheck across all three workspaces meets the spec's final acceptance criterion. No regression in previously-accepted areas (AES-GCM token storage, pairing payload, sw.js bypass list, mode router) — Critic spot-checked unchanged files and confirmed no functional drift.

B001-012 unblocks B001-011 (Electron main shell, which loads the PWA bundle in `?mode=shell`) and indirectly downstream Cuelist Core (ShowX-3) which builds on the SyncClient + auth + discovery plumbing established here.

Recovery from a round-2 blocker in a single Forge cycle. Closed properly.

## Notes for Architect

- `_providerFactory` is a public-but-underscored opt parameter. If Architect later wants to harden the API surface, options are (a) extract to a `__test__` re-export, (b) use a module-level setter that tests call to swap the provider class, or (c) accept the underscored seam as-is (the dominant pattern in React/Vue ecosystems). Recommended: accept as-is for ShowX-1, revisit only if the API surface grows in ShowX-3.
- 4 of the 18 tests in `tests/unit/pwa/syncClient.test.tsx` actually exercise `createSideChannel` (lines 28-81). The file name is `syncClient.test.tsx` but covers both modules. Minor naming nit; not a blocker. If Architect wants a clean per-module test file split, that's a separate hygiene task — not B001-012's concern.
- B001-006 (SyncBroker) will need to honor `_providerFactory`-less contract from production code: server expects `ws://host:port/yjs/<room>?token=…` URL shape, which y-websocket builds. Architect should ensure B001-006 spec confirms the URL parse on server side.
