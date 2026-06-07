---
bundle_id: "ShowX-3.2"
title: "Cuelist UI wiring — shell mode + show mode + routing dispatcher"
status: "active"
opened_at: "2026-06-07"
goal: "Wire the cuelist React components (built in B003-013..016) into PWA App.tsx routing so the shell window actually renders FirstLaunchPicker/CuelistCorePanel and station mode renders SMMasterView/OperatorView. Plus fix Routing UI → dispatcher integration."
target_completion: "2026-06-08"
depends_on:
  - "ShowX-3 bundle accepted"
  - "ShowX-3.1 hotfix bundle accepted"
tasks_planned:
  - "B003-201 — Shell PWA wiring: App.tsx shell mode mounts CuelistCorePanel + FirstLaunchPicker via uiPanel bridge"
  - "B003-202 — Station mode wiring: App.tsx show mode mounts SMMasterView / OperatorView per station role + Yjs connection"
  - "B003-203 — Routing UI dispatcher integration: routing rules from B003-101 actually drive dispatch/resolveRouting.ts"
---

# ShowX-3.2 Wiring Bundle

## Why this bundle

ShowX 0.1.2 launches. Modules discover. Window draggable. Demo show writes to disk. But the cuelist UI components — `SMMasterView`, `OperatorView` variants, `CueEditor`, `GoButton`, `FirstLaunchPicker`, `RoutingTable` — built and accepted in B003-013 through B003-101 are **NEVER MOUNTED**.

Architect oversight: B003-013..016 built React components; nobody wired them into PWA `App.tsx` routing. `pwa/src/App.tsx:53` still renders `<AppShell title="ShowX Shell" subtitle="Module sidebar — UI in later bundle" />` for shell mode and `<PlaceholderShowView />` for show mode.

This bundle closes the integration gap. After 3.2 lands:

- Shell mode renders `FirstLaunchPicker` (3 cards) or `RecentShowsList` + opens `CuelistCorePanel` after Open Demo
- Station mode (after pairing) renders `SMMasterView` for SM role or `OperatorView` variant for operator role
- Routing rules created via Routing UI actually drive dispatch

## Tasks (3 planned)

- **B003-201** Shell PWA wiring (~500 LOC) — `App.tsx` shell mode + IPC bridge for module's `uiPanel` exports + load demo show flow end-to-end
- **B003-202** Station mode wiring (~500 LOC) — `App.tsx` show mode mounts SM vs Operator based on session role + Yjs document loading + GO authority check
- **B003-203** Routing UI dispatcher integration (~300 LOC) — bridge new `target_device_id` RoutingRule shape into `dispatch/resolveRouting.ts`; add migration for existing routing tables

## Definition of done (bundle)

- All 3 tasks accepted by Critic
- E2E happy path: install DMG → launch → click "Open Demo Show" → 25-cue cuelist visible → press Q → cue armed → press Space → GO fires → routing UI shows device dispatched
- Decision note ratifying bundle close
- Build v0.1.3 DMG with everything wired

## Out of scope (defer)

- Yjs awareness presence colors (Q11)
- Real OSC console hookup test (requires hardware)
- Multi-cuelist switcher
- Native MIDI/DMX dispatch verification (the dispatcher works, just deferred to physical test)

## References

- ShowX-3 close: `decisions/2026-06-06_showx_3_bundle_complete.md`
- ShowX-3.1 close: `decisions/2026-06-07_showx_3_1_hotfix_complete.md`
- Wire-up audit conversation: Architect to Jindřich 2026-06-07 evening (post-v0.1.2 install)
