# ShowX-3.3 bundle — Cuelist Core IPC backend wiring

**Project:** ShowX
**Date:** 2026-06-07 22:30 CEST
**Bundle:** ShowX-3.3 (backend wiring for Cuelist Core UI)
**Spawned from:** v0.1.6 test 2026-06-07 — Loading hang fixed; revealed pre-existing IPC gaps in Devices/Routing tabs + cuelist data load

---

## Why

Bundle ShowX-3 (B003-001..023) shipped Cuelist Core UI + dispatch + persistence at the **document layer** (Y.Doc CRUD primitives in `src/modules/cuelist-core/src/document/`). ShowX-3.1 (B003-101..103) added Devices/Routing UI. ShowX-3.2 (B003-201..203) wired the shell + station mode + routing dispatcher.

What was never built: the **IPC bridge** between the cuelist-core React UI and a runtime Y.Doc instance. Symptoms in v0.1.6:

- Devices tab: `No handler registered for 'cuelist-core/get-devices'`
- Routing tab: `No handler registered for 'cuelist-core/get-routing'`
- "Demo Show — 0 cues" (should show 25 — cuelist not actually loaded into runtime)

13 IPC channels expected by UI exist with zero registrations:
- `cuelist-core/get-devices`, `device-add`, `device-update`, `device-remove`, `device-deps`, `device-test` + `devices-changed` broadcast
- `cuelist-core/get-routing`, `routing-add`, `routing-update`, `routing-remove`, `routing-reorder` + `routing-changed` broadcast
- `cuelist-core/get-state` (ShowState shape: cues + stations + health) + `show-state` broadcast (currently only stub broadcast exists)

## Scope

4 task specs:

| Task | Title | LOC est. |
|---|---|---|
| **B003-301** | ActiveShowDoc service (main process) — Y.Doc lifecycle + debounced save | ~200 |
| **B003-302** | Device IPC bridge (5 invoke handlers + observe broadcast) | ~180 |
| **B003-303** | Routing IPC bridge (4 invoke handlers + observe broadcast) | ~150 |
| **B003-304** | Cuelist show-state IPC (get-state ShowState shape + show-state observe broadcast) — fixes "0 cues" | ~150 |

## Architecture

`ActiveShowDoc` lives in **main process** (not in cuelist-core module) because:
- IPC handler registration needs `ipcMain` (not exposed via ModuleContext)
- Show open/close is a shell-level lifecycle event (already in `src/main/src/ipc/uiPanelBridge.ts` `openShow()`)
- Existing `_activeShow` singleton in uiPanelBridge already tracks pkgPath — this bundle extends it with a Y.Doc handle

Module-level integration in CuelistCore.start() stays minimal — module reports its config + health, but does NOT own IPC. Future module slots (custom-router, cloud-sync) will follow the same pattern: shell registers IPC bridges that read module-owned document/dispatch state.

## Out of scope

- **device-test transport ping** — stubbed to return `true`. Real connectivity check is dispatch-layer work (separate task).
- **device-status broadcast** — depends on real transport ping; deferred.
- **Routing UI dispatcher device dependency UI** — the UI already shows target device dropdown; this bundle doesn't change UI.
- **SHOW mode lock UI integration** — write operations check `assertEditAllowed` (already implemented in document layer); UI affordance for mode toggle is shell-level (separate task post-3.3).
- **Stream Deck / awareness wiring** for `stations` / `health` broadcasts — separate task post-3.3.
- **Workspace import path migration** (relative `../../../src/modules/...` → `@showx/module-cuelist-core/ui`) — defer; current imports work, low-priority hygiene.

## Success criteria

- v0.1.7 DMG installs and runs
- Demo Show opens → Cuelist tab shows 25 cues (not 0)
- Devices tab loads without error; Add Device persists to .showx package
- Routing tab loads without error; Add Routing Rule persists
- Reopen Demo Show → devices + rules survive
- Tests: each task includes vitest unit coverage for new code

## Bundle scope flag

`docs/agent_exchange/claude_runner_scope.json` will be updated:
```json
{
  "enabled": true,
  "bundle_id": "ShowX-3.3",
  "allowed_task_ids": ["B003-301", "B003-302", "B003-303", "B003-304"]
}
```

Tasks process serially (B003-301 → 302 → 303 → 304) due to natural dependency. B003-301 is foundational; B003-302/303 depend on its `getDoc()` exposure; B003-304 depends on the open lifecycle hook.

---

**Architect:** Opus
**Bundle authorization:** Jindřich 2026-06-07 22:30 ("Spec ShowX-3.3 backend bundle (Recommended)")
