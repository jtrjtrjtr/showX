---
id: "B004-003"
title: "DMX payload type + dispatch to Art-Net/sACN drivers"
type: "implementation"
estimated_size_lines: 420
priority: "P0"
bundle: "ShowX-4"
depends_on: []
target_files:
  - "src/shared/src/types/payload.ts"
  - "src/modules/cuelist-core/src/document/payload.ts"
  - "src/modules/cuelist-core/src/dispatch/payloadDispatch.ts"
  - "src/modules/cuelist-core/src/dispatch/transports/dmx.ts"
  - "src/main/src/shared/dispatcher/dmxOut.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "New payload type `dmx` added to the canonical Payload union (locate via imports from src/shared/src/types/cue.ts — likely src/shared/src/types/payload.ts AND any mirror in src/types/payload.ts; extend the canonical one + keep both in sync if duplicated). Shape: { type:'dmx', tag, note, device_id, universe:number, channels: Array<{channel:number(1-512), value:number(0-255)}> }."
  - "validatePayload covers dmx: universe>=0, channel 1-512, value 0-255, channels non-empty, <=512 entries. Inline ValidationError on violation."
  - "New cuelist-core transport `dmx.ts` resolves device_id → routing → calls the existing main-process dmxOut driver (src/main/src/shared/dispatcher/dmxOut.ts already implements Art-Net via dmxnet + sACN via e131). Wire through the same dispatch bridge OSC/MIDI use (resolveRoutingForPayload → main dispatcher). The driver protocol (artnet vs sacn) + target comes from the device routing config, NOT the payload."
  - "payloadDispatch routes `dmx` payloads to the new transport. End-to-end: GO a cue with a dmx payload → dmxOut.transmit called with correct universe+channels."
  - "If no device/route resolves for the dmx payload → dispatch result { ok:false, error:'no_route' } logged to Dispatch Log (same pattern as other transports), NOT a crash."
  - "Unit tests: validation matrix; transport calls dmxOut with mapped channels; no-route path; multi-channel set."
  - "`pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Audit 2026-06-13 G2: Art-Net (dmxnet) + sACN (e131) drivers are REAL and working in `src/main/src/shared/dispatcher/dmxOut.ts`, but there is NO `dmx` payload type — so a cue cannot send DMX directly (only indirectly via lx_ref to a console). This task adds the payload type + transport so a cue can set DMX channels directly.

## Implementation notes

- Study how an existing payload type flows end-to-end: `src/modules/cuelist-core/src/dispatch/transports/osc.ts` → resolveRoutingForPayload → main dispatcher → `oscClient`. Mirror that exact path for dmx → `dmxOut`.
- The device routing config decides Art-Net vs sACN + target IP/universe-offset. The payload carries the logical universe + channel/value sets. Don't put transport protocol in the payload.
- dmxOut already exposes Art-Net (`dmxnet`) and sACN (`e131`) senders — reuse, do not add libraries.
- Follow the validatePayload + addPayload/updatePayload helper pattern in document/payload.ts.

## Test plan

- Valid dmx payload passes validation; channel 0 / 513 / value 256 / negative / empty channels rejected.
- dispatchOne(dmx) → dmxOut called with {universe, channels}.
- dmx payload with unresolvable device → {ok:false, error:'no_route'}.

## Out of scope

- Editor UI (B004-004). DMX scenes/fades over time (post-MVP). Direct serial.
