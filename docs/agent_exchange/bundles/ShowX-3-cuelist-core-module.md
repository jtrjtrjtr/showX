---
bundle_id: "ShowX-3"
title: "Cuelist Core Module + ShowX 0.1 public release"
status: "planned"
opened_at: null
goal: "Build the Cuelist Core module (REHEARSAL mode + per-department views + GO authority) and the PWA cuelist UI. Ship ShowX 0.1 publicly as the first cuelist-capable release. First paid pilot in a real venue."
target_completion: "2027-03-31"  # Q1 2027
depends_on:
  - "ShowX-1"          # Foundation services
  - "ShowX-2"          # EventX Bridge module (must ship in same binary)
  - "spec:data_model.md"
  - "spec:protocol_dictionary.md"
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

> **Status:** PLANNED. Opens when ShowX-2 accepts.
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
