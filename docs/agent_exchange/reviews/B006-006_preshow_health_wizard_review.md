---
id: "B006-006"
title: "Pre-show health check wizard"
verdict: "accepted"
round: 2
reviewer: "critic"
reviewed_at: "2026-06-13T22:40:00Z"
---

## Summary

Round 2 fixes all three round-1 wiring defects. The wizard now correctly surfaces B006-003 device health and live device list from registered IPC channels. Code change is minimal (PreShowCheck.tsx only), unit tests still 16/16 green, full repo typecheck + pwa build clean.

## Round-1 issues — all resolved

### Issue 1 — `getSnapshot` → `snapshot` ✓ fixed

- `pwa/src/components/cuelist/PreShowCheck.tsx:19` — type member is now `snapshot: () => Promise<...>`.
- `pwa/src/components/cuelist/PreShowCheck.tsx:167` — call site is `await healthApi.snapshot()`.
- Cross-checked against preload at `src/main/src/ui/preload.ts:10-12`: `health: { snapshot: () => ipcRenderer.invoke(IPC.HEALTH_SNAPSHOT) }`. Names match.

### Issue 2 — `last_error` → `detail` ✓ fixed

- `pwa/src/components/cuelist/PreShowCheck.tsx:19` — record type is `{ slug; status; detail? }`.
- `pwa/src/components/cuelist/PreShowCheck.tsx:176` — reads `s.detail`, stores in `DeviceHealthEntry.last_error` (which is the cuelist-core internal field name; the rename only applies to the preload-side type alias, which is what the bug was about).
- Cross-checked against `src/main/src/shared/HealthBus.ts:35`: `HealthSnapshot { slug, status, detail, updatedAt }`. Names match.

### Issue 3 — fabricated `window.showxApi.devices` removed ✓ fixed

- `pwa/src/components/cuelist/PreShowCheck.tsx:31-40` — new `CuelistCoreApi` type + `getCuelistCoreApi()` helper, reads from `window.showxApi.cuelistCore`.
- `pwa/src/components/cuelist/PreShowCheck.tsx:181-186` — calls `coreApi.invoke('cuelist-core/get-devices')` and maps to `{ device_id, label }[]`.
- Cross-checked against preload at `src/main/src/ui/preload.ts:51-52` (`cuelistCore.invoke`) and IPC handler registration at `src/main/src/ipc/cuelistCoreDeviceBridge.ts:45` (`'cuelist-core/get-devices'`). Channel + namespace both real.

## Acceptance criteria — final

| AC | Verdict | Notes |
|---|---|---|
| 1. Button in SM view, 4 categories, pass/warn/fail + hints | ✓ pass | `pwa/src/components/cuelist/SMMasterView.tsx:911-925` PRE-SHOW button; `:1225-1226` overlay render; four check functions at `src/modules/cuelist-core/src/health/preShowChecks.ts:63-170`. |
| 2. Pure check logic, separate UI | ✓ pass | `preShowChecks.ts` pure (no I/O); `PreShowCheck.tsx` does data gathering only. |
| 3. Non-blocking, re-runnable, clear verdict | ✓ pass | `PreShowCheck.tsx:213-228` modal with close; `:288` re-run label; `:70-102` VerdictBanner; advisory footer at `:324`. |
| 4. Surfaces B006-003 device health via `getDeviceHealth()` snapshot | ✓ pass | Now wires through real `showxApi.health.snapshot` + `showxApi.cuelistCore.invoke('cuelist-core/get-devices')`. |
| 5. Unit tests (all five scenarios) | ✓ pass | 16/16 tests pass in `tests/unit/modules/cuelist-core/health/preShowChecks.test.ts`. |
| 6. Build + typecheck clean, no edits outside target_files | ✓ pass | Critic verified independently: `pnpm --filter showx-pwa build` clean (266 modules, ~983ms), `pnpm -r typecheck` clean (5 packages), diff confined to PreShowCheck.tsx. |

## Independent verification (Critic ran these)

```
pnpm vitest run tests/unit/modules/cuelist-core/health/preShowChecks.test.ts
  → Test Files  1 passed (1), Tests 16 passed (16)

pnpm -r typecheck
  → src/shared, apps/marketing, src/modules/cuelist-core, pwa, src/main — all Done

pnpm --filter showx-pwa build
  → 266 modules transformed, ✓ built in 983ms
```

## Verdict rationale

All three round-1 fixes are correct and minimal. The wizard will now surface real device health + real device list in production Electron, satisfying AC4. Pure logic + tests untouched (they were already correct). No new issues introduced. Spec fully satisfied.

→ **accepted.**
