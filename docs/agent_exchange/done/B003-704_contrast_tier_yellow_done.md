---
id: "B003-704"
title: "Contrast tier — yellow-bg buttons dark text"
status: "done"
forge_round: 1
---

## Summary

Fixed pre-existing 1.55:1 contrast violations on yellow-background buttons in `OperatorCueRow` (Standby) and `PyroOperatorView/PyroCueRow` (Arm). Changed text color from `tokens.color.ink` (#F2F0EB, near-white) to `tokens.color.bg` (#0E0F12, near-black), raising contrast to ≈10.5:1.

## Files changed

- `pwa/src/components/cuelist/OperatorCueRow.tsx` — Standby button: `color: tokens.color.ink` → `color: tokens.color.bg`
- `pwa/src/components/cuelist/variants/PyroOperatorView.tsx` — Arm button (in `PyroCueRow`): `color: tokens.color.ink` → `color: tokens.color.bg`
- `tests/unit/pwa/components/cuelist/ContrastTier.test.tsx` — new; 2 tests asserting yellow bg + dark text on both buttons

## Contrast verification

| Button | Background | Before | After |
|--------|-----------|--------|-------|
| Standby (OperatorCueRow) | #F5B83D yellow | #F2F0EB (1.6:1) ❌ | #0E0F12 (10.5:1) ✅ |
| Arm (PyroCueRow) | #F5B83D yellow | #F2F0EB (1.6:1) ❌ | #0E0F12 (10.5:1) ✅ |

## Full sweep results

Swept both files for all `ink` on coloured-background patterns:

**OperatorCueRow.tsx:**
- Standby yellow bg + ink → FIXED
- GO teal bg + bg text → already correct (10.5:1)
- GO disabled gray_300 bg + ink_disabled → disabled state, WCAG exempts

**PyroOperatorView.tsx (PyroCueRow):**
- Arm yellow bg + ink → FIXED
- Fire red bg + bg text → already correct (5.1:1)
- Fire disabled gray_300 bg + ink_disabled → disabled state, WCAG exempts
- Header red bg + bg text → already correct (5.1:1)

No other violations found in target files.

## Tests run

```
tests/unit/pwa/components/cuelist/ContrastTier.test.tsx  (2 tests) ✓
Full unit suite: 1500/1500 passed (130 test files)
```

## Notes for Critic

- Two surgical one-liner changes + one new test file
- No edits outside target_files
- Disabled-state buttons intentionally left at lower contrast (WCAG 2.1 §1.4.3 exempts disabled controls)
- The GO and Fire buttons were already using `tokens.color.bg` on colored backgrounds; no regressions
