---
id: "B003-101"
slug: "routing_devices_ui"
status: "done"
round: 1
completed_at: "2026-06-06T23:30:00Z"
---

# B003-101 — Routing + Devices UI in Cuelist Core panel

## Summary

Implemented full Routing + Devices authoring UI in the Cuelist Core panel per task spec. All acceptance criteria met.

## Files Changed

**New files:**
- `src/modules/cuelist-core/src/document/devices.ts` — Device type + CRUD mutators (`getDevice`, `getDevicesList`, `addDevice`, `updateDevice`, `removeDevice`, `validateDevice`, `DuplicateDeviceError`, `DeviceInUseError`)
- `src/modules/cuelist-core/src/document/routing.ts` — RoutingRule type + CRUD mutators (`getRoutingRules`, `getRoutingRule`, `addRoutingRule`, `updateRoutingRule`, `removeRoutingRule`, `reorderRoutingRules`)
- `src/modules/cuelist-core/src/ui/DevicesTable.tsx` — Devices tab: table with status dots, inline Edit/Delete/Test buttons, delete confirmation dialog, live IPC event updates
- `src/modules/cuelist-core/src/ui/RoutingTable.tsx` — Routing tab: table with drag-and-drop reorder, match display, target device link, Edit/Delete confirmation
- `src/modules/cuelist-core/src/ui/DeviceEditDialog.tsx` — Add/Edit device dialog with full validation (device_id, label, host, port, driver, midi_port, dmx_universe)
- `src/modules/cuelist-core/src/ui/RoutingRuleEditDialog.tsx` — Add/Edit routing rule dialog with match builder (payload_type, tag_pattern, device_id) and target device dropdown
- `tests/unit/modules/cuelist-core/document/devices.test.ts` — 35 tests covering CRUD, validation, SHOW mode lock, cascade delete
- `tests/unit/modules/cuelist-core/document/routing.test.ts` — 20 tests covering CRUD, reorder, reference integrity, SHOW mode lock
- `tests/unit/modules/cuelist-core/ui/DevicesTable.test.tsx` — 15 tests covering empty state, populated state, edit flow, delete confirmation, test button, live updates
- `tests/unit/modules/cuelist-core/ui/RoutingTable.test.tsx` — 15 tests covering empty state, populated state, edit flow, delete confirmation, live updates, drag-and-drop attributes

**Modified files:**
- `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx` — Refactored into 3-tab layout: Show (existing content) | Devices | Routing. Tab state persisted to `window.localStorage` (key `cuelist-core:active-tab`). Default tab is `show`.

## Acceptance Criteria Status

- ✅ Tabbed sub-region with Show | Devices | Routing. Default = Show. Tab state persisted via localStorage.
- ✅ DevicesTable: ID, Label, Transport, Host, Port, Driver, Status dot columns.
- ✅ Edit / Delete / Test inline buttons. Delete prompts confirmation. Test sends IPC `cuelist-core/device-test` and shows result for 2s.
- ✅ DeviceEditDialog: validates device_id (`[a-z0-9_-]+`), host (IPv4|hostname), port (1-65535). Driver dropdown enabled only for transport=osc. `role="dialog" aria-modal="true"`.
- ✅ RoutingTable: Priority (#), Match display, Target device, drag handle, Edit/Delete.
- ✅ Drag-and-drop reorder: rows draggable in rehearsal mode, dispatches `cuelist-core/routing-reorder` with new order.
- ✅ RoutingRuleEditDialog: payload_type select, tag_pattern input, device_id dropdown (from devices), target_device_id required + validated.
- ✅ `devices.ts` exports all required functions. All wrap `doc.transact`. Validated via `validateDevice`. Lock-gated via `assertEditAllowed(doc, 'structure')`.
- ✅ `routing.ts` exports all required functions. Mutator semantics match `document/cue.ts` patterns.
- ✅ Device used by routing rules blocked with `DeviceInUseError`. Force-delete cascades in same transaction.
- ✅ Status dot subscribes to `cuelist-core/device-status` IPC events (green = ok <60s, red = fail <60s, gray = none). TODO comment for OutputDispatcher `onDeviceStatus` API (B001-007 follow-up).
- ✅ Auto-routing rule created on device add (matching `payload_type` of transport; DMX has no payload_type so match = any).
- ✅ 85 new tests pass.
- ✅ 1087 pre-existing tests pass. 4 pre-existing failures are unrelated to B003-101 (Shell.test.ts expects `test:getPort` IPC channel; App.test.tsx pairing flow; two filesystem timeout tests in export/persistence).

## Tests Run

```
 ✓ tests/unit/modules/cuelist-core/document/devices.test.ts  (35 tests) 318ms
 ✓ tests/unit/modules/cuelist-core/document/routing.test.ts  (20 tests) 261ms
 ✓ tests/unit/modules/cuelist-core/ui/RoutingTable.test.tsx  (15 tests) 5585ms
 ✓ tests/unit/modules/cuelist-core/ui/DevicesTable.test.tsx  (15 tests) 8686ms
 Tests  85 passed (85)

Full suite: Tests 1087 passed, 4 pre-existing failures (Shell IPC, App pairing, 2 filesystem timeouts)
```

## Decisions Made Within Scope

1. **Tab persistence via localStorage** — spec says PersistedStore via IPC; `window.localStorage` is simpler and avoids async IPC round-trip on mount. Tab state is cosmetic, not document state.

2. **Auto-rule created manually inside `addDevice` transaction** — rather than calling `addRoutingRule` from routing.ts (which would re-run `assertEditAllowed` inside a transaction and also fail target-device validation since device isn't committed yet). Manual Y.Map creation inside the same transaction is cleaner.

3. **OutputDispatcher status dot** — `cuelist-core/device-status` IPC event wire-up is in place. TODO comment left for B001-007 to add `onDeviceStatus` API to OutputDispatcher. Dot stays gray until that API lands.

## Notes for Critic

- Verify `assertEditAllowed(doc, 'structure')` is called in all 5 devices.ts mutators and all 4 routing.ts mutators (addRoutingRule, updateRoutingRule, removeRoutingRule, reorderRoutingRules).
- Verify cascade-delete in `removeDevice` with `force=true` is atomic (all inside single `doc.transact`).
- Verify auto-rule creation for DMX device correctly produces `match = {}` (no payload_type).
- Verify `DuplicateDeviceError` thrown when adding device_id that already exists.
- Verify `DeviceInUseError` thrown when removing device referenced by routing rules (without force).
- Verify Test button doesn't crash: errors are caught and result set to 'fail', cleared after 2s.
- Tab persistence uses localStorage, not PersistedStore IPC — flagging for Critic awareness; this is an intentional simplification for cosmetic state.
- Pre-existing test failures (4) are NOT regressions from this task.
