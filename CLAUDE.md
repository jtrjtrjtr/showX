# ShowX — Claude Code Handoff

## What This Is

**ShowX** je XLAB master FOH produkt — LAN-first Electron app na FOH Macu s loadable moduly, který obsluhuje celý live show workflow:

- **EventX Bridge module** (Free) — absorbuje BridgeX 0.3.x: subscribuje EventX Supabase changes, dispatchuje OSC/MIDI/DMX
- **Cuelist Core module** — multi-operator FOH cuelist s per-department views, REHEARSAL mode
- **SHOW mode module** (Pro+) — locked playback, edit proposals, history snapshots
- **Custom Router module** (Pro+) — WD-style rule-table multi-protocol routing
- **Cloud Sync module** (Pro+) — opt-in Supabase backup + cross-venue Yjs multi-provider stack

Vše v jednom signed Electron procesu na FOH Macu, PWA stations přes LAN (mDNS discovery + local pairing).

**Klíčový princip:** LAN-first. Žádný cloud dependency pro venue runtime. Cloud Sync je opt-in modul, ne core path.

**Plná spec:** `docs/specs/` (data_model, module_loader, protocol_dictionary, pairing_auth, bridgex_absorption).
**Strategy context:** `../xlab-strategy/docs/showx_mvp_scope.md` + `../xlab-strategy/docs/showx_module_architecture.md`.
**Binding decision:** `../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`.

## Team & Roles

Three-Claude team. File-based coordination přes `docs/agent_exchange/`. Workflow podle BridgeX pattern.

| Role | Model | Runtime | Owns |
|---|---|---|---|
| **Architect** | Opus | User's Claude Code CLI (`ShowX Architect` chat or hub session) | Mluví s Jindřichem. Plánování, task specs, schvalování bundles, decision notes. Edituje `claude_runner_scope.json`. **NEPÍŠE produkční kód** (mimo rescue mode). |
| **Forge** (Implementer) | Sonnet | LaunchAgent (`com.xlab.showx-forge-runner`, every 4 min) | Čte `claude_runner_scope.json` → najde queued task → napíše kód + testy + done report. **Žádná architektonická rozhodnutí.** |
| **Critic** | Opus | LaunchAgent (`com.xlab.showx-critic-runner`, every 4 min) | Reviewuje `done/` reports nezávisle. Verdikt: `accepted` / `changes_requested` / `blocked`. Kontroluje akceptační kritéria ze specu. |

Coordination is FILE-BASED. Single source of truth: `docs/agent_exchange/WORKFLOW.md`.

## Stack

- **Electron main:** Node.js + TypeScript, modular shell with dynamic module loader
- **PWA frontend:** React 18 + Vite + TypeScript + Yjs + y-indexeddb
- **Sync broker:** y-websocket Node module embedded in Electron main process
- **Asset server:** Express static file server (PWA bundle served from Electron)
- **Discovery:** bonjour-service mDNS (`_showx._tcp.local`)
- **Protocol dispatcher:** OSC (osc-min / node-osc), MIDI (@julusian/midi), DMX (dmxnet for Art-Net, e131 for sACN), MSC over MIDI, LTC (jungle-style audio gen)
- **Local storage:** Electron app data (`.showx` packages, history.jsonl, paired devices)
- **Cloud (opt-in module only):** Supabase (Postgres + Auth) + cloud y-websocket node on Fly.io
- **Testing:** Vitest unit + Playwright E2E + custom parity test harness (BridgeX 0.3.x compat)
- **Packaging:** pnpm workspace (kompatibilní s EventX + BridgeX pattern)
- **Distribution:** signed + notarized DMG (Apple Developer ID, rebrand from BridgeX bundle ID)

## Layout

```
showX/
├── CLAUDE.md                    ← this file
├── README.md
├── package.json                 ← root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── docs/
│   ├── agent_exchange/          ← Architect/Forge/Critic coordination
│   │   ├── WORKFLOW.md          ← canonical workflow doc
│   │   ├── state.json           ← task lifecycle source of truth
│   │   ├── claude_runner_scope.json  ← Forge bandwidth scope
│   │   ├── TASK_DASHBOARD.md    ← auto-rendered
│   │   ├── queued/              ← task specs awaiting Forge
│   │   ├── in_progress/         ← active tasks
│   │   ├── done/                ← Forge done reports
│   │   ├── reviews/             ← Critic reviews
│   │   ├── decisions/           ← architectural ratifications
│   │   ├── bundles/             ← bundle definitions (ShowX-1, ShowX-2, ...)
│   │   └── logs/                ← runner logs
│   └── specs/                   ← module + protocol specs
│       ├── data_model.md
│       ├── module_loader.md
│       ├── protocol_dictionary.md
│       ├── pairing_auth.md
│       └── bridgex_absorption.md
├── scripts/
│   ├── forge_runner_service.sh  ← LaunchAgent entrypoint
│   ├── critic_runner_service.sh
│   └── _run_with_timeout.py
├── launchagents/
│   ├── com.xlab.showx-forge-runner.plist
│   └── com.xlab.showx-critic-runner.plist
├── src/
│   ├── main/                    ← Electron main process
│   │   ├── index.ts             ← entry
│   │   ├── module_loader.ts     ← dynamic module loading
│   │   ├── shared/              ← shared services (Dispatcher, SyncBroker, AssetServer, mDNS, PairingStore, SecretStore, HealthBus, PersistedStore, Logger)
│   │   └── ipc/                 ← Electron IPC handlers
│   ├── modules/                 ← loadable modules
│   │   ├── eventx-bridge/       ← absorbed BridgeX 0.3.x
│   │   ├── cuelist-core/        ← cuelist + REHEARSAL
│   │   ├── show-mode/           ← SHOW mode lock + proposals
│   │   ├── custom-router/       ← WD-style rule table
│   │   └── cloud-sync/          ← Supabase backup (opt-in)
│   ├── shared/                  ← code shared between main and modules
│   └── types/                   ← TypeScript shared types (Module, ModuleContext, etc.)
├── pwa/                         ← React PWA frontend
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── public/                  ← manifest + service worker
└── tests/
    ├── unit/                    ← Vitest unit tests
    ├── e2e/                     ← Playwright E2E
    └── parity/                  ← BridgeX 0.3.x parity test harness
```

## Hard limits

### Architect
- ❌ NO production source code edits (mimo explicit "rescue mode" autorizovaný Jindřichem)
- ❌ NO git push to remote without explicit user OK
- ❌ NO deploy / DMG sign without user OK
- ❌ NO Supabase production push without user OK
- ❌ NO LaunchAgent install without user OK (UNLESS during initial bootstrap, explicit user authorization)
- ✅ Operational reads (typecheck, test, status) authorized
- ✅ Architect rescue source edits when Forge role-bleeds or times out repeatedly (per session precedent)
- ✅ Scope edits (`claude_runner_scope.json`) per Architect discretion
- ✅ Bundle planning + decision notes

### Forge
- ❌ NO architectural decisions
- ❌ NO tasks outside `claude_runner_scope.json.allowed_task_ids`
- ❌ NO self-review (Critic owns review)
- ❌ NO scope expansion mid-task
- ✅ App code, tests, done reports per task spec
- ✅ Refactor inside task scope

### Critic
- ❌ NO production code edits
- ❌ NO behaviour edits
- ❌ NO scope changes
- ✅ Independent review of Forge artefacts
- ✅ Verdict: accepted / changes_requested / blocked

## Session start protocol

When opening a ShowX session:

1. Read this CLAUDE.md
2. Read `docs/agent_exchange/WORKFLOW.md`
3. Read `docs/agent_exchange/state.json` (active tasks)
4. Read `docs/agent_exchange/claude_runner_scope.json` (Forge bandwidth)
5. Read latest entries in `docs/agent_exchange/decisions/` (recent ratifications)
6. Read latest entries in `docs/agent_exchange/logs/` (recent runner activity)
7. Output unified status brief to user

## Cross-project context

- **EventX** (`../eventx/`) — cloud audience product. ShowX's EventX Bridge module subscribes to its Supabase changes.
- **BridgeX** (`../bridgeX/`) — **frozen at 0.3.x post-Kongres 2026-06-17**. Source code being absorbed into `showX/src/modules/eventx-bridge/` during Q3 2026.
- **Integration** (`../integration/`) — cross-project E2E test harness. ShowX↔EventX integration tests live there.
- **xlab-strategy** (`../xlab-strategy/`) — shared strategic memory. ShowX scope + decisions live there.

## References

- `../xlab-strategy/docs/showx_mvp_scope.md` — MVP scope (master product framing)
- `../xlab-strategy/docs/showx_module_architecture.md` — module specs
- `../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` — binding 2-product pivot decision
- `../bridgeX/CLAUDE.md` — predecessor architecture (for reference during absorption)
- `../eventx/CLAUDE.md` — sister project, channel-catalog contract
- Hub: `../CLAUDE.md` — XLAB multi-project Architect hub
