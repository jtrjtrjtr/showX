---
id: "B006-004"
title: "Device feedback — confirmed state (OSC reply, best-effort)"
type: "implementation"
estimated_size_lines: 380
priority: "P1"
bundle: "ShowX-6"
depends_on: ["B006-003"]
target_files:
  - "src/main/src/shared/input/oscListener.ts"
  - "src/main/src/shared/InputRegistrar.ts"
  - "src/main/src/runtime/GoExecutor.ts"
  - "src/modules/cuelist-core/src/document/devices.ts"
  - "src/modules/cuelist-core/src/ui/DevicesTable.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Opt-in per-device 'expects_reply' flag (Device model, devices.ts:10-20). For reply-capable gear (Eos/QLab OSC), when a payload is sent to such a device, ShowX listens for the device's reply on a configured OSC-in address and shows CONFIRMED state (vs merely 'last sent') in DevicesTable."
  - "Correlation: a lightweight match of inbound OSC reply → device (by source IP and/or reply address pattern). Full request_id↔reply is NOT required; a reply observed within a window after a send marks the device 'responding' (confirmed)."
  - "Devices WITHOUT reply capability (DMX/sACN/MSC, or expects_reply=false) keep showing 'last sent' state from B006-003 — NO false 'unconfirmed' reds for fire-and-forget protocols. This is explicitly best-effort: document which protocols support confirmation."
  - "Confirmed state visible in DevicesTable (e.g. a distinct 'confirmed' vs 'sent' vs 'error' indicator). Times out back to 'sent/unknown' if replies stop."
  - "Unit tests: send to reply-capable device + inbound reply → confirmed; no reply within window → stays 'sent'; fire-and-forget device never shows unconfirmed-red; correlation by source."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §3 + Companion pattern (button = confirmed device state, not last command). Only reply-capable protocols (Eos/QLab OSC) can truly confirm — so this is best-effort, opt-in, and must NOT punish fire-and-forget devices.

## Implementation notes

- oscListener.ts + InputRegistrar provide inbound OSC. Subscribe + correlate by source IP / reply address.
- Keep it simple: 'responding' = reply seen recently after a send. Don't over-engineer request_id correlation.
- Device.expects_reply default false → no behavior change for existing devices.

## Test plan

- Eos-style device expects_reply=true, send + reply → confirmed.
- DMX device → only sent/error, never 'unconfirmed'.

## Out of scope

- Health basics (B006-003). Non-OSC reply protocols.
