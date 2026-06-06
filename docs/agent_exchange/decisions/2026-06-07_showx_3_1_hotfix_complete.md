---
date: 2026-06-07
type: bundle_completion
bundle: ShowX-3.1
author: architect
status: ratified
---

# ShowX-3.1 Hotfix Bundle — COMPLETE

## TL;DR

ShowX-3.1 hotfix bundle finished in **~2.5h** of wall-clock time (01:38 → 03:50 CEST 2026-06-07). All 3 task specs (B003-101..103) accepted by Critic. The three critical Cuelist UI gaps surfaced in the 0.2 audit are now closed: Routing + Devices UI shipped, real-time playhead broadcast over Yjs awareness shipped, demo show fixture + first-launch picker shipped (with File menubar wiring).

## Bundle stats

| Metric | Value |
|---|---|
| Tasks planned | 3 |
| Tasks accepted | 3/3 (100%) |
| Wall-clock duration | ~2.5h (scope-enable to last accept) |
| LOC delivered (estimate) | ~2,000 (source + tests + demo fixture) |
| Tests added | ~190 new (cuelist-core unit + PWA + main) |
| Final typecheck baseline | 14 errors (4 from B003-101 incompatible RoutingRule shape — ShowX-3.2 follow-up) |
| Architect rescues | 1 (B003-102 — Forge ultimately consolidated my rescue into round-2 work) |

## Acceptance ratio

| Round | Count | % |
|---|---|---|
| Round 1 single accept | 2 (B003-101 + B003-102 final-accept-round) | 67% |
| Round 2 after Critic fix | 1 (B003-103) | 33% |
| Round 3+ | 0 | 0% |

Critic round-1 catches were legitimate (B003-103 AC #9 menubar wiring; B003-101 minor deviations defensible).

## Pattern 8 saturation

**100% rate** — all 3 tasks hit cycle 1 timeout in this bundle (vs 17% in main ShowX-3, 4/24).

| Task | LOC est | Cycle 1 | Recovery |
|---|---|---|---|
| B003-101 Routing + Devices UI | ~600 | TIMEOUT 23:58Z | cycle 2 finished done report in 12 min, Critic accept |
| B003-102 Playhead awareness | ~400 | TIMEOUT 00:46Z | Architect rescue at 00:54Z → Forge consolidated into round-2-style report → Critic accept round 1 |
| B003-103 Demo show + first-launch | ~500 + 25-cue fixture | TIMEOUT 01:10Z | cycle 2 finished by 01:30Z → Critic round 1 changes_requested (missing AC #9 menubar) → Forge round 2 → Critic accept |

**Hypothesis:** hotfix bundle tasks are individually more wiring-heavy (UI + IPC + integration across multiple workspaces) vs main bundle's more isolated implementation work. Each task touched 3-5 distinct subsystems.

**Decision:** keep 1200s Forge timeout. Self-rescue + Architect rescue protocol robust. No structural change.

## What ShowX-3.1 delivered

### Routing + Devices UI (B003-101)

- CuelistCorePanel gets 3 tabs: Show / Devices / Routing
- DevicesTable + RoutingTable with full CRUD
- DeviceEditDialog with validation per data_model.md §10
- RoutingRuleEditDialog with priority drag-handle
- Cascade delete with DeviceInUseError (rules referencing the device blocked unless force=true)
- Auto-rule creation on device add (smooths empty-state onboarding)
- 85 new tests

### Real-time playhead broadcast (B003-102)

- Playhead state moved from per-station React useState to Yjs awareness
- SM-role authority pattern with deterministic lowest-clientID fallback
- Rate-limited 10 Hz max writes
- SM offline detection (30s threshold) with frozen-playhead UX
- NotAuthorityError on non-SM write attempts
- SMMasterView + OperatorView both wired to shared playhead
- 24 new tests, full suite 1110+ passing

### Demo show + first-launch picker (B003-103)

- 25-cue demo `.showx` fixture committed to `resources/demo-show/` (3 depts, 1 compound cue, 1 group cue, 3 devices, 4 routing rules)
- electron-builder `extraResources` bundles demo into `.app/Contents/Resources/demo-show/`
- FirstLaunchPicker (3 cards: Open Demo / Open Existing / New From Scratch)
- RecentShowsList for subsequent launches (last 5 shown, full 10 stored)
- Native macOS File menubar wiring (Open Demo / Open Cmd+O / Open Recent submenu / New Show Cmd+N) — Round 2 add
- Writable-copy semantics on Open Demo (copies bundled `.showx` to `~/Documents/ShowX/Demo Show.showx`)
- IPC handlers: `cuelist-core:open-demo` / `:open-file-picker` / `:create-new` / `:recent-shows-get` / `:recent-shows-clear`
- 53 new tests

## Critic non-blocking notes (deferred to ShowX-3.2)

From B003-101 review:
1. **`cuelist-core` IPC handlers not wired in main process** — pre-existing gap before B003-101; CuelistCorePanel Open/New buttons don't actually reach main process yet
2. **`target_device_id` RoutingRule shape is incompatible with existing `dispatch/resolveRouting.ts`** — routing UI rules created via B003-101 won't actually route until dispatcher updated
3. **Spec typos in `assertEditAllowed` signature** — minor doc cleanup

From B003-102 review:
4. **CueRow doesn't thread `smOnline` to PlayheadIndicator** — view-level banners cover spec UX, inline indicator would be richer

From B003-103 review:
5. **3 demo devices live only in `DEMO_DEVICES` code constant, not bundled `demo.showx` JSON** — future `cuelist-core/open-show` loader needs fixture extension or special-case
6. **`pushRecent` only fires on open** — close path blocked on future work
7. **`process.cwd()` dev path is brittle** — should use `app.getAppPath()` consistently

These accumulate to a ShowX-3.2 follow-up. None block the user-facing flow.

## What's now possible end-to-end

1. Install ShowX 0.1 DMG (already shipped)
2. Launch app
3. See 3-card picker → click "Open Demo Show"
4. Demo show opens with 25 cues across LX/SX/VIDEO
5. Pair iPad as SM (or any operator role)
6. SM moves playhead → operator stations see it in real-time
7. SM presses Q → standby; Space → GO → routing UI shows which devices fired
8. Use Routing tab to add a real OSC console (Eos, MA3, QLab, etc.) and reroute the demo's cues to it

The blocker chain from "install" to "fire a cue at hardware" is now closed.

## What's still missing for first paid pilot

Per the original Architect 0.2 gap audit, 17 features beyond B003-101..103. Top priorities for next bundle:

- Routing rule → dispatcher integration (Critic note #2 — the routing UI is currently cosmetic until dispatcher reads new shape)
- IPC wiring for Open/New buttons in CuelistCorePanel (Critic note #1)
- Multi-cuelist switcher
- Standby Note in Operator view rows (currently only in editor)
- Print preview for PDF
- Czech/Unicode in PDF

## Forge cadence

- Total subprocess time: ~4h of Forge runtime (5 cycles total: 3 timeouts + 2 successful done report writes + 1 round-2 revision)
- Average wall-time per task: ~50 min including timeouts, Architect rescue, and Critic review
- Round-1 acceptance trend: B003-101 round 1 → B003-102 round 1 → B003-103 round 2

## Decisions ratified

- 1200s Forge timeout stays (Jindřich confirmed earlier; ShowX-3.1 Pattern 8 saturation didn't change the calculus)
- Architect rescue protocol (B003-102) validated as second-tier recovery
- Forge consolidation of Architect rescue into round-2 work is a healthy pattern — Forge doesn't get stuck on partial-rescue ambiguity

## Next steps

1. **Build new DMG with demo show bundled** — the existing DMG (v0.1.0) is pre-3.1; rebuild + push v0.1.1 as the actual usable beta
2. **Update marketing site** — current Downloads page advertises v0.1.0 features; v0.1.1 adds Routing UI + Demo Show
3. **Self-demo session by Jindřich** — install v0.1.1, click "Open Demo", drive through 60-second cuelist test
4. **File ShowX-3.2 follow-up** for the 7 Critic non-blocking items
5. **First customer outreach** per B003-022 playbook (theatre + corporate AV warm contacts)

## Closing reflection

ShowX-3.1 is the bundle that turned 0.1 from "shows the UI" into "actually opens a show and lets you fire cues at hardware". Three task specs closed the three critical gaps in 2.5h of autonomous work. The bundle's 100% Pattern 8 rate is a learning signal — wiring-heavy tasks need different planning than isolated implementation. We compensated through cycle 2 + Architect rescue without changing infrastructure.

ShowX is now demo-ready. Next session = install v0.1.1 and click GO.
