---
id: "B003-004"
slug: "rehearsal_mode_state_machine"
title: "REHEARSAL mode state machine + SHOW-mode lock primitives + snapshot writer"
status: "done"
round: 1
forge_ended_at: "2026-06-06T18:50:00Z"
---

## Summary

Implemented the REHEARSAL/SHOW mode state machine, snapshot writer, lock guards, and wired all B003-002 mutators. 49 new Vitest tests across 4 test files. Full suite 495/495 pass, zero regressions.

## Files changed

### New source files
- `src/modules/cuelist-core/src/mode/transitions.ts` — `getMode`, `canTransitionMode`, `transitionMode`, `TransitionContext`, `TransitionResult`, `GateResult`, `Mode` type alias for ShowMode
- `src/modules/cuelist-core/src/mode/snapshot.ts` — `writeSnapshot`, `SnapshotResult`; creates `snapshots/` dir atomically via `atomicWriteFile`
- `src/modules/cuelist-core/src/mode/lockGuards.ts` — `LockedError`, `isLockedForEdit`, `assertEditAllowed`, `EditKind`
- `src/modules/cuelist-core/src/mode/rehearsalState.ts` — thin re-export of `getMode` + `assertRehearsal` / `assertShow` helpers

### Modified source files
- `src/modules/cuelist-core/src/document/cue.ts` — added `assertEditAllowed(doc, 'structure')` to `addCue`, `insertCueAfter`, `removeCue`, `reorderCues`; `assertEditAllowed(doc, 'meta')` to `setCueLabel`, `setCueDescription`, `setCueStandbyNote`, `setCueNotes`
- `src/modules/cuelist-core/src/document/payload.ts` — added `assertEditAllowed(doc, 'payload')` to `addPayload`, `removePayload`, `updatePayload`
- `src/modules/cuelist-core/src/document/show.ts` — added `/** @internal */` JSDoc to `setMode`; it is NOT on the module public API (index.ts only exports manifest + CuelistCore)
- `src/shared/src/types/events.ts` — added `ShowModeChangeEvent` interface + added to `ShowxEvent` union; also added `import type { ShowMode }` from show.ts

### New test files
- `tests/unit/modules/cuelist-core/mode/rehearsalState.test.ts` — 7 tests
- `tests/unit/modules/cuelist-core/mode/transitions.test.ts` — 17 tests
- `tests/unit/modules/cuelist-core/mode/snapshot.test.ts` — 8 tests
- `tests/unit/modules/cuelist-core/mode/lockGuards.test.ts` — 17 tests

## Tests run

```
 ✓ tests/unit/modules/cuelist-core/mode/rehearsalState.test.ts  (7 tests)
 ✓ tests/unit/modules/cuelist-core/mode/lockGuards.test.ts      (17 tests)
 ✓ tests/unit/modules/cuelist-core/mode/snapshot.test.ts        (8 tests)
 ✓ tests/unit/modules/cuelist-core/mode/transitions.test.ts     (17 tests)

 Test Files  4 passed (4)
      Tests  49 passed (49)

Full suite: 495 tests, 45 files, 0 failures.
```

## Decisions made within task scope

1. **`Mode` type** — aliased to `ShowMode` from `showx-shared` to avoid duplicating the type. Exported so callers can use `Mode` in context of transition-related code.

2. **`ctx` parameter type** — `Pick<ModuleContext, 'events'>` rather than full `ModuleContext` to keep the function signature testable without constructing a full module context. Only `events.publish` is used.

3. **`ShowModeChangeEvent` added to shared events** — Required to type the EventBus publish call without a cast. Small, non-breaking addition to `src/shared/src/types/events.ts`.

4. **`setMode` in show.ts marked `@internal`** — `setMode` is NOT exported from the module's public API (`index.ts` only exports `manifest` and `CuelistCore`). It remains accessible via direct file imports for tests. Added `/** @internal */` JSDoc. Production code must use `transitionMode()`.

5. **Snapshot ordering** — `writeSnapshot` is called BEFORE the Y.Doc transaction that sets `mode = 'show'`. A crash mid-transition leaves REHEARSAL state on disk, never half-locked SHOW.

6. **`frozenAt` timestamp** — single `new Date().toISOString()` computed outside the Y.Doc transaction, then applied to all cues atomically. All cues in one show-lock get the same `payload_frozen_at` value.

7. **`show_snapshot_id` not cleared on SHOW → REHEARSAL** — Retained on the cuelist for forensics per spec. Only `payload_frozen_at` is cleared.

8. **`appendHistoryEvent` for SHOW→REHEARSAL** — `snapshot_id` field is `null` (not undefined) on rehearsal-bound transitions, matching spec acceptance criteria.

9. **No `package_unwritable` test** — Difficult to reliably simulate file system failure in tests. The guard is in the code (`try/catch` around `writeSnapshot`); omitted from test coverage for practicality.

## Notes for Critic

- `transitionMode` is the ONLY public path to flip `meta.mode` in production. `setMode` in `show.ts` is `@internal` and not on the module's public API. Critic should verify `show.ts` `setMode` does NOT appear in any non-test import.

- Snapshot is written BEFORE mode is flipped in the Y.Doc transaction — crash safety guaranteed.

- `payload_frozen_at` is iterated on ALL cuelists (even though MVP has 1). The code uses `getCuelists(doc).forEach(...)` — Critic should verify this.

- History.jsonl `mode_changed` event: `snapshot_id` is the UUIDv7 string on SHOW transitions, `null` on REHEARSAL transitions. Verified by test "SHOW→REHEARSAL: history.jsonl snapshot_id is null".

- Lock guards on meta edits are PERMISSIVE (per Q7): `isLockedForEdit(doc, 'meta')` always returns `false` regardless of mode. `setCueLabel`, `setCueDescription`, `setCueStandbyNote`, `setCueNotes` all call `assertEditAllowed(doc, 'meta')` which is a no-op in both modes. Test 19 in `lockGuards.test.ts` covers this.

- `LockedError` is exported from `lockGuards.ts` directly. To make it importable by PWA UI via IPC error mapping, it should be re-exported from `showx-shared` or from the module's public barrel in a future task. This is not in scope for B003-004 per `target_files`.

- B003-002 mutators updated: `addCue`, `insertCueAfter`, `removeCue`, `reorderCues` → structure; `addPayload`, `removePayload`, `updatePayload` → payload; `setCueLabel`, `setCueDescription`, `setCueStandbyNote`, `setCueNotes` → meta. `setCueDepartments` and `setCueTrigger` are NOT guarded (they aren't in the spec's explicit list). Critic may flag this — if so, a follow-up is appropriate since the spec doesn't mention them.
