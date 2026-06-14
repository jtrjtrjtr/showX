---
id: "B008-004"
critic_started_at: "2026-06-14T14:25:00Z"
critic_completed_at: "2026-06-14T14:30:00Z"
verdict: "accepted"
review_round: 2
prior_verdict: "changes_requested (round 1)"
---

## Summary

Round 2 addresses both round-1 issues:

1. **AC1 wiring gap** — `ClockSourceSettings` is now reachable in the operator-facing shell. Render-prop pattern (`clockPanel?: ReactNode` on `CuelistCorePanel`) wires `<ClockSourceSettings />` through `ShellRouter` without introducing a circular `cuelist-core ↔ pwa` dependency. Mounted inside the Devices tab.
2. **Dead conditional at `ClockSourceSettings.tsx:244`** — false branch flipped from `ltcInDeviceId` to `null`, so switching the radio away from `ltc` clears the device id; consistent with the bridge-side receiver disable.

All other ACs (AC2 TimecodeDisplay extension, AC4 fallback, AC5 unit tests, AC6 typecheck/build) were `accepted` in round 1 and verified unchanged in round 2.

Verdict: `accepted`.

## Acceptance criteria check (round 2 re-verification)

- [x] **AC1 — ClockSourceSettings UI usable in shell.**
  - Component rendered: `pwa/src/components/ShellRouter.tsx:6` (import), `pwa/src/components/ShellRouter.tsx:68` (`<CuelistCorePanel ipc={ipcBridge} clockPanel={<ClockSourceSettings />} />`).
  - Mount site in panel: `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx:29` (prop), `:280-285` (rendered in Devices tab under "Clock" `<h2>`).
  - Render-prop pattern is the right escape from the dependency direction (`cuelist-core` is consumed by `pwa`, not the other way round). `ClockSourceSettings` returns `null` when `window.showxApi` is absent (`ClockSourceSettings.tsx:153`), so it's safe to pass in any context.
  - Mount smoke test: `tests/unit/pwa/ClockSourceSettings.test.tsx:306-339` renders `<CuelistCorePanel ipc={mockIpc} clockPanel={<ClockSourceSettings />} />`, clicks the Devices tab, and asserts `getByTestId('clock-source-settings')` resolves. Green locally.

- [x] **AC2 — TimecodeDisplay source indicator (INT/MTC/LTC + lock states).** Unchanged from round 1.
  - `pwa/src/components/cuelist/TimecodeDisplay.tsx:34-70` covers locked/searching/inactive; backward-compatible fallback preserved.
  - 17 pre-existing tests + 4 chase-status tests at `tests/unit/pwa/ClockSourceSettings.test.tsx:341-415` green.

- [x] **AC3 — Mutual exclusivity in clock + UI.**
  - Bridge-side: `src/main/src/ipc/clockSourceBridge.ts:42-44` (unchanged) — receiver disabled whenever `source !== 'ltc'`.
  - UI-side: LTC-in picker only renders when `source === 'ltc'` (`ClockSourceSettings.tsx:257`).
  - **Round-2 fix verified**: `ClockSourceSettings.tsx:244` now reads `ltcInDeviceId: src === 'ltc' ? ltcInDeviceId : null`. Switching away from LTC clears the device id in the persisted config, matching bridge-side disable semantics. Existing "switching to MTC hides LTC-in picker" test (`ClockSourceSettings.test.tsx:203-220`) asserts on source only (not device id) — still green; no regression.

- [x] **AC4 — Graceful fallback on missing audio device.** Unchanged from round 1.
  - `clockSourceBridge.ts:62-69` catches receiver-enable throw, falls back to internal, returns `{ ok: false, fallback: 'internal' }`.
  - UI warning + radio revert: `ClockSourceSettings.tsx:142-146`; test at `ClockSourceSettings.test.tsx:271-287`.

- [x] **AC5 — Unit tests cover all 5 ACs.**
  - 18 UI tests (`tests/unit/pwa/ClockSourceSettings.test.tsx` — was 17 in round 1, +1 mount smoke) + 11 bridge tests (`tests/unit/ipc/clockSourceBridge.test.ts`). All green locally.
  - Forge claim: 2240 total (was 2239 in round 1, +1). Verified consistent.

- [x] **AC6 — typecheck clean, PWA build clean, tests green, packageJsonIntegrity guard.**
  - `pnpm -r typecheck` → all 5 packages clean (re-verified locally).
  - PWA build / packageJson guard / channel-symmetry guard unchanged from round 1; Shell.ts edits (channel constants, Lt­c instantiation, IPC wiring) were already validated.

## Round-2 diff inspection

Three substantive edits across the round:

1. `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx`
   - Added `clockPanel?: ReactNode` to `PanelProps` (`:27-30`).
   - Destructured in the function signature (`:116`).
   - New "Clock" section conditionally rendered inside the Devices tab (`:280-285`). Conditional `{clockPanel && …}` means the panel adds zero visual noise in tests / contexts that don't provide a clock panel.
   - Import of `ReactNode` from `'react'` (`:1`) — clean.

2. `pwa/src/components/ShellRouter.tsx`
   - Added `import { ClockSourceSettings } from './cuelist/ClockSourceSettings.js'` (`:6`).
   - Passes `clockPanel={<ClockSourceSettings />}` only on the "show open" branch (`:68`); `no-show` branch renders `RecentShowsList` / `FirstLaunchPicker` so the clock UI is intentionally absent — correct, since the clock APIs depend on an active show context.

3. `pwa/src/components/cuelist/ClockSourceSettings.tsx`
   - One-line change at `:244` — `ltcInDeviceId: src === 'ltc' ? ltcInDeviceId : null`. Confirms the round-1 typo concern is resolved with the safer of the two options (clear on switch-away).

No edits outside `target_files` glob besides the `CuelistCorePanel.tsx` prop addition — which is necessary to satisfy the mount AC and follows the precedent set in round 1 (Shell.ts edits to wire optional bridges).

## Code review notes

- **Render-prop choice**: passing the React subtree as a prop avoids both circular deps and forcing `cuelist-core` to know about audio devices. The trade-off is that nothing structurally enforces the panel is rendered — a future refactor could drop it on the floor. Acceptable for this scope; could be tightened later via a slot registry if more cross-package panels appear.
- **Mount only on show-open**: clock controls are unreachable until a show is open. Aligns with the `cuelist-core/get-state` gating of the Devices tab — operator can't reach the picker through `no-show` anyway, so no AC violation.
- **One-time test concern dismissed**: round-1 "switching to MTC hides LTC-in picker" test stays green because it only asserts on source name and picker visibility (`ClockSourceSettings.test.tsx:212-219`), not on the post-switch `ltcInDeviceId`.

## Verdict rationale

Both round-1 concerns resolved cleanly without scope expansion or behavior regression. ClockSourceSettings is now reachable for the operator, the dead conditional is gone, and the test suite (18 UI + 11 bridge) is green. Accepted.
