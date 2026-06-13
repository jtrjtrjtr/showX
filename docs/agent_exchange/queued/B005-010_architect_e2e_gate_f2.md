---
id: "B005-010"
title: "Architect E2E gate — F2 (batched with F1)"
type: "verification"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-5"
depends_on: ["B005-001","B005-002","B005-003","B005-004","B005-005","B005-006","B005-007","B005-008","B005-009"]
target_files: []
acceptance_criteria:
  - "Full `pnpm -r typecheck` 0 errors + entire suite green."
  - "Production build + DMG (v0.4.0) installed to /Applications — single build covering F1 + F2 (batched test per Jindřich)."
  - "EYES-ON on installed app:"
  - "  (a) Master clock runs; LARGE timecode HH:MM:SS:FF visible on shell + SM + operator + countdown views (Kobbi 'all stations')."
  - "  (b) Timecode trigger: arm a cue at a TC, run clock → cue fires when crossed; stopped clock doesn't fire; backward locate doesn't retro-fire."
  - "  (c) MTC OUT: another app / MTC-capable device locks to ShowX's MTC."
  - "  (d) MTC IN chase: feed external MTC → ShowX clock follows, locked indicator true; signal loss → holds + lock lost."
  - "  (e) Show-time OSC captured on `nc -ul <port>`."
  - "  (f) Countdown view on a SECOND device (browser kiosk) shows giant digits + next-cue countdown."
  - "ALSO run the F1 eyes-on checklist on this same build (B004-012 batched here): create every payload type by hand; OSC/MIDI/DMX/webhook on wire; pre-wait; disarm; audition; hotkey."
  - "Screenshots reviewed BY EYE (layout/legibility, 3.6 lesson)."
  - "Evidence in F2 close decision note; close BOTH B004-012 and B005-010. Tag v0.4.0, push."
---

## Context

Binding E2E gate. Per Jindřich 2026-06-13 ('otestujeme více věcí najednou'), F1 + F2 are verified together on one v0.4.0 DMG. Architect-owned. Closes both the deferred F1 gate (B004-012) and the F2 gate.

## Out of scope

- Code. LTC (deferred to a later bundle).
