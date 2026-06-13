---
id: "B006-007"
title: "Cue lights — protocol + state + SM standby send"
type: "implementation"
estimated_size_lines: 450
priority: "P0"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "src/shared/src/types/services.ts"
  - "src/modules/cuelist-core/src/go/goEventChannel.ts"
  - "src/modules/cuelist-core/src/cuelights/cueLights.ts"
  - "pwa/src/lib/sideChannel.ts"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Cue light state model + protocol: SM can put a cue (per department) into STANDBY. New side-channel topic `standby.broadcast` (SM→ops: { cue_id, departments[], standby:true|false }) added to services.ts:129-133 topic enum + PWA sideChannel client. SM also receives `operator.acknowledge` (B006-008) and aggregates per-department ack state."
  - "cueLights.ts holds the standby/ack state (per cue, per department: idle | standby | acknowledged) — pure, testable; updated by SM standby actions + inbound acknowledges."
  - "SM UI (SMMasterView): for the current/next cue, SM can send STANDBY to the relevant department(s) (a 'Standby' control), and SEES per-department status: standby-sent (amber) → acknowledged (green) → then GO. Clearing standby / GO resets to idle. Visual is glanceable (the cue-light metaphor)."
  - "Builds on existing ArmBroadcast (goEventChannel.ts:102-107) — extend/reuse rather than parallel-invent; standby is the richer per-department version."
  - "Unit tests: SM standby sets dept state→standby + broadcasts; inbound acknowledge→acknowledged; GO/clear resets; multi-dept aggregation; topic serialization."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §5 + competitive map mezera #2 (software cue lights — ETC CueSystem discontinued, DIY on r/techtheatre). This is a key differentiator. SM-side: send standby + see acknowledgements. Operator-side is B006-008.

## Implementation notes

- Side-channel publish = SyncBroker.publishSideChannel; SM broadcasts standby; operator stations (B006-008) ack back via `operator.acknowledge`.
- Keep state pure in cueLights.ts; SM view renders + acts.
- This is the data/protocol + SM half; the operator ack UI is B006-008.

## Test plan

- SM standby dept LX on cue 5 → state standby, broadcast sent.
- Inbound ack from LX op → state acknowledged.
- GO/clear → idle.

## Out of scope

- Operator receive+ack UI (B006-008). Authority (B006-010).
---
ARCHITECT NOTE: est 450 lines — if Forge approaches timeout, the operator ack half is already split (B006-008); keep this task to protocol+state+SM only.
