---
id: "B003-013"
title: "PWA SM master view — full cuelist + standby panel + calling text"
type: "implementation"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B003-005", "B003-012"]
target_files:
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/StandbyPanel.tsx"
  - "pwa/src/components/cuelist/CallingText.tsx"
  - "pwa/src/components/cuelist/DepartmentChips.tsx"
  - "pwa/src/components/cuelist/CueTypeBadge.tsx"
  - "pwa/src/components/cuelist/OperatorPresenceIndicators.tsx"
  - "pwa/src/components/cuelist/PlayheadIndicator.tsx"
  - "pwa/src/components/cuelist/tokens.ts"
  - "pwa/tests/unit/components/cuelist/SMMasterView.test.tsx"
  - "pwa/tests/unit/components/cuelist/CueRow.test.tsx"
  - "pwa/tests/unit/components/cuelist/StandbyPanel.test.tsx"
acceptance_criteria:
  - "`SMMasterView` renders the full cuelist for SM with ALL cues visible regardless of department (SM profile from B003-005)"
  - "CueRow shows: cue label (large), description (smaller), department chips, cue type badge (Manual/AutoFollow/AutoContinue/Group/Wait icons), standby_note (italic), payload count, operator presence indicators (small avatars of stations currently focused on this cue), GO state flash (firing/fired animation)"
  - "Selected cue highlighted with playhead bar + accent color (teal); arrow keys / cue navigation move playhead via Yjs awareness `current_view.focus_cue_id`"
  - "StandbyPanel: fixed bottom drawer showing next 1-3 cues with standby text per data_model.md §6.4; SM presses Q (keyboard) → emit arm.request via B003-012 useGoChannel"
  - "CallingText: large text reading the standby_note for armed cue + 'GO' visual when fired; ARIA-live region for accessibility"
  - "Playhead indicator: visual line + 'NOW' chip on current cue; persists across reloads (per cuelist.playhead.cue_id from B003-002)"
  - "Compound cue indication: cue with 2+ departments shows multi-color side-bar (one stripe per department)"
  - "Locked indicator: when SHOW mode, each cue's payload section shows lock icon; metadata still editable per Q7"
  - "Multi-operator presence: per data_model.md §2.10 awareness — show small dots/avatars next to cue rows where other stations are focused"
  - "Search/filter bar: type-ahead search across cue.label + cue.description (instant filter; not departmental)"
  - "Keyboard shortcuts: Space=GO, Q=standby next, ↑/↓ navigate playhead, Enter=focus cue, ?=help overlay"
  - "Empty state: 'No cues yet — click + to add' with prominent add button"
  - "Uses tokens.ts (mirrored from B003-011) for consistent design system"
  - "20+ vitest + RTL tests covering rendering, keyboard, presence, lock state, search, compound visualization"
---

## Context

The SM master view is the central operating UI for stage managers — it's where they call shows. This is the **showpiece component** of ShowX 0.1, ergonomically and visually. Forge must prioritize clarity, large readable text, and instant feedback on cue state.

This task implements the view structure + interaction; the GO button + standby authoritative dispatch is B003-015 (composes this view); the cue editor is B003-016.

## Implementation notes

### Layout structure

```tsx
// pwa/src/components/cuelist/SMMasterView.tsx
export function SMMasterView({ cuelistId }: { cuelistId: string }) {
  const { cuelist, cues } = useCuelist(cuelistId);
  const { mode } = useMode();
  const stations = useStations();
  const { go, standby, lastDispatched } = useGoChannel(cuelistId);
  const [playheadCueId, setPlayheadCueId] = useState<string | null>(cuelist?.playhead?.cue_id ?? null);
  const [armedCueId, setArmedCueId] = useState<string | null>(cuelist?.playhead?.armed_cue_id ?? null);
  const [search, setSearch] = useState('');

  useKeyboardShortcuts({
    Space: () => { if (armedCueId) go(armedCueId); },
    KeyQ: () => { if (playheadCueId) { standby(playheadCueId); setArmedCueId(playheadCueId); } },
    ArrowUp: () => navPlayhead(-1),
    ArrowDown: () => navPlayhead(+1),
  });

  const filtered = useMemo(() => {
    if (!search) return cues;
    const q = search.toLowerCase();
    return cues.filter(c => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [cues, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: tokens.color.cream }}>
      <header style={{ padding: tokens.space.l, borderBottom: `1px solid ${tokens.color.gray_300}` }}>
        <h1 style={{ margin: 0 }}>{cuelist?.name ?? 'Cuelist'}</h1>
        <input
          type="search"
          placeholder="Search cues…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search cues"
        />
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: tokens.space.l }}>
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((cue) => (
            <CueRow
              key={cue.id}
              cue={cue}
              isPlayhead={cue.id === playheadCueId}
              isArmed={cue.id === armedCueId}
              isFiring={lastDispatched?.cue_id === cue.id && !lastDispatched?.historic}
              onSelect={() => setPlayheadCueId(cue.id)}
              stations={stations.filter(s => s.cursor.cue_id === cue.id)}
              mode={mode}
            />
          ))
        )}
      </main>
      <StandbyPanel
        nextCues={getNextCues(cues, playheadCueId, 3)}
        armedCueId={armedCueId}
        cues={cues}
      />
      <CallingText armedCue={cues.find(c => c.id === armedCueId) ?? null} lastFired={lastDispatched} />
    </div>
  );
}
```

### CueRow

```tsx
export function CueRow({ cue, isPlayhead, isArmed, isFiring, onSelect, stations, mode }: CueRowProps) {
  const bg = isPlayhead ? tokens.color.teal_dim : (isFiring ? tokens.color.green : tokens.color.cream);
  return (
    <div
      role="row"
      aria-selected={isPlayhead}
      onClick={onSelect}
      style={{
        display: 'grid', gridTemplateColumns: '40px 100px 1fr auto auto', gap: tokens.space.m,
        padding: tokens.space.m, borderBottom: `1px solid ${tokens.color.gray_300}`, background: bg,
        cursor: 'pointer',
      }}
    >
      <DepartmentSideBar departments={cue.department} />
      <div style={{ fontSize: 24, fontWeight: 700 }}>{cue.label}</div>
      <div>
        <div style={{ fontSize: 16 }}>{cue.description}</div>
        {cue.standby_note && <div style={{ fontStyle: 'italic', color: tokens.color.gray_700 }}>{cue.standby_note}</div>}
      </div>
      <CueTypeBadge trigger={cue.trigger} />
      <DepartmentChips departments={cue.department} />
      <OperatorPresenceIndicators stations={stations} />
      {mode === 'show' && <LockIcon />}
      {isArmed && <ArmedIndicator />}
    </div>
  );
}
```

### CueTypeBadge

```tsx
export function CueTypeBadge({ trigger }: { trigger: Cue['trigger'] }) {
  const icons = { manual: '⏵', auto_follow: '→', auto_continue: '⏩', timecode: '⏱' };
  const labels = { manual: 'Manual', auto_follow: 'Follow', auto_continue: 'Continue', timecode: 'Timecode' };
  return (
    <span aria-label={labels[trigger.kind]} title={labels[trigger.kind]}>
      {icons[trigger.kind]}
    </span>
  );
}
```

### DepartmentSideBar (compound cue visualization)

```tsx
export function DepartmentSideBar({ departments }: { departments: string[] }) {
  const colors = { LX: '#E5A93B', SX: '#0FA298', VIDEO: '#7C5BCF', AUTO: '#4A453E', PYRO: '#D14D3B', FS: '#F5DEB3', SM: '#FAF8F1', OTHER: '#B4ADA0' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 8, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
      {departments.map(d => (
        <div key={d} style={{ flex: 1, background: colors[d as keyof typeof colors] ?? colors.OTHER }} title={d} />
      ))}
    </div>
  );
}
```

### StandbyPanel

```tsx
export function StandbyPanel({ nextCues, armedCueId, cues }: { nextCues: Cue[]; armedCueId: string | null; cues: Cue[] }) {
  const armed = cues.find(c => c.id === armedCueId);
  return (
    <div style={{ padding: tokens.space.l, background: tokens.color.gray_50, borderTop: `2px solid ${tokens.color.ink}` }}>
      <h3>Standby</h3>
      {armed && (
        <div style={{ fontSize: 20, fontWeight: 700, color: tokens.color.red }}>
          Standby {armed.label} — {armed.standby_note}
        </div>
      )}
      <div style={{ display: 'flex', gap: tokens.space.m, marginTop: tokens.space.m }}>
        {nextCues.map(c => (
          <div key={c.id} style={{ padding: tokens.space.s, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s }}>
            <div style={{ fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: 12 }}>{c.standby_note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### CallingText

```tsx
export function CallingText({ armedCue, lastFired }: { armedCue: Cue | null; lastFired: GoDispatched | null }) {
  const isFiringNow = lastFired && Date.now() - new Date(lastFired.dispatched_at).getTime() < 2000;
  return (
    <div aria-live="polite" style={{ padding: tokens.space.l, background: isFiringNow ? tokens.color.teal : tokens.color.cream, fontSize: 32, textAlign: 'center' }}>
      {isFiringNow ? `GO ${lastFired!.cue_id}` : armedCue ? `STANDBY ${armedCue.label}` : 'Ready'}
    </div>
  );
}
```

### OperatorPresenceIndicators

```tsx
export function OperatorPresenceIndicators({ stations }: { stations: StationAwareness[] }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {stations.slice(0, 5).map(s => (
        <div
          key={s.station_id}
          title={s.display_name}
          style={{ width: 16, height: 16, borderRadius: 8, background: s.presence_color }}
        />
      ))}
      {stations.length > 5 && <span>+{stations.length - 5}</span>}
    </div>
  );
}
```

### Keyboard shortcuts hook

```ts
// pwa/src/hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts(map: Record<string, () => void>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      const handler = map[e.code];
      if (handler) { e.preventDefault(); handler(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map]);
}
```

## Test plan

### `SMMasterView.test.tsx`

1. Renders all cues from `useCuelist`.
2. Search filters cues by label.
3. Search filters by description.
4. Empty state when no cues.
5. ArrowDown moves playhead to next cue.
6. ArrowUp moves to prev.
7. Q key arms playhead cue.
8. Space fires armed cue (calls go).
9. Selected cue has aria-selected="true".
10. SHOW mode shows lock icons.

### `CueRow.test.tsx`

11. Cue label rendered large.
12. Department chips rendered.
13. Compound cue (dept=['LX','SX']) shows multi-color sidebar.
14. CueTypeBadge for manual = ⏵ icon.
15. isPlayhead row has teal_dim background.
16. isFiring row flashes green.
17. Station presence dots rendered for cursor matches.

### `StandbyPanel.test.tsx`

18. Renders next 3 cues.
19. Armed cue's standby text rendered in red.
20. No armed cue → no red callout.

### `CallingText.test.tsx`

21. "STANDBY <label>" when armed.
22. "GO <cueId>" when firing within 2s.
23. "Ready" otherwise.
24. aria-live="polite" for screen reader.

## Out of scope

- GO button itself as a tappable button on screen (B003-015 — adds explicit GO button for touch).
- Cue editor (B003-016).
- Per-department operator view (B003-014).
- PDF export (B003-019).
- CSV import UI (B003-017 — utility task, no UI in this MVP).
- Theme customization (post-MVP).
- Multi-cuelist tab switcher (post-MVP — MVP has 1 cuelist).

## Notes for Critic

- Verify SM profile (from B003-005) is applied — SM sees ALL cues regardless of department.
- Verify keyboard shortcuts don't fire when user types in search box (INPUT element check).
- Verify ARIA: aria-selected on selected row, aria-live on CallingText, aria-label on search.
- Verify large font sizes for SM screens (cue label 24px+ for readability across a darkened backstage).
- Confirm compound cue sidebar is multi-stripe (1 stripe per department).
- Verify lock icons only appear in SHOW mode.
- Confirm presence indicators show up to 5 dots + count for overflow.
- Verify standby armed cue text has high contrast (red on cream).
- Watch for performance with 200+ cues — should render fast; if not, virtualization may be needed (use react-window in follow-up).
