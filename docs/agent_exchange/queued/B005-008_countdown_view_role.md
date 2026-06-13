---
id: "B005-008"
title: "Countdown-only station view + 'countdown' role"
type: "implementation"
estimated_size_lines: 420
priority: "P1"
bundle: "ShowX-5"
depends_on: ["B005-003"]
target_files:
  - "pwa/src/components/cuelist/CountdownView.tsx"
  - "pwa/src/components/StationRouter.tsx"
  - "pwa/src/components/PairingView.tsx"
  - "pwa/src/lib/types.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "New 'countdown' role added to role enum (pwa/src/lib/types.ts:16: 'sm'|'operator'|'countdown'|'companion'|'observer'). Selectable in PairingView. A countdown station has NO cue authority (cannot GO/edit — read-only by construction)."
  - "CountdownView: full-screen, GIANT digits — show time (TimecodeDisplay reused from B005-003) PLUS a large countdown to the next/standing cue (remaining time, reuse pre-wait/duration countdown logic) + current and next cue labels. Designed for a wall display / Pi kiosk at FOH-to-stage distance. Minimal chrome, dark, high contrast."
  - "StationRouter routes role==='countdown' → CountdownView (seam map StationRouter.tsx:185-202)."
  - "Subscribes to useClock (B005-002) for show time + the playhead/awareness for current/next cue + countdown. No cue-control affordances rendered."
  - "Responsive: looks correct on a 1080p/4K landscape kiosk display (large fixed layout, not a cramped phone layout) but still loads on any browser."
  - "Unit tests: countdown role routes to CountdownView; giant TC + cue labels render from mocked clock/playhead; no GO/edit controls present; next-cue countdown renders."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §7 + Kobbi: hardware countdown module = Raspberry Pi + big display. ShowX stations run in any browser → a Pi in Chromium kiosk pointed at the countdown URL IS the hardware countdown module, near-free. This task builds the view + role; B005-009 documents the Pi setup.

## Implementation notes

- Reuse TimecodeDisplay (B005-003) for the clock; add a dominant countdown-to-next element.
- Authority: countdown role gets no owned_departments and no GO path (verify GoExecutor/authority rejects, but primarily the view simply renders none).
- Optimize for a fixed large display, not touch interaction.

## Test plan

- Pair as countdown → CountdownView; giant TC + 'NEXT: cue 12' + countdown render; no GO button.

## Out of scope

- Pi recipe doc (009). Clock/display internals (001-003).
