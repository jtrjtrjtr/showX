# Protocol Reference

This is the developer-friendly tour of ShowX's wire protocols and in-process event surface. The canonical contract is `docs/specs/protocol_dictionary.md` — when these pages disagree, that spec wins.

There are **three layers**:

| # | Layer | Transport | Participants |
|---|---|---|---|
| 1 | **In-process** | TypeScript EventBus | Module ↔ shell ↔ dispatcher |
| 2 | **LAN station ↔ shell** | WSS (Yjs + side-channel) + HTTP | Electron app ↔ PWA stations |
| 3 | **External tools ↔ shell** | OSC UDP, MIDI, MSC, DMX, Webhook | Electron app ↔ Companion / Eos / MA3 / QLab / Disguise |

## 1. Default ports + endpoints

| Service | Transport | Default endpoint | Configurable | Purpose |
|---|---|---|---|---|
| Asset HTTP + Yjs sync + side-channel | TCP, port 5300 | `0.0.0.0:5300` | yes | Single port for HTTP + both WSS paths |
| OSC IN | UDP, port 5305 | `0.0.0.0:5305` | yes | External tools → ShowX |
| OSC OUT | UDP, per destination | varies | per output | ShowX → external tools |
| mDNS advertise | UDP multicast | `_showx._tcp.local` | TXT records | Discovery |
| MIDI IN/OUT | OS MIDI ports | configurable port name | per output | Console GO triggers, MSC out |
| DMX OUT | Art-Net (UDP 6454) / sACN (UDP 5568) | per universe | per output | Direct DMX (rare) |

**Why one TCP port for everything?** Minimises firewall config on venue networks. HTTP, Yjs `wss://...../yjs/...`, and side-channel `wss://...../events/...` share port 5300.

## 2. Layer 1 — In-process events (TypeScript)

The shared EventBus is typed. Module authors subscribe via `ctx.events.subscribe('event-name', handler)` and publish via `ctx.events.publish({ type: 'event-name', ... })`.

### 2.1 Event base envelope

Every event in the canonical `ShowXEvents` map carries:

```typescript
interface BaseEnvelope {
  seq: number;        // monotonic per-process
  ts: number;         // int64 ms since epoch, FOH clock
  source: string;     // module slug emitting (set by bus, not sender)
}
```

### 2.2 Canonical event names + publishers

| Event | Payload extends | Published by | Subscribed by |
|---|---|---|---|
| `cue-standby` | `{ show_id, cuelist_id, cue_id, cue_label, departments, standby_note? }` | Cuelist Core | Protocol dispatcher → `/showx/cue/standby`; side-channel WSS → stations; SHOW mode (history log) |
| `cue-fire` | `{ show_id, cuelist_id, cue_id, cue_label, departments, payloads, fired_by, trigger_mode }` | Cuelist Core | Dispatcher; side-channel WSS; SHOW mode; Custom Router |
| `cue-complete` | `{ show_id, cuelist_id, cue_id, duration_ms, success, errors? }` | Dispatcher (after all payloads resolve) | Cuelist Core (auto-follow); side-channel WSS; SHOW mode |
| `cuelist-go` | `{ show_id, cuelist_id, next_cue_id, by_operator_id }` | Cuelist Core / external OSC IN | Cuelist Core (compute next cue); dispatcher → OSC |
| `cuelist-stop` / `cuelist-pause` / `cuelist-resume` | `{ show_id, cuelist_id, by_operator_id }` | Cuelist Core | Dispatcher; all stations |
| `cuelist-playhead` | `{ show_id, cuelist_id, cue_id, index }` | Cuelist Core | Side-channel WSS; Custom Router |
| `show-mode-change` | `{ show_id, mode, by_operator_id }` | SHOW mode module | All modules; side-channel WSS |
| `show-lock` / `show-unlock` | `{ show_id, by_operator_id, snapshot_id? }` | SHOW mode module | All modules; side-channel; history.jsonl writer |
| `station-paired` | `{ station_id, device_name, owned_departments, watched_departments }` | PairingStore | UI shell; side-channel; mDNS service (refresh TXT) |
| `station-presence-update` | `{ station_id, online, last_seen_ts, signal }` | Side-channel WSS receiver | UI shell; HealthBus |
| `system-heartbeat` | `{ uptime_ms, module_health }` | Shell (every 1 s) | HealthBus; side-channel broadcast; OSC OUT (optional) |
| `system-error` | `{ module, severity, code, message, context? }` | Any module | HealthBus; history.jsonl; Logger sink |
| `eventx-channel-update` | `{ plugin, channel_id, value, channel_type }` | EventX Bridge module | Custom Router; optional OSC OUT mapping |

### 2.3 Dispatch ordering when `cue-fire` is emitted

1. Dispatcher receives synchronously.
2. Dispatcher iterates `payloads[]` in array order, sends each through its transport.
3. When all payloads resolve (success or transport error), dispatcher emits `cue-complete`.
4. Side-channel WSS broadcasts `cue-fire` to all stations **immediately** — does NOT wait for dispatcher.
5. SHOW mode (if loaded) appends `cue_fired` to `history.jsonl` on `cue-fire` AND `cue-complete`.

## 3. Layer 3 — OSC dictionary

### 3.1 Namespace conventions

All ShowX-defined OSC addresses live under `/showx/`. Sub-namespaces:

| Sub-namespace | Owner | Semantics |
|---|---|---|
| `/showx/cue/...` | Cuelist Core | Individual cue lifecycle |
| `/showx/cuelist/...` | Cuelist Core | Cuelist transport (go, stop, pause, resume, goto, playhead) |
| `/showx/show/...` | SHOW mode | Show-level state (mode, lock, unlock) |
| `/showx/station/...` | Pairing / shell | Station lifecycle |
| `/showx/system/...` | Shell | Heartbeat, errors, version |
| `/showx/eventx/...` | EventX Bridge | Channel value mirror (optional) |
| `/showx/router/...` | Custom Router | User-defined custom routes |

External tools MUST NOT send to addresses outside `/showx/` and expect routing — ShowX ignores non-`/showx/*` inbound traffic by default. Custom Router rules can listen for arbitrary patterns; that's rule-author responsibility.

### 3.2 OSC OUT (ShowX → external)

Every OUT packet includes a **trailing string** identifying the source ShowX instance: `"showx://<hostname>/<show_id>"`. Lets downstream tools disambiguate when multiple ShowX instances share a network.

| Address | Args | Fired when | Downstream |
|---|---|---|---|
| `/showx/cue/standby` | `,sssshis` cue_id, cue_label, departments_csv, standby_note, ts(h), seq(i), source | SM clicks STANDBY / cuelist auto-advances | Companion, Eos pending list |
| `/showx/cue/fire` | `,ssssshis` cue_id, cue_label, departments_csv, trigger_mode, ts(h), seq(i), source | `cue-fire` event emitted | Companion (feedback), Disguise, QLab slave |
| `/showx/cue/complete` | `,siihis` cue_id, duration_ms(i), success(i), ts(h), seq(i), source | All payloads resolved | History loggers, Companion |
| `/showx/cuelist/go` | `,ssshis` cuelist_id, next_cue_id, by_operator_id, ts(h), seq(i), source | SM (or remote OSC IN) issues GO | External GO mirrors |
| `/showx/cuelist/stop` | `,sshis` cuelist_id, by_operator_id, ts(h), seq(i), source | Transport stop | — |
| `/showx/cuelist/pause` | (same) | Transport pause | — |
| `/showx/cuelist/resume` | (same) | Transport resume | — |
| `/showx/cuelist/playhead` | `,ssihis` cuelist_id, current_cue_id, index(i), ts(h), seq(i), source | Playhead moves | Paper tape display, Companion |
| `/showx/show/mode` | `,sssshis` show_id, mode, by_operator_id, ts(h), seq(i), source | SHOW mode transitions | Eos macros, Companion theme |
| `/showx/show/lock` / `unlock` | `,ssshis` show_id, by_operator_id, snapshot_id, ts(h), seq(i), source | SHOW mode lock/unlock | — |
| `/showx/station/paired` | `,sssshis` station_id, device_name, owned_csv, watched_csv, ts(h), seq(i), source | PairingStore confirms new station | Ops dashboard |
| `/showx/system/heartbeat` | `,ssiihis` showx_version, protocol_version, uptime_s, station_count_online, ts(h), seq(i), source | Every 5 s (configurable 1–60 s) | External watchdog |

Example packet:

```
/showx/cue/fire  ,ssssh is  "01J8H...A1" "Q 11" "LX,SX" "manual" 1735574522300 4232 "showx://foh-mac.local/01J8...SHOW"
```

### 3.3 OSC IN (external → ShowX)

ShowX listens on UDP 5305 by default. All inbound is gated by either:

- **IP whitelist** (default: loopback + configured allow-list)
- **Shared-secret prefix** (optional per-rule: first OSC arg = secret, stripped before dispatch)

Failures: silently dropped, logged at debug.

| Address | Args | Action | Auth |
|---|---|---|---|
| `/showx/cuelist/go` | `,s[s]` cuelist_id (`""` = active), optional shared_secret | Emit `cuelist-go` | IP whitelist OR secret |
| `/showx/cuelist/stop` / `pause` / `resume` | (same) | Emit corresponding event | (same) |
| `/showx/cuelist/goto` | `,ss[s]` cuelist_id, cue_id_or_label, optional secret | Move playhead, emit `cuelist-playhead` | (same) |
| `/showx/cue/fire` | `,ss` cue_id (UUIDv7 only), **REQUIRED** shared_secret | Direct fire bypassing playhead. Emergency automation only. | ALWAYS secret. In SHOW mode also requires lock-time fire secret. Opt-in toggle. |
| `/showx/system/ping` | `,s` request_id | Reply with `/showx/system/pong ,ssi` request_id, showx_version, uptime_s | Open (no auth) |

### 3.4 Payload-type → transport dispatch

The Cuelist Core emits `cue-fire` with `payloads: Payload[]`. The dispatcher resolves per payload type:

| Payload | How resolved |
|---|---|
| `osc` | Direct passthrough. `device_ref` → routing table → `{ host, port, encoding }`. |
| `lx_ref` | Per-console pattern. Eos: `/eos/cue/{list}/{number}/fire`. MA3: `/cmd ,s "GO Cue {n} List {l}"`. Hog 4: `/hog/playback/go/{list}.{number}`. |
| `msc` | SysEx `F0 7F <device_id> 02 <command_format> <command> <cue_number> 00 <cue_list> 00 F7`. Written to MIDI port. |
| `midi` | Raw bytes to MIDI port via `port_ref`. |
| `webhook` | Electron `net.request` POST/PUT/GET with optional JSON body. 3 s default timeout. |
| `wait` | Internal delay; `setTimeout` for `seconds`, then continue. |
| `group` | Recursive expansion of `children[]` cue refs. Cycle detection refuses to recurse into a cue in the current call stack. |

For MSC: ShowX is a **controller**, NOT a slave in 0.1 (slave mode is post-MVP via Custom Router input rule).

## 4. Layer 2 — WSS endpoints

Two parallel WebSocket paths on port 5300:

### 4.1 Yjs sync

```
ws://showx.local:5300/yjs/<show_id>?token=<pairing_token>
```

- One WS per station per show.
- Binary frames, payload = standard Yjs sync messages (sync step 1/2, update messages).
- Sub-protocol: `y-websocket-v1` (compatible with canonical `y-websocket` Node module).
- ShowX hosts one `Y.Doc` per show; broker rebroadcasts updates.
- Stations persist via `y-indexeddb`; full replica per station.
- Awareness protocol carries presence (`{ operator_id, station_id, role, focus_cue_id, color }`).

**Auth at connect time:**

1. Token absent → HTTP 401 on upgrade.
2. Token expired / revoked → HTTP 403.
3. Token's `station_id` already connected from different socket → kick previous, accept new (logged).

### 4.2 Side-channel events (NOT in CRDT)

```
ws://showx.local:5300/events/<show_id>?token=<pairing_token>
```

JSON envelopes (UTF-8 text frames):

```json
{
  "topic": "go" | "standby" | "presence" | "heartbeat" | "system" | "cue-complete" | "show-mode" | "lock",
  "seq": 4231,
  "ts": 1735574522300,
  "payload": { /* topic-specific */ }
}
```

| Topic | Direction | Payload | Purpose |
|---|---|---|---|
| `go` | shell → stations | `{ cuelist_id, cue_id, fired_by, trigger_mode }` | GO event broadcast (mirrors `cue-fire`) |
| `standby` | shell → stations | `{ cuelist_id, cue_id, standby_note }` | Standby broadcast |
| `cue-complete` | shell → stations | `{ cuelist_id, cue_id, success, duration_ms }` | Completion broadcast |
| `presence` | shell ↔ stations | `{ station_id, online, signal, last_seen_ts }` | Online/offline + station heartbeats |
| `heartbeat` | shell → stations | `{ uptime_ms, module_health }` | Every 5 s |
| `system` | shell → stations | `{ severity, code, message, context }` | Errors / warnings |
| `show-mode` | shell → stations | `{ mode, by_operator_id }` | Mode transitions |
| `lock` | shell → stations | `{ locked: bool, by_operator_id, snapshot_id? }` | SHOW mode lock/unlock |
| `station-go` | stations → shell | `{ cuelist_id }` | Operator GO press from station (requires `go` scope) |

#### Idempotency + reconnect

Stations track `last_seen_seq` per topic. On reconnect:

```json
{ "type": "resume", "since_seq": 4220 }
```

Shell replays missed messages from a ring buffer (default 1024 per topic). Older → `{ "type": "gap", "from_seq": 4220, "to_seq": 4231 }`; station should reconcile via Yjs full sync.

**Cue fires are NEVER re-fired on reconnect.** Stations treat replayed `go` messages as **history**, not commands. Visual cue-fire animations check `(ts < now - 5000ms) ? render_as_history : render_as_live`.

## 5. Layer 2 — HTTP endpoints

All served from port 5300.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/` | PWA bundle `index.html` | None (LAN-only; bundle is public) |
| `GET` | `/assets/...` | PWA static assets (JS, CSS, fonts) | None |
| `GET` | `/pairing` | Pairing UI (QR scanner + PIN entry) | None |
| `POST` | `/pairing/claim` | Exchange PIN for device token | PIN body |
| `POST` | `/pairing/initiate` | (SM-only) Generate a new pairing offer | SM-scope token |
| `GET` | `/pairing/devices` | List paired devices (SM panel) | SM-scope token |
| `POST` | `/pairing/renew` | Refresh a token within 7d of expiry | Current token |
| `GET` | `/show/<show_id>/cue-catalog.json` | Cue catalog for routing UI | Pairing token |
| `GET` | `/show/<show_id>/meta.json` | Show metadata | Pairing token |
| `GET` | `/system/health` | Liveness probe `{ status, version, uptime_seconds }` | None |
| `GET` | `/system/version` | Detailed version + module manifest + deprecated[] list | None |

### Pairing claim shape

Request to `POST /pairing/claim`:

```json
{
  "pin": "473829",
  "device_name": "LX Desk iPad",
  "preferred_role": "lx_op",
  "client_version": "0.5.0"
}
```

Success (HTTP 200):

```json
{
  "token": "showx_pair_eyJhbGc...",
  "token_expires_at": 1738166522300,
  "station_id": "01J8H6Z...",
  "owned_departments": [],
  "watched_departments": ["LX"],
  "show_id": "01J8H6A...",
  "yjs_endpoint": "ws://showx.local:5300/yjs/01J8H6A...",
  "events_endpoint": "ws://showx.local:5300/events/01J8H6A..."
}
```

Failures:

- `400` — invalid PIN format
- `401` — PIN incorrect or expired (valid 10 minutes; max 5 attempts per PIN before 60 s rate-limit lockout)
- `403` — pairing disabled / maintenance mode

See `pairing-and-auth.md` for the full flow including SM confirmation modal, token format, and renewal.

## 6. mDNS service descriptor

| Field | Value |
|---|---|
| Service type | `_showx._tcp.local` |
| Port | `5300` (default; reflects asset HTTP port) |
| Hostname | `showx.local` (or user-configured) |
| Instance name | `<show_title> on <hostname>` (e.g. `"Hamlet on foh-mac.local"`) |

TXT records:

| Key | Value | Description |
|---|---|---|
| `v` | `0.5.0` | ShowX semver |
| `proto` | `1` | Pairing protocol version |
| `protocol` | `1.0` | Protocol dictionary version (this doc) |
| `role` | `foh-server` | Reserved for future federation (foh-relay, foh-mirror) |
| `tier` | `free` / `pro` / `production` / `team` | Loaded license tier |
| `show_id` | UUIDv7 | Active show ID, or empty if none |
| `show_title` | string ≤ 64 chars ASCII | Human-readable |
| `stations_online` | int | Count of paired + online stations |
| `pairing_open` | `0` / `1` | Whether new stations can pair now |
| `lock_state` | `rehearsal` / `show` | Current SHOW mode state |
| `fp` | SHA-256 hex (64 chars) | Fingerprint of FOH local-secret-derived pubkey — stations verify against cached on reconnect (MITM detection) |
| `roles` | comma-list of slugs | Loaded modules (`eventx-bridge,cuelist-core,show-mode`) |
| `bundle_id` | `cz.xlab.showx` | macOS bundle identifier |

### Re-advertise cadence

- Initial: at shell boot (after asset server ready).
- TXT update: on every meaningful state change (`stations_online`, `lock_state`, `show_id`). Throttled to 1 update / 2 s minimum.
- De-advertise: on shell shutdown (graceful) or LaunchAgent stop.

### Fallback for non-mDNS networks

Many corporate / hotel / conference networks block mDNS. ShowX must:

- Support **manual entry** (`host:port` typed in station UI).
- Pairing **QR encodes host+port** (bypasses discovery entirely).
- After 3 s mDNS timeout, station auto-pivots to manual entry hint.

## 7. Version handshake (post-MVP)

The protocol dictionary itself is versioned: `protocol_version = "1.0"` for ShowX 0.1.

Emitted in:

- `/showx/system/heartbeat` (slot 2)
- mDNS TXT (`protocol` key)
- HTTP `GET /system/version` body
- WSS side-channel `heartbeat` payload

### Backwards-compat rules

- Adding new OSC addresses, WSS topics, event names, payload types → **minor bump** (`1.0` → `1.1`). Consumers ignore unknown safely.
- Renaming or removing any field, address, topic, event → **MAJOR bump** (`1.x` → `2.0`). Requires migration in show file format + station code.
- Changing OSC argument types or order on an existing address → MAJOR bump.

### Deprecation policy

- Deprecated addresses / topics / events MUST remain functional for at least **2 minor versions**.
- Deprecation logged at WARN when ShowX dispatches.
- Visible in `/system/version` under `deprecated[]`.

### Negotiation handshake — FUTURE

OPEN: Should stations negotiate protocol version on Yjs connect (send `client_protocol_version` in `Sec-WebSocket-Protocol`) so older PWAs can connect to newer shells? **Future (0.2).** For 0.1, version mismatch is detected at runtime via heartbeat — shell sends `system` topic warning if the station's heartbeat indicates an older PWA.

## 8. Cheat sheet — service ports

| Port | Transport | Purpose |
|---|---|---|
| 5300 | TCP / HTTP + WSS | Asset server, Yjs sync, side-channel, pairing UI, health probe |
| 5305 | UDP | OSC IN |
| (per output) | UDP | OSC OUT to configured destination |
| 5353 | UDP multicast | mDNS / Bonjour |
| 6454 | UDP | Art-Net (if direct DMX enabled) |
| 5568 | UDP multicast | sACN (if direct DMX enabled) |

## 9. Department enum (frozen for 0.1)

```typescript
type Department = 'LX' | 'SX' | 'VIDEO' | 'AUTO' | 'PYRO' | 'FS' | 'SM' | 'OTHER';
```

| Code | Meaning |
|---|---|
| `LX` | Lighting |
| `SX` | Sound |
| `VIDEO` | Video / projection / media server |
| `AUTO` | Automation (rigging, set moves) |
| `PYRO` | Pyrotechnics / SFX |
| `FS` | Followspot |
| `SM` | Stage Management |
| `OTHER` | Catch-all (rare) |

Department codes appear in OSC arg strings (CSV form) and in JSON payloads (array form). They are **case-sensitive uppercase**.

## 10. Further reading

- `docs/specs/protocol_dictionary.md` — full canonical reference (binding)
- `docs/dev/cuelist-data-model.md` — what's behind `cue-fire` and the `payloads[]` array
- `docs/dev/pairing-and-auth.md` — full pairing flow + token format
- `docs/dev/module-sdk.md` — write a module that publishes/subscribes to the EventBus
