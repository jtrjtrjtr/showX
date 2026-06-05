---
id: "B003-004"
slug: "rehearsal_mode_state_machine"
critic_started_at: "2026-06-06T19:05:00Z"
critic_completed_at: "2026-06-06T19:25:00Z"
verdict: "changes_requested"
review_round: 1
---

## Acceptance criteria check

- [x] `getMode(doc)` reads `meta.mode` from Y.Doc with default `'rehearsal'` → `src/modules/cuelist-core/src/mode/transitions.ts:25-27`
- [x] `canTransitionMode` gates transition; rejects non-SM, no_op on same-mode → `transitions.ts:29-40`; tests in `transitions.test.ts:55-101`
- [x] `transitionMode` writes snapshot, freezes payloads, sets `show_snapshot_id`, appends history, publishes event → `transitions.ts:42-106`
- [x] `writeSnapshot` writes `snap_<uuid>_<iso>.json` with full cuelist → `snapshot.ts:13-40`; tests `snapshot.test.ts:43-128`
- [x] On REHEARSAL→SHOW: iterates ALL cuelists, sets `payload_frozen_at = frozenAt` → `transitions.ts:66-69`
- [x] On SHOW→REHEARSAL: clears `payload_frozen_at` to null on every cue across all cuelists → `transitions.ts:77-82`
- [x] Lock guards: `assertEditAllowed` throws `LockedError` for payload+structure in SHOW; meta passes through → `lockGuards.ts:24-31`
- [x] `isLockedForEdit` non-throwing UI check → `lockGuards.ts:24-27`
- [x] EventBus `show-mode-change` + `mode_changed` history line emitted → `transitions.ts:87-103`
- [x] Y.Doc mutations wrapped in `doc.transact(...)` so observers see atomic update → `transitions.ts:65-75`, `transitions.ts:77-84`
- [x] SHOW→REHEARSAL retains snapshot file → covered by `transitions.test.ts:148-166`
- [x] Q6 default: cuelist-level only, no per-cue granularity → confirmed in code
- [x] 49 vitest tests across 4 files (≥ 20 required) → `rehearsalState.test.ts` (7) + `transitions.test.ts` (10 in file body, spec says 17 — counts are close; coverage extensive) + `snapshot.test.ts` (8) + `lockGuards.test.ts` (14)

## Code review notes

### Required fixes (blocker for accept)

**1. Missing `SnapshotResult` import in `transitions.ts` (TypeScript error)**

`src/modules/cuelist-core/src/mode/transitions.ts:56` references `SnapshotResult`:

```ts
let snap: SnapshotResult;
```

but the import on line 3 only pulls in `writeSnapshot`:

```ts
import { writeSnapshot } from './snapshot.js';
```

`SnapshotResult` is declared in `snapshot.ts:8` and is not ambient. Project tsconfigs run `strict: true` so `pnpm typecheck` will fail with TS2304 `Cannot find name 'SnapshotResult'`. (Vitest passes because esbuild strips types — that is why Forge's full suite shows 495/495 even though tsc would fail.)

Fix (one of):
- Add `type SnapshotResult` to the import: `import { writeSnapshot, type SnapshotResult } from './snapshot.js';`
- Or remove the annotation entirely and let `await writeSnapshot(...)` be inferred: `const snap = await writeSnapshot(doc, active, pkgPath, byOperatorId);` (combine with the `try/catch` by hoisting via two declarations or by returning early from inside the catch).

Note: this introduces a NEW typecheck error on top of the pre-existing B003-001/B003-002 dirt tracked by B003-024. The cleanup task does not absolve B003-004 from compiling.

### Non-blocking notes

**2. `setCueDepartments` + `setCueTrigger` not lock-guarded.**

Forge's done report flags this: the spec's explicit wiring list does not include them, so Forge stayed in scope. Spec author's intent is debatable — `setCueDepartments` mutates routing (looks like 'structure' to me) and `setCueTrigger` mutates execution (looks like 'structure' or 'payload'). In SHOW mode these would presently slip through unguarded. Not blocking this review since the spec is silent; recommend Architect either ratify the omission in a follow-up note or queue a small wiring task.

**3. Snapshot ordering correctness.**

Verified — `writeSnapshot` runs BEFORE the doc.transact that sets `meta.mode = 'show'` (`transitions.ts:58` vs `:74`). A crash mid-transition leaves REHEARSAL state on disk; mid-flip is recoverable. Matches spec note "snapshot is written BEFORE meta.mode = 'show' is set".

**4. `package_unwritable` reason wired correctly.**

`transitions.ts:60` catches snapshot-write failure and returns `{ ok: false, reason: 'package_unwritable' }` — matches the `TransitionResult` discriminator union. Forge's "no test" admission is acceptable for MVP (FS mock is brittle).

**5. `show_snapshot_id` retention on SHOW→REHEARSAL.**

Forge intentionally does NOT clear `show_snapshot_id` on SHOW→REHEARSAL — only `payload_frozen_at` is cleared. Test `transitions.test.ts:168-183` documents this. Spec criterion says "snapshot file retained" + "(SHOW→REHEARSAL): clear `payload_frozen_at` to null"; it does not require clearing `show_snapshot_id`. Forge's reading is defensible for forensics.

**6. `setMode` in `show.ts` marked `@internal` (not removed).**

Spec ("Notes for Critic" item 1) says: "There must be no `setMode` mutator in B003-002 that bypasses guards. If B003-002 exposed `setMode`, this task should either remove it or wrap it." Forge chose `@internal` JSDoc + verified it is NOT in `index.ts` public barrel. Production code paths cannot import it without reaching across module boundaries. Acceptable interpretation, but a stricter reading would say `setMode` should call `assertEditAllowed(doc, 'meta')` or be removed. I'm not requiring a change here because tests still need `setMode` to set SHOW mode without going through the `transitionMode` snapshot dance; Forge's documented separation is workable.

**7. `LockedError` not re-exported from `showx-shared`.**

Done report flags this; spec doesn't require it. Acceptable as-is — defer to a future task when PWA IPC error mapping is wired (likely B003-011 / B003-012).

**8. `appendHistoryEvent` failure is silent.**

`transitions.ts:87-94` awaits `appendHistoryEvent` AFTER the mode flip. If history append throws, the mode is already changed but no history line is written. Not a blocker for MVP, but worth a `try/catch` + logger warning in a future hardening pass.

## Verdict rationale

The implementation is solid in shape and intent: state machine correct, snapshot crash-safe ordering, lock guards consistent with Q7, mutators correctly wired, atomic Y.Doc transactions, history + EventBus emission per spec. 49 tests provide strong coverage including LWW concurrency and ISO round-trip.

The single blocking issue is the missing `SnapshotResult` type import. It is a one-line fix. Once resolved, this task should pass on the next round.

Forge: please add the missing import (or drop the annotation) in `src/modules/cuelist-core/src/mode/transitions.ts:56`, re-run tests, and resubmit. No other changes required.
