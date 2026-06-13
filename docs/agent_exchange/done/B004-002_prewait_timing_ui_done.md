# B004-002 Done Report — Pre-wait UI + armed-waiting countdown

**Task:** B004-002  
**Status:** done  
**Forge ended_at:** 2026-06-13T14:35:00Z  

---

## Summary

Surfaced `pre_wait_ms` in the operator UI across three component target files plus minimal engine/hook glue needed for PWA-observable pre-wait state.

---

## Files changed

### Engine / side-channel (minimal glue, not primary targets)

- **`src/modules/cuelist-core/src/go/goEventChannel.ts`** — Added `go.prewait` broadcast when `preWaitMs > 0`. Sends `GoPreWait` envelope (cue_id, cuelist_id, waiting_until_ts) just before the pre-wait timer fires. NOT ring-buffered (transient; stale replay would be wrong).
- **`pwa/src/lib/sideChannel.ts`** — Added `GoPreWait` interface, `'go.prewait'` entry in `SideChannelEventMap`, handler in `handleMessage()` switch.
- **`pwa/src/hooks/useGoChannel.ts`** — Added `PreWaitState` type, `preWait` field to `GoChannelState`, `useEffect` subscribing to `go.prewait` (filters by cuelistId), clears `preWait` on `go.dispatched` for same cue.
- **`pwa/src/components/cuelist/SMMasterView.tsx`** — Wired `preWait` from `useGoChannel`, added `pre_wait_ms` to inline tab order, `KeyW` shortcut, `handleInlineCommit` case, and `preWaitUntil` per-row calculation.

### Primary target files

- **`pwa/src/components/cuelist/CueRow.tsx`**
  - `InlineEditField` union: added `'pre_wait_ms'`
  - New `preWaitUntil?: number | null` prop
  - PRE badge in duration cell (`data-testid="pre-wait-badge"`): shown when `cue.pre_wait_ms > 0`, yellow mono, formatted duration
  - Inline edit guard: `inlineEditField === 'pre_wait_ms' && mode === 'rehearsal'` → shows `InlineEdit`; SHOW mode shows badge instead
  - Left border: yellow when `isPreWaiting`, red for armed/counting
  - Absolute overlay: `data-testid="pre-wait-indicator"` with WAIT countdown (yellow, bordered), visible only while `preWaitRemaining > 0`

- **`pwa/src/components/cuelist/CueEditDialog.tsx`**
  - `preWaitSecs` state initialized from `cue.pre_wait_ms`
  - Pre-wait field (`data-testid="cue-edit-prewait"`): text input, decimal, `disabled={locked}`
  - `handleSave` emits `pre_wait_ms` (0 when empty, ms when numeric); `preWaitSecs` added to `useCallback` deps
  - `locked` disables input only (no onChange guard — `disabled` is sufficient)

- **`pwa/src/components/cuelist/PlaybackHeader.tsx`**
  - `formatCountdown()` (M:SS.S)
  - Props: `preWaitingCueLabel?: string | null`, `preWaitUntil?: number | null`
  - WAITING indicator (`data-testid="prewait-indicator"`, `aria-live="assertive"`): shown only when both `preWaitingCueLabel !== null` and `preWaitRemaining > 0`

---

## Tests added

| File | New tests |
|---|---|
| `tests/unit/pwa/components/cuelist/CueRow.test.tsx` | 8 |
| `tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx` | 7 |
| `tests/unit/pwa/components/cuelist/PlaybackHeader.test.tsx` | 4 |

---

## Test results

```
Test Files  134 passed (134)
     Tests  1577 passed (1577)
```

Typecheck: all 5 workspace packages clean.

---

## Bugs fixed during implementation

1. **`handleSave` stale closure** — `preWaitSecs` was missing from `useCallback` dep array; state updated but save saw initial value. Fixed by adding `preWaitSecs` to deps.
2. **Existing test** (`save button calls onSave with current field values`) used exact object match without `pre_wait_ms`; updated to include `pre_wait_ms: 0`.

---

## Acceptance criteria check

- [x] PRE badge visible when `pre_wait_ms > 0`, absent when 0/undefined
- [x] Inline edit in REHEARSAL mode only (SHOW mode shows badge, not input)
- [x] `KeyW` shortcut opens pre-wait inline edit in REHEARSAL
- [x] WAIT countdown overlay on CueRow during active pre-wait
- [x] `CueEditDialog` pre-wait field, pre-filled, disabled in SHOW mode
- [x] `PlaybackHeader` WAITING indicator with cue label + countdown
- [x] Yellow color (`tokens.color.yellow`) for all pre-wait visuals
- [x] No visual noise when `pre_wait_ms` is 0 or undefined
- [x] `go.prewait` side-channel event broadcast from engine
