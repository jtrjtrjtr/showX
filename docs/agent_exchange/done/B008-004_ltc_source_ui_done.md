# B008-004 Done Report — LTC source UI + clock switching (Round 2)

**Task:** LTC source UI + clock switching  
**Bundle:** ShowX-8 (LTC)  
**Forge run:** 2026-06-14  
**Status:** done  
**Review round:** 2 (revision)

---

## Changes from round 1 → round 2

Critic flagged two issues. Both addressed:

### 1. AC1 gap — `ClockSourceSettings` was never mounted (FIXED)

**What Critic found:** `ClockSourceSettings` existed and had passing tests but was never imported or rendered anywhere reachable.

**Fix:** Render prop pattern to avoid circular cross-package dependency:
- Added `clockPanel?: ReactNode` to `CuelistCorePanel`'s `PanelProps` (in `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx`)
- Rendered `{clockPanel}` inside a new "Clock" section within the Devices tab
- In `pwa/src/components/ShellRouter.tsx`, imported `ClockSourceSettings` and passed `clockPanel={<ClockSourceSettings />}` to `CuelistCorePanel`

This avoids the circular dependency (`cuelist-core` module cannot import from `pwa`). `ClockSourceSettings` stays in its tested location in `pwa`; `CuelistCorePanel` accepts it as an opaque `ReactNode`.

### 2. Dead conditional at `ClockSourceSettings.tsx:244` (FIXED)

**What Critic found:**
```ts
ltcInDeviceId: src === 'ltc' ? ltcInDeviceId : ltcInDeviceId,
```
Both branches identical — misleading typo.

**Fix:** Changed false branch to `null` so switching away from LTC source also clears the LTC in device ID:
```ts
ltcInDeviceId: src === 'ltc' ? ltcInDeviceId : null,
```
Consistent with bridge-side disable (bridge already disables receiver when `source !== 'ltc'`).

---

## Files changed in round 2

- **`pwa/src/components/cuelist/ClockSourceSettings.tsx`** — dead conditional fixed (line 244)
- **`src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx`** — added `clockPanel?: ReactNode` prop + "Clock" section in Devices tab
- **`pwa/src/components/ShellRouter.tsx`** — imported `ClockSourceSettings`, passed as `clockPanel` to `CuelistCorePanel`
- **`tests/unit/pwa/ClockSourceSettings.test.tsx`** — added mount smoke test (1 new test)

---

## Verification

### TypeScript
```
pnpm -r typecheck → Done (all 5 packages clean)
```

### Tests
```
pnpm vitest run → 2240 passed (173 test files)
```
+1 test from round 1 (2239→2240): new mount smoke test verifying `ClockSourceSettings` appears in CuelistCorePanel's Devices tab.

---

## Acceptance criteria status (round 2)

- [x] **AC1** — `ClockSourceSettings` UI mounted in CuelistCorePanel Devices tab, reachable by operator in shell mode
- [x] **AC2** — `TimecodeDisplay` extended with INT/MTC/LTC + lock states
- [x] **AC3** — Mutual exclusivity: dead conditional fixed; bridge disables receiver on source change; LTC-in picker hidden for non-LTC sources
- [x] **AC4** — Graceful fallback on missing audio device → internal + warning
- [x] **AC5** — All unit tests passing (13+4 UI tests + 11 bridge tests + 1 new mount smoke)
- [x] **AC6** — typecheck clean, build clean, 2240 tests green, packageJsonIntegrity guard passing

## Notes for Critic

- The render prop pattern (`clockPanel?: ReactNode`) is the standard approach for injecting PWA-level components into module-level panels without circular deps.
- `ClockSourceSettings` returns `null` when `window.showxApi` is absent, so it is safe to pass in all contexts (station mode PWA sessions will silently not render it).
- The dead conditional now clears `ltcInDeviceId` on source switch away from LTC — consistent with the engine disabling the receiver.
