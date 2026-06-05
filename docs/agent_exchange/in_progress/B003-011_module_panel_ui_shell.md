---
id: "B003-011"
title: "Cuelist Core module panel UI in Electron shell"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B003-001", "B003-002"]
target_files:
  - "src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx"
  - "src/modules/cuelist-core/src/ui/StatusStrip.tsx"
  - "src/modules/cuelist-core/src/ui/ShowFilePicker.tsx"
  - "src/modules/cuelist-core/src/ui/StationsTable.tsx"
  - "src/modules/cuelist-core/src/ui/tokens.ts"
  - "src/modules/cuelist-core/src/ui/index.ts"
  - "tests/unit/modules/cuelist-core/ui/CuelistCorePanel.test.tsx"
  - "tests/unit/modules/cuelist-core/ui/StationsTable.test.tsx"
acceptance_criteria:
  - "`CuelistCorePanel` React component implements the lazy import target of `manifest.uiPanel`; default export from `src/modules/cuelist-core/src/ui/index.ts`"
  - "Panel renders in Electron shell as a tab labeled 'Cuelist Core'; shows: show file path (open/recently opened), show metadata (title, venue, date, mode badge), current cuelist name + cue count, station presence table, system status (autosave indicator, last save time)"
  - "Show file picker: 'Open .showx package' button triggers Electron `dialog.showOpenDialog` via IPC; opening calls renderer-side IPC `cuelist-core/open-show` → main-process `openShowxPackage` (B003-003)"
  - "New show: 'Create new show' button → modal prompt for title/venue/date → IPC `cuelist-core/new-show` → main-process `initShowDoc` + `saveShowxPackage` to user-chosen path"
  - "REHEARSAL/SHOW mode badge: large pill at top, color teal for REHEARSAL, red for SHOW; click toggles mode (calls B003-004 `transitionMode` via IPC); button disabled unless current operator is SM"
  - "StationsTable: renders awareness map per data_model.md §2.10 — one row per connected station; columns: presence color dot, display_name, owned_departments chips, watched_departments chips, last_heartbeat (relative time), kick action (SM only)"
  - "Subscribes to module's HealthBus via `ctx.health.observe('cuelist-core', ...)` (renderer-side IPC bridge); shows green/yellow/red status indicator"
  - "Uses ShowX design tokens (cream `#FAF8F1`, ink `#1B1A18`, teal accent `#0FA298`, red signal `#D14D3B`); declared in `tokens.ts` and imported by all UI components"
  - "Component imports zero `react-native`, zero external CSS frameworks beyond CSS Modules or styled-components (Forge picks one — match what B001-016 PWA scaffold used for consistency)"
  - "Empty state: when no show open, panel shows centered call-to-action with 'Open .showx' + 'New show' buttons + brief explanation 'Open a show file or create a new one to start.'"
  - "10+ vitest + React Testing Library tests covering: empty state, populated state, mode toggle gating, stations table rendering, IPC error toast"
---

## Context

The Cuelist Core panel is the **Electron shell's tab for the module** — operators primarily work in the PWA, but FOH staff need a desktop window to open show files, see who's connected, monitor mode + health, and do file management. This is NOT the operator cuelist UI (that's the PWA — B003-013, B003-014, etc.); it's the shell-side admin/status view.

Keep this panel minimal and operational. The deep editing happens on PWA stations.

## Implementation notes

### Tab registration

ModuleLoader picks up `manifest.uiPanel` (declared in B003-001 manifest task — Forge should patch B003-001's manifest to add the uiPanel field now):

```ts
// src/modules/cuelist-core/src/manifest.ts (patch)
export const manifest: ModuleManifest = {
  // ...existing fields
  uiPanel: () => import('./ui/index'),  // lazy-loaded
};
```

`src/ui/index.ts`:
```ts
export { CuelistCorePanel as default } from './CuelistCorePanel';
```

### Design tokens

```ts
// src/modules/cuelist-core/src/ui/tokens.ts
export const tokens = {
  color: {
    cream: '#FAF8F1',
    ink: '#1B1A18',
    teal: '#0FA298',
    teal_dim: '#7FCFC9',
    red: '#D14D3B',
    yellow: '#E5A93B',
    gray_50: '#F0EDE5',
    gray_300: '#B4ADA0',
    gray_700: '#4A453E',
  },
  space: { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 },
  font: { ui: '"GT America", system-ui, sans-serif', mono: '"GT America Mono", monospace' },
  radius: { s: 4, m: 8, l: 12 },
};
```

(GT America aligns with XLAB brand per `reference_xlab_brand.md` — if ShowX brand differs, defer to brand mapping in design tokens follow-up; otherwise use system fonts.)

### Panel component

```tsx
// src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx
import React, { useState, useEffect } from 'react';
import { tokens } from './tokens';
import { ShowFilePicker } from './ShowFilePicker';
import { StationsTable } from './StationsTable';
import { StatusStrip } from './StatusStrip';

interface PanelProps {
  // Provided by shell's UI shell-to-module bridge
  ipc: {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
    on(channel: string, handler: (...args: unknown[]) => void): () => void;
  };
}

interface ShowState {
  open: boolean;
  pkgPath?: string;
  title?: string;
  venue?: string;
  date?: string;
  mode?: 'rehearsal' | 'show';
  cuelistName?: string;
  cueCount?: number;
  isSm?: boolean;
}

export function CuelistCorePanel({ ipc }: PanelProps) {
  const [showState, setShowState] = useState<ShowState>({ open: false });
  const [stations, setStations] = useState<Awareness[]>([]);
  const [health, setHealth] = useState<'healthy' | 'warning' | 'error' | 'unknown'>('unknown');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offState = ipc.on('cuelist-core/show-state', (s) => setShowState(s as ShowState));
    const offStations = ipc.on('cuelist-core/stations', (s) => setStations(s as Awareness[]));
    const offHealth = ipc.on('cuelist-core/health', (h) => setHealth(h as any));
    ipc.invoke('cuelist-core/get-state').then(setShowState);
    return () => { offState(); offStations(); offHealth(); };
  }, [ipc]);

  const openShow = async () => {
    try {
      const path = await ipc.invoke<string | null>('cuelist-core/pick-show-file');
      if (path) await ipc.invoke('cuelist-core/open-show', path);
    } catch (e) { setError(String(e)); }
  };

  const newShow = async () => {
    // Modal flow handled by shell
    try {
      await ipc.invoke('cuelist-core/new-show-flow');
    } catch (e) { setError(String(e)); }
  };

  const toggleMode = async () => {
    if (!showState.isSm) return;
    const target = showState.mode === 'rehearsal' ? 'show' : 'rehearsal';
    try {
      await ipc.invoke('cuelist-core/transition-mode', target);
    } catch (e) { setError(String(e)); }
  };

  if (!showState.open) {
    return (
      <div style={{ background: tokens.color.cream, minHeight: '100vh', padding: tokens.space.xxl }}>
        <h1 style={{ color: tokens.color.ink, fontFamily: tokens.font.ui }}>Cuelist Core</h1>
        <p style={{ color: tokens.color.gray_700 }}>Open a show file or create a new one to start.</p>
        <div style={{ display: 'flex', gap: tokens.space.m }}>
          <button onClick={openShow}>Open .showx</button>
          <button onClick={newShow}>New show</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: tokens.color.cream, minHeight: '100vh', padding: tokens.space.xxl }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: tokens.color.ink, margin: 0 }}>{showState.title ?? '(untitled)'}</h1>
          <p style={{ color: tokens.color.gray_700, margin: 0 }}>
            {showState.venue ?? ''} · {showState.date ?? ''}
          </p>
        </div>
        <ModeBadge mode={showState.mode ?? 'rehearsal'} isSm={!!showState.isSm} onClick={toggleMode} />
      </header>

      <StatusStrip health={health} pkgPath={showState.pkgPath ?? ''} />

      <section style={{ marginTop: tokens.space.xl }}>
        <h2 style={{ color: tokens.color.ink }}>Cuelist</h2>
        <p>{showState.cuelistName} — {showState.cueCount} cues</p>
      </section>

      <section style={{ marginTop: tokens.space.xl }}>
        <h2 style={{ color: tokens.color.ink }}>Stations</h2>
        <StationsTable
          stations={stations}
          canKick={!!showState.isSm}
          onKick={(id) => ipc.invoke('cuelist-core/kick-station', id)}
        />
      </section>

      {error && (
        <div role="alert" style={{ background: tokens.color.red, color: tokens.color.cream, padding: tokens.space.m, borderRadius: tokens.radius.m, marginTop: tokens.space.l }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ModeBadge({ mode, isSm, onClick }: { mode: 'rehearsal' | 'show'; isSm: boolean; onClick: () => void }) {
  const bg = mode === 'show' ? tokens.color.red : tokens.color.teal;
  return (
    <button
      onClick={onClick}
      disabled={!isSm}
      style={{
        background: bg, color: tokens.color.cream, padding: `${tokens.space.s}px ${tokens.space.l}px`,
        borderRadius: tokens.radius.l, border: 'none', fontWeight: 700, cursor: isSm ? 'pointer' : 'not-allowed',
      }}
    >
      {mode === 'show' ? 'SHOW' : 'REHEARSAL'}
    </button>
  );
}
```

### StatusStrip

Shows current autosave status, last save time, file path, health indicator.

### StationsTable

```tsx
interface Awareness { station_id: string; display_name: string; owned_departments: string[]; watched_departments: string[]; last_heartbeat_at: string; presence_color: string; }

export function StationsTable({ stations, canKick, onKick }: { stations: Awareness[]; canKick: boolean; onKick: (id: string) => void }) {
  if (stations.length === 0) return <p>No stations connected.</p>;
  return (
    <table>
      <thead>
        <tr><th></th><th>Name</th><th>Owned</th><th>Watched</th><th>Last seen</th><th></th></tr>
      </thead>
      <tbody>
        {stations.map((s) => (
          <tr key={s.station_id}>
            <td><span style={{ background: s.presence_color, width: 12, height: 12, borderRadius: 6, display: 'inline-block' }} /></td>
            <td>{s.display_name}</td>
            <td>{s.owned_departments.map(d => <Chip key={d}>{d}</Chip>)}</td>
            <td>{s.watched_departments.map(d => <Chip key={d}>{d}</Chip>)}</td>
            <td>{relativeTime(s.last_heartbeat_at)}</td>
            <td>{canKick && <button onClick={() => onKick(s.station_id)}>Kick</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### IPC contract (main-process side stub)

Shell exposes these IPC channels (Forge writes main-side handlers in this task or separate follow-up if shell IPC is ShowX-1 deliverable):

- `cuelist-core/get-state` → returns current `ShowState`
- `cuelist-core/show-state` (push) → on Y.Doc mode/meta change
- `cuelist-core/stations` (push) → on awareness change
- `cuelist-core/health` (push) → on HealthBus snapshot
- `cuelist-core/pick-show-file` → opens Electron file picker, returns path
- `cuelist-core/open-show <path>` → calls `openShowxPackage`
- `cuelist-core/new-show-flow` → modal + create
- `cuelist-core/transition-mode <target>` → calls `transitionMode`
- `cuelist-core/kick-station <id>` → revokes station's pairing token

### Empty state visual

Centered text, soft cream background, two buttons. Pure functional, no animation in MVP.

## Test plan

### `CuelistCorePanel.test.tsx`

1. Empty state: renders Open/New buttons; no show details.
2. Populated state: title + venue + date + mode badge + cuelist count visible.
3. Mode badge button disabled for non-SM operator.
4. Mode badge click triggers `cuelist-core/transition-mode` IPC.
5. Error toast appears when IPC reject.
6. Health red shows red indicator in status strip.

### `StationsTable.test.tsx`

7. Empty stations: "No stations connected" message.
8. 3 stations rendered: presence color dots, display_name, dept chips.
9. Kick button visible for SM; hidden for non-SM.
10. Kick button onClick calls `onKick(station_id)`.

## Out of scope

- PWA cuelist UI (B003-013, B003-014).
- Cue editor (B003-016).
- GO button (B003-015 — PWA only; shell does not GO).
- Routing UI (post-MVP).
- Theme switcher (post-MVP).
- Module loader sidebar entry styling (ShowX-1 B001-016).
- Detailed health diagnostics view (post-MVP).

## Notes for Critic

- Verify the panel does NOT contain GO buttons — that's a PWA-only affordance. Shell-side accidental GO is a hazard.
- Verify mode toggle disabled for non-SM with cursor: not-allowed (UX hint).
- Confirm panel imports from showx-shared (typed IPC bridge) NOT from cuelist-core internals directly — panel is renderer-side, shouldn't reach into main-process modules.
- Confirm design tokens are consistent with rest of ShowX shell (B001-016 if specified design tokens).
- Verify accessibility: ModeBadge has descriptive label; status indicator has aria-label; tables have header rows.
- Verify empty state copy is action-oriented ("Open / New" clear).
- Confirm IPC channel names follow pattern `cuelist-core/<verb>` per module sandboxing convention.
