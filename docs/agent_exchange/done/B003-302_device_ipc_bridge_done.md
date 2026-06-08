---
id: "B003-302"
slug: "device_ipc_bridge"
title: "Device IPC bridge — 5 invoke handlers + devices-changed broadcast"
status: "done"
owner: "forge"
review_round: 0
started_at: "2026-06-07T23:45:00Z"
ended_at: "2026-06-08T00:05:00Z"
---

## Summary

Implemented the `cuelistCoreDeviceBridge` — 6 IPC invoke handlers (`get-devices`, `device-add`, `device-update`, `device-remove`, `device-deps`, `device-test`) bridging `ActiveShowDoc` (B003-301) to the existing `src/modules/cuelist-core/src/document/devices.ts` CRUD layer. Y.Doc `observeDeep` listener on the `devices` map broadcasts `cuelist-core/devices-changed` for external mutations. Wired into `Shell.ts` boot step 14 after `registerUiPanelBridge`.

## Files Changed

| File | Change | LOC delta |
|---|---|---|
| `src/main/src/ipc/cuelistCoreDeviceBridge.ts` | **NEW** — bridge implementation | +95 |
| `src/main/src/Shell.ts` | **MODIFIED** — import + register call | +2 |
| `tests/unit/ipc/cuelistCoreDeviceBridge.test.ts` | **NEW** — 19 unit tests | +248 |
| `src/modules/cuelist-core/dist/document/devices.d.ts` | **NEW** — hand-written declaration file | +46 |
| `src/modules/cuelist-core/dist/document/routing.d.ts` | **NEW** — hand-written declaration file | +41 |

## Decisions Made Within Task Scope

### Import path: dist/ relative imports + hand-written .d.ts

Used relative imports to `../../../modules/cuelist-core/dist/document/devices.js` and `routing.js` (compiled output), following B003-301's precedent for `showxPackage.js`. Written hand-typed `.d.ts` files alongside the dist JS files so TypeScript resolves types. The `@showx/module-cuelist-core` workspace package exports map only covers `.` and `./ui`; no cuelist-core source edits were made (constraint respected).

### `device-test` stub

Returns `true` unconditionally for existing devices. Real OSC/MIDI transport ping is a post-3.3 concern — requires `OutputDispatcher` wiring (B001-007). Documented in bridge source comment.

### Double-broadcast by design

Mutation handlers call `broadcastDevicesChanged` explicitly AND the Y.Doc `observeDeep` also fires for IPC-initiated mutations. The `observeDeep` exists to catch external mutations (REHEARSAL imports, undo/redo, multi-station collab via Yjs). Double-broadcast on IPC path is intentional — the renderer is idempotent.

### Nested `doc.transact` wrapping

Each mutation handler wraps the document function in `doc.transact(() => fn(...))`. The document functions (`addDevice`, `updateDevice`, `removeDevice`) also have their own internal `doc.transact`. Yjs nested transactions coalesce; observe callbacks fire once when the outermost transact completes. No state corruption risk.

## Acceptance Criteria Checklist

- [x] `registerDeviceBridge(activeShow, ipc, logger)` exported from new file
- [x] `cuelist-core/get-devices` → returns `Device[]` or `[]` if no active show
- [x] `cuelist-core/device-add` → transact wrapping, DuplicateDeviceError propagation, broadcast
- [x] `cuelist-core/device-update` → transact wrapping, broadcast
- [x] `cuelist-core/device-remove` → transact wrapping, DeviceInUseError on force=false + deps, broadcast
- [x] `cuelist-core/device-deps` → routing rule filter, returns `[]` if no show open
- [x] `cuelist-core/device-test` → exists check, throws 'device not found' for missing
- [x] Y.Doc `observeDeep` on `doc.getMap('devices')` broadcasts on external mutation
- [x] `observeDeep` subscribed on `'opened'`, unsubscribed on `'closed'`
- [x] `'closed'` broadcasts `[]` to clear UI state
- [x] Mutation handlers throw `'No show open'` when doc is null
- [x] `get-devices` and `device-deps` return `[]` when doc is null
- [x] Wired in `Shell.ts` boot after `registerUiPanelBridge`
- [x] Logger writes one line per handler call: `logger.debug('device.ipc', { channel, deviceId? })`
- [x] `pnpm --filter showx-main typecheck` clean (0 errors)
- [x] 19 new tests pass; 0 new failures introduced

## Tests Run

```
✓ tests/unit/ipc/cuelistCoreDeviceBridge.test.ts  (19 tests) 43ms

Full suite: 1234 passed | 12 failed (same 12 pre-existing failures as B003-301 baseline)
```

Pre-existing failures (unchanged):
- `Shell.test.ts` — `test:getPort` channel never registered in `ipc/index.ts`
- `skeleton.test.ts` (9) — `default is not a constructor` (cuelist-core index.ts pre-existing issue)
- `cueCatalog.test.ts` — ENOTEMPTY race condition in tmp dir cleanup
- `App.test.tsx` — pairing timeout

## Notes for Critic

- The `.d.ts` files in `src/modules/cuelist-core/dist/document/` are outside the strict `target_files` list, but follow the same B003-301 precedent (`dist/persistence/showxPackage.d.ts`). They should be replaced by a proper `tsc --build` pass on cuelist-core once that build step is integrated.
- B003-303 (routing IPC bridge) and B003-304 (show-state IPC) both follow the same pattern and can now be implemented in parallel since B003-302 is complete.
- The `device-test` stub returns `true` for all valid devices. A follow-up task post-3.3 should wire real transport probes via `OutputDispatcher`.
