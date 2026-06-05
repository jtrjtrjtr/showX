---
bundle_id: "ShowX-3"
title: "Cuelist Core Module + ShowX 0.1 public release"
status: "planned"
opened_at: null
goal: "Build the Cuelist Core module (REHEARSAL mode + per-department views + GO authority) and the PWA cuelist UI. Ship ShowX 0.1 publicly as the first cuelist-capable release. First paid pilot in a real venue."
target_completion: "2027-03-31"  # Q1 2027
depends_on:
  - "ShowX-1"          # Foundation services
  - "spec:data_model.md"
  - "spec:protocol_dictionary.md"
# NOTE: ShowX-2 dependency removed by Architect ruling 2026-06-06 — was about
# SHIPPING the same binary (Kongres migration narrative), not development order.
# Module loader treats modules independently; Cuelist Core development has zero
# code dependency on EventX Bridge module. Cuelist demo is Jindřich's visual
# product target; ShowX-2 stays parked until post-Kongres customer migration.
tasks_planned:
  - "B003-001 — Cuelist Core module manifest + skeleton"
  - "B003-002 — Yjs document model (Show / Cuelist / Cue / Payload per data_model.md §2)"
  - "B003-003 — .showx package read/write (per data_model.md §3)"
  - "B003-004 — REHEARSAL mode state machine + edit semantics"
  - "B003-005 — Per-department view filter logic (per data_model.md §6)"
  - "B003-006 — Compound cue model + multi-department payloads"
  - "B003-007 — Trigger taxonomy (manual / auto_follow / auto_continue)"
  - "B003-008 — GO event side-channel publish (per protocol_dictionary.md §7.2)"
  - "B003-009 — Cue payload dispatch (Cuelist → OutputDispatcher per payload type)"
  - "B003-010 — Cue catalog publishing for routing UI"
  - "B003-011 — Module panel UI (in Electron shell)"
  - "B003-012 — PWA cuelist data layer (Yjs hooks, awareness, reconnect)"
  - "B003-013 — PWA SM master view component"
  - "B003-014 — PWA operator view component (per-department filter)"
  - "B003-015 — PWA GO button + standby panel"
  - "B003-016 — PWA cue editor (REHEARSAL mode)"
  - "B003-017 — CSV import"
  - "B003-018 — JSON export + .showx package export"
  - "B003-019 — PDF cue-sheet export per department"
  - "B003-020 — Multi-operator collab integration tests"
  - "B003-021 — Stream Deck via Companion community module"
  - "B003-022 — First-paid-pilot deployment + customer comms"
  - "B003-023 — ShowX 0.1 public release"
---

# ShowX-3 Cuelist Core Module + ShowX 0.1 Public — Bundle Outline

> **Status:** ACTIVE. Opened 2026-06-06 by Architect ruling — ShowX-3 runs before ShowX-2 because Cuelist Core is the first visual demo target.
> **Target:** Q1 2027 — first public release of ShowX with cuelist capability.
> **The product becomes a product** in this bundle.

## Why this bundle

ShowX-2 made ShowX a viable replacement for BridgeX 0.3.x — but it's still just a bridge. ShowX-3 is what makes ShowX a **cuelist product**: per-department views over one shared show document, multi-operator collab, REHEARSAL mode.

This is where Cuelist Core module is born; it's where the PWA gets actual show UI; it's where the first paying customer goes live.

## Tasks (23 planned)

Estimated total: ~12,000 source lines + ~4,000 test lines.

### Phase 1: Cuelist data layer + module backbone (B003-001..010)

Build the Yjs document model, REHEARSAL mode state machine, GO event semantics, cue payload dispatch. Module is internally functional before any UI is written.

### Phase 2: PWA UI (B003-011..016)

Cuelist UI in the PWA: SM master view, operator filtered views, GO button, standby panel, cue editor. Module panel inside Electron shell.

### Phase 3: Import/export (B003-017..019)

CSV import bridge from QLab/Eos/SCS/USITT exports. JSON `.showx` package format. PDF cue-sheet per-department for operator paper backup (non-negotiable for theatre).

### Phase 4: Integration + Stream Deck (B003-020..021)

Multi-operator collab end-to-end test. Companion community module for Stream Deck.

### Phase 5: First customer + ship (B003-022..023)

Migrate first paid pilot venue. Customer comms. ShowX 0.1 public release.

## Definition of done (bundle)

- All 23 tasks accepted by Critic
- ShowX 0.1 DMG signed + notarized + downloadable
- Showx.app (or showx.xlab.cz) live with download + docs
- First paid pilot venue running a real show successfully (1+ rehearsal + 1+ performance)
- Marketing copy + screenshots ready
- Customer migration playbook updated with cuelist scenarios
- Decision note `docs/agent_exchange/decisions/2027-XX-XX_showx_3_complete.md`
- Bridgex 0.3.x EOL announced (Q2 2027 sunset)

## Out of scope

- SHOW mode (ShowX-4 — Q2 2027)
- Cloud Sync module (ShowX-4 or later)
- Custom Router (ShowX-5)
- Timeline editing (ShowX-4+)
- Multi-cuelist per show (ShowX-4)
- MSC out (ShowX-4)
- USITT ASCII import (ShowX-4)
- Cue edit-proposals (SHOW mode feature, ShowX-4)
- Audio playback engine (NEVER — out of product)

## Open questions / decisions needed before opening

Most decisions cascade from data_model.md + protocol_dictionary.md open questions:
- Q4 — Payload-level `department` field (0.1 infer, 0.2 first-class)
- Q5 — `auto_follow` completion with null `duration_hint_ms`
- Q7-Q15 — Lower-priority data model rulings
- Q16-Q17 — Protocol IN gates + DMX direct in 0.1

## References

- Spec: `../../specs/data_model.md`
- Spec: `../../specs/protocol_dictionary.md`
- Spec: `../../specs/module_loader.md`
- Bundle parent: `ShowX-1-foundation.md`, `ShowX-2-eventx-bridge-module.md`
- Strategy: `../../../../xlab-strategy/docs/showx_mvp_scope.md`

---

## Spec writing status — appended 2026-06-05

**Status:** All 23 task specs written and queued in `docs/agent_exchange/queued/B003-001..023_*.md`.

**Total estimated_size_lines across 23 specs:** 11,700 LOC (production + tests).

**Distribution by size:**
- 200 LOC: 1 task (B003-023 release)
- 300 LOC: 4 tasks (B003-001, -010, -018, -022)
- 400 LOC: 5 tasks (B003-005, -007, -008, -015, -017)
- 500 LOC: 3 tasks (B003-004, -006, -021)
- 600 LOC: 6 tasks (B003-003, -009, -011, -019, -020, plus a couple others) — at Pattern 8 advisory threshold
- 700 LOC: 2 tasks (B003-012, -014)
- 800 LOC: 3 tasks (B003-002, -013, -016) — exceed Pattern 8 advisory; Architect should consider pre-emptive split

**Pre-emptive split candidates (≥700 LOC, Pattern 8 advisory):**
- **B003-002 (800)** Yjs document model — splittable into 002a (show + cuelist + meta factories), 002b (cue + payload factories + validation), 002c (CRDT merge tests). Recommend split before Forge picks up; specs cleanly separable along the file boundaries already documented.
- **B003-013 (800)** PWA SM master view — splittable into 013a (SMMasterView shell + CueRow + tokens), 013b (StandbyPanel + CallingText + OperatorPresenceIndicators + keyboard shortcuts). Recommend split; UI components have natural boundary.
- **B003-016 (800)** PWA cue editor — splittable into 016a (CueEditor shell + CueMetaFields + DepartmentSelector + TriggerEditor), 016b (per-payload-type editors — OSC/MSC/LXRef/MIDI/Webhook/Wait/Group). Recommend split; payload editors are 7 distinct components.
- **B003-012 (700)** PWA cuelist data layer — borderline; arguably splittable into 012a (connection + sideChannel + provider stack) and 012b (hooks). Forge may handle as-is; flag if Forge times out.
- **B003-014 (700)** PWA operator view — borderline; 7 variant components is the bulk; could split as 014a (OperatorView selector + OperatorCueRow + GenericOperatorView + 3 variants) and 014b (remaining 4 variants + payloadSummaries). Forge may handle as-is; flag if Forge times out.

**Cross-task dependencies surfaced beyond bundle outline:**
- B003-004 (REHEARSAL state) requires modifying B003-002's mutators to call `assertEditAllowed` — this is a cross-task coupling that Forge must be aware of when implementing B003-004 (touches files outside its direct target_files list).
- B003-007 (trigger engine) requires CuelistCore class integration in B003-001 — `start()` instantiates engine. B003-001 must include a `// TODO B003-007` hook OR Forge of B003-007 patches B003-001's CuelistCore.
- B003-008 (GO channel) similar pattern — CuelistCore.start() instantiates GoEventChannel. Same pattern.
- B003-009 (dispatch) subscribes to cue-fire EventBus — depends on B003-008 publisher. Confirm event order: B003-009 must wait for B003-008 to publish cue-fire before iterating payloads.
- B003-010 (catalog) requires `pkgPath` — comes from B003-003's open result; cuelist-core must thread it through. Forge documents the wiring.
- B003-011 (shell panel UI) assumes IPC bridge from shell (ShowX-1 B001-016 likely); Forge should validate IPC channel availability in done report.
- B003-012 (PWA data layer) assumes pairing token already obtained via ShowX-1 B001-012/B001-018 pairing flow.
- B003-013/-014/-015/-016 (PWA components) require `data-testid` attributes consistent with B003-020 E2E test selectors. Forge of B003-020 should sanity-check selectors exist after each PWA UI task lands.

**Open questions referenced + spec defaults applied:**
- **Q4 (payload department field):** MVP infers from cue.department + tag heuristic; first-class field deferred to 0.2. Default in B003-002, B003-005, B003-006, B003-009.
- **Q5 (auto_follow with null duration_hint):** fire immediately on prev start. Default in B003-007.
- **Q6 (per-cue lock granularity):** cuelist-level only in MVP. Default in B003-004.
- **Q7 (Y.Text vs strings + label LWW in SHOW):** plain strings; label LWW allowed in SHOW. Default in B003-002, B003-004, B003-016.
- **Q8 (group nesting depth):** 4 levels max + cycle detection. Default in B003-009.
- **Q9 (idempotency LRU size):** 1000 default, configurable. Default in B003-001 config + B003-008.
- **Q11 (presence color palette):** null in 0.1, TBD follow-up task. Default in B003-001 config.
- **Q12 (UTI registration):** Info.plist with cz.xlab.showx.package. Default in B003-003.
- **Q16 (/showx/cue/fire IN in SHOW mode):** OFF by default, opt-in per show. Documented in B003-008 (out of scope) + B003-009 dispatch validates.
- **Q17 (direct DMX in 0.1):** Deferred to 0.2. Default in B003-009.

**Specs ready for Forge upon scope activation.** Architect should:
1. Confirm pre-emptive splits for B003-002, B003-013, B003-016 before scope opens (≤30 min Architect work each).
2. Update `claude_runner_scope.json` when ShowX-3 opens (post ShowX-1 + ShowX-2 acceptance).
3. Activate task IDs incrementally — start with B003-001 (skeleton, no deps), then B003-002 sub-tasks, then phase 1 (B003-003 through B003-010), then phase 2 (B003-011 through B003-016 PWA), then phases 3-5.
