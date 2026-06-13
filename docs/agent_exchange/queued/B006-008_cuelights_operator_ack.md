---
id: "B006-008"
title: "Cue lights — operator receive + acknowledge UI"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-6"
depends_on: ["B006-007"]
target_files:
  - "pwa/src/components/cuelist/StandbyPanel.tsx"
  - "pwa/src/components/cuelist/OperatorView.tsx"
  - "pwa/src/components/cuelist/variants/**"
  - "pwa/src/lib/sideChannel.ts"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "Operator stations receive `standby.broadcast` (B006-007) for their owned department(s) and show a PROMINENT standby alert (big, glanceable — the cue-light at the operator position): cue label + 'STANDBY' + a large ACKNOWLEDGE button."
  - "Pressing Acknowledge publishes `operator.acknowledge` ({ cue_id, operator_id, department }) back over the side-channel → SM (B006-007) flips that department to acknowledged. After ack, the operator sees 'READY — waiting for GO'. On GO/clear the panel returns to idle."
  - "StandbyPanel only reacts to standby for the operator's OWNED departments (no noise for other depts). Shown across operator variants (LX/SX/VIDEO/etc.) + generic operator view."
  - "Glanceable at FOH/booth distance: large type, high contrast, dark FOH tokens. Works on iPad/phone."
  - "Unit tests: standby for owned dept → panel shows + Acknowledge; ack publishes correct message; standby for non-owned dept → no panel; GO/clear → idle; multiple sequential standbys."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §5. Operator half of cue lights: the person on lights/sound sees the SM's standby and acknowledges — the digital cue light. Pairs with B006-007 (SM send + aggregation).

## Implementation notes

- Subscribe to standby.broadcast via the PWA side-channel client; filter by owned_departments (from awareness/pairing).
- Publish operator.acknowledge on the same channel.
- Reuse TimecodeDisplay-style large-type approach for glanceability.

## Test plan

- See ACs.

## Out of scope

- SM side + state (B006-007). Protocol topic definitions (B006-007 owns services.ts).
