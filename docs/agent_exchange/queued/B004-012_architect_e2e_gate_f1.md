---
id: "B004-012"
title: "Architect E2E gate — F1"
type: "verification"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-4"
depends_on: ["B004-001","B004-002","B004-003","B004-004","B004-005","B004-006","B004-007","B004-008","B004-009","B004-010","B004-011"]
target_files: []
acceptance_criteria:
  - "Full `pnpm -r typecheck` 0 errors + entire test suite green."
  - "Production build: `pnpm build` + PWA build + DMG, installed to /Applications."
  - "EYES-ON on the INSTALLED app (test launch: SHOWX_PAIRING_TEST_PIN=000000 /Applications/ShowX.app/Contents/MacOS/ShowX --remote-debugging-port=9222):"
  - "  (a) Create a NEW payload of EVERY type (osc/midi/msc/lx_ref/dmx/webhook/wait/group) by hand in a browser station AND in the shell — all succeed and persist."
  - "  (b) OSC payload → captured on `nc -ul 7000` (or python OSC listener). MIDI → virtual port observed. DMX → Art-Net/sACN packet captured. Webhook → local mock server receives request."
  - "  (c) Pre-wait: cue pre_wait_ms=2000 → row shows armed-waiting + 2s countdown → then dispatch."
  - "  (d) Disarm: disarmed cue skipped on GO, chain advances, [DISARMED] in Dispatch Log."
  - "  (e) Audition GO on a cue → [AUDITION] entries in Dispatch Log, ZERO real output (verify listeners silent), playhead unchanged."
  - "  (f) Hotkey trigger: bind a cue to a key, press → fires."
  - "Screenshots reviewed BY EYE for layout/legibility regressions (per 3.6 lesson — testids don't catch layout)."
  - "Evidence (captures, screenshots, logs) recorded in the F1 close decision note. Bundle cannot close without this task."
---

## Context

Binding E2E gate (WORKFLOW.md §E2E gate). F1 specifically must prove the 'papírově je ale není' gaps are now REAL — hence hands-on creation of every payload type + on-the-wire capture of every transport. This is Architect-owned (not Forge); Architect performs it, records evidence, then closes the bundle.

## Out of scope

- Code (this is verification). Any bug found → spawn a fix task or route to B004-011 flex slot.
