---
id: "B003-503"
title: "Station onboarding UX — persistent session, PIN prefill, QR + open-browser in shell"
type: "implementation"
estimated_size_lines: 350
priority: "P0"
bundle: "ShowX-3.5"
depends_on: ["B003-501"]
target_files:
  - "pwa/src/components/PairingView.tsx"
  - "pwa/src/components/StationRouter.tsx"
  - "pwa/src/components/ShellRouter.tsx"
  - "pwa/src/components/StationsPanel.tsx"
  - "pwa/src/lib/session.ts"
  - "src/main/src/shared/pairing/api.ts"
  - "src/main/src/ipc/shellOpenExternal.ts"
  - "src/main/src/Shell.ts"
  - "src/main/src/ui/preload.cts"
  - "pwa/package.json"
  - "tests/unit/shared/pairing/api.test.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "New pwa/src/lib/session.ts: saveSession(s), loadSession(), clearSession() over localStorage key `showx_session_v1` storing the full PairedSession JSON (token, device_id, display_name, role, owned_departments, watched_departments, show_id, host, port)."
  - "PairingView saves the session after successful claim. StationRouter on mount: loadSession() → if present, validate by GET `/api/pairing/validate` with Authorization: Bearer <token> → 200 {valid:true} continues straight to station view (NO pairing form); 401/{valid:false} → clearSession() + show PairingView."
  - "New endpoint GET `/api/pairing/validate` in api.ts: checks bearer token against PairingStore, returns {valid: boolean}. Unit-tested (valid token, invalid token, missing header)."
  - "Reload (F5) of a paired browser lands back in the station view with NO PIN re-entry. Closing/reopening the browser likewise. This is the headline UX fix — Jindřich currently re-pairs every launch."
  - "PairingView prefills PIN from URL query `?pin=XXXXXX` and display name from `?name=`. If BOTH pin and name present and valid → auto-submit (no click needed)."
  - "Shell window (ShellRouter) gains a Stations panel (new component StationsPanel.tsx) showing: (a) station URL `http://<lan-ip>:<port>/pairing` + mDNS variant, (b) QR code of that URL (use `qrcode` npm package — react wrapper not required, render to canvas/dataURL), (c) 'Open station in this Mac's browser' button. In test mode (SHOWX_PAIRING_TEST_PIN set), QR/links embed `?pin=000000`."
  - "LAN IP: expose via existing pairing/asset-server info or new GET `/api/server-info` returning {lan_ip, port, mdns_name, test_pin: string|null}. test_pin populated ONLY when SHOWX_PAIRING_TEST_PIN env is set."
  - "'Open station in browser' button: new IPC `shell.openExternal` (src/main/src/ipc/shellOpenExternal.ts + preload exposure following existing IPC patterns in src/main/src/ipc/). Opens default browser at the station URL (with test pin param when in test mode)."
  - "Electron-packed-app constraint honored: new `qrcode` dependency added to pwa package (bundled by Vite into PWA dist — NOT a main-process workspace import; no electron-builder changes needed)."
  - "`pnpm -r typecheck` clean, all tests pass."
  - "No edits outside listed target_files."
---

## Context

Jindřich 2026-06-10: "je to trochu pakárna to spouštět a pořád tam vyplňovat ty PINy." Today: every browser launch requires manual URL + full pairing form. Session is held only in React state (PairingView stores just the raw token under `showx_pair_token` for tests, never restored).

Cloud-hosting the station UI (showx.xlabproject.net) was considered and rejected — https page cannot open insecure LAN WebSockets (mixed content). LAN-first stands. Instead we kill the friction: pair once + QR onboarding.

## Implementation notes

### Session restore flow (StationRouter)

```
mount → loadSession()
  none        → PairingView
  found       → GET /api/pairing/validate (Bearer token)
      valid   → station view (existing flow, session from storage)
      invalid → clearSession() → PairingView
```

Keep the existing `/api/active-show` poll for show_id changes — session.show_id may be stale after restore; the poll already handles that (B003-403).

### Validate endpoint

PairingStore already holds paired devices/tokens (used by claim). Add a lookup-by-token method if one doesn't exist. Route co-located with other pairing routes in api.ts.

### Stations panel in shell

ShellRouter currently renders the shell-side UI. Add a collapsible "Stations" section (visible when a show is open AND when not — pairing works regardless). QR via `qrcode` package: `QRCode.toDataURL(url)` → `<img>`. Show both `http://<lan-ip>:5300/pairing` and `http://<mdns-name>:5300/pairing`.

LAN IP detection in main process: iterate os.networkInterfaces(), first non-internal IPv4 (en0 preferred). Return via /api/server-info (PWA in shell window can fetch it same-origin).

### Security note

test_pin must NEVER appear in /api/server-info output unless SHOWX_PAIRING_TEST_PIN env var is set in the running process. Production launch without the env var → test_pin: null → QR links carry no pin.

## Done report

Standard format. Explicitly confirm: F5 reload lands in station view without form; QR dataURL renders; openExternal works from packed-app context (document any asar caveat encountered).
