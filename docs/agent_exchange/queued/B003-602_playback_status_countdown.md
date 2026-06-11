---
id: "B003-602"
title: "Playback status — live in-row countdown, header elapsed/next, caret≠selection, follow-grid autoscroll"
type: "implementation"
estimated_size_lines: 300
priority: "P0"
bundle: "ShowX-3.6"
depends_on: ["B003-601"]
target_files:
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/PlaybackHeader.tsx"
  - "pwa/src/hooks/useGoChannel.ts"
  - "pwa/src/hooks/usePlayhead.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Fired cue with duration_hint_ms: row shows a live countdown (M:SS.t remaining) + a thin progress bar along the row bottom (teal → fades out at end). Driven by go.dispatched timestamp + duration_hint_ms; pure client-side rAF/interval, no CRDT writes (FORBIDDEN_CRDT_FIELDS — fire state is event-derived, never doc state)."
  - "Eos color semantics: running cue row = red-tinted left edge while counting down (distinct from teal playhead and green firing flash); falls back to nothing when duration_hint is null."
  - "New PlaybackHeader strip under the existing header (disguise section-header pattern): LAST FIRED (label + time since, e.g. 'House up · 0:42 ago') | NEXT (playhead cue label) | show clock elapsed since first GO of session. Compact, ink_secondary, mono font for times."
  - "ONYX caret≠selection: clicking a row SELECTS it (new visual: thin border) WITHOUT moving the playhead. Moving playhead = explicit: keyboard ↑/↓ (existing), double-click... NO — double-click is edit (B003-506). Playhead move = click on the row's left gutter zone (playhead column, 24px) OR new 'Set playhead' in selection context. Selection drives single-key edits (B003-605) and Arm; playhead drives standby panel + GO sequence. Update STANDBY panel logic accordingly (next cues from playhead, unchanged)."
  - "Follow-grid autoscroll toggle in header (⇣ icon button, default ON): when ON, list auto-scrolls to keep playhead row in middle third after every GO/playhead move (Go Button mid-list pattern). When OFF (operator scrolled manually or toggled), a 'Jump to playhead' pill appears when playhead is off-screen."
  - "All client-side state — zero new doc fields, zero awareness fields beyond existing playhead."
  - "`pnpm -r typecheck` clean, tests pass, `pnpm --filter showx-pwa build` succeeds."
  - "No edits outside target_files."
---

## Context

Research: Eos PSD live countdown + disguise elapsed/remaining header are THE 'where am I' affordances operators name first. We have go.dispatched events (timestamps) + duration_hint_ms — countdown is derivable with no engine change. ONYX's caret/selection split unblocks B003-605 single-key editing without fighting the playhead.

## Watch out

- Countdown must survive late-joining stations gracefully: if go.dispatched arrived before this station connected, no countdown (acceptable — document).
- rAF cleanup on unmount; only ONE ticking interval for the whole list, not per row.
- aria-live polite on PlaybackHeader LAST FIRED (screen-reader = also useful for E2E assertions).
- data-testids: `playback-header`, `row-countdown`, `jump-to-playhead`.
