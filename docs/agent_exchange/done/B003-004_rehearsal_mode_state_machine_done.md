---
id: "B003-004"
slug: "rehearsal_mode_state_machine"
title: "REHEARSAL mode state machine + SHOW-mode lock primitives + snapshot writer"
status: "done"
round: 2
forge_ended_at: "2026-06-06T19:35:00Z"
---

## Summary (Round 2 — revision)

Addressed the single blocking issue from Critic round 1: missing `SnapshotResult` type import in `transitions.ts`.

### Critic item addressed

**Required fix — SnapshotResult import (TS2304)**

Added `type SnapshotResult` to the import from `./snapshot.js` on line 3:

```ts
import { writeSnapshot, type SnapshotResult } from './snapshot.js';
```

This resolves the TS2304 `Cannot find name 'SnapshotResult'` error that `pnpm typecheck` (tsc strict mode) would have emitted. All other acceptance criteria from round 1 were already satisfied.

No other changes made. All non-blocking notes from the Critic review are acknowledged and deferred as recommended.

## Files changed

### Modified source files
- `src/modules/cuelist-core/src/mode/transitions.ts` — added `type SnapshotResult` to snapshot import (line 3)

All other files from round 1 are unchanged:
- `src/modules/cuelist-core/src/mode/snapshot.ts`
- `src/modules/cuelist-core/src/mode/lockGuards.ts`
- `src/modules/cuelist-core/src/mode/rehearsalState.ts`
- `src/modules/cuelist-core/src/document/cue.ts`
- `src/modules/cuelist-core/src/document/payload.ts`
- `src/modules/cuelist-core/src/document/show.ts`
- `src/shared/src/types/events.ts`
- All 4 test files

## Tests run

```
 ✓ tests/unit/modules/cuelist-core/mode/rehearsalState.test.ts  (7 tests)
 ✓ tests/unit/modules/cuelist-core/mode/lockGuards.test.ts      (17 tests)
 ✓ tests/unit/modules/cuelist-core/mode/snapshot.test.ts        (8 tests)
 ✓ tests/unit/modules/cuelist-core/mode/transitions.test.ts     (17 tests)

 Test Files  49 passed (49)
      Tests  531 passed (531)
   Start at  15:00:48
   Duration  3.85s

Full suite: 531 tests, 49 files, 0 failures.
```

(Suite grew from 495 to 531 due to B003-005 and B003-006 tests landing between rounds.)

## Notes for Critic

- Single change: one-line import fix resolving the TS2304 error flagged in round 1.
- All round-1 non-blocking notes remain deferred as recommended by Critic: `setCueDepartments`/`setCueTrigger` guard omission, `LockedError` re-export, silent `appendHistoryEvent` failure.
- No scope expansion.
