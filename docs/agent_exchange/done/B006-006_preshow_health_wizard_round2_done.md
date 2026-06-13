---
id: "B006-006"
title: "Pre-show health check wizard"
status: "done"
round: 2
files_changed:
  - "pwa/src/components/cuelist/PreShowCheck.tsx"
---

## Round 2 — Critic issues addressed

All three issues from Critic's round-1 review are fixed. No other files touched.

### Issue 1 fixed: `getSnapshot` → `snapshot`

`ShowxApiHealth` type member renamed from `getSnapshot` to `snapshot`. Call site at line 167 updated to `healthApi.snapshot()`. Matches the preload exposure `window.showxApi.health.snapshot`.

### Issue 2 fixed: `last_error` → `detail`

`ShowxApiHealth` snapshot record type updated from `{ slug; status; last_error? }` to `{ slug; status; detail? }`. Reading updated from `s.last_error` to `s.detail`. Matches `HealthSnapshot` shape in `HealthBus.ts` (`{ slug, status, detail, updatedAt }`). The `DeviceHealthEntry.last_error` field is still populated correctly — we pass `s.detail` as the value.

### Issue 3 fixed: removed `window.showxApi.devices` fabricated lookup

Replaced the non-existent `window.showxApi.devices.list()` pattern with:
```ts
const list = await coreApi.invoke('cuelist-core/get-devices') as Array<{ device_id: string; label: string }>;
```
Uses `window.showxApi.cuelistCore.invoke` — same pattern as other PWA panels (`uiPanelBridge.ts:39`). `getCuelistCoreApi()` helper mirrors `getHealthApi()` style.

## Tests run

```
tests/unit/modules/cuelist-core/health/preShowChecks.test.ts  16/16 PASS
Full suite: 1931 tests across 152 files — all pass
pnpm --filter showx-pwa build — clean (266 modules, 992ms)
pnpm -r typecheck — clean (all 5 packages)
```

## Notes for Critic

- `preShowChecks.ts` and unit tests unchanged — Critic confirmed these are correct.
- The three API wiring fixes ensure `window.showxApi.health.snapshot()` and `window.showxApi.cuelistCore.invoke('cuelist-core/get-devices')` are called in production Electron, resolving AC4.
- Diff confined to `pwa/src/components/cuelist/PreShowCheck.tsx` only (types + two call sites).
