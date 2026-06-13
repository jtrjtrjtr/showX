---
id: "B006-007"
title: "Cue lights — protocol + state + SM standby send"
status: "done"
round: 1
forge_completed_at: "2026-06-14T04:45:00Z"
---

## Summary

Implemented the cue lights protocol (SM half): per-cue, per-department standby state machine, new side-channel topics, and SM UI panel.

## Files changed

| File | Change |
|---|---|
| `src/modules/cuelist-core/src/cuelights/cueLights.ts` | **NEW** — pure `CueLights` state machine (idle→standby→acknowledged per dept) |
| `src/shared/src/types/services.ts` | Added `'standby.broadcast' \| 'operator.acknowledge'` to `SideChannelMessage.topic` |
| `src/modules/cuelist-core/src/go/goEventChannel.ts` | Added `StandbyRequest`, `StandbyBroadcast`, `OperatorAcknowledge` wire types; `onStandbyRequest`/`onOperatorAcknowledge` handlers; ring for `standby.broadcast`; `cueLights` field; clears cue lights on GO fire |
| `pwa/src/lib/sideChannel.ts` | Added `CueLightState`, `StandbyBroadcast`, `OperatorAcknowledge` types; added to `SideChannelEventMap`; added `case` handling in `handleMessage`; added `sendStandbyRequest()` method |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Added `CueLightsPanel` component (amber=standby, green=acked, dot indicators + STANDBY/CLEAR buttons); added `cueLightState` state; subscribed to `standby.broadcast` + `operator.acknowledge`; clears on GO |
| `tests/unit/modules/cuelist-core/cuelights/cueLights.test.ts` | **NEW** — 18 unit tests for `CueLights` state machine |
| `tests/unit/modules/cuelist-core/cuelights/goEventChannel.standby.test.ts` | **NEW** — 7 unit tests for GoEventChannel standby/ack protocol + topic serialization |

## Tests run

```
Test Files  152 passed (152)
     Tests  1931 passed (1931)
  Duration  12.31s
```

All 25 new tests pass, no regressions. TypeScript clean (`pnpm -r typecheck` OK). PWA build clean (`pnpm --filter showx-pwa build` OK).

## Acceptance criteria verification

1. ✅ **Protocol**: `standby.broadcast` topic added to `services.ts:130` union + PWA sideChannel. SM sends `standby.request` → GoEventChannel broadcasts `standby.broadcast`. SM also receives `operator.acknowledge` (B006-008 op sends; GoEventChannel re-broadcasts to all so SM sees it).

2. ✅ **State**: `cueLights.ts` holds idle|standby|acknowledged per cue/dept. Pure, no side effects. Updated by `onStandbyRequest` + `onOperatorAcknowledge`. `cueLights.clear(cueId)` called on GO fire.

3. ✅ **SM UI**: `CueLightsPanel` in `SMMasterView.tsx` shows dot+label for each dept of armed cue. Yellow=standby-sent, green=acknowledged, gray=idle. STANDBY button sends to all armed-cue depts. CLEAR button visible when any dept active.

4. ✅ **Builds on ArmBroadcast pattern**: `onStandbyRequest` follows same pattern as `onArmRequest`; ring buffer added for `standby.broadcast`. `OperatorAcknowledge` re-broadcast follows `onCueComplete` broadcast pattern.

5. ✅ **Unit tests**: SM standby sets dept→standby + broadcasts; inbound ack→acknowledged; GO/clear resets; multi-dept aggregation (partial ack doesn't satisfy isFullyAcknowledged); topic serialization verified.

6. ✅ `pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, 1931 tests pass. No edits outside target_files.

## Decisions within scope

- `acknowledged` state is preserved when SM re-sends standby=true (existing acks kept, only `idle` → `standby`). Rationale: prevents ack regression if SM accidentally double-taps STANDBY.
- `operator.acknowledge` is re-broadcast to all (not just SM) so operators can see peer acks in B006-008.
- `cueLightState` is React-local in SMMasterView (not in useGoChannel) since it's SM-only UI state; B006-008 will track its own ack state.
- Ring buffer added for `standby.broadcast` so resume/reconnect SM gets latest standby state.

## Notes for Critic

- `CueLightsPanel` only renders when `armedCueId` is set AND `armedCue.department.length > 0`. Both conditions checked via `cueId` prop.
- The unused import lint: `CueLightState` is used in the `useState` generic. `StandbyBroadcast`/`OperatorAcknowledge` imports were removed — TypeScript infers from the generic `.on()` overload.
- `conn.sideChannel.sendStandbyRequest` is called with `armedCue.department` directly — this is the cue's declared departments, which is the correct semantic (put all departments of this cue on standby).
- Operator ack UI (B006-008) is explicitly out of scope per task spec and ARCHITECT NOTE.
