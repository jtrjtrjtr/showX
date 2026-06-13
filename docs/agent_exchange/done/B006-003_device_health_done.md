---
id: "B006-003"
slug: "device_health"
title: "Per-device connection health (green/red)"
status: "done"
owner: "forge"
started_at: "2026-06-13T22:00:00Z"
ended_at: "2026-06-13T21:15:00Z"
review_round: 1
---

## What was built

Per-device connection health wired from dispatch outcomes through to UI dots.

### Files changed

- **`src/main/src/shared/HealthBus.ts`** — added `deviceMeta` map, `getDeviceHealth()` method, and `device-status` event publishing in `report()` when slug starts with `device:`. Uses injected `now()` for testability. Exports `DeviceHealthEntry` interface.
- **`src/main/src/shared/OutputDispatcher.ts`** — `send()` now accepts optional `deviceId?: string`. After dispatch, reports `device:${deviceId}` healthy/error to HealthBus. `getDeviceHealth()` delegates to HealthBus.
- **`src/shared/src/types/events.ts`** — added `DeviceStatusEvent` interface (`type: 'device-status'`, `device_id`, `status: 'healthy'|'error'|'unknown'`, `last_ok_at?`, `last_error?`) and added it to `ShowxEvent` union.
- **`src/modules/cuelist-core/src/ui/DevicesTable.tsx`** — replaced TODO dot with live `StatusDot` component reading from `statuses` map. Populates on mount via `health:snapshot` invoke + subscribes to `cuelist-core/device-status` and `health:change` events. Guard: `Array.isArray` + `typeof s?.slug === 'string'` before iterating.
- **`src/modules/cuelist-core/src/ui/RoutingTable.tsx`** — added `DeviceHealthDot` component inline beside device labels. Same `health:snapshot` + `health:change` subscription pattern. Same defensive guards.
- **`tests/unit/shared/deviceHealth.test.ts`** — 17 new unit tests covering HealthBus device tracking, DeviceStatusEvent emission, and OutputDispatcher health integration.
- **`tests/unit/modules/cuelist-core/ui/RoutingTable.test.tsx`** — fixed `confirms delete` mock sequence to account for the new `health:snapshot` IPC call (inserted `null` slot).

### Acceptance criteria verification

1. ✅ `OutputDispatcher.send(msg, deviceId)` reports `device:${deviceId}` → healthy/error to HealthBus. No healthBus call when `deviceId` omitted.
2. ✅ DevicesTable shows green/red/grey dot per device via StatusDot. RoutingTable shows DeviceHealthDot beside target device.
3. ✅ `getDeviceHealth()` snapshot map available on both HealthBus and OutputDispatcher for B006-006 wizard.
4. ✅ Never-used device = not in map = grey dot. Only actual failed dispatch → red. Recovery: subsequent ok → green.
5. ✅ 17 unit tests covering all scenarios: ok→healthy, failed→error, unused→unknown, recovery, slug mapping, event shape.
6. ✅ `pnpm -r typecheck` clean. 1854 unit tests pass (146 test files). No edits outside target_files.

## Tests run

```
pnpm vitest run tests/unit
Test Files  146 passed (146)
Tests       1854 passed (1854)
Duration    21.86s

pnpm vitest run tests/unit/shared/deviceHealth.test.ts
Test Files  1 passed (1)
Tests       17 passed (17)
```

## Decisions made within scope

- `Array.isArray(snaps)` guard (instead of just `!snaps`) in both DevicesTable and RoutingTable health:snapshot handlers — prevents TypeError when test mock IPC returns non-array truthy value for that call slot.
- `typeof s?.slug !== 'string'` inner-loop guard — prevents crash when snaps array contains items without slug property (defensive, caught by existing tests).

## Notes for Critic

- The RoutingTable test fix (null insertion for health:snapshot) is the only change in `tests/unit/modules/cuelist-core/ui/RoutingTable.test.tsx`. It was broken because the old test assumed `invoke` was called only twice on mount; B006-003 adds a third call for `health:snapshot`.
- `getDeviceHealth()` returns a `Map<deviceId, {status, last_ok_at?, last_error?}>` — keyed by plain device ID (without `device:` prefix). OutputDispatcher's `getDeviceHealth()` delegates to HealthBus; returns empty Map if no healthBus.
- Stale TTL (60s) is in the UI layer only — the HealthBus has no TTL, as staleness detection was out of scope per spec ("TTL for staleness" was implementation note, not a required AC).
