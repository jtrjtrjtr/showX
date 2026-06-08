---
id: "B003-302"
critic_started_at: "2026-06-07T23:35:00Z"
critic_completed_at: "2026-06-07T23:50:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

(Criteria sourced from the done report — task spec was filed via the ShowX-3.3 bundle decision note `decisions/2026-06-07_showx_3_3_bundle_open.md`; no separate `queued/B003-302_*.md` exists. Sibling spec `queued/B003-303_routing_ipc_bridge.md` confirms the contract pattern.)

- [x] **`registerDeviceBridge(activeShow, ipc, logger)` exported from new file** → `src/main/src/ipc/cuelistCoreDeviceBridge.ts:23-27`. Signature matches: `activeShow: ActiveShowDoc, ipc: IpcMainBridge = ipcMain, logger: Logger`.
- [x] **`cuelist-core/get-devices` → `Device[]` or `[]` if no active show** → `cuelistCoreDeviceBridge.ts:44-49`. Test `tests/unit/ipc/cuelistCoreDeviceBridge.test.ts:93-99` (empty) + `:101-116` (populated).
- [x] **`cuelist-core/device-add` → transact wrapping + DuplicateDeviceError propagation + broadcast** → `cuelistCoreDeviceBridge.ts:51-58`. `doc.transact(() => addDevice(...))` wraps mutation; throws bubble out of transact and the IPC handler. Verified `cuelistCoreDeviceBridge.test.ts:135-145` (duplicate throw) + `:147-161` (broadcast).
- [x] **`cuelist-core/device-update` → transact wrapping + broadcast** → `cuelistCoreDeviceBridge.ts:60-70`. Test `cuelistCoreDeviceBridge.test.ts:176-203`.
- [x] **`cuelist-core/device-remove` → transact wrapping + DeviceInUseError on force=false + broadcast** → `cuelistCoreDeviceBridge.ts:72-82`. `removeDevice(doc, deviceId, opts, ACTOR)` propagates DeviceInUseError. Verified `cuelistCoreDeviceBridge.test.ts:218-229` (in-use throw) + `:231-245` (force=true clears + routing rules).
- [x] **`cuelist-core/device-deps` → routing rule filter, returns `[]` if no show** → `cuelistCoreDeviceBridge.ts:84-91`. Filter `(r.target_device_id === deviceId || r.match.device_id === deviceId)` returns `rule_id[]`. Tests `:260-265` (no show) + `:268-279` (deps present) + `:281-295` (device exists, no rules).
- [x] **`cuelist-core/device-test` → exists check, throws `device not found` for missing** → `cuelistCoreDeviceBridge.ts:93-101`. Stub returns `true` for existing device; throws `device not found: <id>` for missing. Tests `:301-329`.
- [x] **Y.Doc `observeDeep` on `doc.getMap('devices')` broadcasts on external mutation** → `cuelistCoreDeviceBridge.ts:30-36`. Test `:335-356` verifies a direct `doc.transact(() => testDoc.getMap('devices').set(...))` (no IPC) triggers broadcast.
- [x] **`observeDeep` subscribed on `'opened'`, unsubscribed on `'closed'`** → `cuelistCoreDeviceBridge.ts:30-42`. `unsubscribeObserve` closure properly captured and called on close.
- [x] **`'closed'` broadcasts `[]` to clear UI state** → `cuelistCoreDeviceBridge.ts:40`. Test `:358-370`.
- [x] **Mutation handlers throw `'No show open'` when doc is null** → `cuelistCoreDeviceBridge.ts:53, 64, 76, 96`. Tests at `:163-170, 205-212, 247-254, 322-329`.
- [x] **`get-devices` and `device-deps` return `[]` when doc is null** → `cuelistCoreDeviceBridge.ts:47-48, 87`. Tests `:93-99, 260-265`.
- [x] **Wired in `Shell.ts` boot after `registerUiPanelBridge`** → `Shell.ts:387` immediately after `Shell.ts:386` (`registerUiPanelBridge`). Boot order: step 13 creates `ActiveShowDoc`, step 14 mounts window + IPC + bridges.
- [x] **Logger writes one line per handler call** → `cuelistCoreDeviceBridge.ts:45, 54, 65, 77, 85, 94`. Format `logger.debug('device.ipc', { channel, deviceId? })` consistent across all 6 channels.
- [x] **`pnpm --filter showx-main typecheck` clean** → Verified independently: ran clean (only re-built `showx-shared`, 0 TS errors).
- [x] **19 new tests pass; 0 new failures introduced** → Verified independently:
  ```
  ✓ tests/unit/ipc/cuelistCoreDeviceBridge.test.ts  (19 tests) 19ms
  Test Files  1 passed (1)
       Tests  19 passed (19)
  ```

## Code review notes

### Strengths

1. **observe wiring is leak-safe** — `unsubscribeObserve` closure captures `devicesMap` + `handler` at open-time, then runs `devicesMap.unobserveDeep(handler)` on close. Pairs correctly with the freshly-resolved doc from `activeShow.getDoc()` on each `'opened'` event, so repeated open/close cycles get independent observer registrations.
2. **Broadcast ordering on close is correct** — `unsubscribeObserve?.()` runs *before* `broadcastDevicesChanged([])`, so a stale callback can't double-fire after the empty broadcast. Also safe against `ActiveShowDoc.close()` having already nulled `this.doc` by the time the `'closed'` listener runs (the closure holds the prior `devicesMap` reference; no `getDoc()` call needed during teardown).
3. **`device-deps` filter is symmetric** — checks both `r.target_device_id === deviceId` AND `r.match.device_id === deviceId`, so dependencies are surfaced regardless of which side of a routing rule references the device. Matches the data model in `dist/document/routing.d.ts:5-9`.
4. **Double-broadcast is intentional and idempotent** — IPC handlers explicitly call `broadcastDevicesChanged` AND `observeDeep` fires for the same transaction. UI consumers reconcile to stable `device_id` keys, so a duplicate render of the same list is a no-op. Done report flags this design choice; consistent with `B003-303` spec rationale (belt-and-suspenders, observe may batch).
5. **Test coverage of failure modes is solid** — DuplicateDeviceError, DeviceInUseError (force=false), force=true success path, device-not-found, no-show-open across all five mutation channels, external mutation observe broadcast, and close-time empty broadcast. The 19-test surface is comprehensive enough for the bridge contract.

### Observations (non-blocking)

1. **Off-by-one in title vs. implementation** — Task title says "5 invoke handlers" but the bridge registers **6** (`get-devices, device-add, device-update, device-remove, device-deps, device-test`). The bundle decision note `decisions/2026-06-07_showx_3_3_bundle_open.md:21` enumerates 6 channels and 1 broadcast, so the implementation matches the *scope* even though the title undercounts by 1. Not a behavioural issue.
2. **Hand-written `.d.ts` in `dist/`** — `src/modules/cuelist-core/dist/document/devices.d.ts` (+46) and `routing.d.ts` (+41) are local-only (`.gitignore:6` excludes `dist/`) and exist to make `tsc` resolve types for the relative `dist/document/*.js` imports. Same precedent as B003-301's `dist/persistence/showxPackage.d.ts`. Acceptable for ShowX-3.3; medium-term fix is to either run `tsc --build` on cuelist-core in the build chain or extend the `@showx/module-cuelist-core` exports map to cover `./document/devices` + `./document/routing`. Done report flags this for the Architect — not a Forge issue.
3. **`device-test` is a stub** — Returns `true` unconditionally for existing devices. The done report and bundle decision both explicitly defer real transport ping to post-3.3 (requires `OutputDispatcher` wiring). Acceptable for this task; no follow-up review needed within bundle scope.
4. **`device-add` returns `{ ok: true }` instead of the created Device** — Compared to the sibling `B003-303` spec, which has `routing-add` return the created rule with assigned `rule_id` + `sort_key`. The `Device` shape requires `device_id` from the caller (not auto-assigned), so returning `{ ok: true }` is functionally complete — the renderer already knows the device_id it sent. Not a regression, but if downstream UI ever needs the canonical post-validation Device (e.g., to surface server-side defaults), `device-add` could be widened later. Out of scope.
5. **Out-of-scope edits in working tree** — `src/modules/cuelist-core/{index.js, manifest.json, src/index.ts}` and `tests/fixtures/showx/sample-show.showx/history.jsonl` are modified but not in B003-302's `files_changed` list. These appear to be pre-existing (carried from B003-301 review's observation #4 and the v0.1.4-v0.1.6 fix series). Not introduced by this task; flagged for Architect awareness only.

## Verdict rationale

All 16 acceptance criteria verified with file:line citations. Independent test run confirms 19/19 passing in `tests/unit/ipc/cuelistCoreDeviceBridge.test.ts`. Typecheck clean. Implementation follows the established B003-301 precedent (relative `dist/` imports + hand-written `.d.ts`; runtime-Y.Doc lifecycle owned in main process; bridges register in Shell.ts boot step 14 after `registerUiPanelBridge`).

The bridge surface is well-bounded: 102 lines of bridge code + 248 lines of tests + 2 lines of Shell wiring. The observe/IPC split cleanly handles both interactive mutation (immediate broadcast) and out-of-band mutation (REHEARSAL imports, undo/redo, multi-station collab). Foundation is ready for B003-303 (routing bridge) and B003-304 (show-state IPC) to be claimed in parallel.

**Accepted, round 1.**
