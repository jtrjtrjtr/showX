# ShowX Protocol Dictionary

> **Status:** Draft v0.1 — Architect specification, awaiting Jindřich review
> **Date:** 2026-06-05
> **Author:** Architect (hub session)
> **Audience:** Forge (implementer), Critic (reviewer), Companion module authors, external integrators
> **Dependencies:**
> - `xlab-strategy/docs/showx_mvp_scope.md` — MVP scope (master product framing, draft dictionary)
> - `xlab-strategy/docs/showx_module_architecture.md` — module shell + shared infrastructure
> - `showX/docs/specs/data_model.md` (companion spec, in progress)
> - `showX/docs/specs/pairing_auth.md` (companion spec, in progress)
> - `showX/docs/specs/module_loader.md` (companion spec, in progress)
> - `eventx/docs/channel-catalog.json` — analogous catalog pattern from sister project
> - **Architectural rule:** `feedback_aggregation_vs_parameters_split.md` — module declares semantic events, dispatcher maps to hardware
>
> **Versioning:** This dictionary is the canonical contract between the ShowX cuelist module, the protocol dispatcher subsystem, the PWA stations, and external tools (Companion, Eos, MA, QLab, Disguise). Breaking changes require a decision note ratified by Architect + Jindřich.

---

## 1. Overview

ShowX is an Electron app on a single FOH Mac. Inside the Electron main process live:

- The **Cuelist Core module** (semantic GO source).
- The **EventX Bridge module** (subscribes Supabase changes, emits semantic dispatch events).
- The **shared protocol dispatcher subsystem** (resolves semantic events to OSC / MIDI / DMX / MSC / LTC / Webhook transport calls).
- The **sync broker** (embedded y-websocket for Yjs CRDT replication to stations).
- The **side-channel WSS server** (GO events, presence, heartbeat — NOT in CRDT).
- The **asset HTTP server** (PWA bundle + pairing UI).
- The **mDNS advertiser** (`_showx._tcp.local`).

ShowX participates in **three distinct communication layers**:

| # | Layer | Transport | Participants | Encoding |
|---|---|---|---|---|
| 1 | **In-process** | Direct TypeScript function calls + EventEmitter | Module ↔ ShowX shell ↔ Dispatcher | Strongly-typed TS events |
| 2 | **LAN station ↔ shell** | WSS (Yjs sync) + WSS side-channel (GO/presence) + HTTP (assets, pairing) | ShowX Electron app ↔ PWA stations on LAN | Yjs binary, JSON envelopes, HTTP responses |
| 3 | **External tools ↔ shell** | OSC over UDP, MIDI, MSC over MIDI, DMX (Art-Net / sACN), LTC audio, Webhook HTTP | ShowX Electron app ↔ Companion / Eos / MA / QLab / Disguise / 3rd-party | OSC packets, MIDI bytes, DMX frames, JSON HTTP |

This document specifies the **wire format** for layers 2 and 3 in detail, plus the **TypeScript event surface** for layer 1 so module authors can implement against a stable contract.

### Default ports + endpoints (summary)

| Service | Transport | Default endpoint | Configurable | Purpose |
|---|---|---|---|---|
| Asset HTTP server | TCP / HTTP | `0.0.0.0:5300` | Yes (show file) | PWA bundle, pairing UI, `/system/health` |
| Yjs sync broker | TCP / WSS | `0.0.0.0:5300/yjs/<show_id>` | Yes (same as asset port) | CRDT replication |
| Side-channel WSS | TCP / WSS | `0.0.0.0:5300/events/<show_id>` | Yes (same as asset port) | GO events, presence, heartbeat |
| OSC IN | UDP | `0.0.0.0:5305` | Yes (show file) | External tools → ShowX |
| OSC OUT | UDP | per destination (e.g. `10.0.1.10:8000`) | Per-output | ShowX → external tools |
| mDNS advertise | UDP multicast | `_showx._tcp.local` | TXT records | Discovery |
| MIDI IN/OUT | OS MIDI ports | configurable port name | Per-output | Console GO triggers, MSC out |
| DMX out | Art-Net (UDP 6454) / sACN (UDP 5568) | per universe | Per-output | Direct DMX (rare) |

ShowX uses a **single TCP port (default 5300)** for HTTP + WSS sync + WSS side-channel. This minimizes firewall configuration on venue networks. OSC stays on its conventional UDP socket.

---

## 2. In-process semantic events (TypeScript)

### 2.1 Event bus shape

The ShowX shell exposes a single typed event emitter on `ModuleContext`:

```ts
interface ShowXEventBus {
  emit<E extends keyof ShowXEvents>(event: E, payload: ShowXEvents[E]): void;
  on<E extends keyof ShowXEvents>(event: E, handler: (p: ShowXEvents[E]) => void): Unsubscribe;
  once<E extends keyof ShowXEvents>(event: E, handler: (p: ShowXEvents[E]) => void): Unsubscribe;
}
```

All events use **kebab-case** names. All payloads carry a `seq` (monotonic int from event bus, used for idempotency) and a `ts` (int64 ms since epoch, FOH Mac clock). All cue / show / station IDs are **UUIDv7 strings** (sortable, embedding time).

### 2.2 Canonical event names + payloads

```ts
interface BaseEnvelope {
  seq: number;        // monotonic per-process
  ts: number;         // int64 ms since epoch, FOH clock
  source: string;     // module slug emitting (e.g. "cuelist_core")
}

// --- Cuelist Core module: cue lifecycle ---

type CueStandbyEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  cue_id: string;
  cue_label: string;
  departments: Department[];    // ["LX","SX",...]
  standby_note?: string;
};

type CueFireEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  cue_id: string;
  cue_label: string;
  departments: Department[];
  payloads: Payload[];          // polymorphic, see §3.4
  fired_by: string;             // operator_id (UUIDv7) or "auto-follow" / "timecode"
  trigger_mode: 'manual' | 'auto_follow' | 'auto_continue' | 'timecode';
};

type CueCompleteEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  cue_id: string;
  duration_ms: number;          // actual elapsed from fire → complete
  success: boolean;
  errors?: string[];
};

// --- Cuelist Core module: cuelist transport ---

type CuelistGoEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  next_cue_id: string;
  by_operator_id: string;       // SM by default
};

type CuelistStopEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  by_operator_id: string;
};

type CuelistPauseEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  by_operator_id: string;
};

type CuelistResumeEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  by_operator_id: string;
};

type CuelistPlayheadEvent = BaseEnvelope & {
  show_id: string;
  cuelist_id: string;
  cue_id: string;               // new playhead position
  index: number;                // ordinal in cuelist
};

// --- SHOW mode module: show lock state ---

type ShowModeChangeEvent = BaseEnvelope & {
  show_id: string;
  mode: 'rehearsal' | 'show';
  by_operator_id: string;
};

type ShowLockEvent = BaseEnvelope & {
  show_id: string;
  by_operator_id: string;       // SM
  snapshot_id: string;          // payload snapshot identifier
};

type ShowUnlockEvent = BaseEnvelope & {
  show_id: string;
  by_operator_id: string;
};

// --- Pairing / station presence ---

type StationPairedEvent = BaseEnvelope & {
  station_id: string;           // UUIDv7
  device_name: string;          // operator-supplied ("LX Desk", "SM iPad")
  owned_departments: Department[];
  watched_departments: Department[];
};

type StationPresenceUpdateEvent = BaseEnvelope & {
  station_id: string;
  online: boolean;
  last_seen_ts: number;
  signal: 'green' | 'yellow' | 'red';    // health
};

// --- System / health ---

type SystemHeartbeatEvent = BaseEnvelope & {
  uptime_ms: number;
  module_health: Record<string /* module slug */, 'ok' | 'warn' | 'error'>;
};

type SystemErrorEvent = BaseEnvelope & {
  module: string;
  severity: 'warn' | 'error' | 'fatal';
  code: string;
  message: string;
  context?: Record<string, unknown>;
};

// --- EventX Bridge: incoming channel updates (for symmetry) ---

type EventxChannelUpdateEvent = BaseEnvelope & {
  plugin: string;               // "wordcloud" | "poll" | ...
  channel_id: string;           // "top_words" | "option.0.share" | ...
  value: number | string | unknown[];
  channel_type: 'scalar' | 'index' | 'text_list' | 'text_collection' | 'event_stream';
};

// --- The master event map ---

interface ShowXEvents {
  'cue-standby': CueStandbyEvent;
  'cue-fire': CueFireEvent;
  'cue-complete': CueCompleteEvent;
  'cuelist-go': CuelistGoEvent;
  'cuelist-stop': CuelistStopEvent;
  'cuelist-pause': CuelistPauseEvent;
  'cuelist-resume': CuelistResumeEvent;
  'cuelist-playhead': CuelistPlayheadEvent;
  'show-mode-change': ShowModeChangeEvent;
  'show-lock': ShowLockEvent;
  'show-unlock': ShowUnlockEvent;
  'station-paired': StationPairedEvent;
  'station-presence-update': StationPresenceUpdateEvent;
  'system-heartbeat': SystemHeartbeatEvent;
  'system-error': SystemErrorEvent;
  'eventx-channel-update': EventxChannelUpdateEvent;
}
```

### 2.3 Publishers + subscribers per event

| Event | Published by | Subscribed by |
|---|---|---|
| `cue-standby` | Cuelist Core | Protocol dispatcher (→ OSC OUT `/showx/cue/standby`), side-channel WSS (→ stations), SHOW mode (history log) |
| `cue-fire` | Cuelist Core | Protocol dispatcher (resolves payloads), side-channel WSS, SHOW mode, Custom Router (optional rule input) |
| `cue-complete` | Protocol dispatcher (after all payload calls resolve) | Cuelist Core (advance auto-follow), side-channel WSS, SHOW mode |
| `cuelist-go` | Cuelist Core (from SM GO press) or side-channel WSS receiver (from external OSC IN) | Cuelist Core (compute next cue), Protocol dispatcher (→ OSC OUT `/showx/cuelist/go`) |
| `cuelist-stop` | Cuelist Core (from operator) | Protocol dispatcher, all stations |
| `cuelist-pause` / `cuelist-resume` | Cuelist Core | Protocol dispatcher, all stations |
| `cuelist-playhead` | Cuelist Core (after each GO / GOTO / FIRE) | Side-channel WSS, Custom Router |
| `show-mode-change` | SHOW mode module | All modules, side-channel WSS |
| `show-lock` / `show-unlock` | SHOW mode module | All modules, side-channel WSS, history.jsonl writer |
| `station-paired` | PairingStore (after successful PIN/QR claim) | UI shell, side-channel WSS, mDNS service (refresh TXT) |
| `station-presence-update` | Side-channel WSS receiver (from station heartbeats) | UI shell, HealthBus |
| `system-heartbeat` | Shell (every 1 s) | HealthBus, side-channel WSS broadcast, OSC OUT (optional) |
| `system-error` | Any module via `context.logger.error()` wrapper | HealthBus, history.jsonl writer, Logger sink |
| `eventx-channel-update` | EventX Bridge module | Custom Router (rule input), optional OSC OUT mapping |

### 2.4 In-process dispatch ordering

When `cue-fire` is emitted:

1. Protocol dispatcher receives it synchronously.
2. Dispatcher iterates `payloads[]` in array order, dispatches each through its transport, accumulating results.
3. When all payloads resolve (success or error), dispatcher emits `cue-complete`.
4. Side-channel WSS broadcasts `cue-fire` to all subscribed stations **immediately** (does NOT wait for dispatcher; stations need the fire signal as fast as the dispatcher does).
5. SHOW mode history writer appends to `history.jsonl` on `cue-fire` and `cue-complete`.

OPEN QUESTION: should `cue-complete` wait for ALL payloads to drain transport buffers, or only for OSC-acknowledgement-style payloads (e.g. webhook 200)? Recommendation: best-effort, with `success: false` if any payload returned a transport-level error. Fire-and-forget UDP cannot truly confirm.

---

## 3. OSC dictionary

### 3.1 ShowX OSC namespace conventions

All ShowX-defined OSC addresses live under the root namespace `/showx/`.

Reserved sub-namespaces:

| Sub-namespace | Owner | Semantics |
|---|---|---|
| `/showx/cue/...` | Cuelist Core | Individual cue lifecycle (standby, fire, complete) |
| `/showx/cuelist/...` | Cuelist Core | Cuelist transport (go, stop, pause, resume, goto, playhead) |
| `/showx/show/...` | SHOW mode | Show-level state (mode, lock, unlock) |
| `/showx/station/...` | Pairing / shell | Station lifecycle (paired, presence) |
| `/showx/system/...` | Shell | Heartbeat, errors, version handshake |
| `/showx/eventx/...` | EventX Bridge | Channel value mirror (optional, configurable per output) |
| `/showx/router/...` | Custom Router | User-defined custom routes; not reserved by ShowX itself |

External tools MUST NOT send to addresses outside `/showx/` and expect them to route — ShowX ignores non-`/showx/*` inbound traffic by default. (Custom Router rules can listen for arbitrary patterns; that is rule-author responsibility.)

### 3.2 OUT addresses (ShowX → external)

All OSC packets emitted by ShowX include a **trailing string argument** identifying the source ShowX instance: `"showx://<hostname>/<show_id>"`. This allows downstream consumers (Companion, Eos) to disambiguate when multiple ShowX instances share a network segment.

#### 3.2.1 `/showx/cue/standby`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` (string) | cue_id (UUIDv7) |
| 2 | `s` (string) | cue_label (e.g. "Q 11") |
| 3 | `s` (string) | departments CSV (e.g. "LX,SX") |
| 4 | `s` (string) | standby_note ("" if none) |
| 5 | `h` (int64) | ts (ms since epoch) |
| 6 | `i` (int32) | seq (event bus monotonic) |
| 7 | `s` (string) | source URI |

Example: `/showx/cue/standby ,sssshis "01J8H...A1" "Q 11" "LX,SX" "house out" 1735574521000 4231 "showx://foh-mac.local/01J8...SHOW"`

Fired when: SM clicks STANDBY for the next cue, OR when the cuelist auto-advances `cuelist-playhead` to a new cue (auto-standby behavior).
Downstream consumer: Stream Deck via Companion (illuminate "next cue" button), Eos console (advance pending list — optional, via Custom Router rule).

#### 3.2.2 `/showx/cue/fire`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cue_id |
| 2 | `s` | cue_label |
| 3 | `s` | departments CSV |
| 4 | `s` | trigger_mode (`manual` \| `auto_follow` \| `auto_continue` \| `timecode`) |
| 5 | `h` | ts |
| 6 | `i` | seq |
| 7 | `s` | source URI |

Example: `/showx/cue/fire ,ssssh is "01J8H...A1" "Q 11" "LX,SX" "manual" 1735574522300 4232 "showx://foh-mac.local/01J8...SHOW"`

Fired when: Cuelist Core emits `cue-fire`. Sent **before** dispatcher resolves payloads (downstream consumers may want to see the fire intent even if a downstream payload fails).
Downstream consumer: Companion (feedback variable update), Disguise (timecode-locked playback start via custom mapping), QLab (slave-mode cue triggering).

#### 3.2.3 `/showx/cue/complete`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cue_id |
| 2 | `i` (int32) | duration_ms |
| 3 | `i` (int32) | success (1 = all payloads OK, 0 = at least one error) |
| 4 | `h` | ts |
| 5 | `i` | seq |
| 6 | `s` | source URI |

Fired when: All payloads have resolved (or failed) for a cue.
Downstream consumer: history loggers, Companion (clear "now firing" feedback).

#### 3.2.4 `/showx/cuelist/go`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cuelist_id |
| 2 | `s` | next_cue_id (the cue about to fire) |
| 3 | `s` | by_operator_id |
| 4 | `h` | ts |
| 5 | `i` | seq |
| 6 | `s` | source URI |

Fired when: SM (or remote OSC IN) issues GO.
Downstream consumer: external GO mirrors (Companion button feedback, secondary FOH display).

#### 3.2.5 `/showx/cuelist/stop`, `/showx/cuelist/pause`, `/showx/cuelist/resume`

Identical signature: `,sssi h s` → `cuelist_id, by_operator_id, "stop"|"pause"|"resume", seq, ts, source`.

Actually for clarity, ShowX emits each as a distinct address (no command argument):

| Address | Args | Description |
|---|---|---|
| `/showx/cuelist/stop` | `,ssh is` (cuelist_id, by_operator_id, ts, seq, source) | Stop transport |
| `/showx/cuelist/pause` | same | Pause transport |
| `/showx/cuelist/resume` | same | Resume transport |

#### 3.2.6 `/showx/cuelist/playhead`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cuelist_id |
| 2 | `s` | current_cue_id |
| 3 | `i` | index (ordinal in cuelist) |
| 4 | `h` | ts |
| 5 | `i` | seq |
| 6 | `s` | source URI |

Fired when: playhead moves (after GO, GOTO, FIRE, or manual edit in REHEARSAL).
Downstream consumer: paper-tape display, Companion variable, ops dashboard.

#### 3.2.7 `/showx/show/mode`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | show_id |
| 2 | `s` | mode (`rehearsal` \| `show`) |
| 3 | `s` | by_operator_id |
| 4 | `h` | ts |
| 5 | `i` | seq |
| 6 | `s` | source URI |

Fired when: SHOW mode module transitions between modes.
Downstream consumer: Eos console (show macro), Companion (color theme swap).

#### 3.2.8 `/showx/show/lock` and `/showx/show/unlock`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | show_id |
| 2 | `s` | by_operator_id |
| 3 | `s` | snapshot_id (lock only; empty string on unlock) |
| 4 | `h` | ts |
| 5 | `i` | seq |
| 6 | `s` | source URI |

Note: `show-lock` and `show-mode-change(mode=show)` are emitted as a pair — `show-mode-change` first, `show-lock` second. Downstream consumers may subscribe to either depending on semantic preference.

#### 3.2.9 `/showx/station/paired`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | station_id |
| 2 | `s` | device_name |
| 3 | `s` | owned_departments CSV |
| 4 | `s` | watched_departments CSV |
| 5 | `h` | ts |
| 6 | `i` | seq |
| 7 | `s` | source URI |

Fired when: PairingStore confirms a new station.
Downstream consumer: ops dashboard, audit log.

#### 3.2.10 `/showx/system/heartbeat`

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | showx_version (semver) |
| 2 | `s` | protocol_version (this dictionary, e.g. "1.0") |
| 3 | `i` | uptime_seconds |
| 4 | `i` | station_count_online |
| 5 | `h` | ts |
| 6 | `i` | seq |
| 7 | `s` | source URI |

Fired when: every 5 seconds (configurable; default 5 s, min 1 s, max 60 s).
Downstream consumer: external watchdog, Companion connection-status indicator, monitoring dashboard.

### 3.3 IN addresses (external → ShowX)

ShowX listens on UDP port `5305` (configurable). All inbound OSC is authenticated by **either**:

- **IP whitelist** (default: loopback + configured allow-list of host IPs from show file).
- **Shared-secret prefix** (optional, enabled per-rule): first OSC argument MUST be the shared secret string. ShowX strips it before dispatch.

Inbound packets failing auth are silently dropped (logged at debug level).

#### 3.3.1 `/showx/cuelist/go` (IN)

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cuelist_id (or empty string `""` to address active cuelist) |
| 2 | `s` (optional) | shared_secret (if rule requires) |

Action: triggers `cuelist-go` event identical to SM GO press. `by_operator_id` is set to `"external:<sender_ip>"`.
Senders: Companion, foot pedal via Companion, custom scripts.
Security: requires IP whitelist match OR shared secret. Recommended: shared secret if any non-loopback sender.

#### 3.3.2 `/showx/cuelist/stop`, `/showx/cuelist/pause`, `/showx/cuelist/resume` (IN)

Same signature + auth as `/showx/cuelist/go` IN.

#### 3.3.3 `/showx/cuelist/goto` (IN)

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cuelist_id (`""` for active) |
| 2 | `s` | cue_id OR cue_label (resolver tries cue_id first, then label match) |
| 3 | `s` (optional) | shared_secret |

Action: moves playhead to specified cue without firing. Emits `cuelist-playhead`.
Senders: rehearsal jump-to, external scripting.

#### 3.3.4 `/showx/cue/fire` (IN) — RESTRICTED

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | cue_id (UUIDv7 only — label fallback disabled here) |
| 2 | `s` | **REQUIRED** shared_secret |

Action: directly fire a cue bypassing playhead. Emits `cue-fire`.
Senders: emergency / show-control automation only.
Security: ALWAYS requires shared secret. In SHOW mode, additionally requires the secret to match the **lock-time fire secret** (separate from the standard inbound secret; rotated on each show-lock).

OPEN QUESTION: should this be disabled by default in SHOW mode? Recommendation: yes, opt-in per show via "Allow external cue fire" toggle in SHOW mode settings.

#### 3.3.5 `/showx/system/ping` (IN)

| Slot | Type | Description |
|---|---|---|
| 1 | `s` | request_id (echoed in pong) |

Action: ShowX replies with `/showx/system/pong` to the sender's IP and the source port from the inbound packet.

`/showx/system/pong` reply: `,ssi` → `request_id, showx_version, uptime_seconds`.

Senders: connection probes, Companion polls.
Security: open (no auth required for ping).

### 3.4 Payload-type OSC dispatch

The Cuelist Core module emits `cue-fire` with a `payloads: Payload[]` array. The dispatcher resolves each payload type to a concrete transport call. The polymorphic `Payload` type (from `data_model.md`):

```ts
type Payload =
  | { type: 'osc'; device_ref: string; address: string; args: OscArg[] }
  | { type: 'msc'; device_ref: string; command: MscCommand; cue_list?: string; cue_number?: string }
  | { type: 'lx_ref'; console: 'eos' | 'ma' | 'avo' | 'hog'; cue_list: number; cue_number: number | string }
  | { type: 'midi'; port_ref: string; bytes: number[] }    // raw MIDI bytes
  | { type: 'webhook'; url: string; method: 'GET'|'POST'|'PUT'; body?: unknown; headers?: Record<string,string> }
  | { type: 'wait'; seconds: number }
  | { type: 'group'; children: string[] /* cue_ref ids */ };

type OscArg =
  | { t: 'i'; v: number }     // int32
  | { t: 'h'; v: bigint }     // int64
  | { t: 'f'; v: number }     // float32
  | { t: 'd'; v: number }     // float64
  | { t: 's'; v: string }     // string
  | { t: 'b'; v: Uint8Array } // blob
  | { t: 'T' }                // true
  | { t: 'F' }                // false
  | { t: 'N' };               // nil
```

#### 3.4.1 `osc` payload

Direct passthrough: dispatcher resolves `device_ref` to a `{ host, port }` via show file's `devices` table, opens (or reuses pooled) OSC client, writes packet with `address` + typed `args`.

Example: `{ type: 'osc', device_ref: 'qlab-main', address: '/cue/Q11/start', args: [] }` → UDP packet to `10.0.1.5:53000` with `/cue/Q11/start ,`.

#### 3.4.2 `lx_ref` payload → OSC

LX console reference is resolved per-target:

| Console | OSC address pattern | Args |
|---|---|---|
| Eos (ETC) | `/eos/cue/{cue_list}/{cue_number}/fire` | none |
| grandMA3 | `/cmd` | `,s "GO Cue {cue_number} List {cue_list}"` |
| Avolites Titan | `/avo/cuelist/{cue_list}/cue/{cue_number}/go` | none (or per Titan OSC spec, see OPEN QUESTION) |
| Hog 4 | `/hog/playback/go/{cue_list}.{cue_number}` | none |

Device routing: the show file `devices` table maps logical console name → `{ host, port, protocol_variant }`. Dispatcher chooses the address pattern based on `console` field.

OPEN QUESTION: Avolites Titan OSC subset is unverified for 0.1; recommend deferring to Custom Router rule until validated against a real desk.

#### 3.4.3 `msc` payload → MIDI MSC

MIDI Show Control SysEx message:

```
F0 7F <device_id> 02 <command_format> <command> [<cue_number> <cue_list> <cue_path>] F7
```

| Field | Default | Source |
|---|---|---|
| `device_id` | `0x7F` (all-call) | device_ref → device record |
| `command_format` | `0x01` (lighting general) | device_ref → device record |
| `command` | `0x01` GO, `0x02` STOP, `0x03` RESUME, `0x04` TIMED_GO, `0x05` LOAD, `0x0B` SET, `0x0C` FIRE | from `command` field |
| `cue_number` | from payload | ASCII digits, "Q11" → `"11"` |
| `cue_list` | from payload | ASCII digits |
| `cue_path` | omitted in 0.1 | post-MVP |

Example: `{ type: 'msc', device_ref: 'eos-main', command: 'go', cue_list: '1', cue_number: '11' }` resolves to SysEx `F0 7F 01 02 01 01 31 31 00 31 00 F7` and is written to the MIDI port mapped to `eos-main`.

#### 3.4.4 `midi` payload (raw)

Dispatcher writes raw bytes to the MIDI port resolved via `port_ref`. No interpretation. Use case: Note On for soft pedals, CC for fader moves, program changes.

Example: `{ type: 'midi', port_ref: 'iac-bus-1', bytes: [0x90, 60, 127] }` → Note On, ch 1, note 60, vel 127.

#### 3.4.5 `webhook` payload

Dispatcher uses Electron `net.request` (or undici) to POST/PUT/GET with optional JSON body + headers. Timeout: 3 s default (configurable per payload). Response code logged to history.jsonl; 2xx = success, anything else = failure.

#### 3.4.6 `wait` payload

Internal delay; dispatcher pauses payload iteration for `seconds` then continues to the next payload in the same cue. Does NOT block the event loop (uses `setTimeout`). Other cues firing in parallel are unaffected.

#### 3.4.7 `group` payload

Recursive expansion: dispatcher looks up each `children[]` cue_ref by ID, emits a synthesized `cue-fire` for each, accumulates completion. Used for compound cues. Cycle detection: dispatcher refuses to recurse into a cue ID already in the current call stack; emits `system-error` with code `group-cycle-detected`.

### 3.5 OSC argument type conventions

| Field | OSC type tag | Notes |
|---|---|---|
| Cue IDs, cuelist IDs, show IDs, station IDs, operator IDs | `s` | UUIDv7 strings, 36 chars with hyphens (`01J8H6A1-...`) |
| Timestamps | `h` (int64) | Milliseconds since Unix epoch, FOH Mac clock |
| Sequence numbers | `i` (int32) | Monotonic per-process; reset on ShowX restart |
| Booleans | `i` (int32) | `1` = true, `0` = false. (We do NOT use `T`/`F` tags to maximize compatibility with naive OSC parsers.) |
| Department CSV | `s` | Comma-separated, no spaces, uppercase enum (e.g. `"LX,SX,VIDEO"`) |
| Source URI | `s` | `showx://<hostname>/<show_id>` for instance disambiguation |
| Numeric cue numbers (LX) | `i` (int32) | When passed as OSC arg; cue_list / cue_number embedded in OSC address are URL-escaped strings |

Versioning argument: every emitted OSC packet whose address starts with `/showx/` MAY include a leading int32 `protocol_version` arg as slot 0, behind a feature flag. Default: OFF for 0.1 (no version slot prefix; consumers rely on `/showx/system/heartbeat` for version handshake). Decision deferred to 0.2 — see §11.

---

## 4. MSC (MIDI Show Control) dictionary

### 4.1 Role

ShowX acts as **MSC controller** (sends MSC commands to receiving consoles). ShowX does NOT act as MSC slave in 0.1 (post-MVP via Custom Router input rule).

### 4.2 Device ID handling

Each show file `devices[]` entry of type MSC carries:

```ts
{
  ref: "eos-main",
  type: "msc",
  midi_port: "Eos IAC Bus 1",       // OS MIDI port name
  device_id: 0x01,                   // 7-bit MSC device ID (0..127), 0x7F = all-call
  command_format: 0x01               // 0x01 = lighting, 0x02 = sound, 0x03 = machinery, 0x10 = all-types
}
```

### 4.3 Cue list / cue number encoding

MSC cue numbers and list IDs are **ASCII strings**, null-terminated, embedded in the SysEx payload. ShowX encodes cue numbers as the textual representation of the value (e.g. cue_number `11.5` → ASCII `"11.5"`, terminated by `0x00`).

Cue list ID format: numeric ASCII (`"1"`, `"2"`, ...). ShowX show file may map cuelist UUIDv7 → MSC list number per device; mapping lives in the device record.

### 4.4 Command formats per target

#### Eos (ETC)

- Recommended command_format: `0x01` (lighting).
- Supported commands: GO (`0x01`), STOP (`0x02`), RESUME (`0x03`), TIMED_GO (`0x04`), LOAD (`0x05`).
- Eos also supports OSC; for ShowX 0.1, recommend OSC path (`/eos/cue/{list}/{number}/fire`) for richer feedback. MSC is fallback for sites where OSC is unavailable.

#### grandMA3 (MA Lighting)

- command_format: `0x01`.
- Native MA path is OSC `/cmd` with text command — that is the recommended route. MSC works but is conventionally less rich on MA3.

### 4.5 Example: ShowX → Eos GO via MSC

Payload: `{ type: 'msc', device_ref: 'eos-main', command: 'go', cue_list: '1', cue_number: '11' }`

SysEx bytes:

```
F0 7F 01 02 01 01 31 31 00 31 00 F7
│  │  │  │  │  │  └────────┘ └─┘ │
│  │  │  │  │  │  cue_num   list F7 EOX
│  │  │  │  │  └─ command (GO)
│  │  │  │  └──── command_format (lighting)
│  │  │  └─────── sub-id1 (MSC)
│  │  └────────── device_id (0x01)
│  └───────────── universal real-time
F0 SysEx start
```

---

## 5. MIDI dictionary

### 5.1 Listening side

ShowX MIDI IN listens on **operator-configured MIDI ports** (one or more, defined in show file `devices[]` with `type: "midi_in"`).

### 5.2 MIDI events that trigger ShowX actions

Each show file contains a `midi_input_map` table that binds MIDI events to ShowX actions:

```jsonc
{
  "midi_input_map": [
    {
      "port_ref": "foot-pedal",
      "match": { "type": "note_on", "channel": 1, "note": 60 },
      "action": "cuelist.go",
      "args": { "cuelist_id": "active" }
    },
    {
      "port_ref": "foot-pedal",
      "match": { "type": "note_on", "channel": 1, "note": 61 },
      "action": "cuelist.stop",
      "args": { "cuelist_id": "active" }
    },
    {
      "port_ref": "akai-apc",
      "match": { "type": "cc", "channel": 16, "cc": 7 },
      "action": "cuelist.fader_pos",   // post-MVP
      "args": { "cuelist_id": "active" }
    }
  ]
}
```

### 5.3 Action vocabulary

| Action | Args | Semantics |
|---|---|---|
| `cuelist.go` | `cuelist_id` | Same as `/showx/cuelist/go` |
| `cuelist.stop` | `cuelist_id` | Same as `/showx/cuelist/stop` |
| `cuelist.pause` / `cuelist.resume` | `cuelist_id` | Same |
| `cuelist.goto` | `cuelist_id, cue_id_or_label` | Same as `/showx/cuelist/goto` |
| `cue.standby_next` | `cuelist_id` | Auto-pick next unfired cue and emit `cue-standby` |
| `show.mode` | `mode: 'rehearsal' \| 'show'` | Toggle SHOW mode (REQUIRES SM auth — see §10) |

Reserved for post-MVP: `cuelist.fader_pos`, `cuelist.goto_index`.

### 5.4 Hardware compatibility notes

- macOS IAC Driver buses supported (cross-app MIDI from QLab, MainStage, etc.).
- USB MIDI class-compliant controllers (Akai APC, foot pedals).
- Stream Deck via Companion **does NOT use MIDI**; Companion sends OSC. Stream Deck is OSC-IN.

---

## 6. DMX / Art-Net / sACN dispatch

### 6.1 Role

ShowX **rarely** sends DMX directly. Standard path is OSC/MSC to a lighting console which owns DMX out. Direct DMX from ShowX is supported for:

- Small installations without a console (single dimmer pack, simple LED bar).
- Legacy BridgeX customers whose `event_bridge_outputs` already targets DMX.
- Custom Router rules emitting DMX.

### 6.2 Universe + channel addressing

Show file `devices[]` of type `dmx`:

```jsonc
{
  "ref": "house-rig",
  "type": "dmx",
  "protocol": "artnet" | "sacn",
  "universe": 1,
  "subnet": 0,           // Art-Net only
  "destination": "10.0.1.50:6454" | "broadcast",   // Art-Net only
  "priority": 100         // sACN only (0..200, higher wins)
}
```

Channels are addressed within universe as `1..512`. Payload format:

```ts
{ type: 'osc' | 'dmx', device_ref: 'house-rig', channels: { 1: 255, 2: 128, 3: 0 } }
```

Note: payload type `'dmx'` is post-MVP. In 0.1, DMX is dispatched **only via Custom Router rules**, not from cue payloads directly. Cuelist cues fire via OSC/MSC to a console.

### 6.3 Frame rate

- Art-Net: refresh at 44 Hz (DMX standard). ShowX dispatcher sends an Art-Net DMX packet at most every ~22 ms per universe even if channel values unchanged (keeps Art-Net nodes alive).
- sACN: refresh at 30 Hz (configurable 1..44 Hz). DMP Universe Discovery packet sent every 10 s.

OPEN QUESTION: should direct DMX be in 0.1 at all, or strictly Custom Router (post-MVP) only? Recommendation: **defer to 0.2**; ShowX 0.1 emits DMX only via the migrated BridgeX EventX Bridge code path. New cuelist-driven DMX waits.

---

## 7. WSS control plane (ShowX shell ↔ PWA stations)

### 7.1 Yjs sync transport

#### Endpoint

```
ws://showx.local:5300/yjs/<show_id>?token=<pairing_token>
```

- `<show_id>` = UUIDv7 of the active show.
- `<pairing_token>` = device-scoped token issued by ShowX after pairing (see §10).
- Upgrade to WebSocket binary frames; payload = standard Yjs sync messages (sync step 1/2, update messages).
- Sub-protocol: `y-websocket-v1` (compatible with the canonical Yjs y-websocket Node module).

#### Behavior

- One WS connection per station, per show.
- ShowX shell hosts a Yjs `Doc` per show; broker rebroadcasts updates to all connected stations.
- Stations persist via `y-indexeddb` locally; full replica per station.
- Awareness protocol (presence): standard Yjs `Awareness` instance; clients write `{ operator_id, station_id, role, focus_cue_id, color }` into awareness state.

#### Auth at connect time

ShowX validates `token` query parameter against `PairingStore`:
1. Reject if token absent or unknown (HTTP 401 on upgrade).
2. Reject if token expired or revoked (HTTP 403).
3. Reject if token's `station_id` is already connected from a different socket (kick previous, accept new — last-write-wins; logged).

### 7.2 Side-channel topics (NOT in CRDT)

Endpoint:

```
ws://showx.local:5300/events/<show_id>?token=<pairing_token>
```

Messages are **JSON envelopes** (UTF-8 text frames):

```json
{
  "topic": "go" | "standby" | "presence" | "heartbeat" | "system" | "cue-complete" | "show-mode" | "lock",
  "seq": 4231,
  "ts": 1735574522300,
  "payload": { /* topic-specific */ }
}
```

#### Topics

| Topic | Payload shape | Direction | Purpose |
|---|---|---|---|
| `go` | `{ cuelist_id, cue_id, fired_by, trigger_mode }` | shell → stations | GO event broadcast (mirrors `cue-fire` event) |
| `standby` | `{ cuelist_id, cue_id, standby_note }` | shell → stations | Standby broadcast |
| `cue-complete` | `{ cuelist_id, cue_id, success, duration_ms }` | shell → stations | Completion broadcast |
| `presence` | `{ station_id, online, signal, last_seen_ts }` | shell ↔ stations | Station online/offline; stations also send to shell |
| `heartbeat` | `{ uptime_ms, module_health }` | shell → stations (every 5 s) | Connection health |
| `system` | `{ severity, code, message, context }` | shell → stations | Errors / warnings |
| `show-mode` | `{ mode, by_operator_id }` | shell → stations | Mode transitions |
| `lock` | `{ locked: boolean, by_operator_id, snapshot_id? }` | shell → stations | SHOW mode lock/unlock |
| `station-go` | `{ cuelist_id }` | stations → shell | Operator GO press from a station (requires permission) |

#### GO event idempotency

The `seq` field is a monotonic int incremented per emitted side-channel message (separate counter from in-process `ShowXEvents.seq`). Stations track `last_seen_seq` per topic. On reconnect, stations request:

```json
{ "type": "resume", "since_seq": 4220 }
```

Shell replays missed messages from an in-memory ring buffer (default size: 1024 messages per topic). Older messages return `{ "type": "gap", "from_seq": 4220, "to_seq": 4231 }` — station should reconcile via Yjs full sync.

Cue fires are **never** re-fired on reconnect — stations treat replayed `go` messages as **history**, not commands. Visual cue-fire animations on stations check `(ts < now - 5000ms) ? render_as_history : render_as_live`.

### 7.3 HTTP endpoints

All HTTP endpoints served from the same port (default 5300).

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/` | PWA bundle index.html | None (LAN-only; bundle is public) |
| `GET` | `/assets/...` | PWA static assets (JS, CSS, fonts) | None |
| `GET` | `/pairing` | Pairing UI for first connect (QR scanner + PIN entry) | None |
| `POST` | `/pairing/claim` | Exchange PIN for device token | PIN body |
| `GET` | `/show/<show_id>/cue-catalog.json` | Cue catalog for routing UI | Pairing token (header `Authorization: Bearer <token>`) |
| `GET` | `/show/<show_id>/meta.json` | Show metadata (title, venue, departments, operators) | Pairing token |
| `GET` | `/system/health` | Liveness probe | None (returns `{"status":"ok","version":"0.5.0","uptime_seconds":1234}`) |
| `GET` | `/system/version` | Detailed version + module manifest | None |

#### Pairing claim shape

`POST /pairing/claim`

Request:
```json
{
  "pin": "473829",
  "device_name": "LX Desk iPad",
  "preferred_role": "lx_op",
  "client_version": "0.5.0"
}
```

Success response (200):
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

Failure responses:
- `400` invalid PIN format
- `401` PIN incorrect or expired (PINs are valid 10 minutes from generation; max 5 attempts per PIN before rate-limit lockout for 60 s)
- `403` ShowX shell in maintenance mode / pairing disabled

---

## 8. mDNS service descriptor

### Service definition

| Field | Value |
|---|---|
| Service type | `_showx._tcp.local` |
| Port | `5300` (default; reflects `asset_http_port` from config) |
| Hostname | `showx.local` (default; reflects FOH Mac mDNS hostname) |
| Instance name | `<show_title> on <hostname>` (e.g. `"Hamlet on foh-mac.local"`) |

### TXT records

| Key | Value | Description |
|---|---|---|
| `version` | `0.5.0` | ShowX semver |
| `protocol` | `1.0` | Protocol dictionary version (this doc) |
| `role` | `foh-server` | Reserved: future federation may include `foh-relay`, `foh-mirror` |
| `tier` | `free` \| `pro` \| `production` \| `team` | Loaded license tier |
| `show_id` | UUIDv7 | Active show ID |
| `show_title` | string | Human-readable (max 64 chars, ASCII safe) |
| `stations_online` | int | Current count of paired + online stations |
| `pairing_open` | `0` \| `1` | Whether new stations can pair now |
| `lock_state` | `rehearsal` \| `show` | Current SHOW mode state |
| `bundle_id` | `cz.xlab.showx` | macOS bundle identifier |

### Re-advertise cadence

- Initial advertisement: at ShowX shell boot (after asset server ready).
- TXT update: on every meaningful state change (`stations_online`, `lock_state`, `show_id`). Throttled to 1 update / 2 s minimum.
- Service de-advertisement: on shell shutdown (graceful) or LaunchAgent stop.

### Fallback

If mDNS fails (network blocks multicast, e.g. corporate guest WiFi), shell remains accessible via direct hostname / IP. PWA pairing flow includes a manual host:port entry field. ShowX displays its primary LAN IP and port prominently in the FOH UI status bar.

---

## 9. Local pairing flow (overview)

> Full spec lives in `pairing_auth.md` (companion). This section is a summary so the dictionary is self-contained.

1. SM clicks **"Add station"** in ShowX shell UI.
2. ShowX generates:
   - 6-digit PIN (random 100000..999999), valid 10 minutes.
   - QR code encoding the URL: `ws://showx.local:5300/pair?pin=473829&show=01J8H6A...`
   - Pairing nonce stored in `PairingStore` with TTL.
3. Operator either:
   - Scans QR with iPad camera → opens browser to URL → PWA auto-fills PIN → submits.
   - OR navigates manually to `http://showx.local:5300/pairing`, enters PIN, enters device name.
4. PWA `POST /pairing/claim` with PIN + device name + preferred role.
5. ShowX validates PIN, issues a **device pairing token** (HMAC-SHA256 signed bearer, see §10.2), stores `{ station_id, device_name, token_hash, issued_at, expires_at, owned_departments, watched_departments }` in `PairingStore`.
6. PWA persists token in IndexedDB under key `showx_pair_token_<show_id>`.
7. PWA connects to Yjs WSS endpoint with token, side-channel WSS with same token, begins receiving show document.
8. ShowX emits `station-paired` event → side-channel `presence` topic → all stations see new operator online.

---

## 10. Authentication & security

### 10.1 Pairing tokens are LAN-only credentials

- Tokens are valid ONLY for the LAN session they were issued on.
- Tokens carry an `issued_at` and `expires_at` (default 30 days; configurable per show: 1 hour for one-off shows up to 90 days for resident installs).
- Tokens are **revocable** from ShowX UI (per-station kick).
- Tokens do NOT grant access to Cloud Sync — that uses Supabase Auth (separate flow).

### 10.2 Token format

```
showx_pair_<base64url(payload)>.<base64url(hmac_sha256(payload, local_secret))>
```

Payload (CBOR-encoded for compactness, JSON-equivalent shape shown below):

```json
{
  "v": 1,
  "tid": "01J8H6Z...",          // station_id
  "sid": "01J8H6A...",          // show_id
  "iat": 1735574522,            // issued_at (seconds)
  "exp": 1738166522,            // expires_at (seconds)
  "scope": ["yjs","events","catalog","go"],   // permission bits
  "deps": ["LX","SX"]            // department permissions
}
```

`local_secret`: 32 random bytes generated at ShowX first boot, persisted in macOS Keychain (`cz.xlab.showx` service, account `local_pairing_secret`). Rotated never automatically; manual rotation invalidates ALL tokens (re-pair required).

### 10.3 Token scopes

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

### 10.4 External OSC IN security

Two gates, configurable per `osc_input_rule` in show file:

#### Gate A: IP whitelist

```jsonc
{
  "ip_whitelist": ["127.0.0.1", "10.0.1.0/24", "192.168.1.50"]
}
```

Default: `["127.0.0.1", "::1"]` only.

#### Gate B: Shared secret prefix

```jsonc
{
  "shared_secret": "s3cret-string-here",
  "secret_arg_slot": 0   // OSC arg slot where secret must appear; stripped before dispatch
}
```

Default: disabled. When enabled, ShowX checks slot 0 of inbound packet for exact match; rejects + logs at debug otherwise.

Senders that fail BOTH gates (when both enabled) are dropped. Either gate alone suffices; configurable per rule.

#### Special: external cue fire

`/showx/cue/fire` ALWAYS requires shared secret regardless of IP whitelist (defense-in-depth — operators may inadvertently whitelist a wide CIDR).

### 10.5 Cloud account auth (separate)

When Cloud Sync module is loaded:
- User signs into Supabase via the module's UI (OAuth or email/password).
- Supabase session token persisted in macOS Keychain (`cz.xlab.showx` / `cloud_supabase_session`).
- Cloud sync module uses session for second Yjs provider connection + show backup REST calls.
- Cloud auth is **independent** of pairing — local pairing tokens still required for stations regardless of cloud state.

---

## 11. Versioning

### 11.1 Protocol version field

The protocol dictionary itself is versioned: `protocol_version = "1.0"` for ShowX 0.1.

- Emitted in `/showx/system/heartbeat` (slot 2).
- Emitted in mDNS TXT (`protocol` key).
- Emitted in HTTP `GET /system/version` body.
- Emitted in WSS side-channel `heartbeat` payload.

### 11.2 Backwards compatibility rules

- **Adding** new OSC OUT addresses under `/showx/`: minor version bump (1.0 → 1.1). Consumers ignore unknown addresses (safe).
- **Adding** new OSC IN addresses: minor version bump. ShowX accepts unknown IN addresses by silently dropping (no error to sender) unless logged at debug.
- **Adding** new event names to `ShowXEvents`: minor version bump. TypeScript callers stay compile-compatible.
- **Adding** new payload types: minor version bump. Dispatcher must handle unknown payload types by emitting `system-error` and continuing to next payload in the same cue.
- **Adding** new WSS topics: minor version bump. Stations ignore unknown topics.
- **Renaming** or removing any field, address, topic, event name: MAJOR version bump (1.x → 2.0). Requires migration in show file format + station code.
- **Changing** OSC argument types or order on an existing address: MAJOR version bump.

### 11.3 Deprecation policy

- Deprecated addresses / topics / events MUST remain functional for at least **2 minor versions** before removal.
- Deprecation logged at `warn` level when ShowX dispatches a deprecated address.
- Deprecation visible in `/system/version` body under `deprecated[]` list.

### 11.4 Negotiation handshake (post-MVP)

OPEN QUESTION: should stations negotiate protocol version on Yjs connect (send `client_protocol_version` in `Sec-WebSocket-Protocol` header) so older PWAs can connect to newer shells? Recommendation: yes for 0.2; for 0.1, version mismatch is detected only at runtime via heartbeat — shell sends `system` topic warning if station's heartbeat indicates older PWA.

---

## 12. Open questions

1. **Avolites Titan OSC subset** — unverified against a real desk. Defer to Custom Router rules in 0.1; promote to first-class LX target in 0.2 if customer demand emerges. (§3.4.2)
2. **Cue-complete semantics** — wait for all transport buffers vs. fire-and-forget UDP. Recommendation: best-effort, mark `success: false` on any transport-level error. (§2.4)
3. **External `/showx/cue/fire` in SHOW mode** — default ON or OFF? Recommendation: default OFF in SHOW mode, opt-in per show. (§3.3.4)
4. **Direct DMX from cuelist payloads in 0.1** — Recommendation: defer to 0.2; DMX-out lives in BridgeX-absorbed EventX Bridge code path only for 0.1. (§6.3)
5. **OSC protocol_version slot prefix** — enable by default? Recommendation: OFF for 0.1 (heartbeat handshake suffices), revisit for 0.2 with explicit feature flag. (§3.5)
6. **Sub-protocol negotiation on Yjs WSS** — should stations send a `client_protocol_version` in WS Sec-WebSocket-Protocol? Recommendation: yes for 0.2 minor bump. (§11.4)
7. **Side-channel ring buffer size** — 1024 messages per topic adequate? May need increase for large casts (>20 stations + dense GO list). Profile during ShowX 0.5 internal testing. (§7.2)
8. **Token CBOR vs JSON encoding** — CBOR is more compact but adds a dependency. Recommendation: JSON in 0.1 for simplicity; CBOR optimization deferred. (§10.2)
9. **mDNS TXT update throttle** — 1 update / 2 s may cause stale `stations_online` count under churn. Acceptable for 0.1; raise to per-event later if needed. (§8)
10. **Heartbeat cadence** — default 5 s OSC heartbeat may be too sparse for monitoring dashboards. Configurable down to 1 s already; mark default reconsidered at 0.2. (§3.2.10)

---

## Appendix A: Complete address / topic / event index (alphabetical)

### A.1 OSC addresses

| Address | Direction | Section |
|---|---|---|
| `/showx/cue/complete` | OUT | §3.2.3 |
| `/showx/cue/fire` | OUT | §3.2.2 |
| `/showx/cue/fire` | IN (restricted) | §3.3.4 |
| `/showx/cue/standby` | OUT | §3.2.1 |
| `/showx/cuelist/go` | OUT | §3.2.4 |
| `/showx/cuelist/go` | IN | §3.3.1 |
| `/showx/cuelist/goto` | IN | §3.3.3 |
| `/showx/cuelist/pause` | OUT | §3.2.5 |
| `/showx/cuelist/pause` | IN | §3.3.2 |
| `/showx/cuelist/playhead` | OUT | §3.2.6 |
| `/showx/cuelist/resume` | OUT | §3.2.5 |
| `/showx/cuelist/resume` | IN | §3.3.2 |
| `/showx/cuelist/stop` | OUT | §3.2.5 |
| `/showx/cuelist/stop` | IN | §3.3.2 |
| `/showx/show/lock` | OUT | §3.2.8 |
| `/showx/show/mode` | OUT | §3.2.7 |
| `/showx/show/unlock` | OUT | §3.2.8 |
| `/showx/station/paired` | OUT | §3.2.9 |
| `/showx/system/heartbeat` | OUT | §3.2.10 |
| `/showx/system/ping` | IN | §3.3.5 |
| `/showx/system/pong` | OUT (reply) | §3.3.5 |

### A.2 WSS side-channel topics

| Topic | Direction | Section |
|---|---|---|
| `cue-complete` | shell → stations | §7.2 |
| `go` | shell → stations | §7.2 |
| `heartbeat` | shell → stations | §7.2 |
| `lock` | shell → stations | §7.2 |
| `presence` | shell ↔ stations | §7.2 |
| `show-mode` | shell → stations | §7.2 |
| `standby` | shell → stations | §7.2 |
| `station-go` | stations → shell | §7.2 |
| `system` | shell → stations | §7.2 |

### A.3 HTTP endpoints

| Method + Path | Section |
|---|---|
| `GET /` | §7.3 |
| `GET /assets/...` | §7.3 |
| `GET /pairing` | §7.3 |
| `POST /pairing/claim` | §7.3 |
| `GET /show/<show_id>/cue-catalog.json` | §7.3 |
| `GET /show/<show_id>/meta.json` | §7.3 |
| `GET /system/health` | §7.3 |
| `GET /system/version` | §7.3 |

### A.4 In-process TypeScript events

| Event name | Section |
|---|---|
| `cue-complete` | §2.2 |
| `cue-fire` | §2.2 |
| `cue-standby` | §2.2 |
| `cuelist-go` | §2.2 |
| `cuelist-pause` | §2.2 |
| `cuelist-playhead` | §2.2 |
| `cuelist-resume` | §2.2 |
| `cuelist-stop` | §2.2 |
| `eventx-channel-update` | §2.2 |
| `show-lock` | §2.2 |
| `show-mode-change` | §2.2 |
| `show-unlock` | §2.2 |
| `station-paired` | §2.2 |
| `station-presence-update` | §2.2 |
| `system-error` | §2.2 |
| `system-heartbeat` | §2.2 |

### A.5 Department enum (frozen for 0.1)

```ts
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

### A.6 Service ports summary

| Port | Transport | Purpose |
|---|---|---|
| 5300 | TCP / HTTP + WSS | Asset server, Yjs sync, side-channel events, pairing UI, health probe |
| 5305 | UDP | OSC IN |
| (per output) | UDP | OSC OUT to configured destination |
| 5353 | UDP multicast | mDNS / Bonjour |
| 6454 | UDP | Art-Net (if direct DMX enabled) |
| 5568 | UDP multicast | sACN (if direct DMX enabled) |

---

*End of ShowX Protocol Dictionary v0.1.*
