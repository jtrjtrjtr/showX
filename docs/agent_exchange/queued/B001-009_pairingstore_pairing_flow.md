---
id: "B001-009"
title: "PairingStore service + pairing flow API"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B001-002", "B001-004"]
target_files:
  - "src/main/src/shared/PairingStore.ts"
  - "src/main/src/shared/pairing/tokenManager.ts"
  - "src/main/src/shared/pairing/pinManager.ts"
  - "src/main/src/shared/pairing/api.ts"
  - "src/main/src/shared/pairing/types.ts"
  - "tests/unit/shared/PairingStore.test.ts"
  - "tests/unit/shared/pairing/tokenManager.test.ts"
  - "tests/unit/shared/pairing/pinManager.test.ts"
  - "tests/unit/shared/pairing/api.test.ts"
acceptance_criteria:
  - "PairingStore persists paired devices via PersistedStore under namespace 'pairing.devices'"
  - "Device record schema: { device_id, display_name, owned_departments[], tier, last_seen, token_hash, created_at }"
  - "tokenManager.sign(payload) returns HMAC-SHA256 JWT-like envelope (header.payload.sig, all base64url)"
  - "tokenManager.validate(token) returns decoded payload or throws TokenInvalidError with reason (expired / bad_sig / malformed / revoked)"
  - "tokenManager.revoke(deviceId) marks token_hash as revoked; subsequent validate() throws revoked"
  - "Local HMAC secret read from SecretStore under key 'pairing.hmac_secret'; auto-generated (32 random bytes) on first init if absent"
  - "pinManager.generate() → { pin: '######', expiresAt }; pin is cryptographically random 6 digits with leading-zero allowed"
  - "pinManager.claim(pin, deviceInfo) → token; single-use; expires after 5 minutes; rate-limited to 5 attempts per minute per source IP"
  - "HTTP routes mounted on AssetServer router: POST /pairing/initiate, POST /pairing/claim, GET /pairing/devices, DELETE /pairing/devices/:id"
  - "Vitest tests cover: token sign/validate round-trip, expired token, bad sig, revoked token, PIN expiry, PIN single-use, rate-limit, full HTTP flow"
---

## Context

ShowX runs LAN-first. Stations (PWA on iPad / phone / laptop) must pair to the FOH Mac without any cloud round-trip, then re-authenticate on every reconnect. The pairing flow:

1. Operator on ShowX clicks "Add station" → ShowX generates a 6-digit PIN + QR code containing the PIN + ShowX host:port.
2. Station scans QR (or operator types PIN) → station POSTs `/pairing/claim` with the PIN and the desired device info.
3. ShowX validates PIN + issues a long-lived signed token. Token is stored on the station (IndexedDB in PWA).
4. Future requests from that station carry the token in `Authorization: Bearer ...` header.

The token is HMAC-signed by a per-install secret kept in the OS keychain (via SecretStore from B001-004). No external CA, no public-key infra — this is LAN-only auth.

This task implements PairingStore + the three helper managers + the HTTP route surface. Routes are mounted onto AssetServer's express router (from B001-005). AssetServer ownership of the HTTP server stays unchanged; this task only ADDS routes.

## Implementation notes

### Dependencies (add to `src/main/package.json`)

```
"qrcode": "^1.5.3"
```

(crypto + express come from Node stdlib + AssetServer's existing express dep.)

### `src/main/src/shared/pairing/types.ts`

```ts
export interface DeviceRecord {
  device_id: string;                 // uuid v4
  display_name: string;              // user-set, e.g. "SM iPad"
  owned_departments: string[];       // ["SM"], ["LX","SET"], or [] for admin
  tier: 'free' | 'pro';              // mirrors install tier at pairing time
  last_seen: number | null;          // ms epoch
  token_hash: string;                // sha256 of issued token; used for revoke lookup
  created_at: number;
  revoked_at?: number;
}

export interface TokenPayload {
  device_id: string;
  display_name: string;
  owned_departments: string[];
  tier: 'free' | 'pro';
  iat: number;                       // issued-at (seconds)
  exp?: number;                      // optional expiry (seconds). v1 = no expiry (revoke list is source of truth).
}

export interface PinRecord {
  pin: string;                       // 6 digits
  expires_at: number;                // ms epoch (now + 5 min)
  claimed_at: number | null;         // null until claim consumed
  attempts: number;                  // failed claim attempts
}

export interface InitiateRequest {
  display_name?: string;             // station may pre-fill or leave blank
}
export interface InitiateResponse {
  pin: string;
  expires_at: number;
  qr_data_url: string;               // data:image/png;base64,...
  pair_url: string;                  // showx://pair?pin=######&host=...&port=...
}

export interface ClaimRequest {
  pin: string;
  display_name: string;
  owned_departments?: string[];
}
export interface ClaimResponse {
  token: string;
  device: DeviceRecord;
}

export class TokenInvalidError extends Error {
  constructor(public reason: 'expired' | 'bad_sig' | 'malformed' | 'revoked') { super(reason); }
}
export class PinInvalidError extends Error {
  constructor(public reason: 'expired' | 'wrong' | 'already_claimed' | 'rate_limited') { super(reason); }
}
```

### `src/main/src/shared/pairing/tokenManager.ts`

```ts
import * as crypto from 'node:crypto';
import type { SecretStore } from 'showx-shared';
import { TokenPayload, TokenInvalidError } from './types.js';

const SECRET_KEY = 'pairing.hmac_secret';

export interface TokenManager {
  init(): Promise<void>;
  sign(payload: Omit<TokenPayload, 'iat'>): string;
  validate(token: string): TokenPayload;
  revoke(deviceId: string): Promise<void>;
  isRevoked(deviceId: string): boolean;
  hashToken(token: string): string;       // sha256 hex; for PairingStore.token_hash
}

export class TokenManagerImpl implements TokenManager {
  private secret: Buffer | null = null;
  private revokedDeviceIds = new Set<string>();
  constructor(private secretStore: SecretStore) {}

  async init() {
    let s = await this.secretStore.get(SECRET_KEY);
    if (!s) { s = crypto.randomBytes(32).toString('base64'); await this.secretStore.set(SECRET_KEY, s); }
    this.secret = Buffer.from(s, 'base64');
  }

  sign(payload) {
    const header = { alg: 'HS256', typ: 'SHOWX1' };
    const fullPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
    const h = base64url(JSON.stringify(header));
    const p = base64url(JSON.stringify(fullPayload));
    const sig = base64url(crypto.createHmac('sha256', this.secret!).update(`${h}.${p}`).digest());
    return `${h}.${p}.${sig}`;
  }

  validate(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new TokenInvalidError('malformed');
    const [h, p, sig] = parts;
    const expected = base64url(crypto.createHmac('sha256', this.secret!).update(`${h}.${p}`).digest());
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new TokenInvalidError('bad_sig');
    const payload = JSON.parse(base64urlDecode(p)) as TokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new TokenInvalidError('expired');
    if (this.revokedDeviceIds.has(payload.device_id)) throw new TokenInvalidError('revoked');
    return payload;
  }

  async revoke(deviceId) { this.revokedDeviceIds.add(deviceId); }
  isRevoked(deviceId)    { return this.revokedDeviceIds.has(deviceId); }
  hashToken(token)       { return crypto.createHash('sha256').update(token).digest('hex'); }
}
```

`base64url` helpers: strip `=`, replace `+` → `-`, `/` → `_`.

### `src/main/src/shared/pairing/pinManager.ts`

```ts
export interface PinManager {
  generate(): PinRecord;                              // create + store in memory
  claim(pin: string, sourceIp: string): PinRecord;    // throws PinInvalidError; marks claimed
  cleanupExpired(): void;                             // called via setInterval(60_000)
  // diagnostic
  activePinCount(): number;
}

class PinManagerImpl implements PinManager {
  private pins = new Map<string, PinRecord>();
  private rateLimit = new Map<string, { count: number; windowStart: number }>(); // sourceIp → window
  private readonly TTL_MS = 5 * 60 * 1000;
  private readonly RATE_MAX = 5;
  private readonly RATE_WINDOW_MS = 60 * 1000;

  generate() {
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const rec = { pin, expires_at: Date.now() + this.TTL_MS, claimed_at: null, attempts: 0 };
    this.pins.set(pin, rec);
    return rec;
  }

  claim(pin, sourceIp) {
    // rate limit FIRST so wrong-pin spam doesn't enumerate
    this.checkRate(sourceIp);
    const rec = this.pins.get(pin);
    if (!rec) throw new PinInvalidError('wrong');
    if (rec.expires_at < Date.now()) { this.pins.delete(pin); throw new PinInvalidError('expired'); }
    if (rec.claimed_at !== null) throw new PinInvalidError('already_claimed');
    rec.claimed_at = Date.now();
    return rec;
  }

  private checkRate(ip) { ... per-IP fixed-window counter; throw PinInvalidError('rate_limited') }
}
```

Use `crypto.randomInt` (Node 14+), NOT `Math.random`. PINs MAY collide on regeneration — if collision, regenerate up to 5 times then throw.

### `src/main/src/shared/PairingStore.ts`

```ts
export interface PairingStore {
  init(): Promise<void>;
  listDevices(): DeviceRecord[];
  getDevice(deviceId: string): DeviceRecord | null;
  addDevice(d: Omit<DeviceRecord, 'created_at' | 'last_seen'>): Promise<DeviceRecord>;
  updateLastSeen(deviceId: string, now?: number): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
  resolveToken(token: string): DeviceRecord;          // validates + returns device; throws on bad
}

class PairingStoreImpl implements PairingStore {
  private devices = new Map<string, DeviceRecord>();
  constructor(
    private store: PersistedStore,
    private tokens: TokenManager,
  ) {}

  async init() {
    const blob = await this.store.get('pairing.devices') ?? [];
    for (const d of blob) {
      this.devices.set(d.device_id, d);
      if (d.revoked_at) this.tokens.revoke(d.device_id);
    }
  }

  // ... CRUD methods write back via this.store.set('pairing.devices', [...this.devices.values()])
}
```

### `src/main/src/shared/pairing/api.ts`

Mounts on an existing express Router given to it by AssetServer:

```ts
export interface PairingApiDeps {
  pairing: PairingStore;
  pins: PinManager;
  tokens: TokenManager;
  hostInfo: { host: string; port: number };     // for QR pair URL
  logger: Logger;
}

export function mountPairingRoutes(router: express.Router, deps: PairingApiDeps): void {
  router.post('/pairing/initiate', async (req, res) => {
    const rec = deps.pins.generate();
    const pairUrl = `showx://pair?pin=${rec.pin}&host=${encodeURIComponent(deps.hostInfo.host)}&port=${deps.hostInfo.port}`;
    const qr = await QRCode.toDataURL(pairUrl, { width: 256 });
    res.json({ pin: rec.pin, expires_at: rec.expires_at, qr_data_url: qr, pair_url: pairUrl });
  });

  router.post('/pairing/claim', async (req, res) => {
    try {
      const { pin, display_name, owned_departments = [] } = req.body as ClaimRequest;
      const sourceIp = req.ip ?? 'unknown';
      deps.pins.claim(pin, sourceIp);
      const device_id = crypto.randomUUID();
      const tier = 'free' as const;          // v1 — Pro detection in later task
      const token = deps.tokens.sign({ device_id, display_name, owned_departments, tier });
      const token_hash = deps.tokens.hashToken(token);
      const device = await deps.pairing.addDevice({
        device_id, display_name, owned_departments, tier, token_hash,
      });
      deps.logger.info('pairing.claim.ok', { device_id, display_name });
      res.json({ token, device });
    } catch (e) {
      if (e instanceof PinInvalidError) return res.status(401).json({ error: e.reason });
      throw e;
    }
  });

  router.get('/pairing/devices', authAdmin, (req, res) => {
    res.json(deps.pairing.listDevices());
  });

  router.delete('/pairing/devices/:id', authAdmin, async (req, res) => {
    await deps.pairing.revokeDevice(req.params.id);
    res.json({ ok: true });
  });
}
```

`authAdmin` is a tiny middleware that reads `Authorization: Bearer <token>`, validates via tokens.validate, and 401s if not present / not admin. For v1 "admin" = device with `owned_departments.length === 0`. Local request from Electron itself (origin = localhost loopback + special header) is also admin — Shell will pass a local-only secret on its own internal calls. Document this assumption in code comments; full local-call auth is in a future task.

### Wiring expectations (NOT done here — for Critic awareness)

B001-011 (Shell) will:
1. `tokenManager.init(secretStore)`
2. `pinManager` constructed
3. `pairingStore.init(persistedStore, tokenManager)`
4. `mountPairingRoutes(assetServer.router, { pairing, pins, tokens, hostInfo, logger })`

Modules receive `context.pairing.resolveToken(t)` so HTTP/WS endpoints they expose can authenticate stations themselves.

## Refer to specs

- `docs/specs/pairing_auth.md` — binding. The token envelope, PIN lifetime, revocation semantics, and route surface in this task MUST match that spec. If Forge spots a contradiction during implementation, STOP and flag in done report rather than diverging.

## Test plan

`tests/unit/shared/pairing/tokenManager.test.ts`
- sign then validate → returns identical payload (minus the always-added `iat`)
- tamper with payload base64 → bad_sig
- tamper with sig → bad_sig
- truncate to 2 parts → malformed
- payload with `exp` in past → expired
- revoke(deviceId) then validate token for that device → revoked
- `hashToken(t)` is deterministic + 64 hex chars
- Two TokenManager instances with the SAME secret produce inter-validatable tokens (proves secret-only dependency)

`tests/unit/shared/pairing/pinManager.test.ts`
- `generate()` returns 6-digit string, expires 5 min in future
- `claim(pin)` ok once → second `claim` of same pin → already_claimed
- Wait past expiry (mock `Date.now()`) → expired
- 6 claim attempts from same IP within 60s → 6th throws rate_limited
- `cleanupExpired()` removes expired records
- Generated PINs use crypto.randomInt (assert by mocking and confirming call)

`tests/unit/shared/PairingStore.test.ts`
- init with empty PersistedStore → 0 devices
- addDevice → listDevices returns 1; persistence call made
- updateLastSeen → device.last_seen updated + persisted
- revokeDevice → device.revoked_at set + tokenManager.revoke called
- resolveToken(validToken) → returns device; resolveToken(revokedToken) → throws revoked

`tests/unit/shared/pairing/api.test.ts`
- Spin up a temp express app with the routes mounted + in-memory deps (test doubles for PersistedStore/SecretStore via `node:fs` tmp dir or pure in-memory impls).
- POST /pairing/initiate → 200 + valid PIN format + qr_data_url starts with `data:image/png;base64,`
- POST /pairing/claim with that PIN → 200 + token + device record; claim same PIN again → 401 already_claimed
- POST /pairing/claim with wrong PIN → 401 wrong
- GET /pairing/devices without auth → 401
- GET /pairing/devices with admin token → 200 array with 1 device
- DELETE /pairing/devices/:id with admin → 200; subsequent token validate → revoked

Run: `pnpm --filter showx-main test tests/unit/shared/PairingStore tests/unit/shared/pairing`

## Out of scope

- Pro-tier detection at claim time (defer; everything is 'free' for now)
- Token expiry rotation (v1 = no `exp`; revoke list is source of truth)
- Multi-admin permission model (v1 = "no owned_departments" = admin)
- Remote (cloud) revoke push — Cloud Sync module will own
- Front-end QR display UI (B001-011 IPC wires it, but UI polish later)
- Migration from BridgeX 0.3.x device list (handled in ShowX-2 absorption)
- WebSocket auth handshake (SyncBroker has its own; B001-006 owns)

## Notes for Critic

- Verify `crypto.timingSafeEqual` is used for sig comparison — NOT `===`. This is the most common HMAC mistake.
- Verify the HMAC secret is generated with `crypto.randomBytes(32)` and stored base64 in SecretStore. NOT base64url, NOT hex — just base64. SecretStore is opaque so any encoding works, but pick one and stick with it.
- PINs MUST come from `crypto.randomInt`, NOT `Math.random`. Grep for `Math.random` in pinManager.ts — should be 0 hits.
- Rate limit MUST check before pin lookup, otherwise an attacker can enumerate PINs by timing the lookup.
- Verify `POST /pairing/claim` reads `req.ip` correctly (express `trust proxy` setting may matter — document the assumption).
- Confirm the `revokedDeviceIds` set is repopulated from PersistedStore on init, otherwise a restart re-enables revoked devices.
- `crypto.randomUUID()` requires Node 14.17+ / 16+ — ShowX targets Node 20 per B001-001 so fine, but call it out if Forge tries to add an external uuid package.
- The `authAdmin` middleware is a small surface but security-critical — read it carefully and confirm the local-loopback bypass is gated by a real secret, not just by header presence.
