---
id: "B007-007"
title: "Interrupt — take-over / mute (<200ms)"
type: "implementation"
estimated_size_lines: 280
priority: "P0"
bundle: "ShowX-7"
depends_on: ["B007-006"]
target_files:
  - "pwa/src/components/caller/CallerPlayer.tsx"
  - "pwa/src/components/caller/InterruptButton.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "A large, always-reachable TAKE OVER / MUTE control (caller panel + SM view) that immediately (<200ms) stops any caller playback so the showcaller speaks live. Per mail: explicitly required."
  - "Clear state indicator: 'AI caller ACTIVE' vs 'MANUAL (you speak)'. Toggling back to AI resumes for subsequent cues (does not retro-play the interrupted line)."
  - "Interrupt also suppresses upcoming auto-plays while in MANUAL until re-enabled (so the showcaller stays in control). Re-enable is explicit."
  - "Stop is immediate (Web Audio stop/disconnect), not fade — the human voice takes over now."
  - "Unit tests (fake timers/audio): interrupt stops playback fast; state flips to manual; auto-plays suppressed in manual; re-enable resumes; no retro-play."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context
Per decision §6 + mail (interrupt explicitly necessary). The showcaller must be able to instantly cut the AI and speak. Trust feature — without it, no one uses the AI caller live.

## Implementation notes
- Immediate Web Audio stop (not fade).
- Manual mode latches until re-enabled; suppress auto-plays meanwhile.
- Big, unmissable control (FOH ergonomics).

## Test plan
- See ACs.

## Out of scope
- HW interrupt button (later). Device select (008).
