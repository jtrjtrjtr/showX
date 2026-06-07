---
id: "B003-202"
title: "Station mode wiring — mount SMMasterView / OperatorView per role + Yjs connection"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: []
target_files:
  - "pwa/src/App.tsx"
  - "pwa/src/components/StationRouter.tsx"
  - "pwa/src/components/cuelist/CuelistShellPanel.tsx"
  - "pwa/src/lib/ConnectionProvider.tsx"
  - "pwa/src/lib/auth.ts"
  - "tests/unit/pwa/StationRouter.test.tsx"
acceptance_criteria:
  - "`pwa/src/App.tsx` `show` mode renders new `<StationRouter session={session} />` component instead of `<PlaceholderShowView />`"
  - "`StationRouter` opens a Yjs y-websocket connection to the paired host using the session token. Wraps children in `<ConnectionProvider>` (already exists from B003-012) providing { doc, sideChannel, awareness } context"
  - "Inside ConnectionProvider, render based on session role:\n  - `role === 'sm'` → `<SMMasterView cuelistId={...} />`\n  - `role === 'operator'` → `<OperatorView session={session} />` (component already routes to dept-specific variant per B003-014)\n  - `role === 'companion' | 'observer'` → minimal read-only view (out of scope for 0.1 — render fallback Generic with note)"
  - "On Yjs document load, render the first cuelist (cuelist_id from doc.getMap('cuelists').keys().next().value). Multi-cuelist switcher deferred."
  - "Shell window (Electron BrowserWindow) also loads the same PWA URL but with `?mode=shell` query param → goes through `ShellRouter` (B003-201). Separate from station path."
  - "When user lands on station mode but no session exists in localStorage (i.e. first-time pair), fall through to existing `DiscoveryView` → `PairingView` flow"
  - "Connection error handling: if y-websocket can't connect within 10s, show retry UI; reconnect button triggers `connectToShow` again"
  - "`SMMasterView` props: `cuelistId` + (inside via ConnectionProvider context) doc + awareness. Props match what B003-013 acceptance criteria defined"
  - "`OperatorView` props: `session` (so it knows its station_id + departments) + (via context) doc + awareness. Matches B003-014"
  - "Tests: StationRouter renders SMMasterView when session.role==='sm'; OperatorView when role==='operator'; renders DiscoveryView when no session"
  - "Full PWA suite still passing; no regressions"
  - "TypeScript strict typecheck clean"
---

## Context

Companion task to B003-201. Per Architect audit, `pwa/src/App.tsx:56` renders `<PlaceholderShowView session={session} />` after pairing. The real cuelist UI components (`SMMasterView` from B003-013, `OperatorView` from B003-014) are built but never reached.

This task wires station mode to the actual UI components and connects to the FOH's Yjs broker for real-time cuelist sync.

## Implementation notes

### Routing

```tsx
// pwa/src/App.tsx
import { StationRouter } from './components/StationRouter.js';

if (mode === 'show' && session) return <StationRouter session={session} />;
```

### StationRouter

```tsx
export function StationRouter({ session }: { session: PairedSession }) {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [cuelistId, setCuelistId] = useState<string | null>(null);

  useEffect(() => {
    const conn = connectToShow({
      url: `ws://${session.host}:${session.port}`,
      pairingToken: session.token,
      stationId: session.station_id,
      showId: session.show_id,
    });
    setDoc(conn.doc);

    conn.doc.on('updateV2', () => {
      const cuelists = conn.doc.getMap('cuelists');
      if (cuelists.size > 0 && !cuelistId) {
        setCuelistId(cuelists.keys().next().value as string);
      }
    });

    conn.wsProvider.on('status', (s: 'connecting' | 'connected' | 'disconnected') => {
      setConnectionStatus(s === 'connected' ? 'connected' : 'connecting');
    });

    return () => conn.disconnect();
  }, [session]);

  if (connectionStatus === 'connecting' || !doc || !cuelistId) {
    return <ConnectingView host={session.host} />;
  }

  return (
    <ConnectionProvider doc={doc} sideChannel={...} awareness={...}>
      {session.role === 'sm'
        ? <SMMasterView cuelistId={cuelistId} />
        : <OperatorView session={session} cuelistId={cuelistId} />}
    </ConnectionProvider>
  );
}
```

### Imports

`SMMasterView` and `OperatorView` live in `pwa/src/components/cuelist/`. Direct imports — no IPC bridge needed since this is the PWA bundle running in iPad's Safari or laptop browser.

### ConnectingView

Simple loading/retry UI:

```tsx
function ConnectingView({ host }: { host: string }) {
  return (
    <div className="centered">
      <p>Connecting to {host}…</p>
      <RetryButton onClick={() => location.reload()}>Retry</RetryButton>
    </div>
  );
}
```

## Notes for Critic

- Verify StationRouter renders correct child per role
- Verify y-websocket connection cleanly closes on unmount
- Verify cuelistId initialization is deterministic (first key by Y.Map iteration order — Yjs uses insertion order)
- Out of scope: multi-cuelist switcher (per session, just first cuelist)
- Out of scope: presence color palette (Q11)
- Non-blocking: connection retry button is simple reload — better UI later

## Why this matters

After this task, an iPad paired as SM sees the full SMMasterView with the cuelist, search, calling text, GO button. An iPad paired as LX operator sees LX-filtered cues with operator-row layout. The headline feature (multi-operator cuelist) is finally end-to-end visible.
