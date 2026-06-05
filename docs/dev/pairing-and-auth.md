# Pairing and Auth

This is the developer tour of the ShowX authentication model. The canonical contract is `docs/specs/pairing_auth.md` — when these pages disagree, that spec wins.

## 1. Two-context model

ShowX uses **two distinct authentication contexts** that must never be conflated.

### 1.1 Venue auth — LAN-only, REQUIRED for runtime

- ShowX-issued **HMAC device tokens** bound to a single show + station device.
- Replaces username/password with an **SM-driven QR + 6-digit-PIN handshake** initiated at the FOH.
- Per-station, per-device, **revocable** trust.
- **No cloud round-trip** during pairing — all crypto is local. ShowX never phones home for venue auth.
- A station with a valid token connects to: the embedded Yjs WSS broker (sync), the side-channel WSS (GO events, presence), HTTP endpoints (asset server, REST control plane).

### 1.2 Cloud account auth — Supabase, OPTIONAL

- Activated **only** when the user enables the **Cloud Sync module** (Pro+ tier).
- Supabase email/password or magic link → Supabase JWT.
- Used for: show file backup, cross-venue access, opt-in remote collab proxy, multi-venue billing.
- **ShowX runs a complete show without ever seeing a Supabase token.** Venue runtime is fully self-contained.

### 1.3 Hard rules

- Venue auth credentials **NEVER leave the LAN**.
- Cloud account credentials **NEVER gate runtime** — the SM can run a show with the Supabase service offline, expired, or never signed up.
- Device tokens are scoped to a single `show_id`. Switching shows = re-pair (MVP). Post-MVP, station-level multi-show is a feature.
- All pairing approval requires an **explicit SM click** in the ShowX shell UI. No silent grants.

## 2. HMAC-SHA256 device token format

Tokens are compact JWS — three base64url segments joined by `.`:

```
<header_b64>.<payload_b64>.<signature_b64>
```

### Header

```json
{
  "alg": "HS256",
  "typ": "showx-device",
  "kid": "v1"
}
```

`kid` lets us rotate the local HMAC key without invalidating in-flight tokens during a grace period (post-MVP).

### Payload

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
| `iss` | always `showx-foh` for venue tokens; distinguishes from Supabase JWTs |
| `show_id` | UUIDv7; token tied to one show |
| `owned_departments` | RBAC: which department's cue-fire authority |
| `watched_departments` | UI scope only; not a security boundary |
| `tier_at_issue` | informational; tier re-checked at connect time |
| `iat`, `nbf`, `exp` | epoch seconds; default `exp = iat + 30 days` |
| `jti` | UUIDv7; used for revocation by token id |

### Signature

```
HMAC-SHA256(header_b64 + "." + payload_b64, local_secret_kv1) → base64url
```

Library: Node `crypto.createHmac('sha256', ...)`. Verifier: same. PWA does NOT verify signatures (it's the bearer, not the auditor) — server-only authority.

### Why HS256, not RS256/ES256?

- LAN-local issuer + LAN-local verifier (both inside the same Electron process).
- Asymmetric crypto adds complexity for zero gain.
- No third-party verifier needs the pubkey.
- HMAC is faster + has smaller signatures (fewer bytes on every Yjs reconnect).

If Companion-bridge or other module ever needs to verify ShowX tokens out-of-process, revisit. Currently moot.

## 3. The local secret

The HMAC key:

- **256-bit** via `crypto.randomBytes(32)`.
- Generated **once** on first ShowX boot ever on this Mac (or on explicit reset).
- Stored in **macOS Keychain** under service `cz.xlab.showx`, account `local-secret-v1`.
- Wrapped behind the `SecretStore` shared service (`keytar` backend; falls back to AES-256-GCM-encrypted file `secrets.enc` if `SHOWX_SKIP_KEYTAR=1`).

Derived uses:

| Purpose | Operation |
|---|---|
| Sign device tokens | `HMAC-SHA256` over header+payload |
| mDNS fingerprint | `fp = SHA256("showx-fp-v1" || local_secret).hex` — published in TXT, cached by stations to detect host substitution |
| Encrypt at-rest sensitive fields | AES-256-GCM with key derived via HKDF |

### Backup + portability

- Local secret is part of the FOH machine's identity. Moving ShowX to a new Mac = new local secret = all stations re-pair.
- **Explicit export:** SM Settings → "Export FOH identity" produces an AES-GCM encrypted `.showx-identity` file (passphrase-locked). Importing on a new Mac restores all device tokens.
- NOT included in `.showx` show packages — show files are portable independent of identity.

### Key rotation (post-MVP)

Bump `kid` v1 → v2; keep old key during grace; SM UI shows progress. MVP: single key, no rotation tooling.

## 4. Pairing flow

```
   SM iPad / LX laptop              SM at FOH                 ShowX shell
   ──────────────────                ─────────                ─────────────
                                          │                        │
                                          │  1. Click "Add station"│
                                          │ ──────────────────────►│
                                          │                        │
                                          │  2. Generate PIN + QR  │
                                          │                        │     PairingOffer
                                          │                        │     pendingOffers[]
                                          │                        │     (in-memory only)
                                          │  3. Show QR + PIN UI   │
                                          │ ◄──────────────────────│
                                          │                        │
                                          │  4. Show countdown 5min│
                                          │                        │
   ────────────────────────────────────────                        │
   5. Operator scans QR                                            │
      or types PIN manually                                        │
                                                                   │
   6. POST /pairing/claim                                          │
      { offer_id, pin, fp,                                         │
        claimed_display_name,                                      │
        claimed_owned_departments,                                 │
        claimed_watched_departments,                               │
        client_nonce, client_metadata }                            │
   ────────────────────────────────────────────────────────────►   │
                                                                   │
                                          │   7. SM modal prompt:  │
                                          │ ◄──────────────────────│
                                          │   "Allow LX-1 iPad?"   │
                                          │                        │
                                          │   8. SM clicks Allow   │
                                          │ ──────────────────────►│
                                          │                        │
                                          │   9. Server issues HMAC│
                                          │      token, persists   │
                                          │      Device record     │
                                          │                        │
   10. 200 OK                                                      │
       { token, station_id, token_expires_at,                      │
         owned_departments, watched_departments,                   │
         show_id, yjs_endpoint, events_endpoint }                  │
   ◄────────────────────────────────────────────────────────────────
   
   11. Station stores token in IndexedDB
       under showx.auth.tokens[show_id]
   
   12. Station connects to Yjs WSS + side-channel WSS
```

### Pairing offer

When SM clicks "Add station", ShowX generates:

```typescript
interface PairingOffer {
  pin: string;          // 6-digit decimal, crypto-random
  pin_hash: string;     // SHA-256(pin) stored server-side; pin itself NOT persisted
  offer_id: string;     // UUIDv7
  show_id: string;      // currently-loaded show
  fp: string;           // SHA-256 of local-secret-derived pubkey (matches mDNS TXT)
  host: string;         // hostname or IP
  port: number;
  expires_at: number;   // epoch ms, default now + 5 min
  proposed_display_name: string | null;
  proposed_owned_departments: string[];
  proposed_watched_departments: string[];
  used: boolean;        // false; flips true on successful claim
}
```

Stored **in-memory** in PairingStore's `pendingOffers` map (NOT persisted to disk — survives only the ShowX process lifetime). On restart, in-flight offers are dropped (rare; SM regenerates).

### QR encoding

```
showx://pair?host=192.168.1.50&port=5300&pin=284917&fp=a3f9...c1&offer=01J8H...
```

The PIN is in the URL because the QR is the convenience path. SM **explicit Allow** in step 8 prevents a leaked QR from granting access by itself.

### PIN properties

- **Length:** 6 decimal digits → 10^6 keyspace.
- **Generation:** `crypto.randomInt(0, 999_999)` zero-padded.
- **Single-use:** flips `used = true` on first successful claim; subsequent attempts return 410 Gone.
- **Expiry:** 5 min.
- **Rate limit on claim:** max 5 attempts per IP per minute, max 20 globally per minute on the pairing endpoint.

## 5. Token expiry, renewal, revocation

### 5.1 Default lifetimes

| Token type | TTL | Rationale |
|---|---|---|
| Device token | **30 days** | Long enough for tour leg + tech week; short enough to bound stale-device risk |
| Refresh window | **last 7 days before exp** | Station may request renewal |
| Hard expiry | **30 days inactive** | Beyond TTL with no refresh = full re-pair |

### 5.2 Auto-renewal

```
Station periodic check: token.exp - now < 7 days?

  POST /pairing/renew
  Authorization: Bearer <current_token>

  → Validate current token (same as connect-time §6)
  → Bind new token to same sub + show_id + same owned/watched (NO escalation)
  → New jti, fresh iat/nbf/exp = now+30d

  200 OK { token: <new_token> }

  Station replaces token in IndexedDB. No SM interaction.
```

Restrictions:

- Cannot renew an expired token (must re-pair).
- Cannot renew a revoked token.
- Cannot escalate `owned_departments` via renew (requires re-pair or SM-side edit).
- Hard cap: server refuses if cumulative continuous-renewal age exceeds 365 days; forces re-pair as freshness ritual.

### 5.3 Revocation

```
SM clicks Revoke
   ↓
1. PairingStore.devices[id].revoked_at = now
2. RevocationStore.add(jti)
3. broadcast revoke-event on side-channel WSS
4. forcibly close any open Yjs / events WS for that token

Revoked station on next connect:
   4401 → clears token → re-pair UI
```

`RevocationStore`: persistent denylist of revoked `jti` + their original `exp`. Stored in `pairing/revocations.jsonl` (Electron app data, perms `0600`). Entries auto-purged when original `exp` is past.

**Mass revoke (panic button):** SM panel offers "Revoke ALL stations" with typed confirmation. End-of-tour cleanup, post-incident lockdown.

### 5.4 SM-side RBAC edits

SM editing a device's `owned_departments`:

- ShowX issues new token with updated claims, same `sub`.
- Old `jti` → revocation list.
- Server pushes "claims updated" over side-channel WSS; station fetches new token via `/pairing/refresh-claims` authenticated with the OLD token (atomic swap).
- Old jti valid for 30 s after issuing new token to bridge the gap.

## 6. Connection auth

### 6.1 Yjs WSS connect

Two paths, both supported. **Subprotocol preferred** (no token in URL → no proxy log leak):

```
GET /yjs/<show_id> HTTP/1.1
Upgrade: websocket
Sec-WebSocket-Protocol: showx-device-token.<token>
Sec-WebSocket-Key: ...
```

Fallback — query string:

```
ws://showx.local:5300/yjs/<show_id>?token=<token>
```

### 6.2 Side-channel WSS

Same auth, separate endpoint:

```
ws://showx.local:5300/events/<show_id>?token=<token>
```

### 6.3 HTTP REST

```
Authorization: Bearer <token>
```

### 6.4 Server-side validation pipeline

On every connect / request:

```
1. Parse token; reject if not three segments.
2. Validate signature with local_secret + kid lookup. Constant-time compare.
3. Check exp; reject if expired (allow 30s clock skew).
4. Check nbf; reject if not-yet-valid (rare).
5. Check show_id matches currently-loaded show; reject if not.
6. Check jti against RevocationStore denylist; reject if revoked.
7. Check tier_at_issue against current license; on downgrade, redact pro-only
   surface but still allow Free-tier scope. Log warning.
8. Pass: attach { sub, owned_departments, watched_departments } to request
   context for downstream RBAC.
```

### 6.5 Failure response

- HTTP: `401 Unauthorized` with body `{ error: "token_invalid", reason: "expired"|"revoked"|"wrong_show"|"bad_signature" }`.
- WSS: close with code `4401` (custom) and reason string.
- PWA on 401/4401: clears local token if `revoked`/`wrong_show`; on `expired` triggers refresh; on `bad_signature` clears token + transitions to PAIRING.

### 6.6 Reconnect backoff

- Initial: 250 ms.
- Exponential ×1.5, cap 8 s.
- Jitter ±20 %.
- Reset on success.

## 7. Token scopes

```typescript
type Scope = 'yjs' | 'events' | 'catalog' | 'go' | 'edit:meta' | 'edit:cue' | 'lock' | 'pair';
```

| Scope | Grants |
|---|---|
| `yjs` | Connect to Yjs WSS endpoint |
| `events` | Connect to side-channel WSS endpoint |
| `catalog` | Read `/show/<id>/cue-catalog.json` |
| `go` | Send `station-go` on side-channel (operator GO press) |
| `edit:meta` | Edit show metadata (REHEARSAL only) |
| `edit:cue` | Edit cue structure (REHEARSAL only) |
| `lock` | Toggle SHOW mode (SM-only) |
| `pair` | Generate new pairing PINs (SM-only) |

Default scopes by role:

- **SM** = all scopes.
- **Department op** = `yjs`, `events`, `catalog`, `go`, `edit:meta`, `edit:cue`.
- **Watcher (no GO)** = `yjs`, `events`, `catalog`.

## 8. External OSC IN security

OSC inputs (e.g. Eos sending GO to ShowX) are NOT station devices and use a simpler trust model: per-source IP whitelist + optional shared secret.

### IP whitelist

```jsonc
{
  "ip_whitelist": ["127.0.0.1", "10.0.1.0/24", "192.168.1.50"]
}
```

Default: `["127.0.0.1", "::1"]` only.

### Shared-secret prefix

```jsonc
{
  "shared_secret": "s3cret-string-here",
  "secret_arg_slot": 0    // first OSC arg; stripped before dispatch
}
```

Default: disabled. When enabled, ShowX checks slot 0 of inbound packet for exact match (constant-time compare); rejects + logs at debug otherwise.

Failures of both gates → dropped. Either alone suffices; configurable per rule.

### Special: external cue fire

`/showx/cue/fire` ALWAYS requires shared secret regardless of IP whitelist (defense-in-depth — operators may inadvertently whitelist a wide CIDR). In SHOW mode, additionally requires the **lock-time fire secret** (rotated on each show-lock). Opt-in toggle.

### Why simpler than station pairing

- OSC sources are typically fixed hardware (lighting console, media server) with stable IPs and operator vetting.
- Stations are end-user devices (iPads, laptops) where the trust gradient is different.
- Performance: per-packet HMAC on OSC stream would add latency to cue fires; whitelist is O(1).

## 9. Cloud Sync module Supabase auth (post-MVP, 0.3+)

When Cloud Sync module is loaded:

- User signs into Supabase via the module's UI (OAuth or email/password).
- Supabase session token persisted in macOS Keychain (`cz.xlab.showx` / `cloud_supabase_session`).
- Cloud sync module uses session for second Yjs provider connection + show backup REST calls.

### Strict separation from venue auth

- Supabase JWT **NEVER** replaces a device token.
- Stations connected to LAN-only broker NEVER see Supabase JWTs.
- If Cloud Sync is disabled or signed out, venue runtime continues unchanged.
- Multi-venue: one Supabase account → multiple `.showx` files in cloud backup; each opens locally with its own pairing flow.

## 10. Threat model summary

| # | Threat | Mitigation |
|---|---|---|
| T1 | Untrusted device on LAN attempts pairing | PIN required; SM-explicit-Allow modal; rate limit on `/pairing/claim` |
| T2 | Stale token after device repurpose / loss | SM revocation; 30-day default `exp`; periodic SM review nudges in 0.2 |
| T3 | Eavesdropper reading Yjs traffic on LAN | **NOT mitigated in MVP.** LAN trust assumed. TLS via self-signed cert is post-MVP (0.2) |
| T4 | Replay of pairing request | Per-claim `client_nonce`; offer single-use; `expires_at` |
| T5 | Replay of connection handshake (stolen token) | Token has `exp`; revocation invalidates in seconds |
| T6 | Forged mDNS advertise (rogue ShowX) | mDNS TXT `fp` fingerprint check; station refuses token from non-matching fp for known show |
| T7 | Brute-force PIN | 1M keyspace + single-use + 5-min expiry + rate limit |
| T8 | Compromised station device (rooted iPad leaks token) | Token bounded to single show + revocable; periodic SM review |
| T9 | Offer interception (PIN shoulder-surf, QR photographed) | SM-explicit-Allow modal; 5-min expiry + single-use limits blast radius |
| T10 | SM mistake (Allows wrong device) | Reversible: SM revokes; minimal blast radius (no cue edit yet); SHOW mode lock prevents disasters |

### Out-of-scope threats

| # | Threat | Why deferred |
|---|---|---|
| — | Active TLS MITM on LAN | LAN trust assumed in MVP. Theatre + corporate venues run private networks. TLS is post-MVP (0.2). |
| — | OS-level compromise of FOH Mac | Game over: attacker has local_secret + can issue any token. Defense = OS-level (FileVault, MDM). |
| — | Physical access to FOH | Same as OS compromise. |
| — | DDoS on `/pairing/claim` | LAN-only; if the LAN is hostile enough to DDoS the FOH, you have bigger problems. |
| — | Side-channel timing on HMAC verify | Constant-time compare used; advanced timing leaks ignored. |
| — | Quantum break of HS256 | Post-MVP. `kid` enables future rotation. |

### Brute-force PIN math

- 6-digit PIN: 10^6 = 1,000,000 candidates.
- Rate limit: 5/min per IP, 20/min global → 1,200/hour global.
- Single-use offer: at most 3 wrong guesses before offer invalidated.
- Per-offer attack: probability = 3/1,000,000 = 0.0003%.
- Even with offer regeneration loop, attacker has ~12 retries before SM notices repeated failed-claim alerts.
- Expected success per attack session: << 1 %. **Acceptable for MVP.**

### Post-MVP hardening roadmap

1. **TLS on LAN (0.2)** — self-signed cert at first boot; mDNS TXT publishes cert fingerprint; PWA pins on first install.
2. **2FA for SHOW mode unlock (0.2)** — TOTP or hardware key prompts SM before un-locking SHOW.
3. **Per-station hardware attestation (0.3+)** — WebAuthn challenge during pairing for high-security venues.
4. **Audit log export (Enterprise)** — structured pairing + revocation + admin action log streamed to SIEM.

## 11. Multi-show isolation (MVP)

- Every token has `show_id` in claims.
- ShowX has exactly one "currently loaded show" at any time (MVP).
- Connect attempts where `token.show_id` ≠ currently-loaded → 4401.
- Switching shows on FOH: SM confirms → stations connected to old show get 4401; PWA transitions to PAIRING.
- PWA stores tokens per `show_id`: `IndexedDB.showx.auth.tokens[<show_id>] = token`.

Cross-show identity (station = persistent operator paired once, used across many shows) is spec'd post-1.0.

## 12. Further reading

- `docs/specs/pairing_auth.md` — full canonical spec (binding)
- `docs/dev/protocol-reference.md` §"WSS endpoints" + §"HTTP endpoints" — connection-time auth shapes
- `docs/dev/architecture.md` §"The big picture" — where PairingStore + SecretStore sit
- `src/types/module.ts` — `PairingStore` + `SecretStore` shared service interfaces
