---
id: "B005-003"
title: "Big timecode display component (all views)"
type: "implementation"
estimated_size_lines: 360
priority: "P0"
bundle: "ShowX-5"
depends_on: ["B005-002"]
target_files:
  - "pwa/src/components/cuelist/TimecodeDisplay.tsx"
  - "pwa/src/components/cuelist/PlaybackHeader.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/OperatorView.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "New TimecodeDisplay component: LARGE mono tabular-nums digits (>=48px, tokens.font.mono, font-variant-numeric: tabular-nums for no jitter). Shows show time HH:MM:SS:FF from useClock + a source indicator (INT / MTC / LTC) + lock/running state (e.g. green when locked/running, dim when stopped/no-lock). MX4D-style prominence per Jindřich (today TC is 'tiny somewhere')."
  - "Rendered prominently in PlaybackHeader (SM view) AND added to OperatorView (which currently has no header per seam map OperatorView.tsx) — timecode must be visible on ALL operator stations (Kobbi requirement)."
  - "Uses useClock() (B005-002); does NOT add its own clock source. Smooth (rAF-driven via the hook). No layout jitter as digits change (tabular-nums + fixed width)."
  - "Dark FOH tokens; legible at FOH distance. Degrades cleanly when clock stopped/absent (shows --:--:--:-- or 00:00:00:00 dim)."
  - "Unit tests: renders formatted TC from a mocked useClock; source indicator reflects source; running vs stopped styling; tabular layout stable."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §6 + Kobbi mail + MX4D screenshot (big LTC-TIMECODE + SYSTEM TIME blocks). Timecode/show-time must be a first-class, large, always-visible element on every station — the single most-requested missing visual.

## Implementation notes

- PlaybackHeader currently renders elapsed/remaining at 18px (seam map PlaybackHeader.tsx). Add TimecodeDisplay as the prominent element; keep elapsed/remaining secondary.
- OperatorView has no header — add a compact header region hosting TimecodeDisplay so operators also see show time.
- tabular-nums + monospace is essential to stop digit-width jitter.

## Test plan

- Mock useClock → '01:23:45:12' renders large; source 'MTC' shows MTC badge; stopped → dim.

## Out of scope

- Clock/broadcast (001/002). Countdown-only view (008).
