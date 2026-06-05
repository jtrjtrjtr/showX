---
id: "B003-013"
title: "PWA SM master view — full cuelist + standby panel + calling text"
status: "done"
round: 1
forge_model: "claude-sonnet-4-6"
started_at: "2026-06-07T17:15:00Z"
ended_at: "2026-06-07T17:30:00Z"
---

## Summary

Implemented the SM master view for the PWA — the central show-calling UI for stage managers. 9 production files + 1 hook + 31 tests. All pass. TypeScript strict clean.

## Files changed

### New production files
- `pwa/src/components/cuelist/tokens.ts` — design tokens for PWA cuelist UI (mirrors B003-011 Electron panel tokens + adds `green` for GO flash and `dept` color map)
- `pwa/src/components/cuelist/CueTypeBadge.tsx` — trigger kind badge (⏵ Manual / → Follow / ⏩ Continue / ⏱ Timecode) with `aria-label` + `title`
- `pwa/src/components/cuelist/DepartmentChips.tsx` — exports `DepartmentChips` (pill labels) and `DepartmentSideBar` (multi-stripe compound cue sidebar, 8px column with per-dept color stripes + `title` attributes)
- `pwa/src/components/cuelist/OperatorPresenceIndicators.tsx` — up to 5 avatar dots (16px circles, `title`=display_name) + `+N` overflow count
- `pwa/src/components/cuelist/PlayheadIndicator.tsx` — absolute left-edge bar + floating "NOW" chip when `visible=true`
- `pwa/src/components/cuelist/CueRow.tsx` — full row component (24px bold label, description, standby_note, CueTypeBadge, DepartmentChips, DepartmentSideBar, OperatorPresenceIndicators, PlayheadIndicator, STBY badge, lock icon in show mode)
- `pwa/src/components/cuelist/StandbyPanel.tsx` — bottom drawer with armed cue red callout + up-to-3 next cue cards
- `pwa/src/components/cuelist/CallingText.tsx` — 32px calling text: "GO <cueId>" (within 2s of dispatch), "STANDBY <label>" (armed), "Ready" (idle); `aria-live="polite"`
- `pwa/src/components/cuelist/SMMasterView.tsx` — main view component: full cuelist for SM (all cues), search/filter bar, keyboard shortcuts, `StandbyPanel`, `CallingText`, help overlay

### New hook
- `pwa/src/hooks/useKeyboardShortcuts.ts` — registers/unregisters `window.keydown` listener; skips INPUT/TEXTAREA/SELECT targets; re-registers when `map` reference changes

### New test files
- `tests/unit/pwa/components/cuelist/CueRow.test.tsx` — 9 tests
- `tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx` — 9 tests (includes CallingText tests)
- `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` — 13 tests

## Tests run

```
pnpm vitest run tests/unit/pwa/
  Test Files  13 passed (13)
  Tests       87 passed (87)

pnpm --filter showx-pwa typecheck
  (no output — clean)
```

Previous baseline: 691 tests (B003-012 accepted). New total: 87 in pwa/ test tree (up from 56 in B003-012 baseline scope). Full suite: 774 tests, 766 passing (8 failing are B003-009 in-progress dispatch tests, pre-existing, not regressions).

## Decisions within task scope

1. **Test location**: Tests placed at `tests/unit/pwa/components/cuelist/` (not `pwa/tests/unit/...` as spec listed) — matches vitest config include pattern `tests/unit/**/*.test.tsx` and consistent with all existing test locations.

2. **`tokens.ts` additions**: Added `green: '#2DA44E'` for GO flash color and `dept: Record<string, string>` map for department sidebar colors. The Electron panel tokens.ts (B003-011) predates this; the PWA tokens.ts is a parallel file at `pwa/src/components/cuelist/tokens.ts`, not imported from the Electron module.

3. **`bg: string` annotation in CueRow**: TypeScript's const narrowing on `tokens.color.cream` (literal type `'#FAF8F1'`) prevented reassignment to `green` or `teal_dim`. Annotated `let bg: string` to allow reassignment.

4. **No explicit `import React`**: PWA tsconfig uses `"jsx": "react-jsx"` with `noUnusedLocals: true`. Removed explicit React imports from all new files since the automatic runtime injects the JSX factory.

5. **CallingText tests in StandbyPanel.test.tsx**: Combined in one test file since both are stateless display components with no hook dependencies. Reduces test file count without losing coverage.

6. **`Slash` code for `?` help shortcut**: The `?` key dispatches `{ code: 'Slash' }` (on US keyboard). Used `Slash` code in shortcuts map to match the keyboard event.

## Notes for Critic

- **SM profile**: `SMMasterView` uses `useCuelist` directly (returns all cues). SM sees ALL cues regardless of department per acceptance criteria — no `useDepartment` filter applied.
- **Keyboard + INPUT guard**: `useKeyboardShortcuts` checks `e.target.tagName`; test `SMMasterView.test.tsx#12` verifies ArrowDown fired on the INPUT element does not move the playhead.
- **ARIA**: `aria-selected` on each `[role="row"]`, `aria-live="polite"` on CallingText, `aria-label` on search input, `aria-label` on lock icon, `aria-label` on presence dots, `role="grid"` on main cuelist container.
- **Compound sidebar**: `DepartmentSideBar` renders one `<div title={dept}>` per department, each with `flex: 1`. For SM (single dept), renders 1 stripe. For LX+SX, renders 2 equal stripes. Test verifies `title="LX"` and `title="SX"` are siblings under the same parent.
- **Playhead init**: `useState(cuelist?.playhead?.cue_id ?? null)` — reads from Yjs doc's playhead on mount. Persists across reloads because Yjs IndexedDB persistence (B001-012/B003-012) restores the doc state.
- **GO flash detection**: `isFiring` check is inline in the map — `Date.now() - new Date(dispatched_at).getTime() < 2000`. The 2-second window means the row stays green briefly after a GO.
- **Locked state**: Lock icon appears in `show` mode only; payload content is still visible but a lock glyph signals it's frozen. Edit restriction is enforced server-side (B003-004).
- **Performance note**: No virtualization implemented. Spec notes this is acceptable for MVP; react-window suggested for follow-up if 200+ cues cause jank.
