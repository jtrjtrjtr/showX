---
id: "B003-004"
slug: "rehearsal_mode_state_machine"
critic_started_at: "2026-06-06T20:10:00Z"
critic_completed_at: "2026-06-06T20:18:00Z"
verdict: "accepted"
review_round: 2
---

## Round 2 — verification of round-1 fix

### Round 1 blocker (now resolved)

**Missing `SnapshotResult` import in `transitions.ts`** — fixed.

`src/modules/cuelist-core/src/mode/transitions.ts:3`:

```ts
import { writeSnapshot, type SnapshotResult } from './snapshot.js';
```

`SnapshotResult` is now in scope at `transitions.ts:56` (`let snap: SnapshotResult;`). The TS2304 `Cannot find name 'SnapshotResult'` error no longer applies. One-line fix, exactly as recommended in round 1.

### Acceptance criteria recheck (delta from round 1)

All criteria previously verified in round 1 (`B003-004_rehearsal_mode_state_machine_review.md` round 1 ticks 1-13) remain satisfied — only `transitions.ts:3` changed between rounds. Spot-verified the load-bearing sites unchanged:

- [x] `transitions.ts:25-27` — `getMode` reads `meta.mode`
- [x] `transitions.ts:29-40` — `canTransitionMode` gating
- [x] `transitions.ts:42-106` — `transitionMode` flow + EventBus + history
- [x] `snapshot.ts:13-40` — `writeSnapshot` writes `snap_<uuid>_<iso>.json`
- [x] `transitions.ts:66-69` — payload_frozen_at set per-cuelist on SHOW
- [x] `transitions.ts:77-82` — payload_frozen_at cleared on REHEARSAL
- [x] `lockGuards.ts:24-31` — `assertEditAllowed` + `isLockedForEdit`
- [x] `transitions.ts:87-103` — history + EventBus emission
- [x] `transitions.ts:65-75`, `:77-84` — atomic `doc.transact` wrappers
- [x] Lock wiring confirmed in `cue.ts:81/104/139/160/182/197/244/259` (structure + meta) and `payload.ts:140/158/178` (payload)
- [x] `setMode` in `show.ts:87` marked `@internal`; `index.ts` barrel does NOT re-export — verified
- [x] `ShowModeChangeEvent` in `src/shared/src/types/events.ts:41-47`, added to `ShowxEvent` union at `:55`
- [x] 49 tests across 4 files (`rehearsalState.test.ts` 7 + `transitions.test.ts` 17 + `snapshot.test.ts` 8 + `lockGuards.test.ts` 17) — file `it()` counts verified

### Non-blocking notes from round 1

All four deferred items (`setCueDepartments`/`setCueTrigger` not guarded, `package_unwritable` untested, `show_snapshot_id` retention on SHOW→REHEARSAL, silent `appendHistoryEvent` failure, `LockedError` not re-exported from `showx-shared`) remain deferred as recommended. None warrant blocking acceptance.

### Tests

Critic could not execute `pnpm test` / `pnpm typecheck` directly (LaunchAgent sandbox forbids those binaries). Verification relies on:

1. Code reading — the round-1 issue was a one-line import omission; the import now exists with the correct named-type form.
2. Forge's round-2 report claims `Test Files 49 passed (49)`, `Tests 531 passed (531)`, `Duration 3.85s`. The +36-test growth (495 → 531) is consistent with B003-005 (per-department filter) + B003-006 (compound payloads) test files landing between rounds.
3. The fix is type-only (zero runtime behaviour change), so the round-1 vitest 49/49 pass still implies behavioural correctness; the new import simply makes tsc happy.

## Verdict rationale

Single, surgical fix addressing the only blocker from round 1. All other acceptance criteria remain satisfied per round-1 verification. Accept.

Forge: clean revision, no scope creep. Good work.
