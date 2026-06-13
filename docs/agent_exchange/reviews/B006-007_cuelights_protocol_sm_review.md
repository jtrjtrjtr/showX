---
id: "B006-007"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-13T22:35:00Z"
---

# B006-007 — Cue lights protocol + state + SM standby send

**Verdict: accepted**

## Acceptance criteria verification

### 1. Protocol — `standby.broadcast` topic on shell + PWA sideChannel ✓

- `src/shared/src/types/services.ts:130` — `SideChannelMessage.topic` union extended with `'standby.broadcast' | 'operator.acknowledge'`.
- `src/modules/cuelist-core/src/go/goEventChannel.ts:128-153` — `StandbyRequest`, `StandbyBroadcast`, `OperatorAcknowledge` wire types defined.
- `pwa/src/lib/sideChannel.ts:148-165` — matching `CueLightState`, `StandbyBroadcast`, `OperatorAcknowledge` types on PWA side.
- `pwa/src/lib/sideChannel.ts:193-194` — `SideChannelEventMap` extended; `pwa/src/lib/sideChannel.ts:294-299` — `handleMessage` switch cases emit both.
- `pwa/src/lib/sideChannel.ts:347-359` — `sendStandbyRequest(cuelistId, cueId, departments, standby)` client method.
- SM aggregates per-dept ack state: `pwa/src/components/cuelist/SMMasterView.tsx:461` (`cueLightState`) + `528-540` (operator.acknowledge handler).

### 2. State machine — `cueLights.ts` pure, testable ✓

- `src/modules/cuelist-core/src/cuelights/cueLights.ts:6-78` — `CueLights` class, `Map<cueId, Map<dept, CueLightState>>`, no I/O.
- States `'idle' | 'standby' | 'acknowledged'`; transitions: `setStandby` (idle→standby), `acknowledge` (standby→acknowledged), `clear` (delete entire cue), `clearAll`, `getState`, `isFullyAcknowledged`, `hasActiveStandby`.
- Class is owned by `GoEventChannel` (instantiated at `goEventChannel.ts:217`), mutated in `onStandbyRequest` (`:465-477`) and `onOperatorAcknowledge` (`:479-484`), cleared on GO fire at `:313`.
- `setStandby(on=true)` preserves `acknowledged` (idle→standby only); rationale in done report = ack regression guard. Reasonable, test at `cueLights.test.ts:25-30` verifies.

### 3. SM UI — `CueLightsPanel` in `SMMasterView` ✓

- `pwa/src/components/cuelist/SMMasterView.tsx:99-200` — `CueLightsPanel` component: per-dept chip with colored dot (yellow=standby, green=ack, dim=idle), `STANDBY` + `CLEAR` buttons.
- Renders only when `cueId !== null && departments.length > 0` (`:100`).
- Mounted at `SMMasterView.tsx:1213-1221` — wired to `armedCueId`, `armedCue.department`, `cueLightState`, calls `conn.sideChannel.sendStandbyRequest`.
- Visual glanceable; idle/standby/acknowledged states distinct.
- React-local state in `SMMasterView` (not in `useGoChannel`) — acceptable trade-off given B006-008 will own its own operator side; not blocking.

### 4. Builds on ArmBroadcast pattern ✓

- `onStandbyRequest` (`goEventChannel.ts:465-477`) mirrors `onArmRequest` (`:449-463`) — broadcast envelope, seq, ring buffer push.
- Ring buffer `'standby.broadcast'` added at `:213` + `:227` for resume window.
- `onOperatorAcknowledge` (`:479-484`) follows broadcast-after-state-update pattern — equivalent to `onCueComplete` broadcast at `:447`.

### 5. Unit tests ✓

- `tests/unit/modules/cuelist-core/cuelights/cueLights.test.ts` — 18 tests covering: initial state, setStandby on/off, acknowledge transitions + idle ignore + idempotency, isFullyAcknowledged (false/partial/true/post-clear), clear, clearAll, multi-dept aggregation.
- `tests/unit/modules/cuelist-core/cuelights/goEventChannel.standby.test.ts` — 7 tests covering: standby request → state + broadcast, clear standby, ack transitions + re-broadcast, ack-without-standby ignore, multi-dept partial vs full ack, topic serialization (outer envelope + inner payload).
- Locally re-ran `pnpm vitest run tests/unit/modules/cuelist-core/cuelights` — 25 tests pass in 9ms.

### 6. Builds + typecheck + scope discipline ✓

- `pnpm -r typecheck` clean (verified locally — all 5 packages Done).
- `pnpm --filter showx-pwa build` clean (verified locally — 266 modules, 456 kB bundle).
- Modified files match `target_files`: `services.ts`, `goEventChannel.ts`, `cueLights.ts` (new), `sideChannel.ts`, `SMMasterView.tsx`, `tests/unit/**`. No edits outside scope for this task.

## Minor observations (non-blocking)

- `setStandby(on=false)` unconditionally clears acknowledged → idle (not just standby → idle). Consistent between shell (`cueLights.ts:27-29`) and PWA (`SMMasterView.tsx:517-519`); matches spec semantics ("Clearing standby … resets to idle"). Documented in tests.
- `cueLightState` in `SMMasterView` mirrors shell's `CueLights` via broadcast — two sources of truth, but SM-only render side intentionally drives off the broadcast (decoupled from shell internal state). Forge flagged this explicitly. Fine.
- `OperatorAcknowledge` is re-broadcast to ALL clients (not station-targeted). For B006-008 operator UX, peers will see each other's acks. Done report acknowledges this is intentional.
- Out-of-scope: operator receive+ack UI (B006-008), authority (B006-010). Confirmed not implemented; spec explicitly carves these out.

## Conclusion

All 6 acceptance criteria verified with citations. Implementation is clean, mirrors the established `arm.broadcast` pattern, state machine is pure and well-tested, protocol is symmetric across shell+PWA, builds and typecheck green. Ready for B006-008 (operator ack UI) to land on top.
