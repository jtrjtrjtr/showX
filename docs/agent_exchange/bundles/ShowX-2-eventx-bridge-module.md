---
bundle_id: "ShowX-2"
title: "EventX Bridge Module — BridgeX 0.3.x Absorption"
status: "planned"
opened_at: null
goal: "Migrate BridgeX 0.3.x source code into showX/src/modules/eventx-bridge/ as a Free-tier module; reach functional parity with BridgeX 0.3.x on identical event_bridge_outputs config; validate parity test suite; prepare BridgeX 0.3.x customer migration path."
target_completion: "2026-12-31"
depends_on:
  - "ShowX-1"          # Foundation must accept before ShowX-2 can start
  - "spec:bridgex_absorption.md"
tasks_planned:
  - "B002-001 — BridgeX 0.3.x source copy + workspace setup"
  - "B002-002 — EventX Bridge module manifest + skeleton"
  - "B002-003 — Module-internal core migration (Bridge engine + event-runtime)"
  - "B002-004 — Adapter migration (osc-adapter + midi-adapter + dmx-adapter → OutputDispatcher)"
  - "B002-005 — Supabase subscriber + reconnect logic"
  - "B002-006 — Rule engine + event_bridge_outputs config schema"
  - "B002-007 — Auth manager placement (per Q23 decision)"
  - "B002-008 — UI panel migration (BridgeX config UI → ShowX module panel)"
  - "B002-009 — Config migration from BridgeX 0.3.x → ShowX persistedConfig"
  - "B002-010 — Parity test scenarios (PT-001 through PT-015, basic dispatch coverage)"
  - "B002-011 — Parity test scenarios (PT-016 through PT-025, error/reconnect coverage)"
  - "B002-012 — Parity test scenarios (PT-026 through PT-035, latency/memory soak)"
  - "B002-013 — Migration test harness (BridgeX 0.3.x → ShowX upgrade flow)"
  - "B002-014 — Apple Developer ID bundle ID rebrand (BridgeX → ShowX)"
  - "B002-015 — Internal release: ShowX 0.5 (EventX Bridge module functional)"
---

# ShowX-2 EventX Bridge Module — Bundle Outline

> **Status:** PLANNED (not yet opened). Opens when ShowX-1 Foundation accepts.
> **Target:** end-December 2026 — ShowX 0.5 internal release with EventX Bridge module at BridgeX 0.3.x parity.
> **Critical path** for BridgeX customer migration (Q1 2027).

## Why this bundle

ShowX-2 is the absorption. BridgeX brand retires; BridgeX 0.3.x code becomes a module in ShowX. By the end of this bundle:

- `showX/src/modules/eventx-bridge/` exists with all BridgeX 0.3.x functional capabilities
- ShowX shell loads the module on startup (Free tier always-on)
- BridgeX 0.3.x customers can install ShowX, enable EventX Bridge module, import their `event_bridge_outputs` config, and have identical behavior
- Parity test suite (35 scenarios from bridgex_absorption.md §6) passes
- ShowX 0.5 internal release validated against ≥3 willing customers

## Tasks (15 planned)

Estimated total: ~8,000 source lines + ~2,000 test lines + ~500 migration script lines.

| Task | Title | Estimated lines | Notes |
|---|---|---|---|
| B002-001 | BridgeX 0.3.x source copy + workspace setup | ~200 | `cp -r bridgeX/bridgex/src/* showX/src/modules/eventx-bridge/src/`; refactor imports to ShowX paths |
| B002-002 | EventX Bridge module manifest + skeleton | ~300 | Implement Module interface against module_loader contract |
| B002-003 | Module-internal core migration | ~1500 | Bridge engine + event-runtime preserved against new ModuleContext |
| B002-004 | Adapter migration → OutputDispatcher | ~1200 | osc-adapter + midi-adapter + dmx-adapter rewired to shared OutputDispatcher (B001-007) |
| B002-005 | Supabase subscriber + reconnect logic | ~600 | Move from BridgeX-internal to module-internal; reconnect backoff preserved |
| B002-006 | Rule engine + config schema | ~800 | Zod schema for `event_bridge_outputs` (identical to BridgeX 0.3.x format); rule matcher unchanged |
| B002-007 | Auth manager placement | ~500 | Decision Q23 — module-local default; may move to shell SecretStore if Architect rules otherwise |
| B002-008 | UI panel migration | ~800 | BridgeX Electron renderer UI → React module panel rendered in ShowX shell tab |
| B002-009 | Config migration script | ~400 | Detects BridgeX 0.3.x install; imports config; preserves behavior |
| B002-010 | Parity scenarios PT-001..015 | ~800 | Basic dispatch (OSC, MIDI, DMX, MSC, webhook) per bridgex_absorption.md §6 |
| B002-011 | Parity scenarios PT-016..025 | ~800 | Error paths + reconnect + auth refresh |
| B002-012 | Parity scenarios PT-026..035 | ~600 | Latency p95 budget + memory soak |
| B002-013 | Migration test harness | ~500 | End-to-end "BridgeX 0.3.x → ShowX upgrade" with real config + real Supabase project |
| B002-014 | Apple Developer ID rebrand | ~200 | Info.plist + sign.sh + notary credentials carry over, new bundle ID `cz.xlab.showx` |
| B002-015 | ShowX 0.5 internal release | ~100 | DMG build + signed + notarized + smoke test on 3 platforms |

## Definition of done (bundle)

- All 15 tasks accepted by Critic
- Parity test suite passes 35/35 scenarios
- Internal release ShowX 0.5 DMG signed + notarized
- Migration playbook documented in `docs/migration/bridgex-to-showx.md`
- ≥3 BridgeX customers tested upgrade path successfully in private beta
- Decision note `docs/agent_exchange/decisions/2026-XX-XX_showx_2_complete.md`
- Hub status reflects ShowX 0.5 ready + BridgeX 0.3.x EOL announced

## Out of scope

- Cuelist Core module (ShowX-3)
- SHOW mode (ShowX-4)
- Custom Router (ShowX-5)
- Cloud Sync (ShowX-3 or later)
- Public release / marketing (ShowX-6)

## Open questions / decisions needed before opening

- Q22 — `html-renderer.ts` fate (Supabase broadcast — migrate or retire)
- Q23 — `auth-manager.ts` placement
- Q25 — OSC packet ordering nondeterminism (parity comparator)
- Q26 — Legacy YAML profile pipeline retire confirmation (~2,800 LOC at risk if customers use it)

## References

- Spec: `../../specs/bridgex_absorption.md`
- Spec: `../../specs/module_loader.md`
- Bundle parent: `ShowX-1-foundation.md`
- Strategy: `../../../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`

## Spec-writing status

**2026-06-05 (Architect):** All 15 task specs written + queued at `../queued/B002-001_*.md` through `B002-015_*.md`. Total estimated source: **9,520 lines** across 15 tasks (matches ~8,000-9,000 forecast in bundle outline).

Per-task estimated_size_lines breakdown:
- B002-001 (250) — source copy + workspace
- B002-002 (320) — module skeleton + manifest
- B002-003 (1500) — core migration (heaviest)
- B002-004 (1200) — adapter → OutputDispatcher
- B002-005 (600) — Supabase subscriber + reconnect
- B002-006 (800) — rule engine + config schema
- B002-007 (500) — auth manager (Q23 module-local)
- B002-008 (800) — UI panel migration
- B002-009 (400) — config migration script
- B002-010 (800) — parity PT-001..015
- B002-011 (800) — parity PT-016..025
- B002-012 (700) — parity PT-026..035 (incl. latency + soak)
- B002-013 (500) — migration test harness
- B002-014 (200) — Apple Dev ID rebrand
- B002-015 (150) — 0.5 internal release

Specs do NOT activate until ShowX-1 Foundation is fully accepted AND Architect explicitly opens the ShowX-2 bundle (state.json + claude_runner_scope.json mutations gated). Specs may be revised before activation as Q22, Q23, Q25, Q26 rulings land.

### Open questions surfaced during spec writing

Specs reference and depend on these open questions from `../decisions/2026-06-05_open_questions_architect.md`:
- **Q22** — `outputs/html-renderer.ts` fate: referenced in B002-003 (file kept temporarily in `legacy/outputs/`); needs Architect ruling before B002-005 picks up.
- **Q23** — `auth-manager.ts` placement: B002-007 honors module-local default; revisit if Cloud Sync absorbs auth earlier.
- **Q25** — OSC packet ordering nondeterminism: B002-010..012 parity scenarios default to byte-equal comparator; order-insensitive comparator gated by `SHOWX_PARITY_ORDER_INSENSITIVE=1`.
- **Q26** — Legacy YAML profile pipeline retirement: B002-003 deletes ~2,800 LOC under this assumption; if any customer uses YAML profiles (interview pre-Kongres), the retire decision must change.
- **Q30** — OutputDispatcher `claim()` sync→async signature: B002-004 assumes `claim()` returns `Promise<ClaimToken | ClaimConflict>` (async ruling confirmed in open questions doc).

### Additional cross-task dependencies not in bundle outline

- B002-006 extends B002-002's persisted config schema (adds `supabaseUrl`, `supabaseAnonKey`) and bumps `persistedConfigSchemaVersion: 1 → 2` with migrate() — Forge must read B002-002's final shape before extending.
- B002-007 wires AuthManager's `subscribe(handler)` callback into B002-005's `SupabaseSubscriber.updateAccessToken(token)` — neither task fully wires without the other; B002-007 expects B002-005 to exist (depends_on chain is correct).
- B002-008 UI panel uses IPC channel naming convention `eventx-bridge:auth:login` that B002-007 declares; both must agree on naming.
- B002-010 parity harness depends on `tests/parity/` helpers from B001-013 (foundation). If B001-013 did not fully implement `scenario-harness.ts`, B002-010 extends and documents.
- B002-013 migration harness re-uses B002-010 parity goldens to verify post-migration parity (clear dependency in spec).
- B002-014 build pipeline assumes B001-011 Electron main shell exists at `src/main/` and an `apps/showx/` workspace package wraps it for electron-builder (verify B001-011's actual layout choice).
- B002-015 release task gates on ALL 14 prior B002-* tasks accepted; checklist enumerated in spec.

### Golden recording capture pre-requirement

B002-010, B002-011, B002-012 parity scenarios require golden BridgeX 0.3.x recordings. These do NOT exist yet and are Architect's responsibility per `bridgex_absorption.md` §7 Step 6. Specs document the BLOCK condition: if goldens absent at task pickup, Forge BLOCKS and escalates. Architect should capture goldens during Step 6 of the migration sequence — ideally after BridgeX 0.3.x final ships post-Kongres 2026-06-17.
