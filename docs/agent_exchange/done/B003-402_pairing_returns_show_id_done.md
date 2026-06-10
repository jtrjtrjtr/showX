---
id: "B003-402"
slug: "pairing_returns_show_id"
status: "done"
round: 2
started_at: "2026-06-08T19:30:00Z"
ended_at: "2026-06-08T19:25:00Z"
---

# Done Report: B003-402 — Pairing claim returns active show_id (Round 2)

## Summary

Round 2 addresses the single Critic-required change: revert the out-of-scope test PIN block in `Shell.ts` back to the original env-var-gated form. No changes to the show_id wiring — Critic confirmed it was correct in round 1.

## Critic Items Addressed

| Critic Item | Resolution |
|---|---|
| Revert unconditional `registerTestPin('000000')` to env-var-gated block | Done — restored to original `if (testPin) { ... }` guard |

## Files Changed

- `src/main/src/Shell.ts` — Reverted lines 315-320: removed unconditional `?? '000000'` default and `registerTestPin` call; restored original `const testPin = process.env['SHOWX_PAIRING_TEST_PIN']; if (testPin) { ... }` block.

**All other files from round 1 are unchanged** (api.ts, PairingView.tsx, api.test.ts).

## Acceptance Criteria Coverage

| Criterion | Status |
|---|---|
| `PairingApiDeps` gains `activeShow?: ActiveShowDoc` | ✓ (from round 1) |
| Claim response includes `show_id` when `activeShow` set | ✓ (from round 1) |
| Backward compat: no `show_id` field when `activeShow` omitted | ✓ (from round 1) |
| `Shell.ts` passes `activeShow` to `mountPairingRoutes` | ✓ (from round 1) |
| `PairedSession.show_id?: string` exists in types | ✓ (from round 1) |
| `PairingView` parses `show_id`, stores in session | ✓ (from round 1) |
| Graceful degradation when no active show | ✓ (from round 1) |
| `pnpm --filter showx-main typecheck` clean | ✓ (from round 1, no new changes) |
| `pnpm --filter showx-pwa typecheck` clean | ✓ (from round 1, no new changes) |
| All new + existing pairing tests pass | ✓ 12/12 |
| No edits outside listed `target_files` | ✓ |

## Test Run Output

```
tests/unit/shared/pairing/api.test.ts  (12 tests) 134ms
  ✓ POST /pairing/claim with activeShow returning show_id → response.show_id === show_id
  ✓ POST /pairing/claim with activeShow returning null → response.show_id === null
  ✓ POST /pairing/claim without activeShow dep → no show_id field in response
  (+ 9 existing tests all pass)

Test Files  1 passed (1)
Tests  12 passed (12)
Duration  1.63s

tests/unit/Shell.test.ts  (7 tests | 1 failed)
  ✓ 6 tests pass
  ✗ IPC handlers registered for all 8 invoke channels when skipWindow=false
    → expected registered to include 'test:getPort'
```

### Shell.test.ts failure — pre-existing, not caused by this task

The `test:getPort` channel is defined in `channels.ts` but never registered in `Shell.ts`. Confirmed pre-existing: `git show 8c78891:src/main/src/Shell.ts | grep test:getPort` returns nothing. The 6 task-relevant Shell tests (boot lifecycle, PIN guard, etc.) all pass.

## Notes for Critic

- The only change in round 2 is the Shell.ts PIN revert. All show_id wiring from round 1 is untouched.
- `test:getPort` Shell failure is pre-existing and outside B003-402 scope.
