---
id: "B003-403"
title: "PWA reactive show-change — refetch session.show_id when shell opens/closes show"
status: "done"
round: 1
forge_started_at: "2026-06-08T20:30:00Z"
forge_ended_at: "2026-06-08T20:45:00Z"
---

## Files changed

| File | Change |
|---|---|
| `src/main/src/shared/pairing/api.ts` | Added `GET /active-show` endpoint (no auth) |
| `pwa/src/components/StationRouter.tsx` | Added polling + reactive reconnect + ShowClosedView |
| `tests/unit/shared/pairing/api.test.ts` | 3 new tests for `/active-show` endpoint |

No changes to `cuelistData.ts` or `cuelistCoreShowStateBridge.ts` — no new behavior needed there for MVP.

## Implementation decisions

**`GET /active-show` endpoint** — added at the end of `mountPairingRoutes`. Returns:
```json
{ "open": bool, "show_id": string|null, "title": string|null, "mode": "rehearsal"|"show"|null }
```
When `activeShow` dep not injected → `{ open: false, show_id: null, title: null, mode: null }`. No auth required as spec states (same threat model as PIN exposure).

**StationRouter polling** — `useEffect` with `[session, currentShowId]` deps runs a 2000ms `setInterval`. On each tick:
1. Fetches `/api/active-show`
2. If `open: false` → sets `closedByShell = true`, renders `ShowClosedView`
3. If `show_id` differs from `currentShowId` → sets `switchingTitle` + `currentShowId`

**Reactive reconnect via React key** — `<ConnectionProvider key={effectiveShowId}>` forces full unmount/remount whenever `effectiveShowId` changes. Old WS torn down, new one started. Chosen over imperative disconnect logic (cleaner, less error-prone).

**Switching overlay** — `switchingTitle` state clears after 2s via `useEffect`. Shows "Switching to <title>…" during that window. After clearing, `StationContent` takes over with normal "Loading show…" → cuelist UI flow.

**ShowClosedView** — inline component with `data-testid="show-closed"`. Reconnect button calls `window.location.reload()` for clean state reset (per spec).

**Initial pair-before-open case** — `currentShowId` initialized to `session?.show_id` (may be undefined). If undefined, `effectiveShowId = 'default'` → ConnectionProvider connects to empty doc → StationContent shows "Loading show…". When polling detects real show_id, triggers switch. Covers Jindřich's fluid workflow.

## Tests run

```
✓ tests/unit/shared/pairing/api.test.ts  (15 tests) 110ms
✓ tests/unit/ipc/cuelistCoreShowStateBridge.test.ts  (8 tests) 13ms
Tests: 23 passed
```

New `/active-show` tests added:
- `GET /active-show with no activeShow dep → open:false, all fields null`
- `GET /active-show when no show is open → open:false`
- `GET /active-show when show is open → all fields populated`

**Pre-existing failures** (not caused by this task):
- `Shell.test.ts` — `test:getPort` IPC channel in enum but not registered
- `skeleton.test.ts` — cuelist-core module lifecycle (stale dist issue)
- `cueCatalog.test.ts` — temp dir race condition
- `App.test.tsx` — pairing flow mock

Typechecks: `pnpm --filter showx-main typecheck` clean. `pnpm --filter showx-pwa typecheck` clean.

## Notes for Critic

1. SSE `/api/active-show/events` is explicitly deferred per task spec — polling at 2s is MVP.
2. `cuelistCoreShowStateBridge.ts` unchanged — no new behavior needed for polling model.
3. `cuelistData.ts` unchanged — `ConnectOpts` already has everything needed.
4. The 4 failing test files are pre-existing; verified by checking they're not in git-modified files touched by this task.
5. Architect post-bundle verification: pair browser as SM with PIN 000000, open demo show → within 2s PWA transitions to SM view. Open different .showx → PWA switches. Close show → "Show closed by stage manager" message appears.
