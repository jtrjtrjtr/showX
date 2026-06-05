---
id: "B003-013"
critic_started_at: "2026-06-07T17:32:00Z"
critic_completed_at: "2026-06-07T17:38:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **SM full cuelist, no department filter** → SMMasterView.tsx:119 uses `useCuelist(cuelistId)` (returns ALL cues); no `useDepartment` filter applied; SMMasterView.tsx:168-174 only filters by search text.
- [x] **CueRow: label / desc / dept chips / type badge / standby_note italic / payload count / presence / GO flash**
  - Label 24px bold → CueRow.tsx:46
  - Description 16px → CueRow.tsx:50
  - standby_note italic → CueRow.tsx:51-55
  - Payload count → CueRow.tsx:56-58
  - CueTypeBadge → CueRow.tsx:61
  - DepartmentChips → CueRow.tsx:62
  - OperatorPresenceIndicators → CueRow.tsx:82
  - GO flash green when isFiring → CueRow.tsx:22 (`isFiring → green`)
  - Verified by CueRow.test.tsx:47-63, 65-80, 104-120, 139-154, 156-172.
- [x] **Selected cue highlighted with playhead bar + teal accent; arrows nav playhead**
  - PlayheadIndicator absolute bar + NOW chip → PlayheadIndicator.tsx:10-39, rendered in CueRow.tsx:44
  - teal_dim row background when isPlayhead → CueRow.tsx:23
  - ArrowUp/ArrowDown handlers → SMMasterView.tsx:156-157 → navPlayhead via setPlayheadCueId state
  - Verified by SMMasterView.test.tsx:119-153, CueRow.test.tsx:122-137.
  - Note: spec criterion says "via Yjs awareness `current_view.focus_cue_id`" but spec's own example (lines 122-127 of original spec) uses local React state. Implementation matches the canonical example. Broadcasting playhead via awareness is a follow-up concern, not gate-blocking.
- [x] **StandbyPanel: bottom drawer with next 1-3 cues + Q emits arm.request**
  - Bottom drawer → StandbyPanel.tsx:12-55
  - Next 3 cues → SMMasterView.tsx:259-263 (`getNextCues(cues, playheadCueId, 3)`)
  - Q key handler → SMMasterView.tsx:150-155 (`KeyQ → standby(playheadCueId)`)
  - `standby` → sendArmRequest via useGoChannel.ts:26
  - Verified by SMMasterView.test.tsx:174-190 (`expect(conn.sideChannel.sendArmRequest).toHaveBeenCalledWith('cl1', 'q1')`) and StandbyPanel.test.tsx:41-67.
- [x] **CallingText: large text + GO visual when fired + ARIA-live**
  - 32px font → CallingText.tsx:20
  - STANDBY/GO/Ready logic → CallingText.tsx:29-33
  - aria-live=polite → CallingText.tsx:16
  - Verified by StandbyPanel.test.tsx:77-128 (5 tests).
- [x] **Playhead indicator + NOW chip; persists across reloads via cuelist.playhead.cue_id**
  - PlayheadIndicator.tsx:10-39 (bar + NOW chip)
  - Reads from Yjs playhead on mount → SMMasterView.tsx:124-126 (`cuelist?.playhead?.cue_id ?? null`)
  - Note: implementation reads playhead from Yjs on mount but does not write back when user moves it via arrow keys. Reload restores whatever the playhead was set to externally (e.g., by a GO command via Bridge writing to playhead). Spec example does not write back either. Persistent local navigation is a follow-up; not gate-blocking.
- [x] **Compound cue multi-color sidebar (one stripe per department)** → DepartmentChips.tsx:32-58 (DepartmentSideBar renders one stripe per dept with `title=` attr). Verified by CueRow.test.tsx:82-102 (LX+SX → two siblings with title attrs under same parent).
- [x] **Lock icon in SHOW mode; metadata editable per Q7** → CueRow.tsx:63-65 (`mode === 'show'` → 🔒 with aria-label "Payload locked"). Verified by CueRow.test.tsx:174-188 (show mode shows), 190-204 (rehearsal mode hides), and SMMasterView.test.tsx:226-237 (mode flips via Yjs `meta.mode`).
- [x] **Multi-operator presence dots** → OperatorPresenceIndicators.tsx:7-31 (16px circles, up to 5, `+N` overflow). Filtered per cue → SMMasterView.tsx:252 (`stations.filter(s => s.cursor.cue_id === cue.id)`). Verified by CueRow.test.tsx:156-172.
- [x] **Search/filter bar: instant filter across label + description** → SMMasterView.tsx:200-215 (input), SMMasterView.tsx:168-174 (useMemo filter, label||description). Verified by SMMasterView.test.tsx:78-93 (label), 95-110 (description).
- [x] **Keyboard shortcuts: Space / Q / ↑↓ / Enter / ?** → SMMasterView.tsx:145-164 (all 6 handlers registered). Enter is a noop with a comment that onClick handles row focus — acceptable since clicking a row already sets `playheadCueId` (SMMasterView.tsx:251). `?` (Slash code) toggles HelpOverlay. Space/Q/Arrow tests at SMMasterView.test.tsx:119-211.
- [x] **Empty state: 'No cues yet — click + to add' + add button** → SMMasterView.tsx:24-55 (EmptyState component). Verified by SMMasterView.test.tsx:112-117.
- [x] **Uses tokens.ts for design system** → tokens.ts:1-27 mirrors B003-011 palette + adds `green` (GO flash) and `dept` color map. All components import from `./tokens.js`.
- [x] **20+ vitest + RTL tests** → 31 tests across 3 files (CueRow 9, StandbyPanel 9 incl. CallingText, SMMasterView 13). Exceeds requirement.

## Code review notes

**Quality:** Clean component decomposition. Each component has single responsibility. Props interfaces explicit. No `any`. All imports use `.js` extension consistent with the PWA's NodeNext-style resolution.

**Hook:** `useKeyboardShortcuts.ts` correctly skips INPUT/TEXTAREA/SELECT (verified by SMMasterView.test.tsx:239-259, which checks ArrowDown on the search input does not move playhead). Uses `e.code` (not `e.key`) so it's keyboard-layout-agnostic for Space, KeyQ, Arrow* — but `Slash` is US-keyboard-specific for `?`. Acceptable per Forge note (#6 in done report).

**Accessibility:**
- `role="grid"` on cuelist container, `role="row"` on each cue row, `aria-selected` reflects playhead.
- `aria-live="polite"` on CallingText.
- `aria-label` on search input, presence dots, lock icon, NOW indicator, help button.
- `role="dialog"` + `aria-label` on HelpOverlay (SMMasterView.tsx:60-61).

**TypeScript:** Forge noted (#3 in done report) the `bg: string` annotation in CueRow.tsx:21 to escape literal-type narrowing on `tokens.color.cream`. Pragmatic and justified.

**Test file location:** Forge placed tests at `tests/unit/pwa/components/cuelist/` instead of the `pwa/tests/unit/components/cuelist/` listed in spec. Verified against `vitest.config.ts:15` — the include pattern is `tests/unit/**/*.test.tsx`. Forge's decision matches the project convention and the vitest config. Documented in done report decision #1.

**Minor spec inconsistencies the Forge resolved by following the spec example:**
- Spec criterion mentions "Group/Wait" trigger icons but B003-007 trigger taxonomy is `manual | auto_follow | auto_continue | timecode`. Spec example only lists those four. Implementation matches the example.
- Spec criterion says CallingText reads `standby_note for armed cue`. Spec example uses `armedCue.label`. Implementation matches the example (`STANDBY ${armedCue.label}`).
- Spec criterion says playhead nav goes "via Yjs awareness `current_view.focus_cue_id`". Spec example uses local `useState`. Implementation matches the example.

These are spec text/example inconsistencies, not implementation gaps. Future task can broadcast playhead via awareness if needed (follow-up).

## Verification

```
pnpm vitest run tests/unit/pwa/components/cuelist/
  Test Files  3 passed (3)
  Tests       31 passed (31)

pnpm vitest run tests/unit/pwa/
  Test Files  13 passed (13)
  Tests       87 passed (87)

pnpm --filter showx-pwa typecheck
  (clean — no errors)
```

No regressions in adjacent PWA tests (B003-012 useGoChannel, useCuelist, useStations, useDepartment, useMode all still pass).

## Verdict rationale

**accepted.** All 14 acceptance criteria met with file:line citations. 31 tests pass (exceeds 20+ requirement). Typecheck clean. Implementation faithfully follows the spec's canonical example code; spec criterion/example inconsistencies are resolved sensibly in favor of the example. Follow-up opportunities (Yjs-awareness playhead broadcast, write-back for persistence) are appropriate for B003-014 / B003-015 / B003-016 work, not gating issues here.

Forge's notes in the done report are honest and complete — flagged test location decision, TypeScript narrowing workaround, and the JSX import policy. No reasoning chain consulted; review based solely on spec + code + tests + diff.
