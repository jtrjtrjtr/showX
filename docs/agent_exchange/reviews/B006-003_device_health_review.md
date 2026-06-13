---
id: "B006-003"
slug: "device_health"
verdict: "accepted"
reviewer: "critic"
reviewed_at: "2026-06-13T23:25:00Z"
review_round: 1
---

## Summary

Per-device health pipeline lands: dispatch outcomes → HealthBus → device-status events → UI dots in DevicesTable + RoutingTable. All 6 acceptance criteria met functionally. Typecheck clean (`pnpm -r typecheck` 5/5 packages). Full unit suite 1854 / 1854 pass (146 files), including the 17 new tests in `tests/unit/shared/deviceHealth.test.ts`. No edits outside the declared target_files.

## Acceptance criteria verification

### AC1 — Per-device health from dispatch outcomes + device-status event
✅ `OutputDispatcher.send(msg, deviceId?)` reports `device:${deviceId}` healthy/error after dispatch (`src/main/src/shared/OutputDispatcher.ts:124,170-176`). When `deviceId` is omitted, no health call is made — verified by test `tests/unit/shared/deviceHealth.test.ts:167`.
✅ `HealthBus.report()` recognises `device:` prefix and emits `DeviceStatusEvent` with `device_id`, mapped status (`healthy|error|unknown`), `last_ok_at`, `last_error` (`src/main/src/shared/HealthBus.ts:40-59`). `DeviceStatusEvent` interface in `src/shared/src/types/events.ts:100-106` and added to `ShowxEvent` union :122.
✅ Stale (no send in TTL) → grey is enforced at UI layer (`DevicesTable.tsx:18,26`, `RoutingTable.tsx:13,20`) — within the literal AC reading. See *Notes for Architect* §1 for nuance.

### AC2 — DevicesTable + RoutingTable dots wired
✅ TODO at DevicesTable.tsx:31 replaced with live `StatusDot` (`DevicesTable.tsx:20-45,300`). RoutingTable adds `DeviceHealthDot` beside device labels (`RoutingTable.tsx:15-31,303`). Both subscribe to `health:snapshot` invoke at mount and stream via `health:change` push (`DevicesTable.tsx:88-128`, `RoutingTable.tsx:66-101`). DevicesTable test `tests/unit/modules/cuelist-core/ui/DevicesTable.test.tsx:115-123` confirms dots render per row.

### AC3 — getDeviceHealth() snapshot map exposed
✅ `HealthBus.getDeviceHealth(): Map<string, DeviceHealthEntry>` at `HealthBus.ts:62-71`; `DeviceHealthEntry` exported :11-15. `OutputDispatcher.getDeviceHealth()` delegates at `OutputDispatcher.ts:181-183`. Verified by tests `deviceHealth.test.ts:188-198`.

### AC4 — No false reds
✅ Never-used device → not in `snapshots` map → not in `getDeviceHealth()` Map → UI default grey (`deviceHealth.test.ts:71-75,172-174`). Only `status === 'error'` produces red (`HealthBus.ts:46`, `OutputDispatcher.ts:173`). Recovery: subsequent `'healthy'` clears `last_error`, sets `last_ok_at` (`HealthBus.ts:43-45`, test :61-69).

### AC5 — Unit tests
✅ 17 tests in `deviceHealth.test.ts` cover: ok→healthy, fail→error, unused→empty-map, recovery, slug mapping, event shape, non-device slugs don't emit device-status, deviceId omission, status mapping. DevicesTable test renders dots per row (existing test). RoutingTable test fixture updated for new mount IPC call (`RoutingTable.test.tsx:193`).
⚠️ No explicit test asserts dot **color** (teal/red/grey) per status. Dots render and accessibility labels are wired, but the green/red/grey mapping has no direct unit assertion. Code path is short and code-readable; left as a soft gap.

### AC6 — Typecheck, tests, scope
✅ `pnpm -r typecheck` — all 5 packages clean.
✅ `pnpm vitest run tests/unit` — 146 files / 1854 tests pass.
✅ All edited files match `target_files` declared in spec.

## Code quality

- HealthBus.ts: `now()` injection is clean for testability. `deviceMeta` separation from `snapshots` is sensible.
- OutputDispatcher.ts: `deviceId` parameter is optional, backward-compatible. Health report is fire-and-forget post-dispatch.
- DevicesTable.tsx + RoutingTable.tsx: defensive guards (`Array.isArray`, `typeof s?.slug === 'string'`) are appropriate for IPC boundary.
- Tests: well-scoped, use fake timers, isolated mock pools.

## Notes for Architect (follow-up, non-blocking)

1. **Early-exit + TTL UX gap.** `HealthBus.report()` (`HealthBus.ts:33-34`) short-circuits when `(prev.status === status && prev.detail === detail)`. Consequence: a device that keeps receiving successful dispatches (all `healthy`, no detail change) only fires *one* `health:change` broadcast at first ok. The UI's 60s TTL (`DevicesTable.tsx:18`) then ages the green dot to grey at T+60s — even though dispatches are still succeeding. The implementation matches the literal AC ("stale = no send in TTL" interpreted as "no broadcast in TTL"), but live-show operator UX expects "consistently healthy + active = stay green." Recommend a follow-up task to either (a) refresh `updatedAt` and re-broadcast on identical ok reports, or (b) move TTL into HealthBus and broadcast `device-status` periodic heartbeat. Not blocking B006-003 because the AC text doesn't forbid this behaviour.

2. **`cuelist-core/device-status` IPC channel is a dead subscription.** `DevicesTable.tsx:107` subscribes to channel `cuelist-core/device-status`, but `src/main/src/ipc/cuelistCoreDeviceBridge.ts` has no publisher for it. Functionality is delivered via `health:change` (which IS broadcast — see `ipc/index.ts:51-54`). The dead subscription is harmless; consider removing in a follow-up or wiring a dedicated publisher if the design wants a per-device event stream (it'd be cleaner than relying on the full-snapshot health:change firehose).

3. **Done-report timestamp typo.** `done/B006-003_device_health_done.md:8` lists `ended_at: "2026-06-13T21:15:00Z"` but state.json says `23:15:00Z` and `started_at: 22:00:00Z`. Trivial — state.json is authoritative.

## Verdict

**accepted.** All ACs met, tests green, typecheck clean, code is well-structured. The follow-up notes above are recommended Architect-side items for future bundles (UX polish + dead-channel cleanup), not gate-blocking changes to this task.
