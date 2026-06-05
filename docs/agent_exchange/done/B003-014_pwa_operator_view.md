---
id: "B003-014"
title: "PWA per-department operator view + variants (LX, SX, VIDEO, AUTO, PYRO, FS)"
type: "implementation"
estimated_size_lines: 700
priority: "P0"
depends_on: ["B003-005", "B003-012"]
target_files:
  - "pwa/src/components/cuelist/OperatorView.tsx"
  - "pwa/src/components/cuelist/variants/LxOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/SxOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/VideoOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/AutoOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/PyroOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/FsOperatorView.tsx"
  - "pwa/src/components/cuelist/variants/GenericOperatorView.tsx"
  - "pwa/src/components/cuelist/OperatorCueRow.tsx"
  - "pwa/src/components/cuelist/payloadSummaries.ts"
  - "pwa/tests/unit/components/cuelist/OperatorView.test.tsx"
  - "pwa/tests/unit/components/cuelist/variants/LxOperatorView.test.tsx"
  - "pwa/tests/unit/components/cuelist/variants/VideoOperatorView.test.tsx"
acceptance_criteria:
  - "`OperatorView` selects appropriate variant per `owned_departments[0]`; multi-owned (e.g. solo op) renders `GenericOperatorView` with combined columns"
  - "Operator view filters cues per B003-005 `visibleCues({owned, watched})` so operator sees their cues + SM-owned cues (watched) + neighbouring context"
  - "LxOperatorView columns: cue label, console cue ref (lx_ref payload), description, standby, manual GO confirm button (if go_authority=sm_called → confirm; if per_dept → GO), greyed-out non-LX payloads for context"
  - "SxOperatorView columns: cue label, sound payloads summary (OSC to QLab or MIDI), description, standby, GO confirm; greyed non-SX payloads"
  - "VideoOperatorView columns: cue label, asset name (from OSC address heuristic / payload note), in/out timing hint (duration_hint_ms), standby, GO confirm; greyed non-VIDEO payloads"
  - "AutoOperatorView columns: cue label, automation cue ref, departure/arrival, fire mode, GO confirm"
  - "PyroOperatorView columns: cue label, **safety arm state**, charge ref, fire confirm (double-tap required), large warnings; restricted GO (requires SM call + dept fire pair)"
  - "FsOperatorView columns: cue label, position, target, GO confirm; visual position indicator (color/intensity)"
  - "GenericOperatorView: solo-op / multi-dept fallback — shows all owned-dept payloads in unified column"
  - "Greyed neighbouring cues: cues actionable for OTHER departments (intersect watched but not owned) shown with reduced opacity 0.4 — provides 'what comes next' context without inviting action"
  - "Highlighted payloads (from B003-005 `highlightedPayloads`) bold + accent color; dimmed payloads grey small text"
  - "GO confirm vs GO button: when cuelist `go_authority === 'sm_called'`, operators send confirm only (not authoritative); when `per_dept`, operators authoritative for own-dept cues"
  - "Keyboard shortcuts: Space=GO/confirm, Q=standby ack, ↑/↓=navigate"
  - "Multi-owned operator (e.g. solo=[LX,SX,VIDEO]): renders GenericOperatorView with all 3 dept summaries"
  - "15+ vitest + RTL tests per variant covering filter, payload highlight, GO confirm vs GO authority, greyed context cues"
---

## Context

Each operator type has different concerns. LX operators need to see Eos cue numbers prominently; sound operators want OSC payload addresses; video operators care about asset names and timing. This task implements **department-specialized views** that surface the right payload info per role, while still showing context for SM communication.

The view variants are simple compositions over `useDepartment` + filtered `cues` array. Heavy lifting is in B003-005 (filtering) and B003-012 (data hooks).

## Implementation notes

### View selector

```tsx
// pwa/src/components/cuelist/OperatorView.tsx
import { LxOperatorView } from './variants/LxOperatorView';
import { SxOperatorView } from './variants/SxOperatorView';
// ...

export function OperatorView({ cuelistId, owned, watched }: { cuelistId: string; owned: string[]; watched: string[] }) {
  if (owned.length === 1) {
    switch (owned[0]) {
      case 'LX': return <LxOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'SX': return <SxOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'VIDEO': return <VideoOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'AUTO': return <AutoOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'PYRO': return <PyroOperatorView cuelistId={cuelistId} watched={watched} />;
      case 'FS': return <FsOperatorView cuelistId={cuelistId} watched={watched} />;
    }
  }
  return <GenericOperatorView cuelistId={cuelistId} owned={owned} watched={watched} />;
}
```

### LxOperatorView

```tsx
// pwa/src/components/cuelist/variants/LxOperatorView.tsx
import { useDepartment, useGoChannel, useCuelist } from '../../../hooks';
import { OperatorCueRow } from '../OperatorCueRow';
import { lxConsoleSummary } from '../payloadSummaries';

const ctx = { owned: new Set(['LX']), watched: new Set(['SM']) };

export function LxOperatorView({ cuelistId, watched }: { cuelistId: string; watched: string[] }) {
  const ctx = useMemo(() => ({ owned: new Set(['LX']), watched: new Set(watched) }), [watched]);
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  const { go, standby } = useGoChannel(cuelistId);
  const { cuelist } = useCuelist(cuelistId);
  const goAuthority = cuelist?.go_authority ?? 'sm_called';

  return (
    <div role="grid" aria-label="LX operator view">
      <header><h2>LX</h2></header>
      <div role="rowgroup">
        {visible.map(c => (
          <OperatorCueRow
            key={c.id}
            cue={c}
            isActionable={actionable.has(c.id)}
            consoleRef={lxConsoleSummary(c)}
            extraColumns={[
              { label: 'Eos', content: lxConsoleSummary(c) },
            ]}
            goLabel={goAuthority === 'sm_called' ? 'Confirm' : 'GO'}
            onGo={() => go(c.id)}
            onStandby={() => standby(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### OperatorCueRow

```tsx
export function OperatorCueRow({ cue, isActionable, extraColumns, goLabel, onGo, onStandby, owned }: Props) {
  const highlighted = useMemo(() => highlightedPayloads(cue, owned), [cue, owned]);
  const opacity = isActionable ? 1 : 0.4;
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto auto', gap: tokens.space.m, opacity, padding: tokens.space.m, borderBottom: `1px solid ${tokens.color.gray_300}` }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{cue.label}</div>
      <div>
        {extraColumns.map(col => (
          <div key={col.label}><strong>{col.label}:</strong> {col.content}</div>
        ))}
        <div style={{ fontSize: 14 }}>{cue.description}</div>
        {cue.standby_note && <div style={{ fontStyle: 'italic' }}>{cue.standby_note}</div>}
        <div style={{ display: 'flex', gap: 4 }}>
          {cue.payloads.map(p => (
            <span
              key={p.id}
              style={{
                fontWeight: highlighted.has(p.id) ? 700 : 400,
                color: highlighted.has(p.id) ? tokens.color.teal : tokens.color.gray_700,
                fontSize: highlighted.has(p.id) ? 14 : 11,
              }}
            >
              {summarizePayload(p)}
            </span>
          ))}
        </div>
      </div>
      <button onClick={onStandby} disabled={!isActionable}>Standby</button>
      <button onClick={onGo} disabled={!isActionable}>{goLabel}</button>
    </div>
  );
}
```

### PyroOperatorView (safety-critical)

```tsx
export function PyroOperatorView({ cuelistId, watched }: { cuelistId: string; watched: string[] }) {
  const ctx = useMemo(() => ({ owned: new Set(['PYRO']), watched: new Set(watched) }), [watched]);
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  const { go, standby } = useGoChannel(cuelistId);
  const [armed, setArmed] = useState<Set<string>>(new Set());
  const { cuelist } = useCuelist(cuelistId);
  const isSmCalled = cuelist?.go_authority === 'sm_called';

  return (
    <div>
      <header style={{ background: tokens.color.red, color: tokens.color.cream, padding: tokens.space.l }}>
        <h2>PYRO — DOUBLE-TAP FIRE</h2>
        <p>SM must call standby. Operator double-taps Fire to confirm.</p>
      </header>
      {visible.map(c => (
        <PyroCueRow
          key={c.id}
          cue={c}
          isActionable={actionable.has(c.id) && isSmCalled}
          isArmed={armed.has(c.id)}
          onArm={() => setArmed(s => new Set(s).add(c.id))}
          onFire={() => {
            if (!armed.has(c.id)) return; // require arm first
            go(c.id);
            setArmed(s => { const next = new Set(s); next.delete(c.id); return next; });
          }}
        />
      ))}
    </div>
  );
}
```

### payloadSummaries

```ts
// pwa/src/components/cuelist/payloadSummaries.ts
export function lxConsoleSummary(cue: Cue): string {
  const lxRef = cue.payloads.find(p => p.type === 'lx_ref') as LxRefPayload | undefined;
  if (lxRef) return `Cue ${lxRef.cue_list}/${lxRef.cue_number}`;
  return '—';
}

export function videoAssetSummary(cue: Cue): string {
  const osc = cue.payloads.find(p => p.type === 'osc') as OscPayload | undefined;
  if (osc) {
    // Heuristic: trailing path segment of OSC address is often the asset name
    const parts = osc.address.split('/');
    return parts[parts.length - 1] || osc.address;
  }
  return '—';
}

export function automationPosSummary(cue: Cue): string {
  // Look for OSC payload with /pos or similar
  const osc = cue.payloads.find(p => p.type === 'osc' && /pos|move|fly/i.test((p as OscPayload).address)) as OscPayload | undefined;
  return osc ? osc.address : '—';
}
```

### GenericOperatorView

```tsx
export function GenericOperatorView({ cuelistId, owned, watched }: { cuelistId: string; owned: string[]; watched: string[] }) {
  const ctx = useMemo(() => ({ owned: new Set(owned), watched: new Set(watched) }), [owned, watched]);
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  const { go, standby } = useGoChannel(cuelistId);
  return (
    <div>
      <header><h2>{owned.join(' · ')}</h2></header>
      {visible.map(c => (
        <OperatorCueRow
          key={c.id} cue={c} isActionable={actionable.has(c.id)}
          owned={ctx.owned}
          extraColumns={owned.map(d => ({ label: d, content: getPayloadSummaryForDept(c, d) }))}
          goLabel="GO" onGo={() => go(c.id)} onStandby={() => standby(c.id)}
        />
      ))}
    </div>
  );
}
```

## Test plan

### `OperatorView.test.tsx`

1. Single-owned LX → renders LxOperatorView.
2. Single-owned SX → renders SxOperatorView.
3. Multi-owned ['LX','SX','VIDEO'] → renders GenericOperatorView.
4. owned=[] (watcher) → renders GenericOperatorView (read-only-equivalent).

### `LxOperatorView.test.tsx`

5. Renders cues with LX or SM dept; hides pure-SX cues.
6. LX-owned cues actionable (GO enabled); SM-watched cues inactionable (GO disabled).
7. Cue with lx_ref payload shows "Cue 1/47" in Eos column.
8. Compound cue (LX+SX) shows LX payload highlighted, SX payload dimmed.
9. go_authority='sm_called' → button label "Confirm".
10. go_authority='per_dept' → button label "GO".
11. Greyed-out (opacity 0.4) for non-LX-owned visible cues.

### `VideoOperatorView.test.tsx`

12. Video cue with OSC `/cue/preshow/start` shows "start" in asset column.
13. Cue with duration_hint_ms=5000 shows "5s" timing.

### `PyroOperatorView.test.tsx`

14. Pyro view header shows safety warning.
15. Fire button disabled until Arm pressed.
16. Arm + Fire dispatches go; arm state cleared.
17. Fire button does NOT dispatch if armed state cleared.

### Multi-operator interaction

18. Two-operator scenario: LX op sees LX cues only; VIDEO op sees VIDEO cues only; both see SM cues.
19. SM-only cue (dept=['SM']) appears in both watched lists but greyed.
20. Compound cue appears in BOTH operators' visible list; each highlights their own payload.

## Out of scope

- Cue editor (B003-016).
- SM master view (B003-013).
- Multi-cuelist switcher (post-MVP).
- Operator preferences (color theme, font size — post-MVP).
- Pyro safety interlock with hardware (post-MVP — UI gates dispatch but no physical safety yet).
- Followspot color picker (post-MVP).

## Notes for Critic

- Verify LxOperatorView's filter context: owned=['LX'], watched={'SM'} (NOT cuelist.meta.departments — operator's awareness is the source).
- Confirm `OperatorCueRow` uses B003-005's `highlightedPayloads` for highlight set.
- Verify compound cue visibility matches expectation: cue with dept=['LX','SX'] visible in BOTH LX and SX views.
- Confirm greyed-out cues (opacity 0.4) are NON-actionable but visible — context for SM communication.
- Verify PyroOperatorView requires arm before fire (defense-in-depth — payload-level safety in 0.2; UI-level here).
- Confirm GO authority is per-cuelist (read from cuelist.go_authority), not global.
- Verify keyboard shortcuts respect input focus (don't fire in text fields).
- Confirm summarizePayload reuses the B003-010 summary function from showx-shared (or re-implement consistent).
