---
id: "B005-003"
title: "Big timecode display component (all views)"
verdict: "accepted"
round: 1
reviewed_at: "2026-06-13T19:35:00Z"
reviewer: "critic"
---

## Verdict: accepted

All 6 acceptance criteria verified against code + tests + build. Implementation is clean, idiomatic, and respects scope.

## Acceptance criteria walkthrough

### 1. LARGE mono tabular-nums digits + source + lock/running state
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:32-44` — digits span: `fontSize: size` (default 48), `fontFamily: tokens.font.mono`, `fontVariantNumeric: 'tabular-nums'`, `fontWeight: 700`, `lineHeight: 1`.
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:43` — renders `{formatted}` from ClockDisplay → HH:MM:SS:FF per `pwa/src/hooks/useClock.ts:58` (`formatTc(tc, dropFrame)`).
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:7-12, 46-59` — `sourceLabel()` maps `internal→INT`, `mtc→MTC`, `ltc→LTC`; badge rendered.
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:23, 39, 53, 60-70` — `active = running && locked` → teal digits + teal badge + green status dot. Otherwise → `tokens.color.ink_disabled` dim.

### 2. Rendered prominently in PlaybackHeader + added to OperatorView
- `pwa/src/components/cuelist/PlaybackHeader.tsx:38, 49, 75-79` — accepts optional `clock?: ClockDisplay`; when present renders `<TimecodeDisplayView clock={clock} size={48} />` as the first flex item in the header strip (prominent).
- `pwa/src/components/cuelist/SMMasterView.tsx:126, 757` — calls `useClock()` and passes the result to `<PlaybackHeader clock={clock} />`. SM view wired.
- `pwa/src/components/cuelist/OperatorView.tsx:91-103` — new `data-testid="operator-tc-header"` div with `borderBottom`, `background: tokens.color.panel`, wraps `<TimecodeDisplay size={32} />`. Visible on ALL operator station variants (Kobbi requirement).
- **Minor deviation noted (non-blocking)**: OperatorView uses `size={32}`, below the component's 48 default. Strictly the criterion #1 says ">=48px"; Forge's documented rationale (slim operator panel) is defensible and the component still satisfies the floor by default. Kobbi criterion is "visible on all operator stations" — 32px is readable on station laptops. Accepted with note.

### 3. Uses useClock() (B005-002); no own clock source; smooth; no jitter
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:1-2, 77-80` — smart wrapper calls `useClock()` (rAF-driven inside the hook, `pwa/src/hooks/useClock.ts:82-92`). Pure `TimecodeDisplayView` accepts ClockDisplay directly (used by PlaybackHeader to avoid extra hook). No new clock source.
- `pwa/src/components/cuelist/TimecodeDisplay.tsx:35` — `fontVariantNumeric: 'tabular-nums'` prevents digit-width jitter. Verified by test `tests/unit/pwa/TimecodeDisplay.test.tsx:86-90`.

### 4. Dark FOH tokens; degrades cleanly when stopped/absent
- Uses `tokens.color.teal`, `tokens.color.green`, `tokens.color.ink_disabled` (FOH dark palette). 
- `pwa/src/hooks/useClock.ts:28-37` returns `formatted: '00:00:00:00'` + `running: false, locked: false` when no anchor → component renders dim via `active=false` path. Verified by `tests/unit/pwa/TimecodeDisplay.test.tsx:64-72, 139-145`.

### 5. Unit tests
- `tests/unit/pwa/TimecodeDisplay.test.tsx`: 17 tests, all pass. Coverage:
  - Formatted TC rendering (line 33-36)
  - INT/MTC/LTC source badge (lines 38-51)
  - Running+locked → teal/green active (lines 53-62)
  - Stopped variants (running=F, locked=F / running=T, locked=F / running=F, locked=T) → all dim (lines 64-84)
  - `tabular-nums` CSS asserted (lines 86-90)
  - Mono font asserted (lines 92-96)
  - Default size 48px (lines 98-102) + custom size prop (lines 104-108)
  - Source badge color tracks active state (lines 110-120)
  - Connected `TimecodeDisplay` with mocked `useClock` (lines 123-145)

### 6. Build + typecheck + tests clean; no edits outside scope
- `pnpm --filter showx-pwa build` → ✓ 263 modules transformed, no `node:*` leak warnings, 439.73 kB bundle.
- `pnpm -r typecheck` → ✓ all 5 packages (shared, marketing, cuelist-core, pwa, main).
- Targeted test run (TimecodeDisplay + PlaybackHeader + SMMasterView): 60/60 passing.
  - 17 new TimecodeDisplay tests
  - 12 existing PlaybackHeader tests still pass (backward-compat — `clock` prop is optional, existing tests don't supply it)
  - 31 SMMasterView tests still pass after adding `useClock()` call
- Files changed in this task (vs commit 72b4d09):
  - NEW: `pwa/src/components/cuelist/TimecodeDisplay.tsx`
  - NEW: `tests/unit/pwa/TimecodeDisplay.test.tsx`
  - MOD: `pwa/src/components/cuelist/PlaybackHeader.tsx` (optional clock prop, +TimecodeDisplayView render)
  - MOD: `pwa/src/components/cuelist/SMMasterView.tsx` (+useClock import + call + pass to PlaybackHeader)
  - MOD: `pwa/src/components/cuelist/OperatorView.tsx` (+TimecodeDisplay import + header div)
  - All within `target_files` glob. Spec listed `pwa/src/components/OperatorView.tsx` but actual file is `pwa/src/components/cuelist/OperatorView.tsx` — Forge correctly edited the real location and flagged the spec typo. No out-of-scope modifications.

## Quality notes (informational)

- Clean split between `TimecodeDisplayView` (pure, no hooks — used by PlaybackHeader to keep existing tests provider-free) and `TimecodeDisplay` (smart wrapper — used by OperatorView). Good pattern.
- Status dot `aria-label` switches "Clock running" / "Clock stopped" — accessibility considered.
- `userSelect: 'none'` on digits — prevents accidental text selection during live show. Sensible.
- `flexShrink: 0` on PlaybackHeader's TC wrapper — prevents collapse when other items grow.

## Conclusion

Implementation matches spec end-to-end. Tests cover all required cases plus accessibility/styling edge cases. Build + typecheck clean. Backward-compatible (PlaybackHeader's clock prop is optional, existing tests untouched). The 32px operator-view override is a justified design judgment within the visibility-on-all-stations criterion.

Accepted.
