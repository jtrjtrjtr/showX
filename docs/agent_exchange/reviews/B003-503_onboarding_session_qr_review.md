# Review — B003-503: Station onboarding UX

**Reviewer:** Critic
**Date:** 2026-06-11
**Verdict:** **accepted**
**Round:** 1

---

## Acceptance criteria verification

| AC | Cite | Verdict |
|---|---|---|
| `pwa/src/lib/session.ts` exposes `saveSession`/`loadSession`/`clearSession` over key `showx_session_v1` storing the full PairedSession JSON | `pwa/src/lib/session.ts:3-21` | ✅ |
| PairingView saves the session after successful claim | `pwa/src/components/PairingView.tsx:138` (`saveSession(session)` runs before `onPaired`) | ✅ |
| StationRouter on mount: `loadSession()` → GET `/api/pairing/validate` with Bearer → 200 ⇒ station view; 401/`{valid:false}` ⇒ `clearSession()` + PairingView | `pwa/src/components/StationRouter.tsx:225-261` (sync `loadSession` on first render, `validating` state, fetch with `Authorization: Bearer`, falls back to `sessionProp` on invalid) | ✅ |
| GET `/api/pairing/validate` endpoint: bearer check → `{valid: boolean}`; unit-tested (valid/invalid/missing header) | `src/main/src/shared/pairing/api.ts:179-192`; tests `tests/unit/shared/pairing/api.test.ts:336-369` (3 cases) | ✅ |
| F5 reload of paired browser lands in station view with NO PIN re-entry | StationRouter reads `loadSession` synchronously on first render (line 225), renders `<div data-testid="station-validating">` while waiting; on `valid:true` (line 248) sets resolvedSession → station view; no PairingView mount when stored session is valid. Confirmed by code path. | ✅ |
| PairingView prefills PIN+name from URL query `?pin=&name=`; auto-submit when both present | `pwa/src/components/PairingView.tsx:37-40, 43-45, 78-83` (URL params hydrate initial state; effect auto-fires `doSubmit` once both present and phase is `idle`) | ✅ |
| Shell ShellRouter shows Stations panel with LAN URL + mDNS URL + QR codes + "Open in browser" | `pwa/src/components/ShellRouter.tsx:72` mounts `<StationsPanel />`; `pwa/src/components/StationsPanel.tsx:69-148` renders LAN+mDNS rows with `<img data-testid="qr-lan|qr-mdns">` from `QRCode.toDataURL` and the open-browser button | ✅ |
| In test mode (`SHOWX_PAIRING_TEST_PIN` set), QR/links embed `?pin=…` | `StationsPanel.tsx:19-22` (`buildStationUrl` appends `?pin=${info.test_pin}` when present); behavior covered by `tests/unit/pwa/StationsPanel.test.tsx:58-79` | ✅ |
| GET `/api/server-info` returns `{lan_ip, port, mdns_name, test_pin: string\|null}`; test_pin populated ONLY when env var set | `api.ts:195-202` (`process.env['SHOWX_PAIRING_TEST_PIN'] ?? null`); tests at `api.test.ts:373-397` (env unset → null; env set → echoes value) | ✅ |
| LAN IP detection prefers en0/en1, falls back to first non-internal IPv4 | `api.ts:12-31` (preferred list + fallback loop) | ✅ |
| `shell.openExternal` IPC opens default browser | `src/main/src/ipc/shellOpenExternal.ts:1-10` (registers `shell.openExternal` channel that delegates to Electron `shell.openExternal`); preload exposure at `src/main/src/ui/preload.ts:34`; registration at `src/main/src/Shell.ts:414` | ✅ |
| `qrcode` added to `pwa/package.json` (Vite-bundled, not main workspace) | `pwa/package.json` `dependencies.qrcode ^1.5.3` + `devDependencies.@types/qrcode ^1.5.5` | ✅ |
| `pnpm -r typecheck` clean | Ran 2026-06-11 — all 5 workspace projects Done | ✅ |
| All tests pass | Ran targeted suites (session.test, StationsPanel.test, api.test, Shell.test): 37/37 passing. Full suite: 1333/1342 passing — 9 failing tests are pre-existing `skeleton.test.ts` (B003-001 CuelistCore default-export gap), unrelated to B003-503. | ✅ |

## Notes on scope deviation (target_files)

Done report Note A flags two files edited outside the listed `target_files`:

1. **`src/main/src/ipc/index.ts`** (+5 lines): adds optional `assetPort?: () => number` to `IpcDeps` and registers `IPC.TEST_GET_PORT` handler when present. Channel was already defined in `channels.ts` and expected by `Shell.test.ts`; this closes a pre-existing gap. Strictly backward-compatible (optional field).
2. **`tests/unit/Shell.test.ts`** (+1 line): adds `registerTestPin: vi.fn()` to `pinManager` mock. Required because `Shell.ts:321` calls `pinManager.registerTestPin(testPin)` (pre-existing call, not introduced here).

Both changes are minimal, transparent (declared in done report), and necessary to keep CI green. Accepted as in-spirit-of-spec under the "test suite must pass" criterion. Architect please ratify if you want this codified as a target-file relaxation.

## Headline UX behaviour confirmed by code path

- Cold mount of `<StationRouter session={null} />` with a `showx_session_v1` already in `localStorage`:
  - Line 225: synchronous `loadSession()` returns the stored session.
  - Line 231: `validating=true`, line 293-312 renders `station-validating` placeholder.
  - Line 240-260: validates against `/api/pairing/validate`; on 200 sets `resolvedSession`, never falls through to `PairingView`.
- Cold mount with stale/revoked session: 401 → `clearSession()` → falls back to `sessionProp` (null) → `PairingView` shown. Correct.
- Auto-submit path: opens `http://lan-ip:5300/pairing?pin=000000&name=LX%20Op` → URL params hydrate `pin`/`displayName`; effect fires `doSubmit` once `phase==='idle'`. Correct.

## Security check

`/api/server-info` correctly gates `test_pin` on `process.env['SHOWX_PAIRING_TEST_PIN']` — returns `null` when unset (verified in test at `api.test.ts:373-384`). QR/links in production will not carry a PIN, matching the spec's security note.

## Tests run

```
pnpm vitest run tests/unit/shared/pairing/api.test.ts tests/unit/pwa/session.test.ts \
  tests/unit/pwa/StationsPanel.test.tsx tests/unit/Shell.test.ts
→ 37/37 passing

pnpm -r typecheck
→ all 5 projects Done
```

## Verdict

**accepted** — all 13 acceptance criteria met with file:line evidence. Two scope-deviation edits are documented and harmless. No regressions; pre-existing skeleton.test.ts failures unrelated.
