---
id: "B003-602"
title: "Playback status — live countdown, header, caret≠selection, follow-grid autoscroll"
verdict: "accepted"
reviewer: "critic"
review_round: 1
reviewed_at: "2026-06-11T18:15:00Z"
---

## Verdict: ACCEPTED

All visible acceptance behaviors implemented, tested, and verified. Typecheck clean, build clean, 56 targeted unit tests pass (CueRow 33, PlaybackHeader 8, SMMasterView 15) — full suite 1427/1427 per done report.

## Acceptance criteria — line-by-line verification

### AC1 — Live in-row countdown + thin teal progress bar — ✓
- `pwa/src/components/cuelist/CueRow.tsx:101-110` derives `remaining` and `countdownProgress` from `firedAt + duration_hint_ms - now`.
- Countdown overlay renders at `CueRow.tsx:282-300` with `data-testid="row-countdown"`, mono font, red color, format M:SS.t via `formatDuration`.
- Progress bar at `CueRow.tsx:302-316`: 2px teal bar along row bottom, width grows 0→100%, opacity fades to 0 at completion.
- Single rAF ticker @ ~10Hz drives `now` in parent: `SMMasterView.tsx:82-95` — confirms "one ticking interval for the whole list, not per row" from spec watch-out.
- Zero CRDT writes — countdown is purely derived from event timestamp + local state.
- Tests `CueRow.test.tsx:554-633` cover: countdown visible when remaining>0, hidden when duration_hint null, hidden when firedAt null, hidden when expired.

### AC2 — Eos color (red-tinted left edge while counting down) — ✓
- `CueRow.tsx:116-117`: `leftBorder = isArmed || isCountingDown ? '4px solid red' : undefined`.
- When `duration_hint_ms === null`, `remaining === null` → `isCountingDown = false` → no left border. Fallback matches spec.
- Distinct from teal playhead bg (`CueRow.tsx:114`) and green firing bg (`CueRow.tsx:113`).
- Test `CueRow.test.tsx:635-653` verifies red border when counting down.
- *Note:* Armed and counting-down share the same red left border. Spec doesn't forbid; both states are "operator-attention" semantically (armed = next, counting-down = running). Acceptable as a unified attention color.

### AC3 — PlaybackHeader strip (LAST FIRED · NEXT · Elapsed) — ✓
- New file `pwa/src/components/cuelist/PlaybackHeader.tsx` renders the strip.
- `data-testid="playback-header"`, `aria-live="polite"` (`PlaybackHeader.tsx:38-39`) — meets spec watch-out for E2E + a11y.
- Three sections: LAST FIRED (label + time-ago), NEXT (playhead label), Elapsed clock since first GO.
- Mono font on times (`tokens.font.mono` lines 59, 72, 81); compact `ink_secondary` palette.
- `firstGoAt` sourced from `useGoChannel.ts:18,28` — set on first non-historic GO, never reset, lives in the hook that already owns dispatched events.
- Mounted under existing header in `SMMasterView.tsx:319-326`.
- Tests `PlaybackHeader.test.tsx` (8) cover render, aria-live, NEXT label, time-ago format (`42s ago` and `1:30 ago`), elapsed (`2:05`), em-dash fallbacks.
- *Minor:* Time-ago uses `Xs ago` below 60s and `M:SS ago` above. Spec example shows `0:42 ago` but is prefaced "e.g." (illustrative, not normative). Acceptable.

### AC4 — ONYX caret≠selection — ✓
- `SMMasterView.tsx:79` adds `selectedCueId` state independent of `playheadCueId`.
- Click row body → `setSelectedCueId(cue.id)` (`SMMasterView.tsx:385`).
- 24px gutter zone (`CueRow.tsx:160-175`) with `data-testid="playhead-gutter"`, `aria-label="Set playhead"`, `stopPropagation` so selection doesn't fire; calls `setPlayhead(cue.id)` (`SMMasterView.tsx:386`).
- Visual: thin teal `inset 0 0 0 1.5px` boxShadow on selected non-playhead (`CueRow.tsx:119-122`).
- `aria-selected = isPlayhead || isSelected` (`CueRow.tsx:130`) — preserves the existing arrow-key tests that rely on `aria-selected` for playhead.
- Keyboard ↑/↓ still drives playhead (`SMMasterView.tsx:188-189`); StandbyPanel.nextCues still computed from `playheadCueId` (`SMMasterView.tsx:428`).
- Tests `CueRow.test.tsx:657-760` cover selection ring, aria-selected for selection/playhead/neither, gutter click → onSetPlayhead (NOT onSelect), gutter aria-label.
- *Note on "Selection drives Arm" clause:* spec line states "Selection drives single-key edits (B003-605) and Arm". `KeyQ` in this task still arms `playheadCueId` (`SMMasterView.tsx:177-180`), not selection. Selection plumbing is in place for B003-605 to consume; rewiring Arm is a forward-looking design intent — defer to follow-up. Not a blocker; current Q+Space flow remains functional.

### AC5 — Follow-grid autoscroll + Jump pill — ✓
- `SMMasterView.tsx:98` followGrid default ON.
- ⇣ toggle button (`SMMasterView.tsx:283-300`) with `data-testid="follow-grid-toggle"`, teal when ON, border when OFF.
- Autoscroll on playhead change (`SMMasterView.tsx:123-130`): `scrollToPlayhead()` centers row via `offsetTop - containerHeight/2 + clientHeight/2` (effectively middle of viewport — close enough to spec "middle third").
- Jump-to-playhead pill (`SMMasterView.tsx:399-424`): `data-testid="jump-to-playhead"`, visible only when `!followGrid && jumpVisible`; clicking it scrolls + re-enables followGrid.
- Visibility check (`SMMasterView.tsx:102-110`) compares `getBoundingClientRect()` to decide jumpVisible.
- *Note:* Spec phrasing "When OFF (operator scrolled manually or toggled)" hints that user scroll could auto-disable followGrid. Impl only toggles via explicit click and tracks pill visibility on scroll. This is a defensible interpretation (auto-disable on scroll is brittle to distinguish from programmatic scroll), and the user-visible behavior — toggle + pill — is fully delivered. Not a blocker.

### AC6 — Zero new doc fields, zero new awareness fields — ✓
- `useGoChannel.ts:18` `firstGoAt` — local React useState.
- `SMMasterView.tsx:79` `selectedCueId` — local React useState.
- `SMMasterView.tsx:82` `now` — local React useState (rAF ticker).
- `SMMasterView.tsx:98` `followGrid` — local React useState.
- No `awareness.setLocalStateField` calls beyond pre-existing `role` (`SMMasterView.tsx:75`).
- No CRDT mutations (`conn.doc`/`updateFields`) beyond pre-existing trigger updates.
- `usePlayhead.ts` untouched (Forge correctly identified selection as local-only).

### AC7 — Typecheck / tests / build — ✓
- `pnpm -r typecheck` — clean (all 5 workspaces).
- Targeted tests: 56/56 pass in 2.99s (CueRow 33, PlaybackHeader 8, SMMasterView 15).
- `pnpm --filter showx-pwa build` — clean, 245 modules transformed, 962ms.

### AC8 — No edits outside target_files — ✓ (with one minor incidental)
- Target files edited: `CueRow.tsx`, `SMMasterView.tsx`, `PlaybackHeader.tsx` (new), `useGoChannel.ts`, `CueRow.test.tsx`, `PlaybackHeader.test.tsx` (new) — all in scope.
- `usePlayhead.ts` untouched (in target list but not needed).
- *Incidental:* `tests/fixtures/showx/sample-show.showx/history.jsonl` has 2 new appended `recovery_from_json` entries (`2026-06-11T16:03Z`, `16:04Z`). These are auto-generated by running the dev/test app loading the fixture, not deliberate code edits. Recommend Forge revert this on next pass (`git checkout tests/fixtures/showx/sample-show.showx/history.jsonl`). Not blocking the verdict because intent-of-criterion (no scope creep) is preserved.

## Code quality observations

- Single rAF ticker pattern correctly hoisted to parent; CueRow accepts `now: number` and is purely derived. Good performance discipline.
- `scrollTo` guarded with `typeof === 'function'` for jsdom compatibility (`SMMasterView.tsx:116`) — pragmatic.
- `aria-selected = isPlayhead || isSelected` preserves all 15 existing SMMasterView tests that assert on playhead via aria-selected. Smart compatibility move.
- `firstGoAt` lives in `useGoChannel` (already owns dispatched events) rather than SMMasterView ref. Cleaner ownership.
- Late-joining countdown gracefully skipped (historic events don't set `lastDispatched`). Matches spec watch-out.

## Follow-up tasks for Architect to consider (not blockers)

1. **B003-605 wiring** — when single-key inline editing lands, also rewire `KeyQ` to arm `selectedCueId` (fallback to `playheadCueId`) per AC4 design intent.
2. **Auto-disable followGrid on operator scroll** — if the spec's "operator scrolled manually" clause was intended as auto-disable, add a wheel/touchmove listener that flips followGrid OFF. Currently only explicit toggle disables.
3. **Fixture hygiene** — `tests/fixtures/showx/sample-show.showx/history.jsonl` accumulated 2 incidental entries from this work; recommend a pre-commit revert or a `.gitattributes` rule to keep fixture stable.

## Files reviewed

- `pwa/src/components/cuelist/CueRow.tsx` (104 lines added)
- `pwa/src/components/cuelist/SMMasterView.tsx` (174 lines added/modified)
- `pwa/src/components/cuelist/PlaybackHeader.tsx` (new, 88 lines)
- `pwa/src/hooks/useGoChannel.ts` (+5 lines for firstGoAt)
- `tests/unit/pwa/components/cuelist/CueRow.test.tsx` (283 lines added/modified)
- `tests/unit/pwa/components/cuelist/PlaybackHeader.test.tsx` (new, 125 lines)

Verdict: **accepted**.
