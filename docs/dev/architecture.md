# ShowX System Architecture

This page is the mental model. The canonical contracts are in `docs/specs/`; the strategic motivation is in `xlab-strategy/docs/showx_module_architecture.md` and `xlab-strategy/docs/showx_mvp_scope.md`.

## 1. Topology in one paragraph

ShowX is a **single signed Electron app** on the FOH (Front-of-House) Mac. Inside one main process: a **module loader** that hosts feature modules, plus **shared infrastructure services** every module can use (sync broker, asset server, mDNS, pairing, protocol dispatcher, secrets, logger, health bus). PWA stations on iPads / laptops / phones discover the FOH via mDNS, pair locally with QR or 6-digit PIN, then connect over LAN WebSocket — one WS for Yjs CRDT sync, a parallel WS for GO events and presence. No cloud dependency is required for the show to run. Cloud is an opt-in Pro+ module (Cloud Sync) that adds a second Yjs provider pointing at Supabase.

## 2. The big picture (ASCII)

```
                   FOH MAC (ShowX Electron app, signed DMG)
   ┌────────────────────────────────────────────────────────────────────────┐
   │                                                                        │
   │  ┌──────────────────────  SHARED INFRASTRUCTURE  ───────────────────┐  │
   │  │                                                                  │  │
   │  │  ModuleLoader  ◄─── manifests + lifecycle ────►  ModuleRegistry  │  │
   │  │                                                                  │  │
   │  │  OutputDispatcher  ◄── refcounted pool ──►  OSC / MIDI / DMX     │  │
   │  │  InputRegistrar    ◄── multiplexed   ────►  OSC IN / MIDI IN     │  │
   │  │  SyncBroker        ◄── y-websocket   ────►  (port 5300/yjs)      │  │
   │  │  AssetServer       ◄── Express HTTP  ────►  (port 5300/...)      │  │
   │  │  mDNSService       ◄── bonjour-svc   ────►  _showx._tcp.local    │  │
   │  │  PairingStore      ◄── JSONL on disk ────►  device tokens        │  │
   │  │  SecretStore       ◄── keytar/macOS  ────►  HMAC key, secrets    │  │
   │  │  HealthBus / Logger / EventBus / PersistedStore                  │  │
   │  └──────────────────────────────────────────────────────────────────┘  │
   │                                                                        │
   │  ┌─────────────────────────  LOADABLE MODULES  ─────────────────────┐  │
   │  │                                                                  │  │
   │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │  │
   │  │  │ EventX       │ │ Cuelist Core │ │ SHOW mode    │              │  │
   │  │  │ Bridge       │ │ (Free single │ │ (Pro+)       │              │  │
   │  │  │ (Free)       │ │  Pro multi)  │ │              │              │  │
   │  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘              │  │
   │  │         │                │                │                       │  │
   │  │  ┌──────┴───────┐ ┌──────┴───────┐                                │  │
   │  │  │ Custom       │ │ Cloud Sync   │                                │  │
   │  │  │ Router (Pro+)│ │ (Pro+, opt-in│                                │  │
   │  │  └──────────────┘ └──────────────┘                                │  │
   │  │                                                                  │  │
   │  └──────────────────────────────────────────────────────────────────┘  │
   │                                                                        │
   └────┬───────────────────────┬─────────────────────────┬─────────────────┘
        │                       │                         │
        │ LAN HTTP + mDNS       │ LAN WSS (Yjs +          │ OSC UDP / MIDI / DMX
        │ (PWA bundle, pairing) │  side-channel events)   │
        │                       │                         │
   ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐           ┌─────▼──────┐
   │ SM iPad  │ │ LX op    │ │ Video op │   ...     │ Eos / MA3  │
   │ PWA      │ │ browser  │ │ iPad PWA │           │ QLab       │
   │ + Yjs    │ │ + Yjs    │ │ + Yjs    │           │ Disguise   │
   └──────────┘ └──────────┘ └──────────┘           └────────────┘
                                                       downstream
                                                       show tools
```

Optional, Pro+ only, behind a feature flag:

```
   ┌────────────────────────────────────────┐
   │  Supabase  (Cloud Sync module only)    │
   │   - Postgres (.showx mirror + history) │
   │   - Auth (XLAB Cloud account)          │
   │   - y-websocket node on Fly.io         │
   └────────────────────────────────────────┘
```

## 3. Shared services — the core API surface

The shell exposes ten shared services. Every module receives a sandboxed handle to all of them via `ModuleContext` (see `module-sdk.md` and `src/types/module.ts`).

| Service | Owner module | What it does | Sandbox boundary |
|---|---|---|---|
| `OutputDispatcher` | shell | Send semantic transport messages (OSC, MIDI, DMX, MSC, webhook). Refcounted socket pool. | Pool is shared; ownership tracked per slug. |
| `InputRegistrar` | shell | Listen on OSC port, MIDI port, HTTP webhook. Multiplexed to subscribers. | Shared multiplex; subscriber slug tagged. |
| `SyncBroker` | shell | Open / close Yjs documents on the embedded `y-websocket` broker. Awareness pub/sub. | Document name namespace is open; modules collaborate by convention (Cuelist Core owns `show:<id>`). |
| `AssetServer` | shell | Mount static directories under URL prefix. Serves PWA bundle + show media. | URL prefix must start with `/<slug>/`. |
| `mDNSService` | shell | Advertise `_showx._tcp.local`; discover peers. | One advertisement per shell instance. |
| `PairingStore` | shell | List paired devices, issue HMAC tokens, revoke. | All modules see all devices (read); only PairingService (shell-internal) writes. |
| `SecretStore` | shell | OS-keychain-backed `get/set/delete/list` of strings. | Keys are sandboxed under `<slug>/`. |
| `HealthBus` | shell | Each module reports its own health; observe peers; shell rolls up. | Report scoped to slug; observe is open. |
| `PersistedStore` | shell | Per-module Zod-validated JSON config with migrations. | File sandboxed per slug: `<userData>/modules/<slug>.json`. |
| `Logger` | shell | Structured logs with auto-prefix `[<slug>]`. | Prefix enforced. |
| `EventBus` | shell | Typed pub/sub for inter-module loose coupling. Origin tag stamped by bus. | Subscribe is open; publish records origin. |

The **Single OutputDispatcher Rule** is the most important shared-service decision: every module that wants to emit OSC / MIDI / DMX goes through one shared dispatcher. Multiple modules emitting to the same destination (e.g. EventX Bridge and Cuelist Core both want OSC `10.0.1.10:8000` to QLab) share one underlying socket via refcounting. The OS-level MIDI input port lock is resolved inside ShowX rather than failing at the OS layer.

## 4. The five MVP modules

| Module | Slug | Tier | Default enabled | Origin |
|---|---|---|---|---|
| **EventX Bridge** | `eventx-bridge` | Free | yes | Absorbed BridgeX 0.3.x (post-Kongres 2026-06-17). Subscribes Supabase `postgres_changes`, routes activity rows to OSC/MIDI/DMX. |
| **Cuelist Core** | `cuelist-core` | Free (single-op) / Pro (multi-op) | yes | New for ShowX. Owns the Yjs `show:<id>` document; emits semantic `cue-fire` events; publishes a `CueCatalog`. |
| **SHOW mode** | `show-mode` | Pro+ | no | New for ShowX. State machine that freezes payloads, gates structural edits, runs a proposal queue, writes `history.jsonl`. Depends on `cuelist-core`. |
| **Custom Router** | `custom-router` | Pro+ | no | New for ShowX. WD-style `{ when, then }` rule table for arbitrary protocol routing. Consumes `cue-catalog-updated` events from Cuelist Core. |
| **Cloud Sync** | `cloud-sync` | Pro+, opt-in | no | New for ShowX. Adds a second Yjs provider pointing at a cloud `y-websocket` node + Supabase backup. Depends on `cuelist-core`. |

The shell itself is **always-on infrastructure** — pairing, sync broker, asset server, mDNS, OS-level dispatcher pool. It is NOT a module. You cannot disable it; you can only quit the app.

## 5. Data flow — the cue-fire path

The single most important code path in ShowX. A Stage Manager presses GO on her iPad; ten milliseconds later an Eos console receives `/eos/cue/1/47/fire`. Here is the full chain:

```
  SM iPad (PWA)                  FOH Mac (Electron main)              Eos console
  ─────────────                  ─────────────────────                ──────────────
       │                                  │                                 │
       │  1. SM taps GO                   │                                 │
       │ ──────────────►                  │                                 │
       │  WSS /events/<show_id>           │                                 │
       │  { topic: "go.request",          │                                 │
       │    request_id, cue_id,           │                                 │
       │    station_id, operator_id }     │                                 │
       │                                  │                                 │
       │                  2. Side-channel WSS server receives              │
       │                     ┌─────────────────────────────┐               │
       │                     │  authorise(req, cuelist)    │               │
       │                     │  (SM identity check etc.)   │               │
       │                     └──────────────┬──────────────┘               │
       │                                    │                              │
       │                                    ▼                              │
       │                     ┌─────────────────────────────┐               │
       │                     │  Cuelist Core module        │               │
       │                     │  - increment sequence       │               │
       │                     │  - emit "cue-fire" event    │               │
       │                     │    on EventBus              │               │
       │                     └──────────────┬──────────────┘               │
       │                                    │                              │
       │                  3. Two consumers, in parallel                   │
       │                     ┌──────────────┴──────────────┐               │
       │                     ▼                             ▼               │
       │     ┌──────────────────────────┐    ┌─────────────────────────┐   │
       │     │ Side-channel WSS         │    │ OutputDispatcher        │   │
       │     │   broadcast "go.        │    │   for each payload in   │   │
       │     │   dispatched" to all     │    │   cue.payloads[]:       │   │
       │     │   stations               │    │   resolve via routing   │   │
       │     └──────────────────────────┘    │   table → transport     │   │
       │                                     │     descriptor          │   │
       │                                     │   send packet through   │   │
       │                                     │   pooled socket         │   │
       │                                     └──────────────┬──────────┘   │
       │                                                    │              │
       │                                                    │  /eos/cue/1/47/fire (UDP)
       │                                                    │ ─────────────►│
       │  4. station updates UI                             │              │
       │ ◄────────────────                                  │              │
       │  GoDispatched envelope                             │              │
       │  with sequence, ts, payload count                  │              │
       │                                                    │              │
       │                  5. SHOW mode (if loaded) appends to history.jsonl
       │                     ┌─────────────────────────────┐               │
       │                     │  { kind: "cue_fired", ...} │               │
       │                     └─────────────────────────────┘               │
       │                                                    │              │
       │                  6. dispatcher waits for all payloads to resolve
       │                     emits "cue-complete" on EventBus              │
       │                                    │                              │
       │  7. station shows green flash on cue                              │
       │ ◄────────────────                                                 │
       │  { topic: "cue-complete", ... }                                   │
       │                                                                   │
```

The critical invariants of this flow:

- **GO is a side-channel event, NOT a CRDT mutation.** The Yjs document describes show *structure*; GO presses are *events* with monotonic sequence numbers + idempotency keys. A station that reconnects after 5 minutes does NOT re-fire missed cues.
- **The dispatcher is shared.** EventX Bridge could be emitting `/eventx/<short>/wordcloud/add` packets to the same UDP host:port at the same instant; both modules share the pooled socket via refcount.
- **`history.jsonl` is append-only on FOH disk.** It is not in the CRDT. It is the audit trail that survives crashes.

See `cuelist-data-model.md` §"GO events" and `protocol-reference.md` §"WSS endpoints" for the wire-level shapes.

## 6. Why these choices — quick map

| Decision | Where motivated | Where ratified |
|---|---|---|
| LAN-first runtime, cloud is opt-in module | `xlab-strategy/docs/showx_mvp_scope.md` §"LAN-first architecture" | `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` |
| Single shared OutputDispatcher | `feedback_aggregation_vs_parameters_split.md` (architectural rule); `xlab-strategy/docs/showx_module_architecture.md` | `docs/specs/module_loader.md` §"OutputDispatcher contention" |
| Modules in one process (no per-module process) | `docs/specs/module_loader.md` §1 goals | `docs/agent_exchange/decisions/2026-06-05_showx_1_foundation_opened.md` |
| GO not in CRDT | `docs/specs/data_model.md` §2.11 | spec is binding |
| `.showx` is a directory bundle (not a zip) | `docs/specs/data_model.md` §3.1 | spec is binding |
| HMAC-SHA256 device tokens, not RS256 | `docs/specs/pairing_auth.md` §6.6 | spec is binding |
| Departments fixed enum (LX, SX, VIDEO, AUTO, PYRO, FS, SM, OTHER) for MVP | `docs/specs/data_model.md` §6.1 | spec is binding |
| BridgeX 0.3.x absorbed as a Free-tier module (not separate app) | `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` | binding |

## 7. What lives WHERE in the repo

```
showX/
├── src/
│   ├── main/                    ← Electron main process (Node API allowed)
│   │   ├── index.ts             ← entry — boots services + module loader
│   │   ├── module_loader.ts     ← dynamic module discovery + lifecycle
│   │   ├── shared/              ← shared services (each = one folder)
│   │   │   ├── output-dispatcher/
│   │   │   ├── input-registrar/
│   │   │   ├── sync-broker.ts
│   │   │   ├── asset-server.ts
│   │   │   ├── mdns.ts
│   │   │   ├── pairing-store.ts
│   │   │   ├── secret-store.ts
│   │   │   ├── health-bus.ts
│   │   │   ├── persisted-store.ts
│   │   │   └── logger.ts
│   │   └── ipc/                 ← Electron IPC handlers (main ↔ renderer)
│   ├── modules/                 ← every directory here = one module
│   │   ├── eventx-bridge/       ← absorbed BridgeX 0.3.x
│   │   ├── cuelist-core/
│   │   ├── show-mode/
│   │   ├── custom-router/
│   │   └── cloud-sync/
│   ├── shared/                  ← TS code shared between main and modules
│   └── types/                   ← public type contracts
│       └── module.ts            ← THE Module / ModuleContext contract
├── pwa/                         ← React 18 + Vite station frontend
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── tests/
    ├── unit/                    ← Vitest unit tests
    ├── e2e/                     ← Playwright E2E (PWA ↔ shell)
    └── parity/                  ← BridgeX 0.3.x byte-parity harness
```

Forge implements `src/main/module_loader.ts` against `src/types/module.ts`. Modules implement the `Module` interface and export the `manifest` constant from their `index.ts`.

## 8. Performance posture

| Path | Budget | Source |
|---|---|---|
| Side-channel GO request → broadcast | < 5 ms wall on FOH Mac | informal target; not in spec yet |
| `cue-fire` event → first OSC packet on wire | < 10 ms p50, < 50 ms p99 | tracks BridgeX 0.3.x baseline |
| EventX Bridge module added overhead vs BridgeX 0.3.x | + 5 ms p95 max | `docs/specs/bridgex_absorption.md` §6.5 (PT-034) |
| Yjs document apply latency on 10-station show | < 50 ms typical | Yjs baseline |
| mDNS TXT update throttle | 1 update / 2 s minimum | `docs/specs/protocol_dictionary.md` §8 |

These are operational, not legal; they exist so we notice regressions early. Add new performance budgets via decision note in `docs/agent_exchange/decisions/`.

## 9. What ShowX is NOT

- **NOT a DMX driver / lighting console.** Eos and MA3 own that. ShowX fires LX cues by reference.
- **NOT a media server.** Resolume / disguise own that. ShowX triggers playback by reference.
- **NOT a native audio engine.** QLab owns sound design for MVP; we trigger it via OSC.
- **NOT a node-graph visual programming tool.** Cuelist shape only.
- **NOT a custom touchscreen panel builder.** Companion + Stream Deck handle that surface; ShowX is the protocol source.

See `xlab-strategy/docs/showx_mvp_scope.md` §"What ShowX is NOT" for the full positioning.

## 10. Further reading inside the repo

- `docs/specs/data_model.md` — Yjs schema and `.showx` package format
- `docs/specs/module_loader.md` — Module lifecycle, ModuleContext contract
- `docs/specs/protocol_dictionary.md` — every OSC address, every WSS topic
- `docs/specs/pairing_auth.md` — pairing flow, HMAC tokens, threat model
- `docs/specs/bridgex_absorption.md` — BridgeX 0.3.x → EventX Bridge module migration
- `docs/dev/module-sdk.md` — write your own module
- `docs/dev/protocol-reference.md` — protocol developer-friendly reference
