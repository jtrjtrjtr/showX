---
id: "B001-012"
slug: "pwa_workspace_bootstrap"
title: "PWA workspace bootstrap (Vite + React + Yjs + IndexedDB)"
status: "done"
owner: "forge"
review_round: 3
started_at: "2026-06-05T13:30:00Z"
ended_at: "2026-06-05T13:40:00Z"
---

# Done Report — Round 3

## Summary

Round 3 addressed both blocking issues from the round-2 review:
1. **discovery.ts endpoint fix** — replace `/_showx/ping` with `/system/health` (2 occurrences)
2. **syncClient tests** — all 4 previously failing tests now pass (18/18 total)

## Round-2 Critic items addressed

### Item 1 — discovery.ts `/_showx/ping` regression ✓ FIXED

- Removed stale TODO comment at lines 20-21 ("pending Architect ratification")
- `discoverFromOrigin()`: probe URL changed to `${window.location.origin}/system/health`
- `probeLan()`: probe URL changed to `http://${host}:8088/system/health`
- Both match the ratified spec body and AssetServer `/system/health` (accepted B001-005).

### Item 2 — 4 failing syncClient tests ✓ FIXED

Root cause (confirmed via test output): `vi.mock('y-websocket', factory)` was not intercepting imports of `y-websocket` v2.1.0. The package is pure ESM (`"type": "module"`, `exports` field) — the `vi.hoisted` reference in the factory does not reliably intercept ESM modules in Vitest 1.6.1 jsdom environment. `MockWebsocketProvider.mock.calls.length` remained 0 even after `mockImplementation` reset, confirming the real module was being loaded.

Fix: **provider injection** — added optional `_providerFactory` parameter to `createSyncClient()`. Production omits it (uses real `WebsocketProvider`). Tests pass a factory that calls `MockWebsocketProvider(...)` as a counter and returns `mockProviderInstance`. Eliminates `vi.mock('y-websocket')` dependency entirely; 100% reliable.

Production code changes:
- `pwa/src/lib/syncClient.ts`: added `ProviderHandle` + `ProviderOpts` types; `_providerFactory` opt parameter; `provider` widened to `ProviderHandle | null`; status event handler uses `(e: unknown)` with internal cast to satisfy TypeScript strict mode. No behavioral change in production path.

Test changes:
- Removed `vi.mock('y-websocket', ...)` block
- Added `makeClient(docName)` helper with `_providerFactory` that routes through `MockWebsocketProvider` counter + returns `mockProviderInstance`
- `vi.mock('y-indexeddb', ...)` kept — CJS-compatible, works reliably, avoids IDB overhead
- All 5 `createSyncClient` tests rewritten to use `makeClient`; test logic semantically identical to round-2

### Item 3 — Done-report verification ritual ✓ APPLIED

Re-read every changed source file before marking criteria. Report reflects actual file state.

## Acceptance criteria check (round 3)

- [x] PWA entry `pwa/src/main.tsx` mounts `<App />` on `#root` — unchanged
- [x] App.tsx mode router 'discover' → 'pair' → 'show' — App.test.tsx 4/4 pass
- [x] Mode driven by URL query `?mode=shell` — unchanged
- [x] **discovery.ts probes `GET /system/health`** — `discoverFromOrigin()` line 21: `/system/health`; `probeLan()` line 44: `/system/health` ✓ (read file to verify)
- [x] syncClient.ts URL → `ws://<host>:<port>/yjs/<docName>?token=<token>` — unchanged
- [x] syncClient exponential backoff 1s→2s→4s capped at 30s — unchanged
- [x] sideChannel.ts connects to `ws://<host>:<port>/events/<showId>?token=...` — unchanged
- [x] auth.ts AES-GCM token encryption — unchanged, auth.test.ts 5/5 pass
- [x] PairingView claim payload full per pairing_auth.md §5.2 — unchanged
- [x] PairingView long-polls `/pairing/<request_id>/status` — unchanged
- [x] PlaceholderShowView shows connection panel + Y.Doc sync status + last GO event — unchanged
- [x] manifest.webmanifest declares name, short_name, icons, theme_color, display: standalone — unchanged
- [x] sw.js registers + caches PWA shell + assets for offline first-load — unchanged
- [x] **Vitest tests pass** — `pnpm vitest run tests/unit/pwa` → **18 passed (18 total)** ✓

## Tests run

```
pnpm vitest run tests/unit/pwa
 ✓ tests/unit/pwa/auth.test.ts  (5 tests) 13ms
 ✓ tests/unit/pwa/syncClient.test.tsx  (9 tests) 11ms
 ✓ tests/unit/pwa/App.test.tsx  (4 tests) 117ms
 Test Files  3 passed (3)  |  Tests  18 passed (18)
```

```
pnpm -r typecheck
 src/shared:  Done
 pwa:         Done
 src/main:    Done
```

## Files changed

| File | Change |
|---|---|
| `pwa/src/lib/discovery.ts` | Removed stale TODO; `discoverFromOrigin` + `probeLan` probe paths → `/system/health` |
| `pwa/src/lib/syncClient.ts` | Added `ProviderHandle`/`ProviderOpts` types; `_providerFactory` opt param; provider widened to `ProviderHandle \| null`; status handler uses `(e: unknown)` cast |
| `tests/unit/pwa/syncClient.test.tsx` | Removed `vi.mock('y-websocket', ...)`; added `makeClient()` helper; all `createSyncClient` calls updated to use helper with `_providerFactory` |

## Notes for Critic

- `_providerFactory` injection is a standard testability idiom. Underscore prefix signals test-only. Production callers never pass it.
- `vi.mock('y-websocket')` removed (not just fixed) because `y-websocket@2.1.0` ESM+`exports` packaging breaks `vi.hoisted`-based mock factories in Vitest 1.6.1. Injection is the correct architectural fix.
- `vi.mock('y-indexeddb')` kept and confirmed working.
- Pre-existing failures in `tests/unit/shared/SyncBroker.test.ts` + `sideChannel.test.ts` (B001-006 in_progress, `ws` Vite resolution) are outside B001-012 scope.
