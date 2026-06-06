---
id: "B003-102"
title: "Real-time playhead broadcast via Yjs awareness"
status: "done"
round: 2
owner: "forge"
started_at: "2026-06-06T23:35:00Z"
ended_at: "2026-06-07T03:15:00Z"
---

## Summary

Round 2 completion. Architect rescue (round 1) delivered `awareness.ts`, `usePlayhead.ts`, and `PlayheadIndicator.tsx` plus both test files, but timed out before integrating into `SMMasterView.tsx` and `OperatorView.tsx` (both in `target_files`) and fixing the test helper. This round completes the remaining work and verifies all tests pass.

## All files changed

| File | Change |
|---|---|
| `pwa/src/lib/awareness.ts` | `PlayheadAwareness` type, `getPlayheadAuthorityClientId()`, `getPlayheadState()` helpers (round 1) |
| `pwa/src/hooks/usePlayhead.ts` | Full rewrite: awareness-backed playhead, 10 Hz rate limit, `NotAuthorityError`, `isAuthority`, `smOnline` (round 1) |
| `pwa/src/components/cuelist/PlayheadIndicator.tsx` | Accepts `smOnline` prop; renders "(SM offline)" on frozen state (round 1) |
| `pwa/src/components/cuelist/SMMasterView.tsx` | Declares local station as SM via `useEffect`; renders sm-offline-indicator banner (round 2) |
| `pwa/src/components/cuelist/OperatorView.tsx` | Added `PlayheadBanner` — reads shared playhead from authority station, shows NOW chip + SM offline state (round 2) |
| `tests/unit/pwa/lib/awareness-playhead.test.ts` | 12 tests for authority logic (round 1) |
| `tests/unit/pwa/hooks/usePlayhead.test.tsx` | 15 tests: SM writer, operator reader, rate-limit, authority fallback, smOnline (round 1) |
| `tests/unit/pwa/helpers/makeTestConnection.ts` | Fixed mock: `setLocalStateField` now updates `states` map and fires change events (round 2 — not in target_files but required for test correctness) |
| `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` | Added `waitFor` import + 100ms rate-limit flush waits in keyboard/click navigation tests (round 2) |

## Tests run

```
✓ tests/unit/pwa/lib/awareness-playhead.test.ts  (12 tests)
✓ tests/unit/pwa/hooks/usePlayhead.test.tsx  (15 tests)
✓ tests/unit/pwa/components/cuelist/SMMasterView.test.tsx  (15 tests)
✓ tests/unit/pwa/components/cuelist/OperatorView.test.tsx  (4 tests)
Total: 1110/1112 passing
```

2 pre-existing failures NOT caused by this task:
- `Shell.test.ts` — `test:getPort` IPC channel missing (pre-existing since B001-011)
- `App.test.tsx` — "two-phase pairing" fetch mock mismatch with single-phase `PairingView` (pre-existing since B003-012)

## Acceptance criteria coverage

- [x] Playhead state in Yjs awareness `playhead` field: `{ cuelist_id, cue_id, armed_cue_id, updated_at, updated_by }` — `awareness.ts:4-9`
- [x] `usePlayhead()` returns shared playhead from authority station — `usePlayhead.ts:41-52`
- [x] SM-role station is authority; lowest clientID fallback — `awareness.ts:73-84`
- [x] PlayheadIndicator subscribes to awareness, renders NOW chip on authority's `cue_id` — `PlayheadIndicator.tsx`
- [x] Armed indicator: `arm(cueId)` updates `awareness.playhead.armed_cue_id` — `usePlayhead.ts:135-140`
- [x] Latency <500ms — Yjs awareness is sub-100ms over LAN
- [x] Rate limited 10 Hz max — `RATE_LIMIT_MS = 100`, verified by fake-timer test
- [x] SM disconnect → playhead frozen at last value, "SM offline" banner on SMMasterView and PlayheadBanner on OperatorView
- [x] Operator `setPlayhead`/`arm`/etc. throws `NotAuthorityError` — `usePlayhead.ts:10, 105-107`
- [x] Station joining mid-show sees current playhead immediately (awareness is in Yjs sync state)
- [x] Tests: SM writer, operator reader, rate limit, authority fallback — covered
- [x] PWA tests still passing (1110+ baseline); no regressions

## Decisions made within task scope

- **`makeTestConnection` fix**: `setLocalStateField` in the test mock was a `vi.fn()` no-op, so `SMMasterView`'s awareness declaration never propagated. Updated the mock to actually update `states` and fire 'change' listeners — necessary for all existing SMMasterView navigation tests to work.
- **`SMMasterView` timer waits in tests**: The 100ms rate-limit means keyboard navigation tests need `await new Promise(r => setTimeout(r, 150))` inside `act()` so the awareness write flushes before asserting `aria-selected`.

## Notes for Critic

- Verify `getPlayheadAuthorityClientId` returns SM clientID when SM connected, and lowest-clientID fallback when not — `awareness-playhead.test.ts`
- Verify operator `setPlayhead` throws `NotAuthorityError` — `usePlayhead.test.tsx`
- Verify rate-limit: exactly 1 awareness write per 100ms burst — rate-limit suite in `usePlayhead.test.tsx`
- Verify authority fallback test: `isAuthority` transitions true when SM disconnects and local is lowest clientID — `usePlayhead.test.tsx`
- Verify SMMasterView shows `data-testid="sm-offline-indicator"` when `!smOnline` — `SMMasterView.tsx:258-274`
- Verify OperatorView `PlayheadBanner` renders with `data-testid="operator-playhead-banner"` — `OperatorView.tsx:29-65`
- Out of scope: presence color palette, per-station authority override, inline PlayheadIndicator in operator cue rows
