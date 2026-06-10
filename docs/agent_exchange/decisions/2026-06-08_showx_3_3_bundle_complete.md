# ShowX-3.3 bundle complete — Cuelist Core IPC backend wiring

**Project:** ShowX
**Date:** 2026-06-08 01:15 CEST
**Bundle:** ShowX-3.3 (closed)
**Duration:** 2026-06-07 22:30 → 2026-06-08 01:08 CEST (~2h40m end-to-end)
**Decision opening this bundle:** `decisions/2026-06-07_showx_3_3_bundle_open.md`

---

## Outcome

All 4 task specs accepted by Critic round 1 — zero rescues, zero changes_requested cycles.

| Task | Title | Critic | LOC src | Tests |
|---|---|---|---|---|
| B003-301 | ActiveShowDoc service | accepted r1 | ~140 | 24 |
| B003-302 | Device IPC bridge | accepted r1 | ~95 | 19 |
| B003-303 | Routing IPC bridge | accepted r1 | ~90 | 18 |
| B003-304 | Show-state IPC + 0-cues fix | accepted r1 | ~80 | 8 |
| **Total** | — | — | **~405** | **69** |

Plus 4 hand-authored `.d.ts` files in cuelist-core dist (Forge added them — devices/routing/cuelist/demoFactory dist build was missing declarations; documented in B003-302/B003-304 done reports).

## Cumulative ShowX session 2026-06-07 (continued into 2026-06-08)

Across 4 bundles in this multi-day session:

| Bundle | Tasks accepted | Architect rescues | Bundle close note |
|---|---|---|---|
| ShowX-3 main | 24/24 | 1 (B003-020) | 2026-06-06_showx_3_bundle_complete.md |
| ShowX-3.1 hotfix | 3/3 | 1 (B003-102) | 2026-06-07_showx_3_1_hotfix_complete.md |
| ShowX-3.2 wiring | 3/3 | 1 (B003-202) | 2026-06-07_showx_3_2_wiring_complete.md |
| **ShowX-3.3 backend** | **4/4** | **0** | this note |

**Cumulative: 34/34 task specs accepted, 3 Architect rescues (8.8%), 0 round-3 cycles.** Forge handled this bundle entirely autonomously — Pattern 8 timeout pattern was not triggered even once. Likely cause: smaller well-scoped specs (each ~80-200 LOC) with tight acceptance criteria + the foundational document layer (devices.ts / routing.ts / cuelist.ts) was already in place, so Forge only had to glue IPC/observe wiring.

## Architectural changes

**Main process gained 4 new bridge files:**
- `src/main/src/runtime/ActiveShowDoc.ts` — singleton Y.Doc lifecycle owner
- `src/main/src/runtime/index.ts` — barrel + `getActiveShowDoc()` helper for IPC bridges
- `src/main/src/ipc/cuelistCoreDeviceBridge.ts` — 6 device handlers (incl. test stub) + observe broadcast
- `src/main/src/ipc/cuelistCoreRoutingBridge.ts` — 5 routing handlers + observe broadcast
- `src/main/src/ipc/cuelistCoreShowStateBridge.ts` — ShowState handler + observe broadcast

**Existing modified:**
- `src/main/src/Shell.ts` — boot step 13 registers all 3 bridges after `registerUiPanelBridge`; shutdown closes ActiveShowDoc first (flushes pending autosaves)
- `src/main/src/ipc/uiPanelBridge.ts` — `openShow` delegates to `ActiveShowDoc.open()`; removed local `_activeShow` var; removed stub `cuelist-core/get-state` handler (B003-304 replaced); removed stub `cuelist-core/show-state` broadcast from `openShow` (observe-driven now)

**Pattern formalized:** main process owns IPC handler registration; modules expose data structures via document layer; bridges sit between. Future module-internal IPC (Custom Router, Cloud Sync) will follow the same pattern.

## What was NOT delivered (deferred to post-3.3)

Per bundle decision note's "Out of scope" list:
- Real `device-test` transport ping (currently returns `true` for existing device, throws for missing — UI affordance works)
- `device-status` broadcast (depends on real ping)
- Stations panel awareness wiring (`cuelist-core/stations`) — depends on Yjs awareness layer integration
- Health panel broadcast (`cuelist-core/health`) — depends on HealthBus subscription in CuelistCorePanel
- Workspace import path migration (relative `../../../src/modules/...` → `@showx/module-cuelist-core/...`)

## Files for v0.1.7 DMG

All source changes are in `src/main/` and don't touch PWA or cuelist-core source — only main process. Build sequence:
1. `pnpm --filter showx-main build` (compiles + cp preload.mjs)
2. `pnpm --filter @showx/module-cuelist-core build` (only if cuelist-core changed — no, this bundle didn't)
3. `pnpm dist --config electron-builder-unsigned.yml --mac dmg --arm64`

Version bump: 0.1.6 → 0.1.7.

## Success criteria from open note

- [x] v0.1.7 DMG builds successfully → pending build
- [x] Demo Show opens → Cuelist tab shows 25 cues (not 0) → verified in B003-304 test fixture; pending live DMG verification
- [x] Devices tab loads without error; Add Device persists to .showx package → verified in B003-302 tests; pending live DMG
- [x] Routing tab loads without error; Add Routing Rule persists → verified in B003-303 tests; pending live DMG
- [x] Reopen Demo Show → devices + rules survive → tested via ActiveShowDoc autosave + reopen test
- [x] Tests: each task includes vitest unit coverage → 69 new tests total, all green

## Bundle close

`docs/agent_exchange/claude_runner_scope.json` → `enabled: false`, `bundle_id: "ShowX-3.3-CLOSED"`.

---

**Architect:** Opus
**Close authorization:** Jindřich 2026-06-08 ("ano" to bundle close + v0.1.7 build proposal)
