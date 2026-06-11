---
id: "B003-502"
title: "SM presence from awareness + deterministic playhead authority"
verdict: "accepted"
round: 1
reviewer: "critic"
reviewed_at: "2026-06-11T04:20:00Z"
---

## Verdict

**accepted** — round 1.

All 8 acceptance criteria met. 36/36 PWA tests pass. Typecheck clean. No edits outside target_files. Implementation matches spec exactly.

## Acceptance criteria verification

1. ✅ **`isSmPresent(awareness): boolean` includes local state.**
   - `pwa/src/lib/awareness.ts:74-79` iterates over `awareness.getStates()` which Yjs includes the local clientID in.
   - Test `tests/unit/pwa/lib/awareness-playhead.test.ts:61-64` (`returns true when the LOCAL state has role=sm (self is SM)`) verifies a station that IS the SM is detected by `isSmPresent`.

2. ✅ **`smOnline` derived from `isSmPresent`, NOT from `playhead.updated_at` age. `SM_OFFLINE_MS` removed.**
   - `pwa/src/hooks/usePlayhead.ts:55` initialises `smOnline` from `isSmPresent(aw)`.
   - `pwa/src/hooks/usePlayhead.ts:98` updates it inside `onAwarenessChange`.
   - Old `const SM_OFFLINE_MS = 30_000` and `const smOnline = (() => { ... age < SM_OFFLINE_MS })()` IIFE are gone (verified via `git diff`).

3. ✅ **A station that IS the SM never sees "SM offline".**
   - Test `tests/unit/pwa/hooks/usePlayhead.test.tsx:466-479` (`smOnline is true when SM is present in awareness (even with no playhead written)`).
   - Test `tests/unit/pwa/hooks/usePlayhead.test.tsx:481-500` (`smOnline is true when SM is present and idle 60s (no time-based logic)`) — explicitly covers the live-show bug pattern: SM connected but idle. The hook returns `smOnline=true`, so `SMMasterView.tsx:262` (`!smOnline && <banner>`) hides the banner.

4. ✅ **`getPlayheadAuthorityClientId` deterministic: lowest SM clientID wins.**
   - `pwa/src/lib/awareness.ts:91-94` filters SMs then sorts by clientID ascending, returns `sms[0][0]`.
   - Fallback (line 97) returns lowest clientID overall.
   - Test `tests/unit/pwa/lib/awareness-playhead.test.ts:193-207` (`two SM clients both elect lowest SM clientID as authority (split-brain fix)`) covers the exact production scenario: two SM tabs (clientID 50, 90) observed from different Map insertion orders, both clients now agree on clientID 50.

5. ✅ **`getPlayheadState` falls back to any state with playhead when authority has none.**
   - `pwa/src/lib/awareness.ts:108-116` — if `state?.playhead` is null on the authority, iterate states and return the first found playhead.
   - Test `tests/unit/pwa/lib/awareness-playhead.test.ts:154-164` (`falls back to any state with playhead when authority has none (freshly-promoted authority)`).

6. ✅ **Required unit tests present.**
   - (a) Two SM clients agree on same authority: `awareness-playhead.test.ts:193-207` ✅
   - (b) `smOnline` true when SM present and idle 60s: `usePlayhead.test.tsx:481-500` ✅
   - (c) `smOnline` false when no role===`sm`: `usePlayhead.test.tsx:502-519` ✅
   - (d) Authority failover when SM disconnects: `awareness-playhead.test.ts:209-222` + `usePlayhead.test.tsx:434-462` (`isAuthority becomes true when SM disconnects and local is lowest clientID`) ✅

7. ✅ **Typecheck clean, all tests pass.**
   - `pnpm --filter showx-pwa typecheck` → exit 0 (verified locally).
   - `pnpm vitest run tests/unit/pwa/lib/awareness-playhead.test.ts tests/unit/pwa/hooks/usePlayhead.test.tsx` → 36/36 pass (19 awareness + 17 usePlayhead) in ~1.4s.

8. ✅ **No edits outside listed target_files.**
   - `git diff --stat HEAD -- pwa/ tests/unit/pwa/` shows only:
     - `pwa/src/hooks/usePlayhead.ts` ✅
     - `pwa/src/lib/awareness.ts` ✅
     - `tests/unit/pwa/hooks/usePlayhead.test.tsx` ✅ (tests/unit/pwa/**)
     - `tests/unit/pwa/lib/awareness-playhead.test.ts` ✅ (tests/unit/pwa/**)
   - `SMMasterView.tsx`, `OperatorView.tsx`, `PlayheadIndicator.tsx` correctly left untouched — they already consume `smOnline` from `usePlayhead()` so the fix propagates without component edits.

## Split-brain test scenario assessment

Forge's stated scenario (done report §"Split-brain test scenario covered") matches the implementation:
- SM-A `clientID=50`, SM-B `clientID=90`, operator `clientID=70`.
- Client A (local=90) and Client B (local=50) build identical state sets but different Map iteration order.
- Old `.find()` returned the first SM in Map order → split-brain.
- New sort → both clients deterministically pick clientID=50.

The test at `tests/unit/pwa/lib/awareness-playhead.test.ts:193-207` is a faithful encoding of the production bug. Confirmed reproducible & fixed.

## Code quality

- `AwarenessLike` correctly promoted to `export` (`pwa/src/lib/awareness.ts:64`).
- JSDoc comments on `isSmPresent`, `getPlayheadAuthorityClientId`, `getPlayheadState` clearly explain the deterministic semantics and the Yjs pruning assumption.
- Reactive `smOnline` state correctly registered in the existing awareness change listener — no extra subscription overhead.

## Minor cosmetic items (NOT blocking, NOT changes_requested)

1. **`PlayheadResult.smOnline` JSDoc is stale.** `pwa/src/hooks/usePlayhead.ts:32` still reads `/** True when playhead was updated within the last 30s */`. New semantics are presence-based, not time-based. Forge explicitly left this for Critic to flag (per done report §Decisions). Architect may queue a one-line doc fix in a follow-up cleanup task; not worth a re-round here.

2. **Redundant `AwarenessLike` derivation in `usePlayhead.ts:38`.** `type AwarenessLike = Parameters<typeof getPlayheadState>[0]` is now redundant with the newly exported `AwarenessLike` from `awareness.ts`. Cosmetic; doesn't affect runtime or types.

Neither item warrants a re-round; both are noted for Architect's cleanup queue.

## Notes for Architect

- B003-502 unblocks B003-503 (`onboarding_session_qr`, depends on 501) and B003-506 (`pwa_cue_editing`, depends on 501 + 502). Both are now eligible for Forge.
- The split-brain fix and idle-SM presence fix together address the two highest-priority live-E2E bugs from 2026-06-10. Recommend live E2E re-test on a paired SM + operator setup to confirm production behavior.
- Suggested follow-up micro-task (one-liner): update `PlayheadResult.smOnline` JSDoc and replace the `Parameters<typeof getPlayheadState>` derivation with the exported `AwarenessLike`. Total scope ~2 lines.
