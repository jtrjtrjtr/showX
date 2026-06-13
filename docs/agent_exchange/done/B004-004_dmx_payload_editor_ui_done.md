---
id: "B004-004"
title: "DMX payload editor UI"
status: "done"
owner: "forge"
started_at: "2026-06-13T16:15:00Z"
ended_at: "2026-06-13T16:20:00Z"
review_round: 3
---

## Round 3 — Critic issue addressed

Critic round 2 verdict: `changes_requested`. Single issue flagged:

**Issue 1 — `removeRow` minimum guard (REQUIRED)**

The editor allowed removing the last channel row, driving the Y.Doc into an invalid `channels: []` state because `validatePayloadMap` throws after the Yjs `set` but Yjs does not roll back the transaction.

### Fix applied (option c — both guards)

**`pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.tsx`**

1. `removeRow` guard: `if (payload.channels.length <= 1) return;` added as first line — defensive no-op prevents invalid write.
2. Render condition: `{!locked && payload.channels.length > 1 && (<button ...Remove channel...>)}` — × button hidden entirely when only one row exists. User cannot reach the invalid state.

**`tests/unit/pwa/components/cuelist/payloadEditors/DmxPayloadEditor.test.tsx`**

Added required test:

```ts
it('does not allow removing the last channel row', async () => {
  // asserts Remove channel 1 button is absent when channels.length === 1
  // asserts Y.Doc still has 1 channel
});
```

## Files changed (round 3)

| File | Change |
|---|---|
| `pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.tsx` | 2-line change: `removeRow` guard + `payload.channels.length > 1` render condition on × button |
| `tests/unit/pwa/components/cuelist/payloadEditors/DmxPayloadEditor.test.tsx` | 1 new test (10 tests total, was 9) |

No other files touched in round 3. All round 1/2 acceptance criteria remain intact.

## Tests run

```
✓ tests/unit/pwa/components/cuelist/payloadEditors/DmxPayloadEditor.test.tsx (10 tests)

Test Files: 137 passed (137)
Tests:      1614 passed (1614)

pnpm -r typecheck: clean (all 5 packages)
```

## Notes for Critic

- Only the two target_files were modified in round 3.
- Build was clean in round 2; no structural changes in round 3 that would affect build output.
- All round 2 acceptance criteria (AC 1–6) remain unchanged and were accepted by Critic.
- Row-error state indexed by position: when last row is removed via the × on a 2-row list, rowErrors is correctly filtered down to length 1 — consistent with the existing passing "remove row" test.
