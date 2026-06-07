---
id: "B003-202"
critic_started_at: "2026-06-07T17:13:00Z"
critic_completed_at: "2026-06-07T17:20:00Z"
verdict: "accepted"
review_round: 1
reviewer: "critic-runner"
---

## Acceptance criteria check

All 11 criteria verified against the delivered code (committed across f0b2959 + e87a8ac).

- [x] **AC #1** `App.tsx` show mode renders `<StationRouter session={session} />` instead of `<PlaceholderShowView />` — `pwa/src/App.tsx:5` imports, `pwa/src/App.tsx:56` renders `<StationRouter session={session} />`.
- [x] **AC #2** `StationRouter` opens y-websocket via session token, wraps children in `<ConnectionProvider>` — `pwa/src/components/StationRouter.tsx:11-27` builds `ConnectOpts` (wsUrl + token + side-channel URL), `StationRouter.tsx:132-135` wraps `<StationContent>` in `<ConnectionProvider opts={opts}>`.
- [x] **AC #3** Role-based routing — `StationRouter.tsx:101-103` (`sm` → `<SMMasterView cuelistId={cuelistId} />`), `StationRouter.tsx:105-113` (`operator` → `<OperatorView cuelistId / owned / watched />`), `StationRouter.tsx:115-116` (companion/observer → `<GenericOperatorView>` read-only fallback). `role ?? 'operator'` default at line 99 covers undefined.
- [x] **AC #4** First cuelist resolved from `doc.getMap('cuelists').keys().next()` — `StationRouter.tsx:64-80` `useEffect` reads `cuelists.keys().next().value` on every doc `update` until cuelistId is set.
- [x] **AC #5** Shell window via `?mode=shell` → ShellRouter path (separate from station) — `App.tsx:9-14` `modeFromUrl()` returns `'shell'`, `App.tsx:53` renders `<ShellRouter />`. Station path untouched.
- [x] **AC #6** No session → DiscoveryView fallback — `StationRouter.tsx:125-128` (`if (!session) return <DiscoveryView ... />`). App-level also falls back to `<DiscoveryView>` at `App.tsx:54,57`.
- [x] **AC #7** Connection timeout 10 s + retry UI — `StationRouter.tsx:41-61` sets a 10s timer; listens for provider `status: 'connected'` to clear it. `StationRouter.tsx:82-89` renders retry button (`window.location.reload()`) on `timedOut`.
- [x] **AC #8** `SMMasterView` props match B003-013 contract — receives `{ cuelistId }` (single prop); component pulls `doc`/`awareness` via `useConnection()` (`SMMasterView.tsx:9`). Matches spec.
- [x] **AC #9** `OperatorView` props match B003-014 contract — receives `{ cuelistId, owned, watched }` (`OperatorView.tsx:13-17`); spec said `session` but the implemented component shape is `cuelistId + owned + watched`. Rescue done report flags this as derived from session; functionally consistent (station_id + role implicit in operator routing).
- [x] **AC #10** Tests: `tests/unit/pwa/StationRouter.test.tsx` exists with 7 tests covering null session → DiscoveryView, sm → SMMasterView, operator → OperatorView, default-to-operator, companion → GenericOperatorView, observer → GenericOperatorView, empty doc → station-loading. Verified 7/7 pass.
- [x] **AC #11** PWA suite — StationRouter.test.tsx 7/7 ✓, ShellRouter.test.tsx 6/6 ✓, PWA typecheck (`pnpm --filter showx-pwa typecheck`) clean, lint clean for new files.

## Code review notes

**StationRouter.tsx structure (137 LOC, clean):**
- Separation of concerns: outer `StationRouter` owns `ConnectionProvider` mounting; inner `StationContent` consumes via `useConnection()`. This is the idiomatic React pattern for context-bound rendering.
- `buildConnectOpts` (`StationRouter.tsx:11-27`) normalises session fields with sensible fallbacks (`show_id ?? 'default'`, `operator_id ?? device_id`, `presence_color ?? '#6b7280'`). Defensible for backward-compat with sessions missing fields.
- Connection timeout uses `let connected = false` closure flag instead of state to avoid effect re-runs — correct pattern.
- First-cuelist resolution uses `doc.on('update', update)` then `cuelists.keys().next().value` — exploits Y.Map insertion order (deterministic). Matches spec guidance.
- Role narrowing: `role === 'sm' ? 'sm' : 'operator'` at `StationRouter.tsx:22` for connection opts (StationAwareness only knows sm/operator); UI routing at `StationRouter.tsx:99-117` handles all 4 roles. Two-tier abstraction is fine.

**App.tsx wiring (8 LOC delta):**
- Replaces `<PlaceholderShowView session={session} />` with `<StationRouter session={session} />` at `App.tsx:56`. Clean swap, no logic change.

**Test coverage (StationRouter.test.tsx):**
- Mocks ConnectionProvider with a synchronous context provider returning a pre-built `mockConn` — bypasses async `connectToShow` cleanly.
- Pre-populates `mockDoc.getMap('cuelists').set('cuelist-1', new Y.Map())` so cuelistId resolves immediately. Sensible.
- The "empty doc → station-loading" test (lines 157-178) uses `mockDoc.getMap('cuelists').delete('cuelist-1')` then restores. A little hacky but correct.

## Verdict rationale

The delivered code covers all 11 acceptance criteria with verifiable file:line citations. The `<StationRouter>` component is well-factored (outer ConnectionProvider, inner content consumer), role routing handles all four roles (sm, operator, companion, observer + undefined fallback), connection-timeout + retry UI is wired, and the new test file passes 7/7 covering every role variant plus null-session and empty-doc states. PWA typecheck is clean and ShellRouter tests remain green.

The Architect rescue framing (Forge cycle 1+2 both timeout, Architect writes done report on Forge's behalf) is justified — the StationRouter.tsx + StationRouter.test.tsx + App.tsx changes are in the tree (committed in f0b2959 during the in-flight cycle, picked up by the rescue commit's done report).

## Non-blocking observations

1. **Unstaged working-dir change to `tests/unit/pwa/App.test.tsx`** — currently reverts the committed `act()` wrapper that makes `"switches to show mode after successful pairing"` pass. This causes the test to time out when run today. The unstaged change is NOT part of the B003-202 delivery commit `e87a8ac` — it appears to be intermediate Forge cycle 3 output or accidental edit. Architect should investigate and either restore the committed version or commit a proper fix. Out of scope for this verdict.
2. **Connection retry UX** is `window.location.reload()` per spec ("non-blocking — better UI later"). Carries forward as backlog.
3. **OperatorView prop signature** (`cuelistId + owned + watched`) differs slightly from spec language (`session`) but matches what B003-014 actually built. The StationRouter unpacks session into the correct shape. Acceptable.
4. **Companion / observer fallback** uses `GenericOperatorView` with empty owned/watched arrays. Per spec, this is fine for 0.1 (note in done report flags out-of-scope full read-only UI).

## Tests run

```bash
pnpm vitest run tests/unit/pwa/StationRouter.test.tsx
  ✓ 7 tests passed

pnpm vitest run tests/unit/pwa/ShellRouter.test.tsx tests/unit/pwa/App.test.tsx
  ShellRouter: 6/6 ✓
  App: 3/4 ✓ (1 timeout from unstaged working-dir regression, not from committed B003-202 code)

pnpm --filter showx-pwa typecheck
  ✓ clean

pnpm lint
  0 errors, 2 pre-existing warnings (cuelist-core export — unrelated)
```

## Verdict

**`accepted` round 1.**

B003-202 delivery is complete, well-tested, and integrates cleanly with B003-201 shell wiring. Station mode now routes paired iPads/laptops through to the real SMMasterView / OperatorView / GenericOperatorView components with proper Yjs connection lifecycle.
