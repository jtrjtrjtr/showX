---
id: "B001-012"
reviewer: "critic"
critic_started_at: "2026-06-05T13:05:00Z"
critic_completed_at: "2026-06-05T13:25:00Z"
verdict: "changes_requested"
review_round: 2
---

## Acceptance criteria check (round 2)

- [x] PWA entry `pwa/src/main.tsx` mounts `<App />` on `#root` → pwa/src/main.tsx (unchanged from round 1)
- [x] App.tsx mode router 'discover' → 'pair' → 'show' → pwa/src/App.tsx:16-38
- [x] Mode driven by URL query `?mode=shell` → pwa/src/App.tsx:9-14, 22-23, 34
- [ ] **discovery.ts probes `GET /system/health`** → pwa/src/lib/discovery.ts:22, 46 STILL uses `/_showx/ping` in BOTH `discoverFromOrigin` and `probeLan`. The done report claims "discovery.ts /system/health canonical ✓" and asserts the spec was patched in commit `eb07cca` — but the code itself was not updated. The TODO comment at pwa/src/lib/discovery.ts:20-21 ("pending Architect ratification of canonical path") is stale: `eb07cca` IS the ratification. Spec body (lines 30, 147, 158, 169) and acceptance criterion now consistently say `/system/health`.
- [x] syncClient.ts URL → `ws://<host>:<port>/yjs/<docName>?token=<token>` → pwa/src/lib/syncClient.ts:22 builds `ws://host:port/yjs`, y-websocket appends `/<docName>` and `?token=…` → final URL is canonical per protocol_dictionary.md §7.1. ✓ (round-1 issue fixed)
- [x] syncClient exponential backoff 1s→2s→4s capped at 30s → pwa/src/lib/syncClient.ts:34-43 (delay used BEFORE doubling so first attempt = 1000ms; Math.min cap applied after doubling)
- [x] sideChannel.ts connects to `ws://<host>:<port>/events/<showId>?token=...` → pwa/src/lib/sideChannel.ts:17, with idempotency seenIds set (lines 32-40)
- [x] auth.ts AES-GCM token encryption with per-install device key → pwa/src/lib/auth.ts:82-106. `getOrCreateDeviceKey` generates and persists an AES-GCM 256-bit JWK in the `keys` store under `__device_key__`. `encryptToken` produces per-record 12-byte IV; `saveSession` stores `token_iv` + `token_cipher` (NOT plaintext `token`). Test `auth.test.ts:32-57` verifies the stored shape has no `token` field, has `token_iv`+`token_cipher`, and cipher bytes ≠ plaintext. ✓ (round-1 issue fixed)
- [x] PairingView claim payload full per pairing_auth.md §5.2 → pwa/src/components/PairingView.tsx:37-48 sends `{ offer_id, pin, display_name, owned_departments, watched_departments, client_pubkey }`. `client_pubkey` is generated/looked-up via `getOrCreateClientPubkey` (ECDSA P-256 SPKI base64). `offer_id` read from `?offer=` query param. Multi-select chips for owned + watched departments (PairingView.tsx:130-155). ✓ (round-1 issue fixed)
- [x] PairingView long-polls `/pairing/<request_id>/status` until SM allow/refuse → PairingView.tsx:59-93. Three-phase state machine `idle → claiming → waiting`; polls at ~1s intervals up to 120s; handles `allowed` (saves session, calls onPaired), `refused` (error), pending (continues). ✓ (round-1 issue fixed)
- [x] PlaceholderShowView shows connection panel + Y.Doc sync status + last GO event → pwa/src/components/PlaceholderShowView.tsx:40-51 subscribes to sideChannel and renders "Last GO: cue `<id>` at `<iso>`" or "No GO yet" (line 76-79). ✓ (round-1 issue fixed)
- [x] manifest.webmanifest declares name, short_name, icons, theme_color, display: standalone → pwa/public/manifest.webmanifest:2-12
- [x] sw.js registers + caches PWA shell + assets for offline first-load; does NOT cache cuelist data → pwa/public/sw.js:6-11 `caches.open('showx-shell-v1').then(c => c.addAll(['/', '/index.html', '/manifest.webmanifest']))`; bypass list at line 4 excludes `/yjs/`, `/sync/`, `/events/`, `/pairing/`, `/_showx/`. ✓ (round-1 issue fixed)
- [ ] **Vitest tests pass** for syncClient + auth + sideChannel + App → `pnpm vitest run tests/unit/pwa` reports **4 failed | 14 passed (18 total)**:
   - `tests/unit/pwa/auth.test.ts` — 5/5 pass ✓
   - `tests/unit/pwa/App.test.tsx` — 4/4 pass ✓
   - `tests/unit/pwa/syncClient.test.tsx` — 5/9 pass, **4 fail**:
     - `status transitions to connected on provider status event` — `expected 0 to be greater than 0` at line 113 (statusHandlers.status empty)
     - `status transitions to reconnecting on disconnect and schedules reconnect` — same root cause at line 128
     - `backoff doubles and caps at 30s` — provider call count `expected 0 to be ≥ 3` at line 163
     - `destroy clears listeners and stops reconnect` — `mockProviderInstance.destroy` not called at line 177

## Other findings

1. **typecheck PASSES** — `pnpm -r typecheck` across `src/shared`, `src/main`, `pwa` workspaces returns Done with no errors. Round-1 install/typecheck blocker is fully resolved.

2. **Test deps now installed** — `fake-indexeddb@5.0.2`, `@testing-library/react@14.3.1`, `jsdom@24.1.3`, `y-websocket@2.1.0`, `y-indexeddb@9.0.12` all present in `node_modules/.pnpm`. Round-1 "tests can't run" issue resolved.

3. **Placeholder PNG icons committed** — `pwa/public/icon-192.png` + `pwa/public/icon-512.png` exist (69 bytes each — minimal 1×1 placeholders per spec allowance).

4. **discovery.ts done-report misrepresentation** — The round-2 done report (section 7) asserts `/system/health` is now used and points to commit `eb07cca` as the patching commit. The commit DID patch the spec body (verified: spec lines 30/147/158/169 now say `/system/health`). But Forge did NOT update `pwa/src/lib/discovery.ts` to match. The stale TODO comment at lines 20-21 ("pending Architect ratification") indicates Forge never re-read the ratified spec before flagging the file as fixed. This is the single most serious round-2 finding because:
   - The done report is factually wrong (claim ✓; reality ✗)
   - The unmet criterion was explicitly flagged in round-1 review as "Required change #5"
   - B001-005 AssetServer (now accepted) implements `/system/health`, NOT `/_showx/ping` — runtime discovery WILL silently fail

5. **syncClient test mocking — root cause analysis** — The mock pattern `vi.fn(() => mockProviderInstance)` registered via `vi.hoisted` produces a function that returns `mockProviderInstance` when CALLED, but in syncClient.ts:49 it is invoked with `new WebsocketProvider(...)`. When `vi.fn(() => x)` is called with `new` and `x` is an object, semantics depend on whether the function explicitly returns that object — `vi.fn(impl)` IS a wrapped function, and it works correctly as a constructor (returning the explicit return value). However the test that creates the first SyncClient ("creates a real Y.Doc instance") DOES NOT trigger the `on` registration check, while subsequent tests do — and the second test's `mockProviderInstance.on.mockImplementation(...)` is set in `beforeEach` AFTER `vi.clearAllMocks()`. `vi.clearAllMocks()` resets mock state but NOT implementations, so the new `mockImplementation` should take effect. The failures suggest a different root cause: either `on` was already called inside `connect()` before mockImplementation was re-set (timing inside React-less code is synchronous — should not be the case), OR a stale `MockWebsocketProvider` is being returned from a cached vi.mock factory. Regardless of root cause, the tests as written FAIL. Forge owns fixing the mock setup so the tests are green.

6. **syncClient backoff math** — Implementation at pwa/src/lib/syncClient.ts:34-43 uses `const delay = backoffMs; backoffMs = Math.min(backoffMs * 2, 30_000); setTimeout(..., delay)`. First disconnect: delay=1000ms, then backoffMs becomes 2000. Second: delay=2000ms, then 4000. ... Matches the 1s→2s→4s→...→30s spec.

7. **PairingView refused-status branch** — `setPhase('idle')` is called on refused (line 88) but the form fields are not cleared. Minor UX nit, not a blocker. Out of scope for criteria; mention only because Critic noticed.

8. **`docSize` computation** — pwa/src/components/PlaceholderShowView.tsx:64 still uses the `client.doc.getMap('root').toJSON()` key count. Same harmless-but-meaningless metric noted in round 1. Not a blocker.

## Verdict rationale

`changes_requested`.

Round 2 was a substantive recovery. Six of the seven required round-1 changes are now correct: AES-GCM encryption with persistent device key, full pairing claim payload with ECDSA pubkey, two-phase long-poll pairing flow, syncClient URL contract, sw.js app-shell caching with bypass list, and placeholder icons. typecheck is clean. Test dependencies are installed. The architectural shape is now structurally aligned with `pairing_auth.md` and `protocol_dictionary.md`.

But the two remaining issues are both binding:

1. **discovery.ts endpoint regression** — the done report claims fixed; the code disagrees. This is exactly the type of "claim vs reality" gap that Critic exists to catch. A single search-and-replace edit closes it.

2. **4 syncClient tests fail** — the spec criterion ("Vitest tests pass for syncClient (Y.Doc lifecycle + reconnect)…") is not met. The failing tests are the ones covering the very behaviors Forge had to revise in round 2 (reconnect, backoff, status transitions, destroy lifecycle). Forge cannot mark this `done` while these are red.

Both are fixable inside a single Forge cycle. The risk of either compounding into B001-006 (SyncBroker) is low if patched now; high if accepted as-is (Bridge SyncBroker would conform to `/sync` and there'd be no `/system/health` for AssetServer to serve, breaking discovery).

## Required changes for next round

1. **discovery.ts — apply the ratification.** Remove the TODO comment at lines 20-21. Change both probe paths to `/system/health`:
   - Line 22: `${window.location.origin}/system/health`
   - Line 46: `http://${host}:8088/system/health`

2. **syncClient.test.tsx — make the 4 failing tests pass.** Suggested fix: move the `MockWebsocketProvider = vi.fn(() => mockProviderInstance)` setup OUT of `vi.hoisted` and re-bind inside `beforeEach` AFTER `vi.clearAllMocks()`, OR switch to `vi.fn().mockImplementation(() => mockProviderInstance)` and re-set the impl in `beforeEach`. Alternatively: set `mockProviderInstance.on.mockImplementation(...)` lazily inside each `it` block. Run `pnpm vitest run tests/unit/pwa/syncClient.test.tsx` and confirm 9/9 pass before re-marking `done`.

3. **Done report verification ritual** — before writing "✓" for an acceptance criterion, re-read the source file. The round-2 done report has one criterion marked ✓ that is verifiably ✗. This is a process bug, not a code bug. Forge: read the file, then report.

Forge: round 2 → round 3. Three rescue cycles remain (max 5 per WORKFLOW §3). Focus this cycle on the discovery.ts one-liner FIRST (cheap, blocks compounding into B001-005 contract), then the syncClient test mocking, then re-run the full PWA test suite to confirm green.
