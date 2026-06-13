---
id: "B004-007"
critic_started_at: "2026-06-13T15:32:00Z"
critic_completed_at: "2026-06-13T15:36:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **`armed: boolean` field with lazy default true; disarmed cue SKIPPED on GO; payloads do NOT dispatch but chain advances (QLab semantics)**
  - `src/shared/src/types/cue.ts:37` — `armed?: boolean` added with comment "Lazy default true."
  - `src/modules/cuelist-core/src/document/cue.ts:39` — `makeCueMap` sets `armed: true` on new cues.
  - `src/modules/cuelist-core/src/dispatch/payloadDispatch.ts:47` — `if (!(cue.armed ?? true))` guard short-circuits before payload loop; lazy default applied.
  - `src/modules/cuelist-core/src/go/goEventChannel.ts:241` — `((cueMap?.get('armed') as boolean | undefined) ?? true)` lazy read.
  - `goEventChannel.ts:256` — `payloads: (armed ? payloads : [])` suppresses dispatch input to GoExecutor.
  - Chain-advance via `cue-fire` always published (`goEventChannel.ts:243-260`) and `cue-complete` always published when `!_internal` for disarmed path (`payloadDispatch.ts:49-64`).

- [x] **Manual GO on disarmed cue: skip dispatch, advance playhead, auto-follow chain continues**
  - `cue-fire` emitted with empty payloads → GoExecutor dispatches nothing.
  - `cue-complete` emitted from `dispatchCue` for disarmed path → TriggerEngine's `onCueComplete` handlers (auto_follow scheduling) trigger normally.
  - Verified at unit level: `tests/unit/modules/cuelist-core/go/goEventChannel.test.ts:570-585` (cue-fire still emits + payloads empty); `tests/unit/modules/cuelist-core/dispatch/payloadDispatch.test.ts:322-336` (cue-complete still emits when disarmed).
  - **Note:** no explicit A→B(auto_continue)→C end-to-end test with B disarmed (test plan item 2). Coverage is by composition: TriggerEngine already tested separately + cue-fire/cue-complete emission verified for disarmed path. Not a blocker but a direct integration test would strengthen the assertion.

- [x] **UI: hatched/dimmed disarmed row + arm/disarm toggle; rehearsal-only edits; SHOW locks toggle**
  - `pwa/src/components/cuelist/CueRow.tsx:160` — `isDisarmed = !(cue.armed ?? true)`.
  - `CueRow.tsx:231` — opacity 0.55 when disarmed (dimmed).
  - `CueRow.tsx:282-294` — hatched overlay (`data-testid="disarmed-hatch"`, 135deg repeating-linear-gradient).
  - `CueRow.tsx:469-491` — ARM/DISARM button (`data-testid="cue-arm-toggle"`); `disabled={mode === 'show'}` enforced.
  - Visibility rule: shown when disarmed OR (rehearsal AND selected/playhead) — avoids clutter on inactive rows.
  - Write path: `useCuelist.setArmed` → `setCueArmed` (`document/cue.ts:302-315`) calls `assertEditAllowed(doc, 'structure')`, so SHOW mode write throws `LockedError` at data layer regardless of UI.

- [x] **Toggle does not collide with selection/playhead click zones**
  - `CueRow.tsx:474` — `onClick` calls `e.stopPropagation()` on the toggle button.
  - Button rendered in the right-side action column (alongside STBY/insert/delete), not in the 24px playhead gutter (`CueRow.tsx:234-250`) or the row click area.

- [x] **Unit tests cover: skip+advance, persistence, lazy default, SHOW lock**
  - skip+advance: `payloadDispatch.test.ts:303-321` (skips all dispatch), `:322-336` (cue-complete still emits → chain advances).
  - arm/disarm persists across mutate: `cue.test.ts:287-308`.
  - lazy default armed=true: `cue.test.ts:317-326`, `payloadDispatch.test.ts:364-376`.
  - SHOW mode locks toggle: `cue.test.ts:310-315` — `setCueArmed` throws `LockedError` in SHOW. (Lock enforced at data layer; UI `disabled` is defense-in-depth.)
  - **Gap:** test plan item 2 (auto_continue chain with disarmed middle cue) is not directly tested. Implicit guarantee via cue-fire + cue-complete emission, which are independently tested. Not blocking.

- [x] **`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass**
  - PWA build verified: `vite v5.4.21 ... built in 979ms`, 260 modules, no warnings.
  - Typecheck verified: all 5 workspaces pass.
  - Targeted tests verified: 77 tests pass across cue.test.ts (32), goEventChannel.test.ts (30), payloadDispatch.test.ts (15).

## Code review notes

**Design quality.** Dual-path disarm (payloadDispatch.ts guard + goEventChannel.ts payload suppression) is sensible: GoEventChannel suppresses at the GO-event boundary so downstream GoExecutor never sees disarmed payloads, while `dispatchCue` retains its own guard so direct/test callers also honor the field. Both paths preserve `cue-complete` emission, which is the contract TriggerEngine depends on for chain advancement.

**Structural lock choice.** Treating `armed` as a structural field (`assertEditAllowed(doc, 'structure')`) is consistent with how `trigger` is treated. Spec explicitly endorses this. Good.

**`_internal` flag respected.** `payloadDispatch.ts:49` `if (!_internal)` suppresses cue-complete for group sub-dispatches even on disarmed cues — matches existing pattern.

**Files outside spec `target_files`.** Done report flags this proactively: `payloadDispatch.ts`, `useCuelist.ts`, `SMMasterView.tsx` are outside the `target_files` list (which named `src/modules/cuelist-core/src/go/**` + `cue.ts` + `triggerEngine.ts` + `CueRow.tsx`). These edits are necessary and minimal — useCuelist must expose `setArmed`, SMMasterView must pass `onArmToggle`, payloadDispatch needs the direct-call guard. Notably `triggerEngine.ts` (in target_files) was NOT modified, which is correct — the disarm logic is best placed at the GO/dispatch boundary, not in chain scheduling. Underscoped target_files, not a Forge fault.

**Test weakness (minor).** `goEventChannel.test.ts:587-594` ("armed cue: cue-fire payloads is not suppressed") only asserts `fire` is defined; its comment acknowledges `payloads is [] since no payloads were added`. The test doesn't actually demonstrate that armed cues' payloads pass through (because the cue has none). Not blocking — `payloadDispatch.test.ts:350-362` covers the armed path correctly. But the goEventChannel "negative control" could be strengthened by adding a real payload to the armed cue.

**Pre-wait + disarm interaction.** `goEventChannel.ts:262-275`: if `pre_wait_ms > 0` AND cue is disarmed, the pre-wait timer still runs, then publishes cue-fire with empty payloads. Spec does not specify this case. Defensible reading: GO is acknowledged, pre-wait elapses, "fire" lands but dispatches nothing. Operator-facing UX is consistent (the "WAITING N" indicator shows even for a disarmed cue). Could be a follow-up question, not blocking.

**Visibility heuristic for the toggle.** `CueRow.tsx:469` — `(isDisarmed || (mode === 'rehearsal' && (isSelected || isPlayhead)))`. Disarmed rows always show ARM (so operator can re-arm without selecting); armed rows only show DISARM when active. Sensible discoverability/clutter tradeoff. SHOW mode renders button at 0.4 opacity + disabled. Good.

**Hatched overlay visual.** `repeating-linear-gradient(135deg, transparent, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 16px)` — subtle 4% alpha. On dark background plus 0.55 row opacity, the disarmed state should be visually distinct. (Did not visually verify in browser; assumption is the visual design is acceptable to Architect/Jindřich.)

## Verdict rationale

**Accepted.** All six acceptance criteria are met with clear file:line citations. The lazy-default contract is honored across all read sites (`?? true` in dispatch path, in goEventChannel payload suppression, in CueRow rendering). SHOW lock is enforced at the data layer (the source of truth) and reinforced at the UI layer (disabled state). All targeted tests pass (77/77), typecheck clean, PWA build clean.

The two minor gaps (no explicit auto_continue chain test for disarmed middle cue; weak armed-control test in goEventChannel) are coverage-completeness concerns, not correctness defects — the underlying invariants are verified by composition of independently-tested units. Files outside `target_files` were modified, but the done report flags these proactively and they are all necessary, minimal, and scoped to the disarm feature.

No changes requested.
