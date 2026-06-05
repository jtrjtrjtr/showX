# ShowX Pairing + Auth Specification

> **Status:** Draft v0.1 — for Architect/Forge/Critic review pre-implementation
> **Date:** 2026-06-05
> **Author:** Architect (hub session)
> **Depends on:** `showx_module_architecture.md` (ModuleContext, SecretStore, PairingStore), `showx_mvp_scope.md` (LAN-first lock, MVP feature set #8 + #15)
> **Companion specs:** `data_model.md` (Device entity), `module_loader.md` (Cloud Sync module triggers Supabase Auth)
> **Implementation phase:** Phase A (ShowX bootstrap, target end-September 2026) — pairing infrastructure is "always-on" shared service, not a module
> **Out of scope:** TLS/HTTPS on LAN (post-MVP), 2FA for SHOW mode unlock (0.2), Stream Deck pairing (handled by Companion module post-1.0)

---

## 1. Overview

ShowX uses **two distinct authentication contexts** that must never be conflated:

### 1.1 Venue auth (LAN-only, REQUIRED for runtime)

- ShowX-issued **device tokens** bound to a single show + station device.
- Replaces "username/password" with **SM-driven QR/PIN handshake** initiated at the FOH.
- Per-station, per-device, **revocable** trust.
- **No cloud round-trip** during pairing — all crypto is local. ShowX never phones home for venue auth.
- A station with a valid token can connect to:
  - the embedded Yjs WSS broker (sync),
  - the side-channel WSS topic (GO events, presence),
  - HTTP endpoints (asset server, REST control plane).

### 1.2 Cloud account auth (Supabase, OPTIONAL)

- Activated **only** when the user enables the **Cloud Sync module** (Pro+ tier).
- Supabase email/password or magic link → Supabase JWT.
- Used for: show file backup, cross-venue access, opt-in remote collab proxy, multi-venue billing.
- **ShowX runs a complete show without ever seeing a Supabase token.** Venue runtime is fully self-contained.

### 1.3 Hard rules

- Venue auth credentials NEVER leave the LAN.
- Cloud account credentials NEVER gate runtime — the SM can run a show with the Supabase service offline, expired, or never signed up.
- Device tokens are scoped to a single `show_id`. Switching shows = re-pair (MVP). Post-MVP, station-level multi-show is a feature.
- All pairing approval requires an **explicit SM click** in the ShowX shell UI. No silent grants.

---

## 2. mDNS discovery

### 2.1 Service advertisement

ShowX advertises itself on the local LAN via Bonjour / mDNS:

| Field | Value |
|---|---|
| Service name | `_showx._tcp.local` |
| Port | configurable (default `5300`) |
| Hostname | `showx.local` (default) or user-configured |
| TXT records | see table below |

TXT record contents:

| Key | Type | Purpose |
|---|---|---|
| `v` | string | ShowX semver, e.g. `0.5.2` |
| `proto` | int | Pairing protocol version (currently `1`) |
| `tier` | string | `free` \| `pro` (informational only — gates UI, not auth) |
| `host` | string | FOH machine hostname (for display) |
| `show_id` | string | UUIDv7 of currently-loaded show, or empty if none |
| `fp` | string | SHA-256 hex of the public derivation of the local secret (see §7.3) — 64 chars, used by station to detect MITM advertise spoofing |
| `roles` | string | comma-separated module slugs currently loaded (`eventx_bridge,cuelist_core,show_mode`) — informational |

### 2.2 Station-side discovery flow

```
┌─────────────┐                                           ┌─────────────┐
│  Station    │                                           │   ShowX     │
│  (PWA)      │                                           │  (FOH Mac)  │
└──────┬──────┘                                           └──────┬──────┘
       │                                                        │
       │  1. mDNS PTR query _showx._tcp.local                   │
       │ ──────────────────────────────────────────────────────>│
       │                                                        │
       │  2. SRV + TXT records (host, port, fp, show_id)        │
       │ <──────────────────────────────────────────────────────│
       │                                                        │
       │  3. Station displays list of discovered ShowX hosts    │
       │     to operator, with show_id + tier badge             │
       │                                                        │
       │  4. (If station has stored token for this show_id +   │
       │      fp matches) — auto-reconnect (skip pairing)       │
       │  4'. (Else) — enter pairing UI                         │
```

### 2.3 Fallback for non-mDNS networks

Many corporate / hotel / conference networks block mDNS. ShowX MUST support:

- **Manual entry:** station UI lets operator type `host:port` directly (e.g. `192.168.1.50:5300`).
- **QR pairing URL** (see §4.2) encodes host+port; scanning bypasses discovery entirely.
- **Detection:** if mDNS scan times out after 3 s, station UI auto-pivots to manual entry with hint.

---

## 3. First-time install flow

PWA install before any auth:

```
1. Operator opens browser → http://showx.local:5300/  (mDNS-resolved)
                                or http://192.168.1.50:5300/  (manual)
2. ShowX AssetServer responds with PWA bundle (index.html + JS).
3. PWA service worker registers, caches assets for offline use.
4. PWA boots in PAIRING state:
   - no token in IndexedDB → render "Pairing required" panel
   - mDNS panel populated from station-side Bonjour scan (Node-bridge
     where available, manual entry fallback in browser)
5. Operator selects ShowX host (or enters manually).
6. PWA awaits PIN entry or QR scan.
```

The PWA cache is **decoupled from pairing state**. Cache survives re-pairs and revocations; only the **token** in IndexedDB changes.

---

## 4. Pairing initiation (SM side)

### 4.1 SM UI flow

1. SM opens ShowX shell on the FOH Mac.
2. SM clicks **"Add station"** in the Pairing panel.
3. SM enters (optional):
   - Display name (e.g. "LX-1 iPad"; defaults to `pending` then editable post-claim).
   - Pre-assigned `owned_departments` (multi-select chips: `LX`, `SX`, `VIDEO`, `AUTO`, `PYRO`, `FS`, `SM`, `OTHER`).
   - Pre-assigned `watched_departments` (read-only views).
   - These can be empty; station can claim them in step §5 and SM confirms.
4. ShowX generates a **pairing offer** (see §4.2).
5. UI displays QR + PIN + countdown timer ("Expires in 4:53").
6. SM hands PIN verbally or shows QR for camera.

### 4.2 Pairing offer payload

When SM clicks "Add station", ShowX generates:

```
PairingOffer {
  pin: string         // 6-digit decimal, cryptographically random (e.g. "284917")
  pin_hash: string    // SHA-256(pin) stored server-side; pin itself NOT persisted
  offer_id: string    // UUIDv7
  show_id: string     // currently-loaded show
  fp: string          // SHA-256 of local-secret-derived pubkey (matches mDNS TXT)
  host: string        // hostname or IP
  port: int           // 5300 default
  expires_at: int     // epoch ms, default now + 5 min
  proposed_display_name: string | null
  proposed_owned_departments: string[]
  proposed_watched_departments: string[]
  used: boolean       // false; flips true on successful claim
}
```

Stored in-memory in PairingStore's `pendingOffers` map (NOT persisted to disk — survives only the ShowX process lifetime). On ShowX restart, in-flight offers are dropped (rare; SM regenerates).

### 4.3 QR encoding

The QR encodes a `showx://` custom URL:

```
showx://pair?host=192.168.1.50&port=5300&pin=284917&fp=a3f9...c1&offer=01J8H...
```

Notes:
- The PIN is in the URL because the QR is the **convenience path** (scan and go). If an attacker physically photographs the SM's screen and is on the LAN within 5 minutes, they can race — mitigation: SM clicks **Allow** in step 5 (§5.5), so the QR alone does not grant access.
- The custom scheme `showx://` is registered by the PWA service worker (post-install). For first-time installs (PWA not yet installed), the QR additionally encodes an `https`-style fallback URL via a wrapping page served at `https://showx.local:5300/pair?...` — TODO post-MVP (OPEN QUESTION §18.4).

### 4.4 PIN properties

- **Length:** 6 decimal digits → 10^6 = 1,000,000 keyspace.
- **Generation:** `crypto.randomInt(0, 999_999)` zero-padded to 6 digits.
- **Single-use:** PinClaim flips `used = true` on first successful claim; subsequent attempts return 410 Gone.
- **Expiry:** 5 minutes from generation (`expires_at`).
- **Rate limit on claim:** max 5 claim attempts per IP per minute, max 20 globally per minute on the pairing endpoint. Brute-force expected cost: see §15.4.
- **OPEN QUESTION §18.1:** lengthen to 8 digits for stricter venues?

---

## 5. Pairing claim (station side)

### 5.1 Two entry paths

**Option A — QR:** station scans QR, parses `showx://pair?...`, extracts host+port+pin+fp+offer_id.
**Option B — PIN:** station entered manually by operator into PWA pairing form; host+port already known from §3 step 6.

### 5.2 Claim request

Station POSTs to `http://<host>:<port>/pairing/claim`:

```http
POST /pairing/claim HTTP/1.1
Content-Type: application/json

{
  "offer_id": "01J8H...",
  "pin": "284917",
  "fp": "a3f9...c1",
  "claimed_display_name": "LX-1 iPad (Marek)",
  "claimed_owned_departments": ["LX"],
  "claimed_watched_departments": ["SX"],
  "client_nonce": "8h2k...",      // 128-bit random; echoed in response, defeats stale-response replay
  "client_metadata": {
    "ua": "Mozilla/5.0 (iPad; ...)",
    "platform": "iPadOS 18",
    "pwa_version": "0.5.2"
  }
}
```

### 5.3 Server-side validation

ShowX checks in order:

1. `offer_id` exists in pendingOffers; else 404.
2. `expires_at > now`; else 410 Gone (expired).
3. `used == false`; else 410 Gone (already claimed).
4. SHA-256(pin) == stored `pin_hash`; else increment failed-claim counter for this offer; on 3 failures, invalidate offer (single-use also after wrong attempts).
5. `fp` from request matches current `fp` in PairingStore; else 409 Conflict (fingerprint mismatch — possible spoofed advertise).
6. Rate-limit check (§4.4); else 429.

If all pass, server marks the offer as **claimed-pending-SM-confirm**, generates a `claim_id`, and pushes a confirmation prompt into the SM UI.

### 5.4 Server holds the request open

The HTTP request is held open (long-poll, max 60 s) while ShowX UI waits for SM to confirm. Station sees "Waiting for SM confirmation…". If SM doesn't respond within 60 s, server returns 408 Request Timeout; station retries.

### 5.5 SM confirmation prompt

ShowX shell UI flashes a modal:

```
┌──────────────────────────────────────────┐
│  Station requesting access               │
│                                          │
│  Name claimed: LX-1 iPad (Marek)         │
│  Owned departments: LX                   │
│  Watched: SX                             │
│  Platform: iPadOS 18                     │
│  IP: 192.168.1.74                        │
│                                          │
│  Offer expires in: 4:31                  │
│                                          │
│  [Reject]                  [Allow] ←     │
└──────────────────────────────────────────┘
```

- **Allow:** ShowX writes Device record to PairingStore (persisted), issues a device token (§6), returns token + device record in the held HTTP response.
- **Reject:** ShowX marks offer used (with `rejected_at`), returns 403 Forbidden to station.
- **No action (60 s):** server returns 408; SM modal stays open until dismissed; if SM later clicks Allow with an expired offer, modal converts to "offer expired, regenerate PIN".

### 5.6 Station token storage

On 200 response, station:

1. Stores device token in IndexedDB under `showx.auth.tokens[show_id]`.
2. Stores device record (sub, show_id, owned_departments, watched_departments) in the same store for UI display ("Connected as LX-1 iPad").
3. Caches `fp` so future advertise reads can detect host swap.
4. Transitions PWA from PAIRING → CONNECTING → CONNECTED state.

### 5.7 IndexedDB at-rest protection

Browser IndexedDB is **not encrypted at rest by default**. Mitigations:

- Token is signed (HS256, see §6.4) — recovering the raw token from disk only helps an attacker if they're on the same LAN within token expiry, AND not revoked.
- PWA wraps token storage in a thin `TokenStore` API that gates on origin (only the ShowX PWA origin can read).
- **OPEN QUESTION §18.2:** wrap token in `crypto.subtle.encrypt` with a key derived from `navigator.userAgentData` + per-install salt? Marginal benefit (browser can read both anyway), some support burden. Defer to 0.2.

---

## 6. Device token format

### 6.1 Token shape

Compact JWS, three base64url segments joined by `.`:

```
<header_b64>.<payload_b64>.<signature_b64>
```

### 6.2 Header

```json
{
  "alg": "HS256",
  "typ": "showx-device",
  "kid": "v1"
}
```

- `kid` lets us rotate the local HMAC key without invalidating in-flight tokens during a grace period (post-MVP).

### 6.3 Payload

```json
{
  "sub": "device_01J8H...",
  "iss": "showx-foh",
  "show_id": "01J8H...",
  "owned_departments": ["LX"],
  "watched_departments": ["SX"],
  "tier_at_issue": "free",
  "iat": 1748102400,
  "nbf": 1748102400,
  "exp": 1750694400,
  "jti": "01J8H..."
}
```

| Claim | Notes |
|---|---|
| `sub` | UUIDv7 device id; stable across token renewals |
| `iss` | always literal `showx-foh` for venue tokens; distinguishes from Supabase JWTs |
| `show_id` | UUIDv7; token tied to one show. Switching show = re-pair (MVP) |
| `owned_departments` | RBAC: which department's cue-fire authority the station has |
| `watched_departments` | UI scope only; not a security boundary |
| `tier_at_issue` | informational; tier is re-checked at connect time from current license state |
| `iat`, `nbf`, `exp` | epoch seconds; default `exp = iat + 30 days` (see §9) |
| `jti` | UUIDv7; used for revocation by token id (cheap denylist) |

### 6.4 Signature

`HMAC-SHA256(header_b64 + "." + payload_b64, local_secret_kv1)` → base64url.

Library: Node `crypto.createHmac('sha256', ...)`. Verifier: same; PWA does **not** verify signatures (it's the bearer, not the auditor) — server authority only.

### 6.5 Storage at rest

- **PWA side (IndexedDB):** clear token + device metadata. Origin-locked, per §5.7.
- **ShowX side (PairingStore on disk):** Device records contain `jti` + `sub` + claims, but **not the token itself**. Tokens are reconstructable by signing on demand if ever needed (rare; we issue fresh on rotation). PairingStore is a JSON file in Electron app data, OS file perms `0600`.

### 6.6 Why HS256, not RS256/ES256?

- LAN-local issuer + LAN-local verifier (both inside ShowX Electron process). Asymmetric crypto adds complexity for zero gain.
- No third-party verifier needs the pubkey.
- HMAC is faster + has smaller signatures (fewer bytes on every Yjs reconnect handshake).
- **OPEN QUESTION §18.3:** if Companion bridge module ever needs to verify ShowX tokens out-of-process, revisit. Currently moot.

---

## 7. Local secret (HMAC key)

### 7.1 Generation

- 256-bit (32 bytes) cryptographically random via `crypto.randomBytes(32)`.
- Generated **once** on first ShowX boot ever on this Mac (or on explicit reset).
- Stored in **OS keychain** (macOS Keychain Services) under service `cz.xlab.showx` account `local-secret-v1`.

### 7.2 Access via SecretStore service

`SecretStore` (shared infrastructure per `module_loader.md`) wraps `keytar` (node-keytar). Boot sequence:

```
ShowX boot
 ├─ SecretStore.init()
 │    ├─ try keytar.getPassword('cz.xlab.showx', 'local-secret-v1')
 │    ├─ if null → generate 32 random bytes, keytar.setPassword(...)
 │    └─ cache in-memory for module use
 ├─ derive fp = SHA256(local_secret + "fp-derivation-v1")
 ├─ publish fp via mDNS TXT records
 └─ ready
```

### 7.3 Uses

| Purpose | Operation |
|---|---|
| Sign device tokens | HMAC-SHA256 over header+payload |
| mDNS fingerprint | `fp = SHA256("showx-fp-v1" || local_secret).hex` — published in TXT. Stations cache + verify on reconnect to detect host substitution |
| Encrypt at-rest sensitive fields | AES-256-GCM, key = `HKDF(local_secret, "at-rest-v1")` — used for SecretStore-wrapped module secrets (e.g. Supabase service key for EventX Bridge) |

### 7.4 Backup + portability

- Local secret is part of the FOH machine's identity. Moving ShowX to a new Mac = new local secret = all stations re-pair.
- **Explicit export:** SM Settings → "Export FOH identity" produces an encrypted `.showx-identity` file (AES-GCM, user-supplied passphrase). On a new Mac, "Import FOH identity" restores it → all device tokens remain valid.
- ShowX warns on export: "Anyone with this file + passphrase can impersonate this FOH and issue tokens to stations on your LAN."
- **NOT** included in `.showx` show packages — show files are portable independent of identity.

### 7.5 Key rotation (post-MVP)

- Bump `kid` from `v1` → `v2`; generate new key; keep old key during grace window.
- All new tokens signed with `v2`; verifier accepts both during grace; SM UI shows "Rotate complete" once last `v1` token is replaced (auto-renewals do this).
- MVP: single key, no rotation tooling. **Mark TODO in 0.2.**

---

## 8. Connection auth

### 8.1 Yjs WSS connect (sync broker)

Token is presented in the WebSocket handshake. Two paths, both supported:

**Preferred — Sec-WebSocket-Protocol header:**

```
GET /yjs/<show_id> HTTP/1.1
Upgrade: websocket
Sec-WebSocket-Protocol: showx-device-token.<token>
Sec-WebSocket-Key: ...
```

The server inspects the subprotocol, validates the token, and (if valid) echoes the subprotocol in response. Reason for preferred: avoids tokens in URL query strings (which leak into proxy logs, browser history).

**Fallback — query string** (some PWA wrapper libs don't expose subprotocol):

```
ws://showx.local:5300/yjs/<show_id>?token=<token>
```

Server accepts both. PWA SHOULD prefer subprotocol form.

### 8.2 Side-channel WSS (GO events, presence)

Same auth, separate endpoint:

```
ws://showx.local:5300/events/<show_id>?token=<token>
```

Subscribed channel set determined by `owned_departments` + `watched_departments` claims:
- All stations receive global GO events for departments they watch.
- Cue-fire authority gated by `owned_departments` ∩ cue.department.

### 8.3 HTTP REST API

```
Authorization: Bearer <token>
```

Endpoints under `/api/v1/` for: presence reporting, edit proposals, history queries, etc. (Defined in separate spec; this one only covers the auth layer.)

### 8.4 Server-side validation pipeline

On every connect / request:

```
1. Parse token; reject if not three segments.
2. Validate signature with local_secret + kid lookup. Constant-time compare.
3. Check exp; reject if expired (allow 30s clock skew).
4. Check nbf; reject if not-yet-valid (rare).
5. Check show_id matches currently-loaded show; reject if not.
6. Check jti against RevocationStore denylist; reject if revoked.
7. Check tier_at_issue against current license tier; if downgraded
   (e.g. token issued under Pro, license now Free), redact pro-only
   subscriptions but still allow Free-tier surface. Log warning.
8. Pass: attach { sub, owned_departments, watched_departments } to
   request/connection context for downstream RBAC.
```

### 8.5 Failure response

- HTTP: `401 Unauthorized` with body `{ error: "token_invalid", reason: "expired" | "revoked" | "wrong_show" | "bad_signature" }`.
- WSS: close with code `4401` (custom subprotocol close code) and reason string.
- PWA on 401/4401: clears local token if reason is `revoked` or `wrong_show`; for `expired` triggers refresh flow (§9.2); for `bad_signature` logs error + transitions to PAIRING state.

### 8.6 Reconnect backoff

- Initial reconnect: 250 ms.
- Exponential: ×1.5, capped at 8 s.
- Jitter: ±20 %.
- Reset on successful connect.

---

## 9. Token expiry + refresh

### 9.1 Default lifetimes

| Token type | TTL | Rationale |
|---|---|---|
| Device token | **30 days** | Long enough to span typical tour leg / theatre run + tech week; short enough to bound stale-device risk |
| Refresh window | **7 days before exp** | Station may request renewal during last 7 days |
| Hard expiry | **30 days inactive** | Beyond TTL with no refresh = full re-pair required |

### 9.2 Auto-renewal flow

```
┌─────────────┐                                  ┌─────────────┐
│  Station    │                                  │   ShowX     │
└──────┬──────┘                                  └──────┬──────┘
       │                                                │
       │  Periodic check: token.exp - now < 7 days?     │
       │                                                │
       │  POST /pairing/renew                           │
       │  Authorization: Bearer <current_token>         │
       │ ──────────────────────────────────────────────>│
       │                                                │
       │  Validate current token (same as §8.4).        │
       │  Bind new token to same sub + show_id +        │
       │  same owned/watched (no privilege escalation). │
       │  New jti, fresh iat/nbf/exp = now+30d.         │
       │                                                │
       │  200 OK { token: <new_token> }                 │
       │ <──────────────────────────────────────────────│
       │                                                │
       │  Station replaces token in IndexedDB.          │
       │  No SM interaction required.                   │
```

### 9.3 Renewal restrictions

- Cannot renew an expired token (must re-pair).
- Cannot renew a revoked token.
- Cannot escalate `owned_departments` via renew (RBAC change requires re-pair or SM-side edit).
- Cannot extend beyond hard cap: server refuses if cumulative continuous-renewal age exceeds 365 days; forces re-pair as freshness ritual. **OPEN QUESTION §18.5:** is 365 d the right cap?

### 9.4 SM-side edits to RBAC

SM can edit a device's `owned_departments` / `watched_departments` from the Devices panel:

- ShowX issues a new token with updated claims, binds it to same `sub`.
- Old token's `jti` added to revocation list (§10).
- Server pushes "claims updated" over the side-channel WSS topic; station fetches new token via `/pairing/refresh-claims` endpoint authenticated with the OLD token (atomic swap before revocation propagates) — **edge case timing**: server keeps old jti valid for 30 s after issuing new token to bridge the gap.

---

## 10. Revocation

### 10.1 SM UI — Devices panel

```
┌──────────────────────────────────────────────────────────────────┐
│  Devices paired to "Hamlet — Act 2"                              │
│                                                                  │
│  ● SM iPad           SM,*           last seen: now      [⋯]      │
│  ● LX-1 iPad (Marek) LX             last seen: 2s ago   [⋯]      │
│  ● VID-rack          VIDEO,AUTO     last seen: 5s ago   [⋯]      │
│  ○ Marek's MacBook   LX             last seen: 14h ago  [⋯]      │
│                                                                  │
│  [+ Add station]                                                 │
└──────────────────────────────────────────────────────────────────┘

Per-row actions (⋯):
 - Edit claims (owned/watched)
 - Rename
 - Force re-pair (revokes token, requires fresh PIN)
 - Revoke (token denylisted, device row tombstoned)
```

### 10.2 Revocation mechanism

```
┌─────────────┐                                  ┌─────────────┐
│  SM clicks  │                                  │ Other       │
│  "Revoke"   │                                  │ stations    │
└──────┬──────┘                                  └──────┬──────┘
       │                                                │
       │ 1. PairingStore.devices[id].revoked_at = now   │
       │ 2. RevocationStore.add(jti)                    │
       │ 3. broadcast revoke-event on side-channel WSS  │
       │ ──────────────────────────────────────────────>│
       │ 4. forcibly close any open Yjs / events WS for │
       │    that token                                  │
       │                                                │
                                                        │
                  ┌─────────────────┐                  │
                  │ Revoked station │ <────────────────┘
                  │ on next connect:│
                  │ 4401 → clears   │
                  │ token → re-pair │
                  │ UI              │
                  └─────────────────┘
```

### 10.3 RevocationStore

- Persistent denylist of revoked `jti` values + their original `exp`.
- Stored in Electron app data (`pairing/revocations.jsonl`), perms `0600`.
- Entries auto-purged when their original `exp` is past (token would be rejected anyway).
- Size bounded: worst case ~30-day rolling, even at 1 revoke/hour = 720 entries. JSON file is tiny.

### 10.4 Tombstones (deleted devices)

- "Revoke" tombstones the Device row but keeps it visible in UI under "Revoked" expandable section for 30 days (forensics).
- After 30 days, row pruned. Device record fully removed; if same operator pairs again, fresh `sub`.

### 10.5 Mass revoke (panic button)

- SM panel: "Revoke ALL stations" action with confirm-typed-confirmation (`type "REVOKE ALL" to confirm`).
- All non-FOH device tokens denylisted in one batch.
- Useful: end-of-tour cleanup, post-incident lockdown.
- FOH self (ShowX shell) is NOT a paired device; cannot be self-revoked.

---

## 11. Multi-show isolation

### 11.1 Show binding

- Every token has `show_id` in claims.
- ShowX has exactly one "currently loaded show" at any time (MVP).
- Connect attempts where token.show_id ≠ currently-loaded show → 4401.

### 11.2 Switching shows on FOH

- SM opens new `.showx` file → ShowX prompts "This will close current show. Stations will be disconnected and must re-pair."
- Confirm → ShowX unloads current show; stations connected to old show_id get 4401 closure; PWA transitions to PAIRING.

### 11.3 Station perspective

- PWA stores tokens per `show_id`: `IndexedDB.showx.auth.tokens[<show_id>] = token`.
- On boot, if it knows multiple shows, presents a chooser.
- Future MVP+ extension: cross-show identity (station = persistent operator, paired once, used across many shows). Spec'd post-1.0.

### 11.4 Why this is conservative

- MVP scope (`showx_mvp_scope.md` §"Must"): one show per session. Multi-show batch ops explicitly out of scope.
- Easier mental model for SMs migrating from QLab (one workspace at a time).

---

## 12. Failure modes

| Scenario | Behavior |
|---|---|
| Network partition during pairing (after offer, before claim) | PIN expires after 5 min; SM regenerates offer; no harm done |
| Network partition mid-claim (after SM Allow, before station gets token) | Server marked offer used + persisted Device; station retries claim (idempotent on `claim_id`) within 60 s; OR PWA shows "Pairing pending, retry from SM panel" with re-issue option |
| mDNS blocked on venue network | Manual host:port entry + PIN flow still works; UI shows "mDNS unreachable, enter ShowX address" hint |
| SM-side ShowX restart while stations connected | Stations reconnect with persisted tokens; tokens persist across restarts (PairingStore is on disk). WebSocket connections re-establish via §8.6 backoff |
| Local secret destroyed (Mac reset, keychain wipe) | All tokens become unverifiable → all stations get 4401 → all stations re-pair; SM sees "Stations rebuilding" notice on first launch |
| Lost device (operator's iPad stolen / damaged) | SM revokes via Devices panel → token denylisted → if attacker still has the iPad on LAN within `exp`, gets 4401 |
| Stale device after operator change | SM revokes; new operator pairs fresh |
| Forge MITM advertise (rogue ShowX on LAN claims to be ours) | Fingerprint check (§7.3) catches it: stations cache `fp` first time, refuse to accept token from different `fp` for same `show_id` |
| SM accidentally rejects legitimate device | Operator re-requests, SM allows |
| Offer leaked (screenshot, photographed QR) | 5-min expiry + SM-explicit-allow limit blast radius; attacker also needs to be on LAN |
| Brute-force PIN | Rate limit (§4.4) + single-use offer; expected work to brute = see §15.4 |

---

## 13. External OSC auth (separate concern)

OSC inputs (e.g. slave-mode where Eos sends GO to ShowX) are NOT station devices and use a simpler trust model:

### 13.1 IP whitelist + optional shared secret

- ShowX UI: "External OSC Sources" list under Routing module.
- Per-source entry: `{ source_ip: "10.0.1.10", optional_secret: "...", allowed_paths: ["/eos/go", "/eos/standby/*"] }`.
- Incoming OSC packet:
  - Source IP must match a whitelist entry.
  - If `optional_secret` configured, packet's last OSC string argument must equal the secret (constant-time compared).
  - OSC path must match an allowed pattern (glob).
- Failure: dropped + logged + alert badge in UI; 100 failures/min → source temp-banned for 5 min.

### 13.2 Why simpler than station pairing

- OSC sources are typically fixed hardware (lighting console, media server) with stable IPs and operator vetting.
- Stations are end-user devices (iPads, laptops) where the trust gradient is different.
- Performance: per-packet HMAC on OSC stream would add latency to cue fires; whitelist is O(1).

### 13.3 Out of scope here

- HMAC-signed OSC (post-MVP if customer demand).
- TLS-wrapped OSC (existing standard but niche).
- Per-source key rotation tooling.

---

## 14. Cloud account auth (Cloud Sync module — separate)

### 14.1 Activation

- User enables Cloud Sync module in ShowX module sidebar.
- Module's UI panel prompts: "Sign in to ShowX Cloud" → email/password or magic link via Supabase Auth.
- Successful auth → Supabase JWT stored in SecretStore (OS keychain).

### 14.2 Account model

- Supabase Auth user = ShowX Cloud account (1:1).
- One Supabase account → can hold many shows in cloud backup.
- Each cloud-synced show has a server-side `cloud_show_id` separate from local `show_id` (UUIDv7 may or may not match; mapping table in account row).

### 14.3 Cloud Sync session

When module is active:
- Adds a second Yjs provider to the active show: `y-websocket → wss://cloud.showx.app/yjs/<cloud_show_id>?token=<supabase_jwt>`.
- Supabase JWT carries claims for RLS-style access on PostgREST queries (cloud-side backup history, account billing).
- LAN broker remains primary; cloud is secondary provider. Either can survive alone.

### 14.4 Strict separation from venue auth

- Supabase JWT NEVER replaces a device token.
- Stations connected to LAN-only broker NEVER see Supabase JWTs.
- If Cloud Sync module is disabled or signed out, venue runtime continues unchanged.
- Multi-venue: one Supabase account → multiple `.showx` files in cloud backup; each opens locally with its own pairing flow.

### 14.5 Out of scope here

- Supabase RLS policy details (covered in Cloud Sync module spec, future).
- Multi-org / team accounts (post-MVP).
- SSO / SAML / OIDC (Enterprise tier, post-1.0).

---

## 15. Threat model

### 15.1 In-scope threats + mitigations

| Threat | Mitigation |
|---|---|
| **T1. Untrusted device on LAN attempts pairing without invitation** | PIN required (§4.4); SM-explicit-Allow modal (§5.5); rate limit on `/pairing/claim` |
| **T2. Stale token after device repurpose / loss** | SM revocation flow (§10); 30-day default exp (§9.1); periodic SM Devices review nudges in 0.2 |
| **T3. Eavesdropper on LAN reading Yjs traffic** | **NOT mitigated in MVP.** LAN trust assumed; encrypted WS via self-signed TLS is post-MVP work (see §15.3) |
| **T4. Replay attack of pairing request** | Per-claim `client_nonce` (§5.2); offer single-use; `expires_at`. Not enough to replay an offer once it's used |
| **T5. Replay attack of connection handshake (steal token + reconnect)** | Token has `exp`; revocation invalidates within seconds; per-WS connection assigned ephemeral connection_id (Yjs awareness layer) |
| **T6. Forged mDNS advertise (rogue ShowX on LAN)** | mDNS TXT `fp` fingerprint check (§2.1, §7.3); station refuses token from non-matching fp for known show_id |
| **T7. Brute-force PIN attack** | 1M keyspace + single-use + 5-min expiry + rate limit (§4.4, §15.4) |
| **T8. Compromised station device (operator's iPad rooted/leaks token)** | Token bounded to single show + revocable; periodic SM review surfaces unfamiliar devices |
| **T9. Offer interception (PIN shoulder-surf / QR photographed)** | SM-explicit-Allow modal forces confirmation; 5-min expiry + single-use limits blast radius |
| **T10. SM mistake (Allows wrong device)** | Reversible: SM revokes immediately; minimal blast radius (no edit of cues yet); SHOW mode lock prevents disasters |

### 15.2 Out-of-scope threats

| Threat | Why deferred |
|---|---|
| **Active TLS MITM on LAN** | LAN trust assumed in MVP. Theatre/corporate venues run private networks. TLS coverage is post-MVP plumbing (self-signed cert + station trust prompt) |
| **OS-level compromise of FOH Mac** | Game over: attacker has local_secret + can issue any token. Defense = OS-level (FileVault, MDM) |
| **Physical access to FOH** | Same as OS compromise. Out of scope |
| **DDoS on /pairing/claim** | LAN-only; if the LAN is hostile enough to DDoS your own FOH, you have bigger problems |
| **Side-channel timing on HMAC verify** | Constant-time compare used; advanced timing leaks ignored |
| **Quantum break of HS256** | Post-MVP. Algorithm-agility via `kid` already allows future rotation |

### 15.3 Post-MVP security hardening roadmap

1. **TLS on LAN** (0.2): self-signed cert generated at first boot; mDNS TXT publishes cert fingerprint; PWA pins on first install. Requires PWA install over `https://` (or service-worker-managed cert trust UX).
2. **2FA for SHOW mode unlock** (0.2): TOTP or hardware key prompts SM before un-locking SHOW.
3. **Per-station hardware attestation** (0.3+): WebAuthn challenge during pairing for high-security venues.
4. **Audit log export** (Enterprise): structured pairing + revocation + admin action log streamed to SIEM.

### 15.4 Brute-force PIN math

- 6-digit PIN: 10^6 = 1,000,000 candidates.
- Rate limit: 5/min per IP, 20/min global → 1,200/hour global.
- Single-use offer: at most 3 wrong guesses before offer invalidated (§5.3 step 4).
- Per-offer attack: probability = 3/1,000,000 = 0.0003%.
- Even with offer regeneration loop (attacker waits for SM to retry), attacker has at most ~12 retries before SM notices repeated failed-claim alerts in UI.
- Expected success per attack session: << 1 %. **Acceptable for MVP.**

---

## 16. Implementation notes

### 16.1 Library choices

| Need | Library | Rationale |
|---|---|---|
| HMAC signing | Node `crypto` (`createHmac`) | Stdlib, no dep |
| JWT compose/parse | `jose` (Panva) or hand-roll (it's just base64url + HMAC) | `jose` if we want algorithm-agility; hand-roll is 30 LOC |
| QR generation | `qrcode` (npm) | Standard, well-maintained |
| PIN entropy | `crypto.randomInt` | Stdlib |
| Keychain wrapper | `keytar` | Cross-platform; macOS Keychain Services backend |
| Bonjour / mDNS | `bonjour-service` (npm) | Already in stack per `showx_mvp_scope.md` |
| AES-GCM (export, at-rest encrypt) | Node `crypto.createCipheriv('aes-256-gcm', ...)` | Stdlib |
| Rate limit on /pairing/claim | `bottleneck` or simple in-memory token bucket | LAN-only — no need for Redis |

### 16.2 Shared services

- **`SecretStore`** — wraps keytar; exposes `getLocalSecret()`, `encryptAtRest(buf)`, `decryptAtRest(buf)`, `storeModuleSecret(moduleSlug, key, val)`, `getModuleSecret(moduleSlug, key)`.
- **`PairingStore`** — persistent device registry; exposes `addDevice(record)`, `getDevice(sub)`, `listDevices()`, `revokeDevice(sub)`, `updateClaims(sub, partial)`. Persistence to `pairing/devices.jsonl` + `pairing/revocations.jsonl` in Electron app data.
- **`PairingService`** — request handlers for `/pairing/claim`, `/pairing/renew`, `/pairing/refresh-claims`. Issues tokens via SecretStore-provided HMAC key.
- **`AuthMiddleware`** — connect-style middleware for HTTP routes; WebSocket equivalent for WSS upgrades. Implements §8.4.

Each is registered into `ModuleContext` (per `module_loader.md`) so modules can reuse them.

### 16.3 Pairing module surface in ShowX shell

Pairing is **not a module** — it's shared infrastructure (always-on). The shell UI exposes:
- **Devices panel** (top-level menu, not inside any module).
- **Pairing prompts** as system modals (Electron BrowserWindow modal child).
- **Status badge** in shell status bar showing connected device count.

### 16.4 Telemetry (opt-in, post-MVP)

- Count of pairing attempts (success / reject / expired).
- Median time SM took to Allow.
- Number of active devices per show.
- NO PIN values, NO claim contents, NO IPs.

---

## 17. UI flows (mockup-level)

### 17.1 ShowX "Add station" panel

```
┌─────────────── Add station ────────────────┐
│                                            │
│  Display name (optional)                   │
│  [LX-1 iPad (Marek)            ]           │
│                                            │
│  Owned departments                         │
│  [×LX] [+SX] [+VIDEO] [+AUTO] ...          │
│                                            │
│  Watched departments                       │
│  [×SX] [+VIDEO] ...                        │
│                                            │
│  ─────────────────────────────────────     │
│                                            │
│       ┌──────────────────────────┐         │
│       │                          │         │
│       │       [ QR code ]        │         │
│       │                          │         │
│       └──────────────────────────┘         │
│                                            │
│       PIN: 2 8 4 - 9 1 7                   │
│                                            │
│       Expires in 4:53                      │
│                                            │
│       Waiting for station…                 │
│                                            │
│       [Regenerate]            [Cancel]     │
└────────────────────────────────────────────┘
```

### 17.2 ShowX "Devices" list panel

```
┌──────────────────── Devices ────────────────────┐
│                                                 │
│  Show: Hamlet — Act 2                           │
│                                                 │
│  Active                                         │
│  ●  SM iPad           SM,*         now    [⋯]   │
│  ●  LX-1 iPad (Marek) LX           2s     [⋯]   │
│  ●  VID-rack          VIDEO,AUTO   5s     [⋯]   │
│  ○  Marek MacBook     LX           14h    [⋯]   │
│                                                 │
│  Revoked (last 30 days) ▼                       │
│                                                 │
│  ────                                           │
│  [+ Add station]    [Revoke ALL]                │
└─────────────────────────────────────────────────┘
```

### 17.3 PWA pairing journey

```
[Discovering ShowX…]
       │
       ▼
[Found "showx.local"]
[Select host →]
       │
       ▼
[Enter PIN ⬚⬚⬚-⬚⬚⬚   or   Scan QR]
       │
       ▼
[Confirm details:
  Name: LX-1 iPad (Marek)
  Departments: LX
  Watch: SX
  → Request access]
       │
       ▼
[Waiting for SM to approve…]
       │
       ├── (SM allows) ──▶ [Connecting…] ──▶ [Connected: Cuelist view]
       │
       ├── (SM rejects) ──▶ [Access denied. Ask SM and try again.]
       │
       └── (timeout)    ──▶ [SM didn't respond. Try again?]
```

### 17.4 PWA "Re-pair required" state

```
┌──────────────────────────────────────────┐
│  ⚠  Re-pairing required                  │
│                                          │
│  Your access was revoked or expired.     │
│  Ask the Stage Manager to add this       │
│  station again.                          │
│                                          │
│  Last known show: Hamlet — Act 2         │
│                                          │
│         [Re-pair]   [Switch show]        │
└──────────────────────────────────────────┘
```

---

## 18. Open questions

### 18.1 PIN length

6 digits feels light, but UX is significantly nicer than 8. Customer interviews pre-Kongres may want to push to 8 for theatre security policies. **Default: 6, configurable in advanced settings → "Strict pairing mode"** that bumps to 8 + raises rate limit from 5 → 3 per minute.

### 18.2 PWA token at-rest encryption

Encrypting the token in IndexedDB with a Web Crypto–derived key adds tiny defense-in-depth but is the kind of feature whose UX implications (lost browser data on iPad cache eviction → forced re-pair) need testing. **Default: clear-text, origin-locked, defer encryption to 0.2.**

### 18.3 HS256 vs ES256 for Companion bridge

If post-1.0 we ship a Companion bridge module that runs in a separate process or even a third-party machine, that verifier may need a pubkey. Switching to ES256 then requires version 2 of token spec with `kid` rotation handling. **Default: HS256 now, ES256 plan parked.**

### 18.4 QR scheme registration

Custom `showx://` scheme works inside the installed PWA (service worker can claim the scheme) but breaks for first-time installs from a fresh browser (no SW yet). Three options:
(a) Always use `https://showx.local:5300/pair?...` style; PWA intercepts after install. Needs TLS (post-MVP).
(b) `http://showx.local:5300/pair?...` for first install; works without TLS but browsers may warn.
(c) Two QR codes side-by-side ("install" and "pair").
**Default: option (b) — pragmatic for LAN. Revisit with TLS in 0.2.**

### 18.5 Cumulative renewal cap

365 days continuous-renewal cap forces a healthy re-pair ritual but may annoy long-term-install venues (year-round West End theatre). **Default: 365 d, opt-out via "Trusted install" setting that requires SM keychain backing.**

### 18.6 Multi-show-per-station post-MVP

How does a station that's paired to 5 shows present that to the operator? Show selector at boot, or auto-detect by mDNS show_id, or both? Drives Devices panel UX. **Out of MVP scope; revisit Q3 2027 with Cloud Sync module.**

### 18.7 Pairing during SHOW mode

Should SM be able to add a new station while SHOW is locked? Risk: rogue admit mid-show. Benefit: covers "iPad died, need new operator on the fly". **Default: ALLOWED but flagged with "SHOW mode is active — new station will be read-only until SM grants write" intermediate state.** Spec-TODO in SHOW mode module spec.

### 18.8 Token JWS lib

Hand-roll vs `jose` — hand-roll is 30 LOC, zero deps, easy to audit. `jose` is well-known, gives us future algorithm-agility cheaply. **Default: `jose` for forward-compat; revisit if dep weight matters.**

---

## 19. Test plan

### 19.1 Unit tests (Vitest, in `tests/unit/pairing/`)

- `token.spec.ts` — sign, verify happy path; tamper signature; tamper payload; expired; nbf-future; bad kid; constant-time signature compare.
- `pin.spec.ts` — generation entropy; format; single-use semantics; expiry; rate-limit bucket math.
- `secret_store.spec.ts` — keychain mock; first-boot generate; subsequent boot read; corrupted entry → regenerate + warn; encrypt/decrypt round-trip.
- `pairing_store.spec.ts` — add/get/list/revoke; persistence round-trip; tombstone TTL; revocations.jsonl prune.
- `auth_middleware.spec.ts` — each failure branch of §8.4 returns correct 401 reason; happy path attaches claims to context.
- `revocation.spec.ts` — jti denylist; auto-purge past-exp entries.

### 19.2 Integration tests (Vitest, mocked-network, `tests/unit/pairing-integration/`)

- Full pairing dance: generate offer → claim → SM allow → token issued → use token to open Yjs WSS connection (against an in-process broker mock).
- Renewal dance: issue short-TTL token → request renew during window → new token issued, old jti not revoked.
- Revocation dance: issue token → revoke → reconnect attempt receives 4401 → PWA-side state machine transitions to PAIRING.
- Reject path: SM rejects offer → station 403.
- Timeout path: SM ignores 60 s → station 408.
- Wrong-fp scenario: spoofed advertise with mismatched fp → station-side detection.

### 19.3 E2E tests (Playwright, `tests/e2e/pairing/`)

- Spin up real ShowX Electron process + 2 PWA browser contexts.
- Pair both PWAs via real QR scan (synthetic QR decode via Playwright) and real PIN entry.
- Confirm both PWAs connect to embedded Yjs broker and see each other's presence.
- Make an edit in one PWA, assert it propagates to the other.
- Revoke one PWA, assert it's force-disconnected and re-pair UI appears within 2 s.
- Restart ShowX, assert both PWAs reconnect transparently (token persistence).
- Mass revoke, assert all stations disconnect within 5 s.

### 19.4 Adversarial tests (`tests/unit/pairing/adversarial/`)

- Brute-force PIN: 1000 random guesses → assert none pass + offer auto-invalidated after 3 wrong.
- Token tamper: flip random bits, assert signature verify fails 100/100.
- Replay claim: replay a used `offer_id` → 410.
- Token swap across show_ids → 4401 wrong_show.
- Race revocation: revoke during in-flight WSS handshake → handshake aborts cleanly.

### 19.5 Acceptance criteria for §"DONE"

- All §19.1, §19.2, §19.3, §19.4 green.
- Manual test: full SM → operator handshake on real iPad + Mac on a real LAN, with mDNS, < 30 s from "Add station" click to "Connected" badge.
- Manual test: revoke during live edit → operator sees disconnection prompt within 3 s.
- Manual test: ShowX restart → all paired stations reconnect within 10 s of ShowX boot.

---

## End of spec
