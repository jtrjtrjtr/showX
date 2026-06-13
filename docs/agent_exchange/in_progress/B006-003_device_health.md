---
id: "B006-003"
title: "Per-device connection health (green/red)"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "src/main/src/shared/OutputDispatcher.ts"
  - "src/main/src/shared/HealthBus.ts"
  - "src/shared/src/types/events.ts"
  - "src/modules/cuelist-core/src/ui/DevicesTable.tsx"
  - "src/modules/cuelist-core/src/ui/RoutingTable.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Per-device health derived from dispatch outcomes: OutputDispatcher.send() (OutputDispatcher.ts:120-151) reports per-device health to HealthBus using slug `device:${device_id}` — ok→healthy, fail→error, stale (no send in TTL)→unknown. Emit a 'device-status' event (extend events.ts ~:87) carrying device_id + status + last_ok_at + last_error."
  - "DevicesTable green/red dot wired (replace the TODO at DevicesTable.tsx:31) — each device row shows healthy(green)/error(red)/unknown(grey) from the device-status stream over IPC. RoutingTable device labels (RoutingTable.tsx:113) show the same indicator."
  - "Health is also queryable for the pre-show wizard (B006-006) + cue-light/station views — expose a getDeviceHealth() snapshot map."
  - "No false reds: a device that has simply not been used yet = 'unknown' (grey), not error. Only an actual failed dispatch → red. Recovery: a subsequent ok → green."
  - "Unit tests: ok dispatch→healthy; failed→error; unused→unknown; recovery; slug mapping; event shape; DevicesTable/RoutingTable render correct dot from status."
  - "`pnpm --filter showx-pwa build` clean (if PWA touched), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §2 + competitive map P1 (Companion 'trust device state'). Today there's no per-device health; DevicesTable has a StatusDot placeholder + TODO. Wire real per-device health from dispatch outcomes.

## Implementation notes

- HealthBus.report(slug,status,detail) exists (HealthBus.ts:25). Use slug `device:${device_id}`.
- DispatchResult {ok,error} already returned per send (transport.ts:73). Map to health.
- TTL for staleness — a device with no recent send → unknown, not error.

## Test plan

- Dispatch to deviceA ok → device:A healthy → green dot.
- Dispatch fail → red. Never-used device → grey.

## Out of scope

- Reply-based confirmed state (B006-004). Health wizard (B006-006).
