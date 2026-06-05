# ShowX-1 Foundation Bundle Opened

**Date:** 2026-06-05 night (autonomous Architect bundle planning session)
**Status:** Bundle opened, 13 tasks queued, scope DISABLED pending Jindřich approval
**Approver:** Jindřich (pending review tomorrow morning)
**Bundle definition:** `docs/agent_exchange/bundles/ShowX-1-foundation.md`

## What this is

ShowX-1 Foundation is the first bundle of work for the ShowX project. It creates:

- Electron main process shell + module loader
- Shared infrastructure services (Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, mDNS, SyncBroker, OutputDispatcher, InputRegistrar, PairingStore)
- React PWA workspace scaffold (Vite + Yjs + IndexedDB)
- CI workflow + parity test harness skeleton

No customer-facing functionality yet. This is the foundation that ShowX-2 (EventX Bridge module — absorbs BridgeX 0.3.x) and ShowX-3 (Cuelist Core module) build on.

## What was prepared in this session

Architect autonomous bundle planning session 2026-06-05 night produced:

### Specifications (`docs/specs/`)

- `data_model.md` — 840 lines, Yjs schema + `.showx` package format + Cue/Payload polymorphism + REHEARSAL/SHOW mode state machine + Postgres schema (Cloud Sync only)
- `module_loader.md` — 567 lines, Module interface + ModuleContext API + lifecycle hooks + module discovery + UI integration
- `protocol_dictionary.md` — 1180 lines, OSC + WSS + MSC + MIDI + DMX dictionary + mDNS service descriptor + auth gates + versioning
- `pairing_auth.md` — pending count, local-only pairing flow + HS256 token format + revocation + threat model
- `bridgex_absorption.md` — (pending) BridgeX 0.3.x audit + classification + parity contract + migration sequence

### Module loader TypeScript skeleton

- `src/types/module.ts` — 573 lines, contract types (Module, ModuleManifest, ModuleContext, all service interfaces)

### Bundle definition + 13 task specs

- `bundles/ShowX-1-foundation.md` — bundle scope + DOD + dependency graph
- `queued/B001-001_workspace_setup.md` — workspace + TypeScript + ESLint setup
- `queued/B001-002_shared_types.md` (pending agent landing) through `queued/B001-013_ci_parity_test_harness.md` (pending agent landing)

### Infrastructure

- `CLAUDE.md` (project DNA), `README.md`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- `docs/agent_exchange/WORKFLOW.md` (canonical multi-agent protocol)
- `docs/agent_exchange/STARTING_PROMPTS.md` (Forge + Critic role prompts)
- `docs/agent_exchange/state.json` (13 tasks registered, all queued)
- `docs/agent_exchange/claude_runner_scope.json` (enabled=false, allowed_task_ids=[])
- `scripts/forge_runner_service.sh`, `scripts/critic_runner_service.sh`, `scripts/_run_with_timeout.py`
- `launchagents/com.xlab.showx-forge-runner.plist`, `com.xlab.showx-critic-runner.plist` (installed + loaded; scope disabled so no work yet)

### Open questions for Architect / Jindřich review

`docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` — accumulated decisions needed from spec writing (~20 questions, most with defaults, ~5 needing immediate Jindřich call).

## What is NOT done in this autonomous session

- Source code (any) — Forge writes that
- Scope enabling — Jindřich approves first
- Customer comms drafting
- Domain registration

## How to start ShowX-1 Foundation execution

Tomorrow morning (or whenever Jindřich approves):

1. Review `docs/agent_exchange/decisions/2026-06-05_open_questions_architect.md` — confirm defaults or override per-question
2. Update relevant specs if defaults overridden
3. Edit `docs/agent_exchange/claude_runner_scope.json`:
   ```json
   {
     "enabled": true,
     "bundle_id": "ShowX-1",
     "allowed_task_ids": ["B001-001"],
     "rationale": "Foundation execution begins. Starting with workspace setup; will add tasks as dependencies clear.",
     "updated_at": "2026-06-06T08:00:00Z",
     "updated_by": "architect"
   }
   ```
4. LaunchAgents `com.xlab.showx-forge-runner` (every 4 min) + `com.xlab.showx-critic-runner` (every 4 min) are already loaded; they wake up on next tick and Forge picks up B001-001
5. Architect monitors `docs/agent_exchange/logs/forge_runner_service.log` + `docs/agent_exchange/state.json` for progress
6. As tasks pass Critic review, Architect adds next ID(s) to `allowed_task_ids` per dependency graph
7. When all 13 tasks `accepted`, Architect writes bundle completion decision note + opens ShowX-2

## Estimated bundle completion timeline

- Forge per-task wall time: ~10-30 minutes per task (1200s timeout × 1-3 cycles)
- 13 tasks × ~20 min each = ~4-6 hours pure Forge time
- Critic review per task: ~5-15 min
- Dependency graph allows ~5 parallel tracks at peak
- Realistic timeline: **3-7 working days** from scope enable
- Target completion: end of July 2026 (post-Kongres + ~6 weeks)

## References

- `bundles/ShowX-1-foundation.md` — bundle definition
- `WORKFLOW.md` — coordination protocol
- `2026-06-05_open_questions_architect.md` — pending decisions
- `../../specs/` — binding specifications
- `../../../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` — parent strategic decision
