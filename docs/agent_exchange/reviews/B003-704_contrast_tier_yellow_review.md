---
id: "B003-704"
title: "Contrast tier — yellow-bg buttons dark text"
verdict: "accepted"
critic_round: 1
reviewed_at: "2026-06-11T20:45:00Z"
---

## Verdict

**accepted** — surgical two-line fix + sweep + verification test, exactly what the spec asked for.

## Acceptance criteria

1. **Standby + Arm: ink → bg on yellow, contrast ≥4.5:1** — ✅
   - `pwa/src/components/cuelist/OperatorCueRow.tsx:101-102` — Standby button: `background: tokens.color.yellow` + `color: tokens.color.bg`
   - `pwa/src/components/cuelist/variants/PyroOperatorView.tsx:74-75` — Arm button (in `PyroCueRow`): `background: tokens.color.yellow` + `color: tokens.color.bg`
   - Hex sanity: `#F5B83D` (yellow) vs `#0E0F12` (bg) → relative luminance ratio ≈ 10.5:1, comfortably above 4.5:1.

2. **Sweep zbytku obou souborů na stejný pattern (ink na barevném bg)** — ✅
   - Independently swept both files (`grep tokens.color`):
     - OperatorCueRow.tsx: only remaining `tokens.color.ink` use is at L64 (description text on dark row `bg`) — not a coloured-bg case, contrast OK.
     - PyroOperatorView.tsx: no other `tokens.color.ink` on coloured bg; GO/Fire/Header all use `bg` on `red`/`teal` (already correct, ≥5:1).
     - Disabled-state `ink_disabled` on `gray_300` (OperatorCueRow:118, PyroOperatorView:91) intentionally left — WCAG 2.1 §1.4.3 exempts disabled controls. Done report calls this out explicitly.
   - No further violations missed.

3. **Testy + typecheck + PWA build zelené. No edits outside target_files.** — ✅
   - New `tests/unit/pwa/components/cuelist/ContrastTier.test.tsx` — 2 tests, both pass (verified locally: `pnpm vitest run tests/unit/pwa/components/cuelist/ContrastTier.test.tsx` → 2/2 ✓).
   - PWA typecheck clean (`pnpm --filter showx-pwa typecheck` → 0 errors).
   - `git diff` confined to exactly the two target source files + the new test file. No collateral edits.

## Test verification

```
tests/unit/pwa/components/cuelist/ContrastTier.test.tsx  (2 tests) ✓
  ✓ OperatorCueRow — Standby button has tokens.color.bg text on yellow background (61ms)
  ✓ PyroOperatorView — Arm button has tokens.color.bg text on yellow background
```

PWA `tsc --noEmit` exits 0.

## Notes

- Test asserts both: `style.color === BG_DARK` and `style.color !== INK_LIGHT` — a nice belt-and-braces guard against future regressions silently flipping back.
- Done report's contrast table matches the actual hex values in `pwa/src/style/tokens.ts` (spot-checked via test constants).
- Minimal scope, no overreach. Exactly the "mechanical cleanup" promised in the spec.
