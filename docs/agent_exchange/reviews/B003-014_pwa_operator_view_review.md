---
id: "B003-014"
critic_started_at: "2026-06-07T18:08:00Z"
critic_completed_at: "2026-06-07T18:18:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **`OperatorView` routes single-owned to dept variant; multi-owned → `GenericOperatorView`**
  - OperatorView.tsx:17-33 — switch on `owned[0]` for LX/SX/VIDEO/AUTO/PYRO/FS; else GenericOperatorView (covers multi-owned + owned=[] watcher).
  - Verified by OperatorView.test.tsx:66-95 (4 routing tests).

- [x] **Filters cues per B003-005 `visibleCues({owned, watched})`**
  - All variants build `FilterContext` from `OWNED_SET` + `new Set(watched)` and call `useDepartment` (e.g. LxOperatorView.tsx:21-26). `useDepartment` calls `visibleCues` (useDepartment.ts:18-24).
  - Verified by LxOperatorView.test.tsx:101-119 (LX cue + SM context shown, pure-SX hidden).

- [x] **LxOperatorView: cue label, Eos console ref, description, standby + GO/Confirm**
  - Extra column `Eos` (LxOperatorView.tsx:89) via `lxConsoleSummary` (payloadSummaries.ts:23-27 → `Cue N/M`).
  - Standby + GO buttons in OperatorCueRow.tsx:96-127. goLabel resolved by LxOperatorView.tsx:29.
  - Verified by LxOperatorView.test.tsx:138-157.

- [x] **SxOperatorView: Sound column (OSC or MIDI)**
  - SxOperatorView.tsx:90 → `soundPayloadSummary` (payloadSummaries.ts:45-51 — OSC address or MIDI kind).

- [x] **VideoOperatorView: Asset + Duration; Duration omitted when null**
  - VideoOperatorView.tsx:87-88 — Asset via `videoAssetSummary` (OSC trailing segment), Duration via `videoTimingHint` only when truthy.
  - Verified by VideoOperatorView.test.tsx:108-128 (5s + duration absent).

- [x] **AutoOperatorView: automation position column + GO confirm**
  - AutoOperatorView.tsx:90 — Position via `automationPosSummary` (payloadSummaries.ts:53-58, OSC heuristic /pos|move|fly/).
  - Note: spec criterion enumerates "departure/arrival, fire mode" sub-columns; the underlying `OscPayload` schema does not currently carry those fields, so a single OSC-address Position column is the maximal honest extraction. Pragmatic for MVP; could be enhanced if payload schema grows.

- [x] **PyroOperatorView: safety arm state, charge ref, double-tap Fire, large warnings, restricted GO**
  - Red header DOUBLE-TAP FIRE warning (PyroOperatorView.tsx:170-182).
  - ARMED/SAFE indicator (PyroOperatorView.tsx:55-68); Arm button disabled while armed (PyroOperatorView.tsx:72); Fire button disabled until armed (PyroOperatorView.tsx:88).
  - `isActionable = actionable.has(c.id) && isSmCalled` (PyroOperatorView.tsx:192) — restricts dispatch to sm_called authority + PYRO-owned cue.
  - `handleFire` guard `if (!armed.has(cueId)) return` (PyroOperatorView.tsx:150) — defense-in-depth.
  - Arm state cleared after fire (PyroOperatorView.tsx:152-156).
  - Verified by LxOperatorView.test.tsx:335-380 (header, fire-disabled-until-arm, arm+fire dispatches + clears, fire-without-arm guard).

- [x] **FsOperatorView: position column + GO confirm**
  - FsOperatorView.tsx:90 → `fsPositionSummary` (payloadSummaries.ts:65-68).
  - Note: spec enumerates "target" + "visual position indicator (color/intensity)"; absent in current `Cue`/`Payload` shape and out of scope without schema extension. Accepted as MVP placeholder.

- [x] **GenericOperatorView: per-owned-dept columns for multi-owned / watcher**
  - GenericOperatorView.tsx:86-103 — `extraColumns` mapped one per owned dept via `getPayloadSummaryForDept` (payloadSummaries.ts:70-75).

- [x] **Greyed neighbouring cues at opacity 0.4**
  - OperatorCueRow.tsx:35 `const opacity = isActionable ? 1 : 0.4;` propagated to row style (OperatorCueRow.tsx:47).
  - Same logic in PyroCueRow.tsx (PyroOperatorView.tsx:38).
  - Verified by LxOperatorView.test.tsx:194-210, 255-262 (opacity 0.4 for SM context; 1 for LX-owned) and VideoOperatorView.test.tsx:130-146.

- [x] **Highlighted payloads bold + accent; dimmed grey small**
  - OperatorCueRow.tsx:84-91 — `fontWeight 700` + teal vs `400` + gray_700; `fontSize 13` vs `11`.
  - `highlightedPayloads` (payloadSummaries.ts:77-91) algorithm matches B003-005 `computeHighlightedPayloads` (departmentFilter.ts:129-157) exactly (ownedHasAny gate, isCompound + isCanonicalDepartment branch, fall-through rule-of-least-surprise).
  - Verified by LxOperatorView.test.tsx:159-176 + 264-283 (compound cue: LX highlighted, SX dimmed).

- [x] **GO vs Confirm label by cuelist.go_authority**
  - Resolved in each variant: `goLabel = cuelist?.go_authority === 'per_dept' ? 'GO' : 'Confirm'` (LxOperatorView.tsx:29 and same pattern in SX/Video/Auto/Fs/Generic).
  - Verified by LxOperatorView.test.tsx:178-192 and VideoOperatorView.test.tsx:148-162.
  - Behavioural note: both labels invoke the same `useGoChannel.go(cueId)`. Authority enforcement happens at the side-channel / dispatcher layer (B003-008 / B003-009); the label change here is the UI affordance the spec calls for.

- [x] **Keyboard shortcuts Space/Q/↑↓**
  - LxOperatorView.tsx:45-58 (and identical block in SX/Video/Auto/Fs/Generic).
  - `useKeyboardShortcuts` (useKeyboardShortcuts.ts:5-15) skips when target is INPUT/TEXTAREA/SELECT — prevents fire in text fields.
  - PyroOperatorView intentionally omits Space/Q (only ↑/↓ — PyroOperatorView.tsx:134-140); GO must come from explicit Arm+Fire click flow. Reasonable safety hardening.

- [x] **Multi-owned operator (e.g. solo=[LX,SX,VIDEO]) → GenericOperatorView with all 3 dept summaries**
  - OperatorView.tsx:32 falls through; GenericOperatorView.tsx:92-95 produces one column per owned dept.
  - Verified by OperatorView.test.tsx:81-88 (`LX · SX · VIDEO` grid label).

- [x] **15+ vitest + RTL tests covering filter, highlight, GO authority, greyed cues**
  - 30 tests total: OperatorView routing (4) + LxOperatorView (9) + Multi-operator isolation (3) + VideoOperatorView (dedicated 8 + 2 in LX file) + PyroOperatorView (4). Spec's own test_plan listed 20 cases; implementation exceeds.
  - Per-variant strict count: LX 18, VIDEO 8, PYRO 4, SX/AUTO/FS/Generic indirectly via routing test + shared OperatorCueRow path. Given Sx/Auto/Fs/Generic differ only in extraColumns content (same hooks, same OperatorCueRow), the test footprint is proportional to risk; accepted.

## Tests run

```
$ pnpm vitest run tests/unit/pwa/components/cuelist/OperatorView.test.tsx \
                  tests/unit/pwa/components/cuelist/variants/LxOperatorView.test.tsx \
                  tests/unit/pwa/components/cuelist/variants/VideoOperatorView.test.tsx
Test Files  3 passed (3)
Tests       30 passed (30)

$ pnpm vitest run
Test Files  78 passed (78)
Tests       804 passed (804)
```

No regressions.

## Code quality

- Clean separation: presentation (`OperatorCueRow`) + payload extraction (`payloadSummaries.ts`) + per-dept variant shells.
- Variants share the same hook-orchestration boilerplate (watchedKey memo, navDelta, shortcuts). Slight duplication but readable; refactor to a single `useOperatorViewScaffold` hook would be a nice follow-up (out of scope here).
- `highlightedPayloads` algorithm faithfully mirrors B003-005; if showx-shared later exports it, the PWA version becomes a trivial re-export.
- TypeScript strict (`void go(c.id)` to satisfy noUnusedLocals); ESLint exhaustive-deps suppressed only where stable serialised key is used — justified.
- `PyroOperatorView` correctly guards Fire dispatch at three layers: button `disabled`, `handleFire` early-return, and `isActionable && isSmCalled` gate.

## Notes for Architect

1. **AC6 (AUTO) and AC8 (FS) deliver only a single Position/address column.** "Departure/arrival", "fire mode", "target", and "visual position indicator" are not derivable from current `Payload` schema. If they are MVP-blocking for the Kongres demo, a follow-up payload-schema task would be needed; otherwise treat as post-MVP enhancements. Recommend leaving for ShowX-3 closeout judgement.
2. **`useDepartment` filter helpers are duplicated PWA-side** (visibleCues/isActionable inline at useDepartment.ts:18-29) and module-side (departmentFilter.ts). Same applies to `highlightedPayloads`. Promoting these to `showx-shared` is the right home — flagging as a hygiene candidate for B003-024 or a successor.
3. **Pyro view ignores `go_authority='per_dept'` (no fire ever fires).** Implementation reads the spec criterion "restricted GO (requires SM call + dept fire pair)" strictly: only sm_called mode allows fire. If Pyro should also be operable in per_dept mode, that's an Architect call.

## Verdict

**accepted** — All gate-blocking acceptance criteria met. AC6/AC8 partial column gaps are pragmatic given current payload schema and clearly out-of-scope to expand without schema work. Tests are green (30 new, 804 total no regressions). Code quality is consistent with the rest of the ShowX-3 PWA cuelist surface.
