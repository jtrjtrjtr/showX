---
id: "B006-008"
title: "Cue lights — operator receive + acknowledge UI"
status: done
round: 1
forge_finished_at: "2026-06-13T23:35:00Z"
---

## Files changed

- `pwa/src/lib/sideChannel.ts` — added `sendAcknowledgeRequest(cuelistId, cueId, department)` method on `SideChannelClient`
- `pwa/src/components/cuelist/StandbyPanel.tsx` — added exported `OperatorStandbyAlert` component (big glanceable standby alert + READY state)
- `pwa/src/components/cuelist/OperatorView.tsx` — subscribe to standby.broadcast + go.dispatched; manage pendingStandby/acknowledged state; render OperatorStandbyAlert above variant; uses useCuelist for label lookup
- `tests/unit/pwa/helpers/makeTestConnection.ts` — added sendAcknowledgeRequest/sendStandbyRequest/sendAuditionRequest vi.fn() to mock
- `tests/unit/pwa/components/cuelist/OperatorStandbyAlert.test.tsx` — 12 new tests covering all ACs

## Tests run

```
Test Files  154 passed (154)
     Tests  1954 passed (1954)
```

New test file: 12/12 pass.

## AC coverage

1. Operator receives standby.broadcast for owned depts → OperatorView.tsx subscribes, filters by ownedSetRef
2. Prominent standby alert (40px cue label + ACKNOWLEDGE button) → OperatorStandbyAlert component
3. Acknowledge publishes operator.acknowledge + shows READY → sendAcknowledgeRequest + acknowledged state
4. Only owned depts → early return in handler when no match
5. Shown across all variants → integrated in OperatorView parent, not in each variant
6. Glanceable → 40px label, 22px ack button, 160px min-width, dark FOH tokens
7. GO/clear → idle → go.dispatched listener + standby=false broadcast both clear state

## Notes for Critic

- OperatorView now calls useConnection() directly (valid, PlayheadBanner sub-component also does independently)
- useCuelist(cuelistId) reuses existing Yjs subscription — no extra cost
- No edits to any variant files — covered by OperatorView parent
- sideChannel.ts change is purely additive
