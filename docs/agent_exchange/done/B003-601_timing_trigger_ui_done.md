# B003-601 Done Report — Timing & trigger UI

**Task:** Timing & trigger UI — trigger cell, duration column, follow/continue glyphs
**Bundle:** ShowX-3.6
**Forge session:** 2026-06-11
**Status:** done

---

## Changes delivered

### `src/modules/cuelist-core/src/document/cue.ts`
- Extended `CueFieldPatch` with `trigger?: Trigger` and `duration_hint_ms?: number | null`
- `updateCueFields` now validates and writes both fields:
  - `auto_continue`: rejects `delay_ms < 0`
  - `timecode`: rejects `time_ms < 0`
  - `auto_follow`: validates `prev_cue_id` exists in cuelist before committing
  - `duration_hint_ms`: rejects negative values

### `pwa/src/components/cuelist/TriggerCell.tsx` (new file)
- MagicQ-style single-cell trigger display + popover editor
- Display glyphs: `⏵ GO` (manual), `→ follow <label>` (auto_follow), `⏩ +Xs` (auto_continue), `⏱ TC mm:ss` (timecode)
- Popover opens only in `rehearsal` mode when `editable=true`; SHOW mode shows lock icon `🔒`
- `timecode` option disabled with "ShowX 0.2" label
- `auto_follow` pre-populates `prev_cue_id` from list order when kind changes

### `pwa/src/components/cuelist/CueRow.tsx`
- Grid expanded from 6 to 8 columns to accommodate TriggerCell + Duration columns
- `>` gutter marker (absolute, dim, `aria-hidden`) for non-manual cues when not playhead
- `formatDuration(ms)` helper: `M:SS.t` format, `—` for null
- `data-testid="duration-cell"` span
- Props extended: `cues?: Cue[]`, `onTriggerUpdate?: (trigger: Trigger) => void`

### `pwa/src/components/cuelist/CueEditDialog.tsx`
- Duration field (`type="text"`, `inputMode="decimal"`, `data-testid="cue-edit-duration"`)
- `durationMsToSecs` + inverse computation on save
- Fixed stale closure: added `durationSecs` to `handleSave` useCallback dependency array

### `pwa/src/components/cuelist/SMMasterView.tsx`
- Sticky column header row (Trigger + Dur labels)
- Passes `cues` and `onTriggerUpdate` down to each `CueRow`

---

## Tests

### New test files
- `tests/unit/pwa/components/cuelist/TriggerCell.test.tsx` — 12 tests

### Extended test files
- `tests/unit/modules/cuelist-core/document/cue.test.ts` — +9 tests (trigger + duration_hint_ms validation)
- `tests/unit/pwa/components/cuelist/CueRow.test.tsx` — +4 tests (duration display, trigger-cell testid)
- `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx` — +4 tests (duration field pre-fill, save behavior)

### Results
```
Test Files  124 passed (124)
     Tests  1409 passed (1409)
```

---

## Build gate

```
pnpm --filter showx-pwa build  →  ✓ built in 856ms
pnpm -r typecheck              →  all workspaces: Done
```

---

## Acceptance criteria coverage

| Criterion | Status |
|---|---|
| `updateCueFields` accepts `trigger` + `duration_hint_ms`, validates, writes to Y.Map | ✅ |
| TriggerCell: MagicQ-style glyph display + click-to-edit popover | ✅ |
| Duration column in CueRow: `M:SS.t` format, `—` for null | ✅ |
| `>` gutter marker for non-manual cues (not playhead) | ✅ |
| CueEditDialog Duration field — pre-filled, saves as ms | ✅ |
| SHOW mode locking — popover blocked, lock icon shown | ✅ |
| CRDT write via `updateCueFields` from SMMasterView | ✅ |
| Typecheck clean (`pnpm -r typecheck` passes) | ✅ |
| Production build clean (`pnpm --filter showx-pwa build` passes) | ✅ |
