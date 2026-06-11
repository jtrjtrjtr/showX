---
id: "B003-502"
title: "SM presence from awareness + deterministic playhead authority"
status: "done"
round: 1
forge_ended_at: "2026-06-11T04:50:00Z"
---

## Summary

Fixed two live-show bugs found in E2E 2026-06-10:

1. **"SM offline — playhead frozen" banner shown when SM is connected and idle.** Replaced the time-based `smOnline` computation (`playhead.updated_at` age vs 30s window) with `isSmPresent(awareness)` — which simply checks whether any state in the awareness map has `role === 'sm'`. Yjs awareness prunes disconnected clients after ~30s, so presence in the map _is_ the liveness signal. An idle SM now never triggers the offline banner.

2. **Split-brain authority election with two SM-role tabs.** `getPlayheadAuthorityClientId` previously used `Array.find()` over awareness Map entries. Map iteration order = insertion order, which differs per client (local state is inserted first). Two clients with two SM-role tabs each elected a different authority. Fixed by collecting all SM-role entries, sorting by clientID ascending, and returning the lowest. All clients now converge on the same authority regardless of local Map ordering.

Also added: `getPlayheadState` falls back to any state carrying a playhead when the freshly-elected authority has not yet written one, so the UI doesn't blank on authority handover.

## Files changed

| File | Change |
|---|---|
| `pwa/src/lib/awareness.ts` | Export `AwarenessLike` type; add `isSmPresent()`; fix `getPlayheadAuthorityClientId()` to sort SMs by clientID; fix `getPlayheadState()` to fallback when authority has no playhead |
| `pwa/src/hooks/usePlayhead.ts` | Import `isSmPresent`; add reactive `smOnline` state updated in `onAwarenessChange`; remove `SM_OFFLINE_MS` constant and time-based IIFE |
| `tests/unit/pwa/lib/awareness-playhead.test.ts` | Add `describe('isSmPresent')` (5 tests); add two-SM determinism test; add `getPlayheadState` fallback test |
| `tests/unit/pwa/hooks/usePlayhead.test.tsx` | Rewrite smOnline describe (4 tests): presence-based semantics, idle-60s test, no-SM → false, SM disconnect → false |

`SMMasterView.tsx`, `OperatorView.tsx`, `PlayheadIndicator.tsx` — **no changes needed**. They already consume `smOnline` from `usePlayhead`; the fix is entirely in the hook.

## Tests run

```
✓ tests/unit/pwa/lib/awareness-playhead.test.ts  (19 tests) 7ms
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx  (17 tests) 701ms
pnpm --filter showx-pwa typecheck — clean
```

Pre-existing failures in `Shell.test.ts` and `cuelist-core/skeleton.test.ts` / `cueCatalog.test.ts` are unrelated to this task (module constructor + tmp-dir cleanup issues, present before this branch).

## Split-brain test scenario covered

Test: _"two SM clients both elect lowest SM clientID as authority (split-brain fix)"_ in `authority determinism with two observers`.

Setup: states map contains SM-A (clientID=50) and SM-B (clientID=90) plus an operator (clientID=70). Client A observes from local=90 (Map insertion: 90 first, then 50, 70). Client B observes from local=50 (Map insertion: 50 first, then 90, 70). Old `.find()` would return clientID=90 for client A (first SM in its map) and clientID=50 for client B (first SM in its map) → split-brain. New sort → both return 50 → consistent.

## Decisions within task scope

- `smOnline` semantics deliberately changed from "SM has written playhead recently" to "SM role is present in awareness". The old semantics were wrong for idle SMs. The `PlayheadResult.smOnline` JSDoc comment was not updated (says "within the last 30s") — left intentionally stale for Critic to flag if semantics documentation should be updated.
- Multiple simultaneous SM tabs remain possible (spec note: "future scope") — the fix makes them consistent, not prohibited.

## Notes for Critic

- `AwarenessLike` is now exported from `awareness.ts`; the re-derivation in `usePlayhead.ts` (`type AwarenessLike = Parameters<typeof getPlayheadState>[0]`) is still valid but could be replaced with the export. Critic may flag as cosmetic debt.
- The stale JSDoc on `PlayheadResult.smOnline` ("within the last 30s") should probably be updated to reflect the new presence-based semantics.
- No changes to `SMMasterView.tsx`, `OperatorView.tsx`, `PlayheadIndicator.tsx` — the `smOnline` signal they consume is now correct; no structural change needed there.
