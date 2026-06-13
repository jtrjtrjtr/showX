---
id: "B004-011"
title: "Payload authoring discoverability + cue-edit affordance"
verdict: "accepted"
round: 1
reviewed_at: "2026-06-13T16:48:00Z"
reviewer: "critic"
---

## Verdict

**accepted** — all acceptance criteria met, tests + typecheck + build clean, no edits outside `target_files`.

## Acceptance criteria coverage

### AC1 — Visible cue-edit affordance (✎ glyph)
- ✅ `cue-edit-btn` always rendered in rehearsal mode when `onEdit` provided — `pwa/src/components/cuelist/CueRow.tsx:483-505`
- ✅ Touch-friendly: `minWidth: 32`, `minHeight: 32` (iPad-friendly tap target)
- ✅ Click isolated from row selection via `e.stopPropagation()` on line 488
- ✅ Title + aria-label set for discoverability
- ✅ Double-click row → edit dialog still works (no regression — onDoubleClick wiring untouched)

### AC2 — Payloads section visible without scrolling
- ✅ Payloads section now rendered at `CueEditDialog.tsx:146-177`, BEFORE Duration (line 179) and Pre-wait (line 191)
- ✅ Order in dialog: Label → Description → Standby note → **Payloads** → Duration → Pre-wait → Save/Cancel
- ✅ Empty state CTA: `PayloadList.tsx:76-84` — `data-testid="payload-empty-state"` shows "No payloads yet." + hint "OSC, MIDI, DMX, MSC… — add an action this cue sends."
- ✅ `+ Add payload` button (AddPayloadMenu at line 166-169) remains immediately reachable below the empty state, so the CTA flow is unbroken

### AC3 — Payload count badge on cue row
- ✅ `payload-count-badge` always rendered — `CueRow.tsx:399-412`
- ✅ Shows "N payload(s)" in teal when present, "no actions" in `ink_disabled` when empty
- ✅ "no actions" signal addresses Jindřich's "nefunguje, nic se neděje" perception — visually distinguishes inert cues
- ✅ Always rendered (also in show mode) — verified by test at `CueRow.test.tsx`

### AC4 — Flex slot for packed-app bug if found
- ✅ Forge documented no actual packed-app bug identified at this stage (gate B004-012 has not run yet). Spec wording "If gate reveals..." makes this conditional — no real bug to fix in scope.

### AC5 — Dark FOH theme, touch-friendly, no regression
- ✅ Uses `tokens.color.teal`, `tokens.color.ink_disabled`, `tokens.color.ink_secondary`, `tokens.color.border` — no raw hex
- ✅ Edit button uses `e.stopPropagation()` — selection / playhead click zones unaffected
- ✅ `payload-summary` testid preserved alongside new `payload-count-badge` — existing e2e test `tests/e2e/multiop.spec.ts:88` not broken

### AC6 — Unit tests
- ✅ Edit glyph: 5 tests (visible in rehearsal+onEdit, click calls onEdit, click doesn't propagate to onSelect, NOT in show mode, NOT without onEdit) — `tests/unit/pwa/components/cuelist/CueRow.test.tsx`
- ✅ Empty state CTA: empty-state testid + "No payloads yet" — `tests/unit/pwa/components/cuelist/PayloadList.test.tsx:71-75`
- ✅ Payload count badge: "no actions" when 0, "2 payloads" when 2, always rendered (incl. show mode) — 3 tests
- ✅ Add-payload reachability: existing menu test confirms 8-type menu reachable from empty state

### AC7 — Build / typecheck / tests / no scope creep
- ✅ `pnpm vitest run` for 3 target test files → 91 tests pass (57 CueRow + 24 CueEditDialog + 10 PayloadList)
- ✅ `pnpm -r typecheck` → clean
- ✅ All file changes attributable to B004-011 stay inside `pwa/src/components/cuelist/{CueRow,CueEditDialog,PayloadList}.tsx` and `tests/unit/pwa/**`
- ✅ No production code edited outside target_files

## Independent verification

Ran:
- `pnpm vitest run tests/unit/pwa/components/cuelist/CueRow.test.tsx` → 57 passed
- `pnpm vitest run tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx tests/unit/pwa/components/cuelist/PayloadList.test.tsx` → 34 passed (24 + 10)
- `pnpm -r typecheck` → clean across 5 workspaces

Source citations:
- `CueRow.tsx:485` — `data-testid="cue-edit-btn"` rendered in rehearsal mode
- `CueRow.tsx:401-412` — `payload-count-badge` always rendered
- `CueEditDialog.tsx:146-177` — Payloads section before Duration
- `PayloadList.tsx:76-83` — empty state with CTA hint

## Notes for Architect

- The diff against HEAD bundles uncommitted work from multiple ShowX-4 tasks (B004-002 pre-wait, B004-004 DMX, B004-007 disarm) because no per-task commits exist since the bundle-open commit `0164c71`. B004-011's specific deltas (cue-edit-btn, payload-count-badge, Payloads-section reorder, empty-state CTA) are correctly scoped to target_files.
- Sensible UX decisions documented in done report (edit glyph always-on instead of hover-only for iPad touch, Payloads ordered before timing fields because authoring intent dominates). Aligned with spec intent.
- AC4 (flex slot for packed-app bug) is conditional on B004-012 gate findings. If the gate surfaces a real authoring bug, that would be a fresh task or a re-open of this one.

## Verdict

**accepted**
