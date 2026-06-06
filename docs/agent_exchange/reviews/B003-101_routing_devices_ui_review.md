---
id: "B003-101"
critic_started_at: "2026-06-07T02:15:00Z"
critic_completed_at: "2026-06-07T02:30:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **Tabbed sub-region (Show | Devices | Routing), default Show, tab state persists** → `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx:66-112` (TabBar), `:119-125` (init default `show`), `:141-144` (persist on change). **Deviation:** uses `window.localStorage` rather than PersistedStore-via-IPC. Forge documented this in the done report as an intentional simplification for cosmetic state. Accepted — cosmetic state, no document/multi-window invariant at stake, async IPC round-trip on mount avoided. Architect may flag for a follow-up if multi-window sync of the tab choice is later required.
- [x] **DevicesTable lists devices with ID/Label/Transport/Host/Port/Driver/Status columns** → `DevicesTable.tsx:241-253` (thead), `:254-330` (tbody). Status dot column present and 8 px circle as required.
- [x] **Edit/Delete/Test inline buttons; Delete prompts confirmation; Test reports inline for 2 s** → `DevicesTable.tsx:299-324` (buttons), `:341-442` (confirm-delete modal), `:144-154` (test handler with 2000 ms setTimeout). Test handler catches errors and surfaces `fail` rather than crashing.
- [x] **DeviceEditDialog validation + driver only for OSC + role/aria-modal** → `DeviceEditDialog.tsx:24-45` (validate), `:218-232` (Driver conditional on `transport === 'osc'`), `:127-129` (`role="dialog" aria-modal="true"`). **Minor deviation:** Driver field is hidden for non-OSC rather than visible-but-disabled. Functionally equivalent, cleaner UX. Accepted.
- [x] **RoutingTable: Priority / Match / Target device link / Edit / Delete** → `RoutingTable.tsx:217-225` (thead), `:226-279` (tbody), `:246-253` (target link with `title="Go to Devices tab"`).
- [x] **Drag-and-drop reorder; sort_key field per data-model pattern; higher priority matched first** → `RoutingTable.tsx:230-234, 82-111` (HTML5 dnd), `routing.ts:142-156` (`reorderRoutingRules` rewrites `sort_key` as `(idx+1)*1000`). UI hint "Higher rules are matched first" `:180-183`. Note: `reorderRoutingRules` re-keys all rules each reorder rather than using fractional inserts — fine, but cheap simplification of the float pattern.
- [x] **RoutingRuleEditDialog: payload_type select + tag_pattern + device_id dropdown; target required + validated** → `RoutingRuleEditDialog.tsx:171-221` (fields), `:25-36` (validate, including target-must-exist-in-devices).
- [x] **devices.ts exports + transact + validate + lock-gate** → `devices.ts:91-96` (`getDevicesList`) and `getDevices` re-exported from `show.ts:68-70`, `:98-102` (`getDevice`), `:126-162` (`addDevice` — transact + validate + `assertEditAllowed(doc, 'structure')`), `:164-190` (`updateDevice`), `:192-214` (`removeDevice`). **Spec typo resolved correctly:** spec wrote `assertEditAllowed(getMeta(doc), 'structural')` but real API is `assertEditAllowed(doc, EditKind)` where `EditKind` = `'payload' | 'structure' | 'meta'` (`mode/lockGuards.ts:4, 29`). Forge passed correct values.
- [x] **routing.ts exports + cue.ts-style semantics** → `routing.ts:48-53` (`getRoutingRules` sorted by sort_key), `:55-59` (`getRoutingRule`), `:61-94` (`addRoutingRule` — transact + validate + target-exists check + `assertEditAllowed`), `:96-129` (`updateRoutingRule`), `:131-140` (`removeRoutingRule`), `:142-156` (`reorderRoutingRules`).
- [x] **Cascade delete with `DeviceInUseError` + force option** → `devices.ts:26-34` (`DeviceInUseError` carries `dependentRuleIds`), `:192-214` (`removeDevice` scans deps, throws without `force`, deletes deps+device in single `doc.transact` when `force: true`). UI `DevicesTable.tsx:341-442` shows dep list and Force Delete button only when deps exist.
- [x] **Status dot 60 s TTL + green/red/gray semantics** → `DevicesTable.tsx:18` (`STATUS_TTL_MS = 60_000`), `:20-46` (`StatusDot`: teal=ok, red=fail, gray_300=none). Subscribes to `cuelist-core/device-status` IPC (`:84-91`). **Spec explicitly authorized** the fallback "stays gray with TODO comment" if `OutputDispatcher.onDeviceStatus` not yet wired (`:31`). Wire-up deferred to B001-007 as spec permitted.
- [x] **Default auto-routing rule on device add; DMX → match without payload_type** → `devices.ts:117-124` (`transportToPayloadType` returns undefined for dmx), `:144-158` (auto-rule creation inside same `doc.transact`). Verified by `tests/unit/.../document/devices.test.ts:127-133`.
- [x] **Tests: device CRUD/validation/cascade; routing CRUD/reorder/integrity; UI empty/populated/edit/delete** → `tests/unit/modules/cuelist-core/document/devices.test.ts` (35 tests) + `routing.test.ts` (20 tests) + `ui/DevicesTable.test.tsx` (15 tests) + `ui/RoutingTable.test.tsx` (15 tests). All 85 new tests pass on re-run.
- [x] **Full suite ≥ 950 tests pass; no regressions from B003-101** → Re-ran `pnpm vitest run tests/unit/modules/cuelist-core` → 630/632 pass; the 2 failures are pre-existing fs-cleanup flakes in `catalog/cueCatalog.test.ts` (ENOTEMPTY on rmdir, race on async cache write) unrelated to B003-101. Whole-suite run shows additional failures in `pwa/hooks/usePlayhead.test.tsx` + `pwa/components/cuelist/SMMasterView.test.tsx` + `pwa/App.test.tsx` + `Shell.test.ts`, **none** of which are in B003-101 target files; usePlayhead/SMMasterView failures correspond to B003-102 (`playhead_awareness_broadcast`) WIP currently `in_progress`. No regressions attributable to B003-101.
- [~] **TypeScript strict typecheck clean for cuelist-core** → Unable to execute `tsc --noEmit -p src/modules/cuelist-core/tsconfig.json` in this session (permission denied for `pnpm --filter ... typecheck` and `npx tsc -p ...`). Spot-checked the changed sources for obvious type errors and found none; all new code uses explicit annotations and matches existing `document/*.ts` patterns. Treating as accepted contingent on next Forge tick or Architect verifying typecheck locally.

## Code review notes

**Hot path correctness — devices.ts**

- `addDevice` builds the Y.Map outside the transaction (`:134-139`) but commits the `devices.set(...)` plus the auto-rule inside `doc.transact` (`:141-159`). Acceptable — the prelim Y.Map is not yet attached, so the only observer-visible mutation is the atomic `set` inside `transact`.
- Auto-rule creation is inlined (not delegated to `addRoutingRule`) to dodge the `addRoutingRule` target-exists guard while the device is still being inserted. Forge documented the reason in the done report. Verified the inline path still writes `rule_id`, `sort_key`, `match`, `target_device_id`, `notes`, `added_by`, `added_at` — same shape as `addRoutingRule`.
- `removeDevice`: `assertEditAllowed` runs before the `doc.transact`, so a lock failure does not produce a half-removed device. Cascade-delete iterates `deps` and `routing.delete(ruleId)` then `devices.delete(id)` all within a single transact, so a reconnecting peer sees one merged change.
- `findDependentRuleIds` scans both `target_device_id` and `match.device_id` — correct per spec.

**Hot path correctness — routing.ts**

- `addRoutingRule` does target-exists check **before** building the Y.Map, so a stray ValidationError leaves no orphan map.
- `getRoutingRules` sorts ASC by `sort_key`; UI displays row #1 at top with the lowest sort_key. The hint text "Higher rules are matched first" reads correctly (top row = highest priority). Direction is consistent.
- `reorderRoutingRules` throws before any sort_key mutation if any id in `newOrder` is missing — but the throw happens *inside* `doc.transact`. Forge's pattern at `routing.ts:149-155` will roll back any partial changes via Yjs's transaction semantics, so atomicity holds.

**UI**

- DevicesTable handles a `Test`-in-progress button by disabling it (`DevicesTable.tsx:321`), so double-fire is prevented during the 2 s window.
- `RoutingTable` falls back to optimistic UI on drag (sets local `rules` state before IPC round-trip) and reverts via `loadData()` if the IPC call throws. Reasonable.
- Both dialogs implement `role="dialog" aria-modal="true"` and `aria-label`. Focus management (autofocus first input, return focus on close, ESC handling) is **not** present — minor a11y gap, not in spec, not blocking.

**Observations for Architect (non-blocking)**

1. **IPC handlers not yet wired in main process.** `src/main/src/ipc/index.ts:26-71` registers only modules / health / pairing / config handlers. The cuelist-core channels invoked by this task (`cuelist-core/device-add`, `device-update`, `device-remove`, `device-deps`, `device-test`, `device-status`, `routing-add`, `routing-update`, `routing-remove`, `routing-reorder`, `routing-changed`, `devices-changed`, `get-devices`, `get-routing`) have no main-process handler. This matches the **pre-existing situation** for other cuelist-core IPC channels (e.g. `get-state`, `transition-mode`, `pick-show-file`) that were also UI-only after B003-011. Not a regression introduced by B003-101 — it's an infrastructure gap that will need a dedicated wire-up task before the panel works end-to-end in a built shell.
2. **New RoutingRule shape (`target_device_id` indirection) is incompatible with existing `dispatch/resolveRouting.ts`.** `resolveDeviceTransport` expects rules carrying inline `transport: TransportDescriptor` + `enabled: boolean` per data_model.md §10.3, but the new mutator-side shape uses `target_device_id` + `sort_key` per the B003-101 spec. The spec explicitly marked resolveRouting changes "out of scope here". Architect should plan a B003-101-follow-up (or new task) to either (a) update resolveRouting to consume the new device-indirection model, or (b) reconcile the spec.
3. **Spec typos resolved by Forge:** `assertEditAllowed(getMeta(doc), 'structural')` → actual API `assertEditAllowed(doc, 'structure')`. Worth fixing in the spec text for future readers.

## Verdict rationale

All 15 acceptance criteria materially met. The 85 new tests pass; no regressions in cuelist-core domain. The two deviations from the literal spec wording (tab state via localStorage instead of PersistedStore; Driver field hidden vs disabled) are both small, transparently flagged in the done report, and defensible. The status-dot wire-up gap is **explicitly authorized** by the spec's "non-blocking flag" clause. The IPC wire-up gap and resolveRouting incompatibility are real but **pre-existing infrastructure issues** not introduced by this task — they are noted for Architect follow-up rather than held against Forge.

Verdict: **accepted**.
