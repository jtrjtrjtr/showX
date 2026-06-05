---
bundle_id: "ShowX-1"
title: "Foundation"
status: "in_progress"
opened_at: "2026-06-05T22:00:00Z"
goal: "Bootstrap ShowX Electron shell + module loader + shared infrastructure + PWA scaffold + parity test harness, enabling subsequent bundles (ShowX-2 EventX Bridge module, ShowX-3 Cuelist Core) to start cleanly."
target_completion: "2026-07-31"
tasks:
  - "B001-001"
  - "B001-002"
  - "B001-003"
  - "B001-004"
  - "B001-005"
  - "B001-006"
  - "B001-007"
  - "B001-008"
  - "B001-009"
  - "B001-010"
  - "B001-011"
  - "B001-012"
  - "B001-013"
---

# ShowX-1 Foundation — Bundle Definition

## Why this bundle

ShowX is the master FOH product (2026-06-05 evening 2-product pivot). It is a single Electron app with loadable modules. Before any module (EventX Bridge, Cuelist Core, etc.) can be built, the **shell + module loader + shared infrastructure** must exist. This bundle creates that foundation.

After ShowX-1 completes:
- ShowX-2 (EventX Bridge module) — absorbs BridgeX 0.3.x source
- ShowX-3 (Cuelist Core module) — main new feature
- ShowX-4 (SHOW mode + Cloud Sync modules)
- ShowX-5 (Custom Router module)
- ShowX-6 (PWA polish + customer migration tooling)

ShowX-1 does NOT ship to customers. It is internal scaffolding. The first customer-visible release is ShowX 0.5 (BridgeX parity) at end-2026 after ShowX-2 + ShowX-1 are both done.

## Tasks

| ID | Title | Estimated lines | Depends on | Priority |
|---|---|---|---|---|
| B001-001 | Workspace + TypeScript + ESLint setup | ~250 | — | P0 |
| B001-002 | Shared types: Module, ModuleContext, services | ~400 | B001-001 | P0 |
| B001-003 | Logger + EventBus + HealthBus services | ~350 | B001-002 | P0 |
| B001-004 | PersistedStore + SecretStore services | ~400 | B001-002 | P0 |
| B001-005 | AssetServer + mDNS services | ~400 | B001-002 | P0 |
| B001-006 | SyncBroker service (embedded y-websocket) | ~400 | B001-002, B001-003, B001-005 | P0 |
| B001-007 | OutputDispatcher infrastructure (OSC + MIDI + DMX) | ~600 | B001-002, B001-003 | P0 |
| B001-008 | InputRegistrar infrastructure (OSC + MIDI listeners) | ~400 | B001-002, B001-003 | P1 |
| B001-009 | PairingStore service + pairing flow API | ~500 | B001-002, B001-004 | P0 |
| B001-010 | Module loader implementation | ~500 | B001-002, B001-003, B001-004 | P0 |
| B001-011 | Electron main entry + shell skeleton | ~400 | B001-005, B001-006, B001-009, B001-010 | P0 |
| B001-012 | PWA workspace bootstrap (Vite + React + Yjs + IndexedDB) | ~400 | B001-001 | P1 |
| B001-013 | CI workflow + parity test harness skeleton | ~300 | B001-001 | P1 |

Total estimated: ~5,300 source lines + tests.

Dependency graph:
```
B001-001 ── B001-002 ── B001-003 ─┬─ B001-006 ─┐
                                  ├─ B001-007 ─┼─ B001-011
                                  └─ B001-008 ─┤
                       B001-004 ─┬─ B001-009 ─┤
                                 └─ B001-010 ─┤
                       B001-005 ──┬───────────┘
                                  └─ feeds B001-006 (httpServer attach)
B001-001 ─ B001-012 (parallel)
B001-001 ─ B001-013 (parallel)
```

## Definition of done (bundle)

- All 13 tasks accepted by Critic
- `pnpm install && pnpm typecheck && pnpm test` all pass
- ShowX Electron app launches and shows an empty shell with module sidebar (no modules loaded — that's ShowX-2+)
- PWA dev server (`pnpm dev:pwa`) launches and shows a placeholder UI
- Parity test harness validates a stub module load
- All specs in `docs/specs/` referenced by tasks have been created (separate Architect-night session)
- Decision note `decisions/2026-06-05_showx_1_foundation_opened.md` written
- Hub status dashboard reflects ShowX as active project

## Out of scope (explicitly NOT in ShowX-1)

- Actual EventX Bridge module implementation (that's ShowX-2)
- Cuelist Core module (ShowX-3)
- SHOW mode (ShowX-4)
- Custom Router (ShowX-5)
- Signed/notarized DMG (ShowX-6)
- BridgeX 0.3.x source migration (begins ShowX-2)
- Production deployment of any kind

## References

- `../WORKFLOW.md`
- `../../specs/data_model.md` (written 2026-06-05 night)
- `../../specs/module_loader.md` (written 2026-06-05 night)
- `../../specs/protocol_dictionary.md` (written 2026-06-05 night)
- `../../specs/pairing_auth.md` (written 2026-06-05 night)
- `../../specs/bridgex_absorption.md` (written 2026-06-05 night)
- `../../../CLAUDE.md`
- `../../../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`
