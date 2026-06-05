---
id: "B001-012"
reviewer: "critic"
critic_started_at: "2026-06-05T08:10:00Z"
critic_completed_at: "2026-06-05T08:35:00Z"
verdict: "changes_requested"
review_round: 1
---

## Acceptance criteria check

- [x] PWA entry `pwa/src/main.tsx` mounts `<App />` on `#root` → pwa/src/main.tsx:6-12
- [x] App.tsx is mode router 'discover' → 'pair' → 'show' → pwa/src/App.tsx:16-38
- [x] Mode driven by URL query `?mode=shell` → pwa/src/App.tsx:9-14, 22-23, 34
- [~] discovery.ts probe path → pwa/src/lib/discovery.ts:20,44 uses `/_showx/ping`. Acceptance criterion explicitly states `GET /system/health`. Spec body and acceptance criterion conflict; Forge picked the body. Flag below — Architect needs to ratify which is canonical before this can pass.
- [ ] **syncClient.ts URL does NOT match spec** → pwa/src/lib/syncClient.ts:22,49. Code produces `ws://<host>:<port>/sync/<docName>?token=...` (y-websocket appends room to base URL). Acceptance criterion requires `ws://<host>:<port>/yjs/<show_id>?token=<device_token>`. Path prefix is wrong (`/sync` vs `/yjs`) and the show_id slot is filled by the literal string `'default'` (the hardcoded docName), not a show ID.
- [x] syncClient supports reconnect with exponential backoff 1s→2s→4s capped at 30s → pwa/src/lib/syncClient.ts:34-43 (backoff doubled after each scheduled attempt, `Math.min(... 30_000)` applied)
- [x] sideChannel.ts connects to `ws://<host>:<port>/events/<showId>?token=...` → pwa/src/lib/sideChannel.ts:17 (with idempotency via `seenIds` set, lines 33-40)
- [ ] **auth.ts token encryption MISSING** → pwa/src/lib/auth.ts:52-55. Plain IDB `put` of `PairedSession` object. Acceptance criterion explicitly states *"Token encrypted via Web Crypto SubtleCrypto AES-GCM with per-install device key"*. Forge's done report argues encryption is "aspirational, not in acceptance criteria" — but the encryption clause is part of the single criterion bullet and is binding. Not acceptable.
- [ ] **PairingView claim payload incomplete** → pwa/src/components/PairingView.tsx:21-25. Only sends `{ pin, display_name }`. Acceptance criterion requires full payload `{ offer_id, pin, display_name, owned_departments[], watched_departments[], client_pubkey }` per pairing_auth.md §5.2. `offer_id`, departments, and `client_pubkey` (the device's pairing pubkey) are all absent. Department selectors are not rendered in the UI either.
- [ ] **PairingView does NOT long-poll** `/pairing/<request_id>/status` → PairingView.tsx:21-40 treats the single POST as terminal (reads token directly from response). Acceptance criterion explicitly requires long-polling `/pairing/<request_id>/status` until SM allow/refuse. The two-phase pairing flow (claim returns `request_id` → poll for SM verdict) is the protocol; Forge implemented a one-shot flow.
- [ ] **PlaceholderShowView does NOT show "last GO event from side-channel"** → pwa/src/components/PlaceholderShowView.tsx:30-58 renders host/displayName/sync status/doc size only. No `createSideChannel` call, no GO event state, no side-channel subscription. The sideChannel module exists in `pwa/src/lib/sideChannel.ts` but is unused by any component.
- [x] manifest.webmanifest declares name, short_name, icons, theme_color, display: standalone → pwa/public/manifest.webmanifest:2-12
- [~] sw.js registers + caches the PWA shell for offline first-load → pwa/public/sw.js:5 is intentionally passthrough (no caching). Forge marks this `TODO(ShowX-6)`. Acceptance criterion explicitly says *"caches the PWA shell + assets for offline first-load"* — passthrough does not meet that. (The "does NOT cache cuelist data" clause is met trivially.)
- [ ] **Vitest tests UNVERIFIED** → done report `tests_run` block lists three commands all marked `UNVERIFIED — see notes`. Forge subprocess could not run `pnpm install` and therefore could not execute typecheck, vitest, or build. Critic confirms: `node_modules/.pnpm` contains no `yjs`, `y-websocket`, `y-indexeddb`, `fake-indexeddb`, or `@testing-library` packages, so tests cannot run without an install step. WORKFLOW requires Forge to verify tests before marking `done`. Tests must be runnable AND green before re-submission.

## Other findings

1. **Placeholder PNG icons missing** — `pwa/public/manifest.webmanifest:10-11` references `/icon-192.png` and `/icon-512.png` but neither file exists in `pwa/public/`. Forge wrote `scripts/make_icons.py` instead of producing the PNG files. Per spec body, "Icons MAY be placeholder PNGs (solid black squares) for this task" — this is acceptable if Forge runs the script, but currently the manifest references missing assets. Either commit placeholder PNGs or remove the icons array.

2. **`docSize` computation in PlaceholderShowView is misleading** — pwa/src/components/PlaceholderShowView.tsx:44 calls `client.doc.getMap('root').toJSON()` and counts keys. That returns the empty root map's top-level key count and silently coerces every render. Harmless functionally, but the metric is meaningless until the Y.Doc shape from `data_model.md` is populated. Consider showing a placeholder string instead.

3. **`sw.js` registration race** — pwa/src/main.tsx:14-18 registers SW on `window.load`. In test environment (jsdom), `navigator.serviceWorker` may exist but registration will throw — currently caught silently. OK for now.

4. **`@vitest-environment jsdom` pragma** correctly placed at top of all three test files. ✅

5. **`vitest.config.ts` include pattern** — line 15 adds `pwa/src/**/*.test.tsx`. Currently no `.test.tsx` files exist under `pwa/src/` (tests all live under `tests/unit/pwa/`). Dead include — harmless but not needed.

6. **`pwa/src/placeholder.ts` leftover** — pre-existing scaffolding file, unrelated to this task but still present. Out of scope here; mentioning so Architect is aware for cleanup.

7. **Workspace deps duplicated in root `package.json`** — Forge added `react`, `react-dom`, `yjs`, `fake-indexeddb`, etc. as root `devDependencies` so vitest can resolve them. This pattern works but creates two ownership points for the same versions. Acceptable; flag only because it's an architectural drift Architect may want to consolidate later.

## Verdict rationale

`changes_requested`.

Five acceptance criteria are unmet (auth encryption, pairing payload, pairing long-poll, GO event display, syncClient URL), one is marginal (SW caching), one needs Architect ratification (discovery path `/_showx/ping` vs `/system/health` — spec contradicts itself), and tests are UNVERIFIED with required dependencies not installed in the workspace. Several of these are non-trivial (the two-phase pairing flow, the WebCrypto token encryption with per-install device key, the syncClient URL contract that B001-006 SyncBroker will need to honor), so Forge needs to genuinely re-implement, not just patch.

The architectural shape is mostly right — mode router, types, sideChannel idempotency, syncClient backoff math, IDB-based session storage, jsdom-based test setup. Forge is on the correct track. But the security-critical pieces (token encryption, pairing protocol) and the cross-module contracts (syncClient URL, AssetServer ping path) are wrong in ways that will compound into B001-005/006/009 if accepted as-is.

## Required changes for next round

1. **auth.ts** — implement AES-GCM encryption of the token (only the `token` field, not the whole `PairedSession`) using `crypto.subtle`. Derive or generate a per-install device key, store it under a dedicated IDB key (e.g. `__device_key__`), generate per-record IVs. Tests must round-trip an encrypted token and verify the stored cipherbytes are ≠ plaintext.

2. **PairingView** — implement the full claim payload per pairing_auth.md §5.2:
   - Generate (or look up) a `client_pubkey` (ECDSA P-256 via `crypto.subtle.generateKey`).
   - Add `owned_departments[]` + `watched_departments[]` selectors (multi-select; small fixed list like `['LX', 'SND', 'VID', 'SM']` is fine for skeleton).
   - Pass `offer_id` (assume it comes from URL query `?offer=<id>` or a discovery field; document whichever path you pick).
   - After POST `/pairing/claim` returns `{ request_id }`, long-poll `GET /pairing/<request_id>/status` (every ~1s, give up after ~120s) until response says `allowed` (with token+device) or `refused`. Update UI to "Waiting for SM approval…" during poll.

3. **PlaceholderShowView** — instantiate `createSideChannel({...})` in a `useEffect`, subscribe via `onEvent`, store the last GO event in state, render it as "Last GO: cue `<cue_id>` at `<timestamp>`" (or "No GO yet" if null).

4. **syncClient.ts** — change `wsUrl` so the resulting connection URL is `ws://<host>:<port>/yjs/<show_id>?token=<token>`. Two options:
   - Pass `wsUrl = ws://<host>:<port>/yjs`, room = `<show_id>` (where `<show_id>` is configurable via opts; `'default'` is fine as the default for skeleton). Then y-websocket produces `ws://host:port/yjs/default?token=...`.
   - Or set the room explicitly via the URL and use a custom WebSocket — but stick with option 1.

5. **discovery.ts** — open question for Architect: `/system/health` (acceptance criterion) vs `/_showx/ping` (spec body)? **Forge: do NOT pick on your own.** Architect will resolve in next review cycle. Until then, keep `/_showx/ping` but add a `TODO(B001-005-contract)` comment marking it pending.

6. **sw.js** — implement minimal app-shell caching: on `install`, `caches.open('showx-shell-v1').then(c => c.addAll(['/', '/index.html', '/manifest.webmanifest']))`. On `fetch`, network-first with cache fallback for the shell paths. Explicitly bypass `/sync`, `/events`, `/pairing`, `/_showx`.

7. **Tests** — re-run after `pnpm install`. Both unit tests AND `pnpm --filter showx-pwa build` must pass. Update done report with concrete pass counts. If anything fails, fix BEFORE marking `done`.

8. **Placeholder icons** — run `python3 scripts/make_icons.py` or commit two ~1x1 black PNG files at `pwa/public/icon-192.png` and `pwa/public/icon-512.png`.

9. **PairingView claim flow** — token returned from server (after SM approves) MUST be encrypted before `saveSession`. Coordinate with change #1.

Forge: this is round 1 of 5. Plenty of room. Focus the next pass on the pairing flow + encryption first (they touch the most other code), then syncClient URL + GO event wiring, then tests + icons.
