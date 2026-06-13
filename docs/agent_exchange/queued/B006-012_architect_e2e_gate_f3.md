---
id: "B006-012"
title: "Architect E2E gate — F3 (batched F1+F2+F3)"
type: "verification"
owner_hint: "architect"
estimated_size_lines: 0
priority: "P0"
bundle: "ShowX-6"
depends_on: ["B006-001","B006-002","B006-003","B006-004","B006-005","B006-006","B006-007","B006-008","B006-009","B006-010","B006-011"]
target_files: []
acceptance_criteria:
  - "Full `pnpm -r typecheck` 0 errors + entire suite green."
  - "v0.5.0 DMG built (B006-001 fix) that BOOTS, installed to /Applications. Signed if cert present (B006-002), else unsigned + noted."
  - "EYES-ON F3 on installed app: device health green/red reacts to a real failed dispatch + recovery; multi-dest backup fires when primary unreachable; pre-show wizard runs + flags a deliberately-broken device; cue lights standby→acknowledge→GO between SM and a 2nd (operator) station; proposal submit in SHOW + SM accept applies; operator authority blocks a non-owner GO."
  - "BATCHED F1+F2 eyes-on on this same build (closes B004-012 + B005-010): every payload type created by hand + OSC/MIDI/DMX/webhook on the wire; pre-wait/disarm/audition/hotkey; master clock + big timecode on all views; timecode trigger fires; MTC in/out; countdown view on a 2nd device; show-time OSC captured."
  - "Functional verification done by Architect via CDP (--remote-debugging-port=9222) + wire listeners (nc -ul, OSC/Art-Net capture). Screenshots saved; reviewed by eye for layout/legibility; full visual/taste sign-off batched to Jindřich."
  - "Evidence in F3 close decision note. Close B004-012, B005-010, B006-012. Tag v0.5.0, push. Surface B006-002 cert status + F4 design proposal (B006-011) to Jindřich."
---

## Context

The batched gate Jindřich asked for ('otestujeme více věcí najednou'). One v0.5.0 DMG covers F1+F2+F3. Architect runs functional eyes-on via CDP + wire capture; Jindřich does final visual sign-off when free. This is the convergence point for all three deferred gates.

## Out of scope

- Code. LTC (ShowX-7).
