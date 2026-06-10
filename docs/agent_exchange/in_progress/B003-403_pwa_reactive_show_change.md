---
id: "B003-403"
title: "PWA reactive show-change — refetch session.show_id when shell opens/closes show"
type: "implementation"
estimated_size_lines: 150
priority: "P0"
bundle: "ShowX-3.4"
depends_on: ["B003-402"]
target_files:
  - "src/main/src/shared/pairing/api.ts"
  - "src/main/src/ipc/cuelistCoreShowStateBridge.ts"
  - "pwa/src/components/StationRouter.tsx"
  - "pwa/src/lib/cuelistData.ts"
  - "tests/unit/shared/pairing/api.test.ts"
  - "tests/unit/ipc/cuelistCoreShowStateBridge.test.ts"
acceptance_criteria:
  - "New GET endpoint `/api/active-show` on asset server (mounted alongside pairing routes). Returns `{ show_id: string | null, title: string | null, mode: 'rehearsal'|'show' | null, open: boolean }`. No auth required (public on LAN — same surface area as pairing PIN exposure)."
  - "Endpoint implemented in api.ts's `mountPairingRoutes` extension (or new `mountActiveShowRoute` co-located with pairing). Uses injected `activeShow.getActiveShow()` + `getShowId()`."
  - "`StationRouter.tsx`: gains a polling effect that GETs `/api/active-show` every 2 seconds while station view is mounted. If returned `show_id` differs from current `session.show_id` (or session.show_id was undefined and server now reports one), trigger reconnection: disconnect current provider/sideChannel, rebuild ConnectOpts with new show_id, mount new ConnectionProvider."
  - "Reconnection UI: while transitioning between shows, show 'Switching to <new title>…' centered (use existing Loading style) for max 2s — if doesn't connect, falls through to existing 10s timedOut UI."
  - "If `/api/active-show` returns `open: false` and current session.show_id is set → show 'Show closed by stage manager' message + Reconnect button. PWA stops trying to sync until reconnect clicked."
  - "Cuelist Core ShowState bridge (B003-304): on `activeShow.onChange('opened' | 'closed')`, also broadcast a server-sent-events-style notification on `/api/active-show/events` (optional, can defer; polling at 2s is fine for MVP)."
  - "API test: GET /api/active-show with no active show → `{ open: false, show_id: null, title: null, mode: null }`. With active show → all fields populated."
  - "ShowStateBridge test: open/close show triggers expected sequence."
  - "PWA test (manual or playwright if available): pair without show open → shows 'Loading'; shell opens demo → within 2s PWA transitions to SM view with 25 cues; shell closes show → PWA shows 'Show closed' + Reconnect."
  - "`pnpm --filter showx-main typecheck` clean. `pnpm --filter showx-pwa typecheck` clean. All tests pass."
  - "No edits outside listed `target_files`."
---

## Context

After B003-401 (broker shares shell's doc) and B003-402 (pairing returns show_id), the static case works: pair when shell has demo show open → PWA gets demo show's cuelist. But Jindřich's workflow is fluid — he opens shell first, pairs later, switches shows mid-session. PWA needs to react to those changes, not stay locked to the show_id seen at pair time.

This task adds the reactive layer: polling endpoint + auto-reconnect on show_id change.

## Architectural decisions

**Why polling vs server-sent events vs Yjs awareness:**
- Yjs awareness is doc-scoped → useless when no doc connected yet (pair-before-open case)
- SSE adds endpoint complexity + browser EventSource API quirks
- HTTP polling at 2s is "dumb but correct" — low load (one client, LAN, ~1KB response), works in all browser/Electron contexts, easy to reason about
- For ShowX-3.5+ can upgrade to SSE/WebSocket push if 2s feels laggy in practice

**Why no auth on `/api/active-show`:** PIN-based pairing already implies that anyone on LAN with PIN can pair fully. Knowing which show is open without a token is strictly less sensitive — same threat model.

**Why "Show closed by stage manager" UX:** when shell closes show, broker detaches doc (B003-401 forces WS close). PWA WS disconnects abruptly. Without explicit UX, station shows generic "connection lost" which is misleading. Explicit message helps operator know SM action caused it.

## Implementation notes

### Server endpoint

```ts
// api.ts — add to mountPairingRoutes
router.get('/active-show', (_req, res) => {
  const meta = deps.activeShow?.getActiveShow();
  const showId = deps.activeShow?.getShowId() ?? null;
  res.json({
    open: !!meta,
    show_id: showId,
    title: meta?.title ?? null,
    mode: meta?.mode ?? null,
  });
});
```

### PWA polling + reconnect

```tsx
function StationRouter({ session }: StationRouterProps) {
  const [currentShowId, setCurrentShowId] = useState(session?.show_id);
  const [closedByShell, setClosedByShell] = useState(false);

  useEffect(() => {
    if (!session) return;
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`http://${session.host}:${session.port}/api/active-show`);
        const { open, show_id } = await r.json();
        if (!open) {
          setClosedByShell(true);
          return;
        }
        if (show_id && show_id !== currentShowId) {
          setCurrentShowId(show_id);
          setClosedByShell(false);
        }
      } catch { /* network blip, retry next tick */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [session, currentShowId]);

  if (!session) return <DiscoveryView ... />;
  if (closedByShell) return <ShowClosedView onRetry={() => { setClosedByShell(false); window.location.reload(); }} />;

  const opts = buildConnectOpts({ ...session, show_id: currentShowId });
  return (
    <ConnectionProvider key={currentShowId} opts={opts}>
      <StationContent session={{ ...session, show_id: currentShowId }} />
    </ConnectionProvider>
  );
}
```

Key trick: `key={currentShowId}` on `ConnectionProvider` forces React to fully unmount/remount when show_id changes — disconnects old WS, creates new connection. Much cleaner than imperative disconnect logic.

### ShowClosedView component

Simple inline:
```tsx
function ShowClosedView({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: 'system-ui' }}>
      <h2>Show closed by stage manager</h2>
      <p>Waiting for a show to be opened in the FOH shell.</p>
      <button onClick={onRetry}>Reconnect</button>
    </div>
  );
}
```

## Done report

Standard format. Verify in done report (Architect will live-test post-build): pair PWA, then open demo show in shell → PWA transitions to SM view within 2s. Open different .showx → PWA switches. Close show → "closed by SM" message.

## Post-bundle Architect verification (NOT Forge's job)

After B003-401/402/403 all accepted by Critic, Architect will:
1. Build v0.1.10 DMG
2. Install + launch via `~/Desktop/ShowX Test.command`
3. Pair browser as SM with PIN 000000
4. Verify Demo Show → 25 cues visible, GO button enabled
5. Edit a cue in PWA → shell Show tab cueCount reflects update
6. Close decision note documenting end-to-end success
