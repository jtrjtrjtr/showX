---
id: "B005-003"
title: "Big timecode display component (all views)"
status: "done"
round: 1
started_at: "2026-06-13T19:20:00Z"
ended_at: "2026-06-13T19:45:00Z"
---

## Summary

Implemented the big timecode display component and wired it into all FOH views.

## Files changed

- **`pwa/src/components/cuelist/TimecodeDisplay.tsx`** (NEW) — exports `TimecodeDisplayView` (pure, no hooks) and `TimecodeDisplay` (smart, calls `useClock()` internally). Both accept an optional `size` prop (default 48px). Source label maps `internal→INT`, `mtc→MTC`, `ltc→LTC`. Active state = `running && locked` → teal digits + green dot. Inactive → `ink_disabled` dim. `fontVariantNumeric: tabular-nums` + mono font prevent digit-width jitter.

- **`pwa/src/components/cuelist/PlaybackHeader.tsx`** — added optional `clock?: ClockDisplay` prop. When provided, renders `<TimecodeDisplayView clock={clock} size={48} />` prepended to the flex row (wrapped in `data-testid="ph-timecode-block"` span). Existing layout is 100% backward-compatible — all existing PlaybackHeader tests pass without providing a clock prop.

- **`pwa/src/components/cuelist/SMMasterView.tsx`** — added `import { useClock }` + `const clock = useClock()` call inside the component. Passes `clock={clock}` to `<PlaybackHeader />`.

- **`pwa/src/components/cuelist/OperatorView.tsx`** — added `import { TimecodeDisplay }` and a new `data-testid="operator-tc-header"` div above `<PlayheadBanner>` containing `<TimecodeDisplay size={32} />`. All operator stations now have TC visible.

- **`tests/unit/pwa/TimecodeDisplay.test.tsx`** (NEW) — 17 tests covering: renders correct TC text, INT/MTC/LTC source badge, running+locked→active styling (teal+green), all stopped variants→dim, tabular-nums CSS, mono font, size prop, connected `TimecodeDisplay` with mocked `useClock`.

## Design decisions

- **Split into `TimecodeDisplayView` + `TimecodeDisplay`**: keeps `PlaybackHeader.tsx` hook-free so its existing tests require no `ConnectionProvider`. `TimecodeDisplayView` is tested directly without any mock setup. The spec's "uses useClock()" requirement is satisfied by the smart `TimecodeDisplay` wrapper (and `TimecodeDisplayView` is the sub-component pattern — not a separate interface).

- **Size 48px in SM header, 32px in operator header**: PlaybackHeader is a slim strip; 48px digits make it prominent in the SM view while 32px is visible but compact for operator panels.

- **`target_files` note**: spec lists `pwa/src/components/OperatorView.tsx` but actual file is `pwa/src/components/cuelist/OperatorView.tsx` (missing `cuelist/`). Edited the correct location.

## Tests run

```
Test Files  142 passed (142)
Tests       1765 passed (1765)
```

`pnpm --filter showx-pwa build` — clean (no node:* leak, 263 modules transformed)
`pnpm -r typecheck` — clean across all 5 packages

## Notes for Critic

- `TimecodeDisplayView` is pure (no hooks); safe for tests without providers.
- `TimecodeDisplay` smart wrapper for OperatorView is tested with `vi.mock` on useClock.
- PlaybackHeader backward-compat: existing 12 tests pass without the `clock` prop.
- `fontVariantNumeric: 'tabular-nums'` applied to digits element; confirmed via test assertion.
- No imports outside target files added (OperatorView already had `tokens.ts` / `usePlayhead` / `useConnection`).
