---
id: "B001-009"
title: "PairingStore service + pairing flow API"
status: "done"
round: 2
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-06T08:30:00Z"
ended_at: "2026-06-06T08:50:00Z"
---

## Round 2 — Changes from Critic review

**Critic issue addressed:**

> (blocker) `src/shared/pairing/api.ts(70,43): error TS6133: 'req' is declared but its value is never read.`

Fixed by renaming `req` → `_req` in the POST `/pairing/initiate` handler signature (line 70), matching the convention already used on the GET `/pairing/devices` handler (line 121). One-character change; no behaviour change.

`pnpm --filter showx-main typecheck` now exits clean (0 errors).

## Summary

Implemented PairingStore service + pairing flow API for ShowX LAN-first device pairing.

## Files Changed

### New files
- `src/main/src/shared/pairing/types.ts` — DeviceRecord, TokenPayload, PinRecord, request/response types, TokenInvalidError, PinInvalidError
- `src/main/src/shared/pairing/tokenManager.ts` — HMAC-SHA256 JWT-like token sign/validate, revocation set, secret auto-generation via SecretStore
- `src/main/src/shared/pairing/pinManager.ts` — cryptographically random 6-digit PINs, single-use, 5-min TTL, per-IP rate limiting (5/min), collision retry
- `src/main/src/shared/PairingStore.ts` — device registry persisted via PersistedStore (Zod schema v1), in-memory Map for fast lookup
- `src/main/src/shared/pairing/api.ts` — mountPairingRoutes(router, deps): POST /pairing/initiate, POST /pairing/claim, GET /pairing/devices, DELETE /pairing/devices/:id
- `tests/unit/shared/pairing/tokenManager.test.ts` — 10 tests
- `tests/unit/shared/pairing/pinManager.test.ts` — 10 tests
- `tests/unit/shared/PairingStore.test.ts` — 8 tests
- `tests/unit/shared/pairing/api.test.ts` — 9 tests

### Modified files
- `src/main/package.json` — added `qrcode: "^1.5.3"` (dep) and `@types/qrcode: "^1.5.5"` (devDep)
- `package.json` (root) — added `express: "^4.18.2"` and `@types/express` to root devDeps (required for api.test.ts which imports express directly in test setup)
- `src/main/src/shared/index.ts` — added exports for PairingStore, TokenManager, PinManager, mountPairingRoutes, and all pairing types
- `src/main/src/shared/pairing/api.ts` — (round 2) renamed unused `req` → `_req` on POST /pairing/initiate handler (TS6133 fix)

## Tests Run

```
Test Files  24 passed (24)
      Tests  234 passed (234)
   Start at  08:35:48
   Duration  2.18s
```

Typecheck: `pnpm --filter showx-main typecheck` — 0 errors.

## Acceptance Criteria Coverage

- ✅ PairingStore persists devices via PersistedStore under slug 'pairing' (key 'pairing.devices')
- ✅ DeviceRecord schema: device_id, display_name, owned_departments[], tier, last_seen, token_hash, created_at, revoked_at?
- ✅ tokenManager.sign() returns HMAC-SHA256 JWT-like envelope (header.payload.sig, base64url)
- ✅ tokenManager.validate() returns decoded payload or throws TokenInvalidError with reason
- ✅ tokenManager.revoke(deviceId) marks as revoked; validate() throws revoked
- ✅ HMAC secret read from SecretStore key 'pairing.hmac_secret'; auto-generated (32 random bytes base64) on first init
- ✅ pinManager.generate() → {pin: '######', expiresAt}; cryptographically random; leading-zero padded
- ✅ pinManager.claim(pin, sourceIp) → single-use; expires after 5 min; rate-limited 5/min/IP (checks BEFORE pin lookup)
- ✅ HTTP routes: POST /pairing/initiate, POST /pairing/claim, GET /pairing/devices, DELETE /pairing/devices/:id
- ✅ Tests cover: sign/validate round-trip, expired, bad_sig, revoked, malformed, PIN expiry, PIN single-use, rate-limit, full HTTP flow

## Decisions Made Within Task Scope

**1. PinManagerImpl constructor injection for randomInt**
Injected `randomIntFn` as optional constructor parameter (defaults to `crypto.randomInt`). Reason: Node's native `crypto.randomInt` is non-configurable and cannot be spied on via `vi.spyOn`. The injection makes the "assert by mocking" test requirement achievable while production code still uses `crypto.randomInt` exclusively.

**2. PersistedStore API adaptation**
Task spec pseudocode used `store.get('pairing.devices')` but the actual PersistedStore interface has `load(schema)` / `save(value)`. Implemented with Zod schema wrapping `DeviceRecord[]` as `{ devices: DeviceRecord[] }`.

**3. authAdmin middleware — local bypass**
Added optional `localSecret?: string` to `PairingApiDeps` for Electron shell bypass. Marked with `TODO(B001-011)` for B001-011 to wire a real per-boot random secret.

**4. express added to root devDependencies**
api.test.ts imports express directly; vitest runs from root. Added express + @types/express to root devDeps to match existing pattern.

## Notes for Critic

- All round-1 security observations remain unchanged.
- Single fix this round: `req` → `_req` on line 70 of `api.ts`. No behaviour change.
- `pnpm --filter showx-main typecheck` exits clean.
- Full 234-test suite green, no regressions.
