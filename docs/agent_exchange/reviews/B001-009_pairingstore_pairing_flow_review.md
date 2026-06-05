---
id: "B001-009"
critic_started_at: "2026-06-06T08:55:00Z"
critic_completed_at: "2026-06-06T09:00:00Z"
verdict: "accepted"
review_round: 2
prior_verdict: "changes_requested (round 1)"
---

## Summary

Round 2 addresses the single round-1 blocker (TS6133 unused `req` parameter on POST `/pairing/initiate`). One-character rename to `_req` matches the convention already used on GET `/pairing/devices`. Typecheck now exits clean; full vitest suite green (234/234); pairing subsuite 37/37. All security-critical round-1 observations remain valid and unchanged. Task accepted.

## Acceptance criteria check (round 2 re-verification)

- [x] **PairingStore persists devices via PersistedStore under namespace 'pairing.devices'** → `src/main/src/shared/PairingStore.ts:27-37` (`PairingDataSchema` wraps `{ devices: DeviceRecord[] }` under slug `'pairing'`).
- [x] **Device record schema** → `src/main/src/shared/pairing/types.ts:1-10` — all required fields present.
- [x] **tokenManager.sign() HS256 base64url envelope** → `src/main/src/shared/pairing/tokenManager.ts:43-52`.
- [x] **tokenManager.validate() throws TokenInvalidError with reason** → `tokenManager.ts:54-92` covers `malformed`, `bad_sig`, `expired`, `revoked`.
- [x] **revoke marks revoked; subsequent validate throws revoked** → `tokenManager.ts:94-96, 87-89`.
- [x] **HMAC secret read from SecretStore key 'pairing.hmac_secret'; 32 random bytes auto-gen on first init** → `tokenManager.ts:34-41`.
- [x] **pinManager.generate() — 6-digit padded, cryptographically random** → `pinManager.ts:38` uses `crypto.randomInt(0, 1_000_000)`. Zero `Math.random` occurrences in file (Grep clean).
- [x] **pinManager.claim — single-use, 5-min TTL, 5/min/IP rate limit** → `pinManager.ts:52-68, 11-13, 81-95`; rate check runs BEFORE pin lookup (`pinManager.ts:54`).
- [x] **HTTP routes POST /pairing/initiate, POST /pairing/claim, GET /pairing/devices, DELETE /pairing/devices/:id** → `api.ts:70, 88, 121, 125`.
- [x] **Vitest covers sign/validate, expired, bad_sig, revoked, malformed, PIN expiry/single-use/rate-limit, full HTTP flow** → 37 tests, all pass.

## Round-2 diff inspection

Single change in `src/main/src/shared/pairing/api.ts:70`:

```diff
- router.post('/pairing/initiate', async (req: express.Request, res: express.Response) => {
+ router.post('/pairing/initiate', async (_req: express.Request, res: express.Response) => {
```

No behaviour change; no other files modified. Confirmed by reading `api.ts` end-to-end — handler body still references only `res`, `deps.pins`, `deps.hostInfo`, `deps.logger`. No semantic implication.

## Verification commands run

| Command | Result |
|---|---|
| `pnpm --filter showx-main typecheck` | 0 errors (exit clean — was the round-1 blocker) |
| `pnpm vitest run tests/unit/shared/PairingStore tests/unit/shared/pairing` | 4 files, 37 tests passed |
| `pnpm vitest run` (full suite) | 24 files, 234 tests passed |

## Security-critical items (carried forward from round 1, re-verified)

1. **`crypto.timingSafeEqual` for sig comparison** → `tokenManager.ts:69-72` with length guard. ✅
2. **Secret encoding consistency** (base64 in/out) → `tokenManager.ts:37, 40`. ✅
3. **PIN entropy from `crypto.randomInt`** → `pinManager.ts:38`. ✅
4. **Rate-limit BEFORE pin lookup** → `pinManager.ts:54` precedes `this.pins.get(pin)` on line 56. ✅
5. **Revoked devices repopulated on init** → `PairingStore.ts:50-54` re-emits `tokens.revoke(d.device_id)` for every persisted device with `revoked_at` set. ✅
6. **`authAdmin` local-secret bypass is presence + match gated, not presence-only** → `api.ts:30-36`. ✅
7. **`crypto.randomUUID()` (no external dep)** → `api.ts:95`. ✅

## Carry-forward notes (non-blocking, surfaced for next bundle)

These were called out in round 1 and remain documented here so they're not lost:

- `api.ts:30-36` localSecret comparison uses `===` rather than `crypto.timingSafeEqual`. Per-boot random 128-bit token on LAN — risk is low; promote to constant-time compare when B001-011 wires the real secret if convenient.
- `pinManager.ts` rateLimit map has no eviction — bounded by station count on a LAN; document for v2 hardening.
- `token_hash` is computed and persisted (`api.ts:98, 100-107`) but no current code path reads it back. Spec describes it as "used for revoke lookup"; carrying it forward is fine — no functional gap today.
- `PairingStoreImpl.resolveToken` reuses `TokenInvalidError('bad_sig')` for the "structurally-valid token but no in-memory device" case. The four-reason enum is closed by spec; this is a reasonable proxy.
- `req.ip` will need `trust proxy` configuration once B001-011 wires AssetServer behind any local proxy; for direct LAN use this is fine.

## Verdict rationale

`accepted` — round 1 changes_requested was a single one-line typecheck blocker. Round 2 fixed it precisely, no scope expansion, no other diffs. Typecheck clean, 234/234 tests pass. All round-1 security verifications carry forward unchanged.

Task is ready to accept.
