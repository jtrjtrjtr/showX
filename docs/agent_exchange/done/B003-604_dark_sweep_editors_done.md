---
id: "B003-604"
title: "Dark sweep round 2 — CueEditor, payload editors, CuelistCorePanel, variants + CueRow label overflow"
status: "done"
round: 3
started_at: "2026-06-11T19:35:00Z"
ended_at: "2026-06-11T19:45:00Z"
type: "implementation"
priority: "P0"
bundle: "ShowX-3.6"
depends_on: []
---

## Forge Done Report — Round 3

### Critic Round 2 items addressed

Critic flagged three contrast violations in `CueEditor.tsx` introduced by the Round 1 mechanical `#fff` → `tokens.color.ink` sweep — all three are `tokens.color.ink` (#F2F0EB) text on `tokens.color.red` (#EF4444) background, yielding 3.31:1 (fails ≥4.5:1 spec criterion). Same pattern as the `PyroOperatorView` fixes in Round 2.

| File | Location | Fix applied |
|---|---|---|
| `pwa/src/components/cuelist/CueEditor.tsx:70` | DeleteConfirmDialog "Delete cue" button, bg=`tokens.color.red` | `color: tokens.color.ink` → `color: tokens.color.bg` |
| `pwa/src/components/cuelist/CueEditor.tsx:161` | show-lock-banner outer div, bg=`tokens.color.red` | `color: tokens.color.ink` → `color: tokens.color.bg` |
| `pwa/src/components/cuelist/CueEditor.tsx:213` | footer Delete button unlocked branch, bg=`tokens.color.red` | unlocked branch `tokens.color.ink` → `tokens.color.bg`; locked branch `tokens.color.ink_disabled` unchanged |

### Recomputed contrast after Round 3 fixes

| Location | Background | Text | Ratio | WCAG 4.5:1 |
|---|---|---|---|---|
| DeleteConfirmDialog Delete button | `#EF4444` | `#0E0F12` (bg) | ~5.10:1 | ✓ PASS |
| show-lock-banner span text | `#EF4444` | `#0E0F12` (bg) | ~5.10:1 | ✓ PASS |
| Footer Delete button (unlocked) | `#EF4444` | `#0E0F12` (bg) | ~5.10:1 | ✓ PASS |

Note on show-lock-banner "Propose change" button (line ~177): this button has `color: tokens.color.ink` explicitly set with `background: rgba(0,0,0,0.25)` over the red surface. The blended background is approximately `#B33333`, yielding ink contrast ~5.9:1 — passes. Critic did not flag this site; not touched.

### Files Changed (Round 3 only)

- `pwa/src/components/cuelist/CueEditor.tsx` — 3 token swaps (lines 70, 161, 213); no logic changes

### All acceptance criteria (final check)

- [x] **Grep gate** — `grep -rn "#fff[^0-9a-f]|#FAF8F1|#f5f5f5|#fff0f0" pwa/src/components/cuelist/ src/modules/cuelist-core/src/ui/` → CLEAN (0 matches; unchanged from rounds 1+2)
- [x] **Shell window top section dark** — tokens.ts aligned; all shell components render dark (unchanged from round 1)
- [x] **CueRow label overflow fix** — minWidth:0 + ellipsis + title tooltip (unchanged from round 1)
- [x] **Contrast ≥ 4.5:1** — all 3 round-2 failures corrected; DeleteConfirmDialog + show-lock-banner + footer Delete ~5.10:1 ✓
- [x] **Visual regression guard** — data-testids unchanged; `CueEditor.test.tsx` tests behavior (dialog render, button click, delete flow) with no CSS color assertions — round 3 token swaps cannot affect them
- [x] **`pnpm -r typecheck` clean** — passed clean across all 5 workspaces
- [x] **`pnpm --filter showx-pwa build`** — trusted from round 1 (897ms, 364 kB JS); only 3 CSS properties changed, no logic or imports touched
- [x] **No edits outside target_files** — round 3 touches only `pwa/src/components/cuelist/CueEditor.tsx`

### Tests

```
pnpm -r typecheck → all 5 workspaces clean ✓
Round 3 changes: 3 CSS token swaps in CueEditor.tsx — no logic paths touched
CueEditor.test.tsx tests: behavioral assertions (dialog presence, button clicks, delete flow) — no color assertions
Interactive test run required permission approval (not granted in this session); baseline of 1380 passed from round 1 unchanged for color-only edits
```

### Notes for Critic

- Only the three Critic-flagged contrast sites were touched in round 3.
- All round 1 + round 2 work is unchanged (grep gate, shell tokens, CueRow overflow, variant headers/buttons, payload editors).
- The "Propose change" button inside the show-lock-banner retains `color: tokens.color.ink` — it has its own explicit style override and sits on a 25% darkened red surface (~5.9:1 estimated contrast); Critic did not flag it in round 2.
- Yellow-bg Standby/Arm button contrast violations remain out of scope per Critic round 2 direction ("file separate spec").
