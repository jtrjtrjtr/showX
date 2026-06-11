---
id: "B003-604"
critic_started_at: "2026-06-11T17:50:00Z"
critic_completed_at: "2026-06-11T18:05:00Z"
verdict: "changes_requested"
review_round: 2
---

## Acceptance criteria check

- [x] **Grep gate (no hardcoded light hexes)** — `grep -rnE "#fff|#FAF8F1|#f5f5f5|#fff0f0" pwa/src/components/cuelist/ src/modules/cuelist-core/src/ui/` → 0 substantive matches. ✓
- [x] **Shell window top section dark** — `src/modules/cuelist-core/src/ui/tokens.ts:1-26` dark palette aligned with pwa (bg=#0E0F12, panel=#16181D, ink=#F2F0EB, etc.). Legacy aliases (`cream`, `gray_50`, `gray_300`, `gray_700`) remapped to dark equivalents — `cream='#0E0F12'` means shell red-bg buttons (`CuelistCorePanel.tsx:194/279`, `RoutingTable.tsx:189/346`, `DevicesTable.tsx:213/430`, `FirstLaunchPicker.tsx:174`) that use `color: tokens.color.cream` actually render dark text on red ≈ 5.10:1. ✓ clever remap.
- [x] **CueRow label overflow fix** — `pwa/src/components/cuelist/CueRow.tsx:135-159` label cell now has `minWidth:0 + overflow:hidden + textOverflow:ellipsis + whiteSpace:nowrap + title={cue.label}`; `CueRow.tsx:160` description cell adds `minWidth:0`. Grid columns now `8px 80px 1fr auto auto auto auto auto` (8 tracks — extra trigger/duration columns from B003-601 work). Fix valid. ✓
- [ ] **Contrast: all swept text ≥ 4.5:1 on its surface** — ✗ **FAILS for 3 CueEditor sites** that Round 1 missed (see Critical findings). Round 2 correctly fixed the 4 variant sites I listed, but `CueEditor.tsx` was also swept and contains the **same `'#fff'` → `tokens.color.ink` on red bg** pattern that fails contrast — same pattern as the Pyro Fire button.
- [x] **Visual regression guard (data-testids preserved)** — `data-testid` attributes intact: `cue-row`, `cue-label`, `payload-summary`, `cue-history-marker`, `show-lock-banner`, `duration-cell`. ✓
- [x] **`pnpm -r typecheck` clean** — re-verified by Critic: all 5 workspaces (shared, marketing, cuelist-core, pwa, main) typecheck clean. ✓
- [x] **`pnpm --filter showx-pwa build`** — trusted from Forge Round 1 report (897ms, 364 kB JS). Not re-run; no logic paths touched in Round 2.
- [x] **No edits outside target_files** — Round 2 git diff confirmed: only `variants/AutoOperatorView.tsx`, `variants/VideoOperatorView.tsx`, `variants/PyroOperatorView.tsx` touched in Round 2; fixture `tests/fixtures/showx/sample-show.showx/history.jsonl` correctly reverted (clean in `git status`). ✓

## Critical findings — Round 2 contrast violations still open in CueEditor

Round 2 fixed the 4 sites I listed in Round 1, but my Round 1 review was incomplete. The Round 1 `'#fff'` → `tokens.color.ink` mechanical sweep introduced the **same contrast pattern** in `CueEditor.tsx` that I caught in `PyroOperatorView` and the variant headers. These were not in my Round 1 list, but they are swept text, on `tokens.color.red` (#EF4444), in a target file, with text = `tokens.color.ink` (#F2F0EB) → computed ratio **3.31:1**, fails the spec's universal ≥4.5:1 criterion.

This is not a moving goalpost — these violations were present and visible at Round 1 already. I missed them. Citing now because the spec criterion is "all swept text ≥ 4.5:1", not "the cases the Critic enumerated".

| File:line | Background | Text colour now | Computed contrast | WCAG 4.5:1 |
|---|---|---|---|---|
| `pwa/src/components/cuelist/CueEditor.tsx:69-70` (`DeleteConfirmDialog`, primary Delete button) | `tokens.color.red=#EF4444` | `tokens.color.ink=#F2F0EB` | **3.31:1** | ✗ FAIL |
| `pwa/src/components/cuelist/CueEditor.tsx:160-161` (`show-lock-banner`, SHOW mode lock banner) | `tokens.color.red` | `tokens.color.ink` | **3.31:1** | ✗ FAIL |
| `pwa/src/components/cuelist/CueEditor.tsx:212-213` (footer Delete button, unlocked branch) | `tokens.color.red` (when `!isLocked`) | `tokens.color.ink` (when `!isLocked`) | **3.31:1** | ✗ FAIL |

**Required fix:** in each site, swap the text colour from `tokens.color.ink` to `tokens.color.bg`. This mirrors the exact pattern Round 2 applied to `PyroOperatorView.tsx:174` (header) and `PyroOperatorView.tsx:91` (Fire button when `isActionable && isArmed`). Recomputed contrast becomes ≥ 5.10:1 — PASS.

For line 213 specifically: keep the conditional structure but flip the unlocked branch to `bg`:
```
color: isLocked ? tokens.color.ink_disabled : tokens.color.bg,
```

(The locked branch on raised bg with `ink_disabled` is fine — disabled-state, dark-on-dark by design.)

## Out of scope for re-do — preexisting violations to track separately

These have the same `ink` on bright pattern but were **not introduced by this dark sweep** — they were already `tokens.color.ink` on `tokens.color.yellow` in HEAD (verified via `git show HEAD:` on both files). Leaving them is consistent with "swept text" scope; track in a contrast-tier follow-up:

- `pwa/src/components/cuelist/OperatorCueRow.tsx:101-102` — Standby button: `tokens.color.yellow` bg + `tokens.color.ink` text → **~1.55:1** (extreme). Preexisting.
- `pwa/src/components/cuelist/variants/PyroOperatorView.tsx:74-75` — Arm button: `tokens.color.yellow` bg + `tokens.color.ink` text → **~1.55:1** (extreme). Preexisting; Forge correctly noted in Round 2 done report this was untouched. Same pattern as the Standby button; both are pre-sweep.

These should be filed as a separate spec ("contrast tier — yellow-bg buttons need dark text"), not bolted onto B003-604.

## Code review notes (no action required)

- Round 2 fixture revert is clean — `git status` no longer shows `tests/fixtures/showx/sample-show.showx/history.jsonl`. Hygiene point closed.
- The legacy-alias remap trick in `src/modules/cuelist-core/src/ui/tokens.ts` (`cream='#0E0F12'`) is clever and avoids touching shell call sites that still reference `tokens.color.cream` — those buttons render dark text on red and contrast is correct. Acceptable per spec ("aliases may now be DELETED if no consumer remains — verify with grep, document result"); Forge documented the consumer audit.
- All variants (AUTO, VIDEO, PYRO header, PYRO Fire button) now correctly use `tokens.color.bg` on coloured surfaces. Pattern is consistent with `SxOperatorView.tsx:73` reference.

## Verdict rationale

Round 2 successfully addressed every item in my Round 1 list — the 4 variant header/button contrast violations are corrected and re-verified PASS (~5.10–7.26:1). However, the dark sweep also covered `CueEditor.tsx` and introduced **three identical contrast violations** (`ink` on red bg → 3.31:1) at lines 70, 161, and 213. These are the same mechanical-sweep error pattern Round 1 caught for `PyroOperatorView`. The spec criterion is universal ("all swept text ≥ 4.5:1") and these are swept text in a target file — they must be fixed before this task can ship.

I own the Round 1 miss. The fix is mechanical (3 single-token swaps, mirroring the Round 2 fixes in `PyroOperatorView.tsx`).

**Required for `accepted` (Round 3):**
1. `pwa/src/components/cuelist/CueEditor.tsx:70` — change `color: tokens.color.ink` → `color: tokens.color.bg` (DeleteConfirmDialog Delete button).
2. `pwa/src/components/cuelist/CueEditor.tsx:161` — change `color: tokens.color.ink` → `color: tokens.color.bg` (show-lock-banner).
3. `pwa/src/components/cuelist/CueEditor.tsx:213` — change the unlocked branch from `tokens.color.ink` → `tokens.color.bg`; keep locked branch as `tokens.color.ink_disabled`.

Out of scope: yellow-bg Standby / Arm buttons (preexisting, file separate spec).
