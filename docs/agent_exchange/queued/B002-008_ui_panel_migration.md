---
id: "B002-008"
title: "UI panel migration: BridgeX 0.3.x renderer → ShowX module panel"
type: "implementation"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B002-002"]
target_files:
  - "src/modules/eventx-bridge/src/ui/EventXBridgePanel.tsx"
  - "src/modules/eventx-bridge/src/ui/EventPicker.tsx"
  - "src/modules/eventx-bridge/src/ui/LoginSection.tsx"
  - "src/modules/eventx-bridge/src/ui/SenderStats.tsx"
  - "src/modules/eventx-bridge/src/ui/ListenerSection.tsx"
  - "src/modules/eventx-bridge/src/ui/ActivityLog.tsx"
  - "src/modules/eventx-bridge/src/ui/hooks/useAuth.ts"
  - "src/modules/eventx-bridge/src/ui/hooks/useEvents.ts"
  - "src/modules/eventx-bridge/src/ui/hooks/useHealth.ts"
  - "src/modules/eventx-bridge/src/ui/styles.module.css"
  - "src/modules/eventx-bridge/src/ui/index.ts"
  - "src/modules/eventx-bridge/src/manifest.ts"
  - "src/modules/eventx-bridge/tests/unit/ui/EventXBridgePanel.test.tsx"
  - "src/modules/eventx-bridge/tests/unit/ui/EventPicker.test.tsx"
  - "src/modules/eventx-bridge/tests/unit/ui/LoginSection.test.tsx"
  - "src/modules/eventx-bridge/package.json"
acceptance_criteria:
  - "`src/ui/EventXBridgePanel.tsx` is the root React component mounted into the ShowX shell module tab; exports default function `EventXBridgePanel()`"
  - "Panel composes sub-components: LoginSection (when not auth'd), EventPicker (event dropdown + Start/Stop), SenderStats (counter + last packet), ListenerSection (OSC IN bind config + receive stats), ActivityLog (combined sent/received scrollable log)"
  - "All BridgeX 0.3.x panel functionality preserved: select event, start/stop runtime, view sender counter + last packet, configure listener bind, view activity log"
  - "Uses ShowX shell design tokens for color/spacing/typography per `pwa/src/styles/tokens.css` (or equivalent from B001-012 / shell theming) — NO direct BridgeX dark-CSS literals"
  - "Marketing palette honored: ink (`#0f0f10`), cream (`#f6f1e7`), neon yellow accent (`#FFFF00` per XLAB brand) — verify against `~/.claude/projects/.../memory/reference_xlab_brand.md` if any conflict"
  - "manifest.ts updated: `uiPanel: () => import('./ui/index.js')` registers the lazy panel; statusBadge optionally registered"
  - "IPC bridge: panel uses `window.showx.modules['eventx-bridge'].auth.login()` (or equivalent shell-provided RPC handle from B001-010 module loader) — NOT direct main process calls"
  - "useAuth hook subscribes to auth state changes (via shell IPC + EventBus); useEvents hook fetches event list from EventX Supabase via IPC; useHealth hook subscribes to module health from HealthBus IPC bridge"
  - "Panel renders correctly in 3 states: not-logged-in (LoginSection only), logged-in-no-event-selected (EventPicker prompts), logged-in-runtime-active (SenderStats + ListenerSection + ActivityLog visible)"
  - "Activity log virtualized (display last 200 entries; scroll back for more) to handle 480 packets/sec from sensor_race without UI freeze"
  - "Vitest + @testing-library/react unit tests: ≥10 tests covering 3 states + interactions (login submit, event select, start/stop click)"
  - "package.json adds `react@^18`, `react-dom@^18`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@types/react`, `@types/react-dom`"
  - "vitest.config.ts switches environment to `jsdom` for UI tests (or `tests/ui/vitest.config.ts` separately)"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test` passes including UI tests"
---

## Context

BridgeX 0.3.x has a full Electron renderer UI: `apps/bridgex-app/src/renderer/` with `App.tsx`, `EventPanel.tsx`, `SenderPanel.tsx`, `ListenerPanel.tsx`, `LoginPanel.tsx`, `ActivityLog.tsx` — wraps the bridge engine with auth gate, event selector, sender/listener stats, scrolling activity log.

ShowX absorbs this UI into a module panel. The shell hosts a tabbed layout (per `docs/dev/architecture.md` topology); each loaded module with `uiPanel` declared gets a tab. EventX Bridge's tab renders this panel. The shell provides design tokens, an IPC bridge (`window.showx.modules['eventx-bridge'].*`), and an EventBus subscription channel.

Per module_loader spec §6 (UI integration):
- `manifest.uiPanel: () => Promise<ReactComponentModule>` declares the lazy import.
- Renderer dynamic-imports the panel on tab activate.
- Panel receives `ModuleUIContext` (renderer-side typed handle) — distinct from main-process ModuleContext.

This task is the visible deliverable for ShowX 0.5 — the module appearing as a UI tab. Critic + Jindřich will sanity-check the panel actually renders all BridgeX 0.3.x functionality before customer migration.

## Implementation notes

### Component hierarchy

```
<EventXBridgePanel>
  ├── <PanelHeader> (module name + status pill)
  ├── (auth gate)
  │     ├── <LoginSection> (when !authenticated)
  │     └── <AuthedContent> (when authenticated)
  │            ├── <EventPicker>
  │            ├── <RuntimeControls> (Start/Stop buttons + listener toggle)
  │            ├── <Grid2Col>
  │            │     ├── <SenderStats>
  │            │     └── <ListenerSection>
  │            └── <ActivityLog>
  └── <PanelFooter> (version + xlab brand mark)
```

### EventXBridgePanel.tsx skeleton

```tsx
import { useAuth } from './hooks/useAuth.js';
import { useHealth } from './hooks/useHealth.js';
import LoginSection from './LoginSection.js';
import EventPicker from './EventPicker.js';
import SenderStats from './SenderStats.js';
import ListenerSection from './ListenerSection.js';
import ActivityLog from './ActivityLog.js';
import styles from './styles.module.css';

export default function EventXBridgePanel() {
  const auth = useAuth();
  const health = useHealth('eventx-bridge');

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2>EventX Bridge</h2>
        <HealthPill status={health.status} detail={health.detail} />
      </header>

      {!auth.authenticated ? (
        <LoginSection onLogin={auth.login} error={auth.error} />
      ) : (
        <AuthedContent email={auth.email} onLogout={auth.logout} />
      )}

      <footer className={styles.footer}>
        <span>v{__SHOWX_MODULE_VERSION__} · XLAB</span>
      </footer>
    </div>
  );
}

function AuthedContent({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <>
      <div className={styles.authBar}>
        <span>{email}</span>
        <button onClick={onLogout}>Log out</button>
      </div>
      <EventPicker />
      <div className={styles.grid2}>
        <SenderStats />
        <ListenerSection />
      </div>
      <ActivityLog />
    </>
  );
}
```

### IPC bridge usage

The shell exposes per-module RPC at `window.showx.modules['eventx-bridge']`. The exact shape is TBD by B001-010 module loader implementation, but the contract is:

```ts
window.showx.modules['eventx-bridge'].auth.login(email, password): Promise<AuthSnapshot>;
window.showx.modules['eventx-bridge'].auth.logout(): Promise<void>;
window.showx.modules['eventx-bridge'].auth.getSession(): Promise<AuthSnapshot>;

window.showx.modules['eventx-bridge'].runtime.start(eventId): Promise<void>;
window.showx.modules['eventx-bridge'].runtime.stop(): Promise<void>;
window.showx.modules['eventx-bridge'].runtime.status(): Promise<RuntimeStatus>;

window.showx.modules['eventx-bridge'].events.list(): Promise<Array<{ id: string; short_id: string; name: string }>>;
window.showx.modules['eventx-bridge'].config.load(): Promise<EventXBridgeConfig>;
window.showx.modules['eventx-bridge'].config.save(cfg): Promise<void>;

window.showx.events.subscribe(slug, type, handler): Subscription;  // EventBus IPC bridge
window.showx.health.subscribe(slug, handler): Subscription;
window.showx.health.snapshot(slug): HealthSnapshot;
```

If the shell IPC API isn't yet finalized (verify against B001-010, B001-011), Forge inlines a minimal `getShellIpc()` adapter that calls `window.electron.ipcRenderer.invoke(...)` directly with namespaced channel names (`eventx-bridge:auth:login`). Document chosen path in done report.

### useAuth hook

```ts
// src/ui/hooks/useAuth.ts
export function useAuth() {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({ authenticated: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = window.showx.events.subscribe('eventx-bridge', 'auth-state-changed', (e: any) => {
      setSnapshot(e.snapshot);
    });
    window.showx.modules['eventx-bridge'].auth.getSession().then(setSnapshot);
    return () => sub.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    try { setError(null); return await window.showx.modules['eventx-bridge'].auth.login(email, password); }
    catch (e: any) { setError(e.message); throw e; }
  };
  const logout = async () => window.showx.modules['eventx-bridge'].auth.logout();

  return { ...snapshot, login, logout, error };
}
```

`useEvents` and `useHealth` follow same pattern.

### ActivityLog virtualization

BridgeX 0.3.x ActivityLog naïvely renders all log entries — fine for occasional emits but locks the UI at 480 packets/sec (sensor_race). ShowX's port virtualizes:

```tsx
const MAX_DISPLAY = 200;

export default function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    const sub = window.showx.events.subscribe('eventx-bridge', 'log-entry', (e: any) => {
      setEntries(prev => [e.entry, ...prev].slice(0, MAX_DISPLAY));
    });
    return () => sub.unsubscribe();
  }, []);

  return (
    <div className={styles.activityLog}>
      <h3>Activity</h3>
      <div className={styles.scroll}>
        {entries.map(entry => (
          <div key={entry.id} className={styles.logRow}>
            <span className={styles.ts}>{formatTime(entry.ts)}</span>
            <span className={styles.dir}>{entry.dir === 'sent' ? '→' : '←'}</span>
            <span className={styles.payload}>{entry.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

For 0.5: keep cap at 200 in-memory; if scroll-back beyond 200 needed, defer to ShowX 0.1+ (history viewer module).

### Styling

`styles.module.css`:
```css
.panel {
  background: var(--showx-cream, #f6f1e7);
  color: var(--showx-ink, #0f0f10);
  padding: 24px;
  font-family: var(--showx-font, 'GT America', system-ui, sans-serif);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--showx-border, #d8d0bf);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.healthPill {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.healthPill[data-status="healthy"] { background: var(--showx-accent, #FFFF00); color: #000; }
.healthPill[data-status="warning"] { background: orange; color: #fff; }
.healthPill[data-status="error"]   { background: #d63b3b; color: #fff; }
.healthPill[data-status="unknown"] { background: #999; color: #fff; }

/* ... rest */
```

Pull token variable names from `pwa/src/styles/tokens.css` (B001-012) if exists; if not yet present, file follow-up to add tokens before ShowX 0.5 ships.

### manifest.ts update

```ts
export const manifest: ModuleManifest = {
  // ... existing fields
  uiPanel: () => import('./ui/index.js'),
};
```

`src/ui/index.ts`:
```ts
export { default } from './EventXBridgePanel.js';
```

### vitest.config.ts UI environment

If existing vitest config uses node env, add a separate jsdom config:

```ts
// src/modules/eventx-bridge/vitest.config.ts (revise)
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

```ts
// src/modules/eventx-bridge/vitest.ui.config.ts (new)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/ui/**/*.test.tsx'],
    setupFiles: ['tests/setup-ui.ts'],
  },
});
```

`tests/setup-ui.ts`:
```ts
import '@testing-library/jest-dom';
// mock window.showx
(globalThis as any).window = (globalThis as any).window ?? {};
(window as any).showx = {
  modules: { 'eventx-bridge': { auth: { login: vi.fn(), logout: vi.fn(), getSession: vi.fn() }, runtime: { start: vi.fn(), stop: vi.fn() }, events: { list: vi.fn() }, config: { load: vi.fn(), save: vi.fn() } } },
  events: { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) },
  health: { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }), snapshot: vi.fn() },
};
```

Add npm script `"test:ui": "vitest run -c vitest.ui.config.ts"` and have `pnpm test` run both.

## Test plan

### `tests/unit/ui/EventXBridgePanel.test.tsx` (≥4 tests)

1. Renders LoginSection when not authenticated.
2. Renders AuthedContent when authenticated.
3. Health pill reflects HealthBus status.
4. Logout button triggers `window.showx.modules['eventx-bridge'].auth.logout`.

### `tests/unit/ui/EventPicker.test.tsx` (≥4 tests)

1. Fetches event list on mount.
2. Renders dropdown with events.
3. Start button triggers `runtime.start(selectedEventId)`.
4. Stop button enabled only when running.

### `tests/unit/ui/LoginSection.test.tsx` (≥3 tests)

1. Form renders email + password fields + submit button.
2. Submit calls `auth.login(email, password)`.
3. Error message displays on login failure.

## Out of scope

- IPC bridge implementation in shell (that's B001-010 / B001-011).
- Cuelist Core UI (ShowX-3).
- SHOW mode UI (ShowX-4).
- E2E Playwright tests (deferred to B002-013 migration harness).
- Real-time chart rendering (sender rate graph) — bare counters only in 0.5; visualization deferred.
- Per-output health drill-down (only top-level module health pill in 0.5).
- Customer-facing config editor for `event_bridge_outputs` (Supabase Studio remains the editor; ShowX UI is read-only stats).
- Touching `legacy/` BridgeX renderer files (read-only audit; do not import).

## Notes for Critic

- Verify no direct DOM manipulation or React internals; use hooks + JSX.
- Verify no hard-coded URL strings; all IPC goes through `window.showx.*` abstraction.
- Verify activity log cap = 200 entries (test by pushing 1000 entries, assert DOM contains only 200).
- Verify CSS module imports work (`styles.module.css` exports typed `{ panel, header, ... }`).
- Check accessibility: form labels present, button text non-empty, color contrast WCAG AA.
- Verify `manifest.uiPanel` is a function returning a Promise (lazy import); not a direct reference.
- No imports from `src/legacy/` — Critic greps for them; any hit = `changes_requested`.
- Verify React 18 / concurrent-mode-safe (no setState in render).
