---
id: "B004-011"
title: "Payload authoring discoverability + cue-edit affordance"
status: "done"
round: 1
forge_ended_at: "2026-06-13T16:42:00Z"
---

## Files changed

- `pwa/src/components/cuelist/CueRow.tsx` — added `payload-count-badge` div (always visible, shows count or "no actions") + `cue-edit-btn` button (always visible in rehearsal mode when `onEdit` provided)
- `pwa/src/components/cuelist/CueEditDialog.tsx` — moved Payloads section before Duration/Pre-wait fields so it's visible without scrolling
- `pwa/src/components/cuelist/PayloadList.tsx` — improved empty state: `data-testid="payload-empty-state"`, "No payloads yet." + hint text "OSC, MIDI, DMX, MSC… — add an action this cue sends." (hidden when locked)
- `tests/unit/pwa/components/cuelist/CueRow.test.tsx` — 8 new tests for edit glyph and payload count badge
- `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx` — 1 new test verifying Payloads DOM position before duration field
- `tests/unit/pwa/components/cuelist/PayloadList.test.tsx` — updated "shows empty state" test + 3 new tests for hint text and add-payload reachability

## Tests run

```
Test Files  137 passed (137)
     Tests  1661 passed (1661)
```

`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean.

## Acceptance criteria coverage

- ✅ Visible edit affordance (`cue-edit-btn`, ✎ glyph) always-on in rehearsal mode; double-click still works
- ✅ Payloads section moved before Duration/Pre-wait in CueEditDialog — visible without scrolling
- ✅ Empty state shows "No payloads yet." + hint CTA "OSC, MIDI, DMX, MSC… — add an action this cue sends."
- ✅ `payload-count-badge` always rendered on every row (shows "N payloads" or "no actions")
- ✅ Dark FOH theme maintained (used existing token colors)
- ✅ `payload-summary` testid preserved (e2e test at tests/e2e/multiop.spec.ts:88 uses it)
- ✅ No regressions to selection/playhead click zones (edit btn uses `e.stopPropagation()`)
- ✅ No edits outside target_files

## Decisions made within task scope

- Kept `payload-summary` testid alongside new `payload-count-badge` — e2e test at `tests/e2e/multiop.spec.ts` line 88 depended on it; adding a separate element avoids breaking that test without touching out-of-scope files.
- Edit glyph always-on (not hover-only) because inline styles can't express CSS hover; this also gives better touch discoverability on iPad.
- Payloads moved BEFORE Duration/Pre-wait in dialog — most operators care more about "what does this cue DO?" than timing fields, so payload editing is now above the fold.

## Notes for Critic

- The `cue-edit-btn` renders in the actions column flex container, before ARM/DISARM and other contextual buttons. This means it's visible on EVERY rehearsal row (not just selected ones), which is the intent per spec.
- `payload-count-badge` uses `tokens.color.teal` for > 0 payloads and `tokens.color.ink_disabled` for 0, giving a "this cue does nothing" signal without being alarming.
- No packed-app-specific bugs were found per AC item 4 (spec said "reserve slot if gate finds one" — no actual runtime bug identified at this stage).
