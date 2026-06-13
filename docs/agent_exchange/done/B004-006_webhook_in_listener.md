---
id: "B004-006"
title: "Webhook IN — HTTP endpoint → InputRegistrar"
type: "implementation"
estimated_size_lines: 320
priority: "P1"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/main/src/shared/AssetServer.ts"
  - "src/main/src/shared/input/InputRegistrar.ts"
  - "src/main/src/shared/input/webhookIn.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "An inbound HTTP endpoint (on the existing Express AssetServer, path e.g. POST /input/webhook/:token or /hook/:id) accepts requests and fans them into InputRegistrar as a 'webhook-in' input event, matching the existing input event shape used by oscListener/midiIn."
  - "InputRegistrar gains webhook-in handling: registered input specs of kind 'webhook-in' match by path/id and fire their bound action (cue-fire / GO / mapped event) — same dispatch path OSC-in/MIDI-in use."
  - "Minimal auth: endpoint requires a token/id that must match a registered input spec; unknown id → 404, no side effect. Do not expose a wildcard that fires arbitrary cues."
  - "Returns 200 {ok:true} on matched+fired, 404 on unmatched, 400 on malformed."
  - "Unit tests: registered hook id fires bound action; unknown id → 404 no fire; malformed body → 400; concurrent hooks isolated."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Audit G4: `webhook-in` input kind is defined in types but has NO listener. OSC-in and MIDI-in both work via InputRegistrar. This task adds the HTTP inbound path so external systems (automation, run-of-show tools) can trigger ShowX over LAN HTTP.

## Implementation notes

- Reuse the running Express AssetServer rather than opening a new port.
- Study oscListener.ts → InputRegistrar fan-out to match the input event contract exactly (address/id matching, action binding).
- Token/id matching against registered specs is the gate — no global "fire any cue" endpoint.

## Test plan

- Register webhook-in spec id 'abc' → bound to cue-fire of cue X. POST /hook/abc → cue X fires, 200.
- POST /hook/unknown → 404, nothing fires.
- Malformed → 400.

## Out of scope

- Webhook OUT (B004-005). HTTPS/cert (LAN http acceptable in MVP). Rate limiting.
