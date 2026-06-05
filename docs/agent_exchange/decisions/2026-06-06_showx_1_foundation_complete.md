# ShowX-1 Foundation — Bundle Complete

**Date:** 2026-06-06 (autonomous bundle execution started 2026-06-05T01:38Z, completed 2026-06-05T08:36Z)
**Status:** ✅ 13/13 tasks accepted
**Bundle definition:** `bundles/ShowX-1-foundation.md`
**Execution wall time:** ~7 hours
**Architect rescues:** 2 (B001-001 workspace setup, B001-012 round 2 icons + done report)

## Tasks accepted

| ID | Title | Owner | Round | Notes |
|---|---|---|---|---|
| B001-001 | Workspace + TypeScript + ESLint setup | architect-rescue | 1 | Forge 2× 1200s timeout; Architect implemented per spec; Critic accepted |
| B001-002 | Shared types: Module, ModuleContext, services | forge | 1 | 8 type modules + 11 service interfaces + 37 expectTypeOf tests |
| B001-003 | Logger + EventBus + HealthBus services | forge | 2 | Round 1 had tsconfig paths collision; Round 2 fixed |
| B001-004 | PersistedStore + SecretStore services | forge | 1 | keytar primary + AES-256-GCM file fallback; 23 tests |
| B001-005 | AssetServer + mDNS services | forge | 1 | Express + bonjour-service; CORS for LAN ranges |
| B001-006 | SyncBroker service (embedded y-websocket) | forge | 1 | Vendored y-protocols; attach() to AssetServer http.Server; 17 tests |
| B001-007 | OutputDispatcher (OSC + MIDI + DMX) | forge | 1 | 6 transport pools; 34 tests; dmxnet ^0.9.0 |
| B001-008 | InputRegistrar (OSC + MIDI listeners) | forge | 1 | Refcounted multiplex; 35 tests |
| B001-009 | PairingStore + pairing flow API | forge | 2 | HMAC-SHA256 tokens + 6-digit PIN + rate-limit-first; 37 pairing tests |
| B001-010 | Module loader implementation | forge | 1 | Tier gating + topo sort lifecycle + crash isolation; 23 tests |
| B001-011 | Electron main entry + shell skeleton | forge | 2 | 13-step boot sequence; reverse-order safeCall shutdown; 7 Shell tests |
| B001-012 | PWA workspace bootstrap (Vite + React + Yjs + IndexedDB) | forge+architect-rescue | 3 | Required 3 rounds: round 1 spec drift, round 2 timeout (Architect rescued icons+report), round 3 test mocking fixed via provider injection |
| B001-013 | CI workflow + parity test harness skeleton | forge | 1 | .github/workflows/ci.yml (6 jobs); parity harness + 5 example scenarios; 3 dashboard scripts |

## Aggregate stats

- **Total source LOC delivered:** ~12,500+ (TypeScript / TSX)
- **Total test LOC delivered:** ~3,500+
- **Full test suite at bundle close:** 269 tests passing (typecheck clean across all 4 workspaces)
- **Git commits:** 24
- **Forge cycles total:** ~22 (including rescues + revisions)
- **Critic reviews total:** 16 (13 accepts + 3 changes_requested rounds)
- **Bundle wall time:** ~7 hours (2026-06-05T01:38Z scope-enable → 2026-06-06T08:36Z B001-011 accept)
- **Architect rescues:** 2 (B001-001 workspace setup, B001-012 round 2 final 5%)

## What's now live in the repo

### Electron main process
- `src/main/src/index.ts` — Electron app entry with graceful shutdown
- `src/main/src/Shell.ts` — 13-step boot orchestration
- `src/main/src/ModuleLoader.ts` — module discovery + lifecycle + tier gating
- `src/main/src/moduleLoader/` — supporting modules (discovery, lifecycle, contextFactory)
- `src/main/src/shared/` — all shared services: Logger, EventBus, HealthBus, PersistedStore, SecretStore, AssetServer, MdnsService, SyncBroker, OutputDispatcher, InputRegistrar, PairingStore
- `src/main/src/ipc/` — contextBridge-secure IPC for renderer
- `src/main/src/ui/` — preload + BrowserWindow

### Shared types
- `src/shared/src/index.ts` + `src/shared/src/types/` — 8 type modules covering Module, ModuleContext, services, transports, payloads, cues, shows, events

### PWA stations
- `pwa/src/main.tsx`, `App.tsx`, `lib/`, `components/`, `styles.css`, `public/manifest.webmanifest`, `public/sw.js`
- AES-GCM token encryption via Web Crypto
- Two-phase pairing flow (POST /pairing/claim + long-poll /pairing/<id>/status)
- Y.Doc + y-indexeddb + y-websocket via provider injection (testable)
- Side-channel WS for GO events + presence

### Test infrastructure
- Vitest unit (~269 tests passing)
- Playwright E2E config (skeleton)
- Parity harness `tests/parity/` (skeleton + 5 sample scenarios; real BridgeX 0.3.x scenarios land in ShowX-2)
- GitHub Actions CI `.github/workflows/ci.yml` (6 jobs: typecheck, lint, unit, e2e, parity, build)

### Dashboard scripts
- `scripts/render_dashboard.py` (auto-render TASK_DASHBOARD.md)
- `scripts/agent_exchange_refresh_dashboard.py` (called from runners)
- `scripts/agent_exchange_estimate_split.py` (700-line task spec split helper)

## Open issues / deferred items

Per `decisions/2026-06-05_open_questions_architect.md`:

- **Q4-Q15** (data model lower priority) — punt to ShowX-3 Cuelist Core decisions
- **Q22 html-renderer.ts fate** — verify with EventX before ShowX-2 starts
- **Q23 auth-manager.ts placement** — decide before ShowX-2 Phase 2
- **Q25 OSC packet ordering nondeterminism** — parity harness comparator strategy; pending ShowX-2 PT scenarios
- **Q26 YAML profile pipeline retirement** — customer interview question pre-Kongres
- **Q31 Forge wall-time pattern** — Forge timed out on B001-001 (2× before Architect rescue), B001-012 round 2 (Architect finished last 5%). Mitigations applied: removed `--add-dir` flags from runner scripts, added `.claude/settings.json` permission allowlist for pnpm test/typecheck. Result: 11 of 13 tasks completed without rescue.

## Pattern observations

- **`pnpm vitest run *` wildcard permission** was critical for Forge productivity (test-loops without permission gates)
- **STARTING_PROMPTS dependency gate** (Forge checks `depends_on` are accepted before claiming) prevented blocked-task pickup
- **Changes-requested priority** (revisions before fresh work) reduced bundle bloat from queue accumulation
- **Provider injection pattern** in B001-012 syncClient solved ESM mock interception issues — reusable pattern for future modules importing y-websocket / pure-ESM packages
- **Architect rescue is genuinely cheap** when scope is tight (workspace setup ~8min; icons+report ~2min) — should not be over-resisted

## Next bundle

ShowX-2 EventX Bridge module — BridgeX 0.3.x absorption.

Per binding decision `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`:

- Bundle definition: `bundles/ShowX-2-eventx-bridge-module.md` (outline written 2026-06-05)
- Detailed task specs B002-001..015 to be written this session (specs only; **scope stays disabled until Jindřich enables post-Kongres**)
- BridgeX 0.3.x source migration into `showX/src/modules/eventx-bridge/` is the heaviest task
- 35 parity test scenarios (per `docs/specs/bridgex_absorption.md` §6)
- Target ShowX 0.5 internal: end-2026
- Customer migration begins Q1 2027 (ShowX 0.1 public)

## What user should do next

1. Review this bundle close summary
2. Optionally: redeploy marketing site with bundle status 13/13 (Architect doing)
3. Pre-Kongres: BridgeX customer interview (3-5) — confirm Q26 YAML profile usage
4. Pre-Kongres: domain registration `showx.app` / `showx.io`
5. Pre-Kongres: trademark check ShowX EU + US
6. **Post-Kongres 2026-06-18**: enable ShowX-2 scope, let Forge start eventx-bridge migration

## References

- Bundle definition: `bundles/ShowX-1-foundation.md`
- Open questions: `decisions/2026-06-05_open_questions_architect.md`
- Bundle opening: `decisions/2026-06-05_showx_1_foundation_opened.md`
- Strategy binding: `../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
- Live site: https://showx.xlabproject.net
- Memory: `~/.claude/projects/-Users-machintoshhd-Daniel-local/memory/project_showx.md`
