---
id: "B006-006"
title: "Pre-show health check wizard"
status: "done"
round: 1
files_changed:
  - "src/modules/cuelist-core/src/health/preShowChecks.ts"
  - "src/modules/cuelist-core/package.json"
  - "pwa/src/components/cuelist/PreShowCheck.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "tests/unit/modules/cuelist-core/health/preShowChecks.test.ts"
---

## What was built

### 1. `src/modules/cuelist-core/src/health/preShowChecks.ts` — Pure check logic

Exported function `runPreShowChecks(input: PreShowInput): PreShowCheckResult` performs four checks:

- **(a) Device health** — For each configured device, reads the health snapshot provided by the caller (sourced from `HealthBus.getDeviceHealth()`). Maps `healthy` → pass, `warning` → warn, `error` → fail (with `last_error` as hint). Device with no health data → warn. No devices configured → warn.
- **(b) Payload device references** — Scans all cue payloads for `device_id` fields. Any `device_id` not present in the devices list → fail item with list of broken references.
- **(c) Station presence** — If `stationCount === 0` → warn. Otherwise pass with count.
- **(d) Clock source** — If any cue has `trigger.kind === 'timecode'` AND `clockLocked === false` → warn. If no timecode cues, no clock check item is emitted at all.

Returns `{ items, verdict, warning_count, failure_count }` where `verdict` is `all_pass | has_warnings | has_failures`.

### 2. `pwa/src/components/cuelist/PreShowCheck.tsx` — Modal overlay UI

- Shown as a fixed-position overlay (non-blocking, SM can close and proceed at any time).
- "Run check" button triggers data collection + `runPreShowChecks()` synchronously.
- Data gathering: device health via `window.showxApi?.health?.getSnapshot()` (Electron shell context), device list via `window.showxApi?.devices?.list()`, stations from `useStations()`, clock from `useClock()`, cues from `useCuelist(cuelistId)`.
- Displays `VerdictBanner` (all-green / N warnings / N failures) + `CheckRow` per item with status icon (✓ / ⚠ / ✗) and remedy hint.
- Re-runnable. Advisory footer reminds SM this is non-blocking.

### 3. `pwa/src/components/cuelist/SMMasterView.tsx` — Header button

- Added `showPreShowCheck` state + "PRE-SHOW ✓" button in header (after `?` shortcuts button).
- Button renders `<PreShowCheck cuelistId={cuelistId} onClose={...} />` overlay when clicked.

### 4. `src/modules/cuelist-core/package.json` — Export path

- Added `"./health/preShowChecks.js"` entry to exports map so PWA can import the types.

## Tests run

```
tests/unit/modules/cuelist-core/health/preShowChecks.test.ts  16 tests PASS
Full suite: 1906 tests across 150 files — all pass
pnpm --filter showx-pwa build — clean (266 modules)
pnpm -r typecheck — clean
```

### Test coverage
- All-pass scenario (healthy device, ok refs, 1+ stations, no timecode)
- Device health: error → fail with hint; no data → warn; healthy → pass; warning → warn
- Asset refs: missing device_id → fail; all present → pass; no payloads → pass
- Station presence: 0 → warn; 1+ → pass
- Clock: no timecode cues → no item; timecode + unlocked → warn; timecode + locked → pass
- Verdict aggregation: any fail → has_failures; only warns → has_warnings

## Decisions made within task scope

- Check logic is pure (plain data, no Y.Doc dependency) — easier to test and decoupled from Yjs
- "Media/assets" check interpreted as payload device_id integrity (no file-based media type exists in this version) — closest meaningful check per the codebase
- Clock item omitted when no timecode cues (cleaner UX — don't show irrelevant checks)
- Health data fetched via `showxApi` pattern (mirrors DispatchLogPanel) — graceful degradation when running in standalone browser (health shows as unknown for all devices)

## Notes for Critic

- The `window.showxApi?.health` and `window.showxApi?.devices` APIs are NOT yet registered in the Electron preload — these are forward hooks. Until the preload registers them, the UI still renders but the device health section will be empty (all devices will be absent from health snapshot → all warn). This is the correct fallback.
- `PreShowCheck` is not tested with JSDOM at render level — that would require mocking the `showxApi` and all hooks. The pure logic in `preShowChecks.ts` is fully covered by unit tests. The component is simple render-only logic branching on state.
