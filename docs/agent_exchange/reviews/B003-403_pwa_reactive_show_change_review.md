---
id: "B003-403"
title: "PWA reactive show-change — refetch session.show_id when shell opens/closes show"
verdict: "accepted"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-08T17:42:00Z"
---

## Verdict

**accepted** — all acceptance criteria met, code quality good, tests pass cleanly, typechecks clean.

## Acceptance criteria verification

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `GET /api/active-show` returns `{ open, show_id, title, mode }`, no auth | ✅ | `src/main/src/shared/pairing/api.ts:145-154`. AssetServer mounts router at `/api` (`AssetServer.ts:37`), so route lands at `/api/active-show`. |
| 2 | Endpoint in `mountPairingRoutes` extension using injected `activeShow` | ✅ | `api.ts:146-147` calls `deps.activeShow?.getActiveShow()` + `getShowId()`. |
| 3 | `StationRouter` polls every 2s, reconnects via Provider key change | ✅ | `StationRouter.tsx:158-178` polls at `2000ms`; line 205 uses `<ConnectionProvider key={effectiveShowId} …>` so React unmounts/remounts on show change. |
| 4 | "Switching to <title>…" overlay, max 2s | ✅ | `StationRouter.tsx:148, 151-155, 190-199` — state cleared by 2s timeout. |
| 5 | `open: false` → "Show closed by stage manager" + Reconnect button | ✅ | `ShowClosedView` at `StationRouter.tsx:18-29`; mounted at line 184-188. Reconnect calls `window.location.reload()` for clean state reset. |
| 6 | SSE `/api/active-show/events` | ⚪ deferred | Spec explicitly marks this optional ("can defer; polling at 2s is fine for MVP"). Acceptable. |
| 7 | API tests: no dep / no show / show open | ✅ | `api.test.ts:252-309` — 3 new tests for `/active-show` endpoint. |
| 8 | ShowStateBridge test for open/close sequence | ✅ | Pre-existing tests at `cuelistCoreShowStateBridge.test.ts:186, 268` cover open/close; Forge only added `show_id` setup needed since ActiveShowDoc now requires it. |
| 9 | PWA test (manual/playwright) | ⚪ deferred to Architect | Per spec: "Architect will live-test post-build". Acceptable. |
| 10 | `pnpm --filter showx-main typecheck` + `showx-pwa typecheck` clean | ✅ | Both verified clean by Critic. |
| 11 | No edits outside listed target_files | ✅ | Only 4 files touched, all in target_files list. `cuelistData.ts` unchanged as Forge noted ConnectOpts shape already sufficient. |

## Tests executed by Critic

```
$ pnpm vitest run tests/unit/shared/pairing/api.test.ts
✓ tests/unit/shared/pairing/api.test.ts  (15 tests) 129ms
Tests: 15 passed (15)
```

Typechecks:
- `pnpm --filter showx-main typecheck` → clean
- `pnpm --filter showx-pwa typecheck` → clean

## Code quality notes

- **`key={effectiveShowId}` trick is correct and clean** — React fully remounts `ConnectionProvider` on show_id change, guaranteeing old WS teardown. Avoids imperative disconnect logic.
- **Polling effect deps `[session, currentShowId]`** — causes interval recreation on every show change. Wasteful but correct (cleared properly via return cleanup). Acceptable for MVP.
- **`closedByShell` re-set every poll while closed** — idempotent setState, no infinite loop. Fine.
- **Error path on fetch swallows error silently** — appropriate for "network blip, retry next tick" semantics in spec.
- **`ShowClosedView` reload reset** — pragmatic; full reload after click ensures no stale state. Matches spec UX intent.

## Spec compliance

- Files touched are exactly `api.ts`, `StationRouter.tsx`, `api.test.ts`, plus minor `show_id` field additions in `cuelistCoreShowStateBridge.test.ts` setup (listed in target_files).
- Endpoint mounting path `/api/active-show` is correct (router mounted at `/api` prefix in AssetServer).
- Response shape matches spec exactly: `{ open: bool, show_id: string|null, title: string|null, mode: 'rehearsal'|'show'|null }`.

## Recommendation to Architect

B003-403 ready for acceptance. ShowX-3.4 station data plane bundle complete (401 + 402 + 403 all accepted). Proceed with v0.1.10 build + live-test verification per spec's "post-bundle Architect verification" section.
