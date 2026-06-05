---
id: "B003-015"
title: "PWA GO button + standby panel — SM authoritative dispatch UI"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B003-008", "B003-013"]
target_files:
  - "pwa/src/components/cuelist/GoButton.tsx"
  - "pwa/src/components/cuelist/StandbyPanel.tsx"
  - "pwa/src/components/cuelist/GoConfirmDialog.tsx"
  - "pwa/src/components/cuelist/HelpOverlay.tsx"
  - "pwa/src/hooks/usePlayhead.ts"
  - "pwa/tests/unit/components/cuelist/GoButton.test.tsx"
  - "pwa/tests/unit/components/cuelist/StandbyPanel.test.tsx"
  - "pwa/tests/unit/hooks/usePlayhead.test.tsx"
acceptance_criteria:
  - "`GoButton` — large green/teal button bottom-center of SM view; tap triggers `sideChannel.sendGoRequest(cuelistId, armedCueId)` from B003-012; SHOW mode = red button"
  - "SM authority enforced via `useGoChannel` (B003-012) — non-SM stations' GO requests get authority-rejected per B003-008"
  - "Keyboard: Space = GO; arrows = navigate playhead via `usePlayhead` hook; Q = standby (arm next cue); Esc = cancel armed; ? = help overlay"
  - "Standby panel: shows next 1-3 cues + current armed cue's standby_note in large text; visually pulses when armed"
  - "Visual feedback on GO: button flashes for 300ms; cue row pulses; CallingText updates to 'GO <label>'"
  - "GO rejected (e.g. not_sm): toast + button shake animation; reason from `go.rejected` envelope shown briefly"
  - "Override mode: long-press Cmd+Shift+G (or 1.5s long-press on touch) opens override-confirm dialog; bypasses authority for SM emergency fire"
  - "`usePlayhead(cuelistId)` hook: returns `{playheadCueId, armedCueId, advance(), retreat(), arm(cueId), unarm()}`; persists playhead via Yjs `cuelist.playhead` per data_model.md §2.4 (mutates cuelist.playhead.cue_id + armed_cue_id)"
  - "Help overlay (?): keyboard shortcut reference + GO authority explanation + role indicator"
  - "Accessibility: GO button has aria-label='GO — fire armed cue'; standby panel role='status' aria-live='polite'"
  - "Touch-friendly: GO button min height 80px; standby cues tappable to re-arm"
  - "Touch + mouse + keyboard parity — all three interaction modes work"
  - "15+ vitest + RTL tests covering GO dispatch, keyboard, override flow, rejection toast, playhead nav, standby visualization"
---

## Context

The GO button is the most safety-critical UI element in the entire product. Every theatre production goes through it; misfires here cost real money and trust. Forge MUST be conservative — no auto-fire, no double-dispatch, clear visual confirmation, predictable keyboard behavior, no accidental rebinding.

This task adds the explicit GO button + standby panel composition that B003-013 SM master view consumes. The dispatch wiring is via B003-012's `useGoChannel`; this task is UI only.

## Implementation notes

### GoButton

```tsx
// pwa/src/components/cuelist/GoButton.tsx
import { useState, useEffect, useRef } from 'react';
import { tokens } from './tokens';

export interface GoButtonProps {
  armedCueId: string | null;
  cueLabel?: string;
  mode: 'rehearsal' | 'show';
  onGo: () => string;            // returns request_id
  onOverride: () => void;
  rejectedReason: string | null;
  isAuthoritative: boolean;       // false if station is non-SM and authority=sm_called
}

export function GoButton({ armedCueId, cueLabel, mode, onGo, onOverride, rejectedReason, isAuthoritative }: GoButtonProps) {
  const [flash, setFlash] = useState(false);
  const [shake, setShake] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const bg = mode === 'show' ? tokens.color.red : tokens.color.teal;
  const disabled = !armedCueId || !isAuthoritative;

  useEffect(() => {
    if (rejectedReason) {
      setShake(true);
      const t = window.setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [rejectedReason]);

  const handleClick = () => {
    if (disabled) return;
    onGo();
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
  };

  const handleMouseDown = () => {
    longPressTimer.current = window.setTimeout(() => onOverride(), 1500);
  };
  const handleMouseUp = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      disabled={disabled}
      aria-label={armedCueId ? `GO — fire armed cue ${cueLabel}` : 'GO — no armed cue'}
      style={{
        width: '100%', minHeight: 80, fontSize: 36, fontWeight: 800,
        background: flash ? tokens.color.cream : bg, color: flash ? tokens.color.ink : tokens.color.cream,
        border: 'none', borderRadius: tokens.radius.l,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 80ms',
        animation: shake ? 'shake 0.5s' : 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      GO {armedCueId && cueLabel ? `· ${cueLabel}` : ''}
    </button>
  );
}
```

### usePlayhead

```ts
// pwa/src/hooks/usePlayhead.ts
import { useCuelist } from './useCuelist';
import { useConnection } from '../lib/ConnectionProvider';

export function usePlayhead(cuelistId: string) {
  const conn = useConnection();
  const { cuelist, cues } = useCuelist(cuelistId);
  const playheadCueId = cuelist?.playhead?.cue_id ?? null;
  const armedCueId = cuelist?.playhead?.armed_cue_id ?? null;

  const setPlayhead = (cueId: string | null) => {
    const cl = getCuelist(conn.doc, cuelistId);
    if (!cl) return;
    conn.doc.transact(() => {
      const ph = cl.get('playhead') as any;
      cl.set('playhead', { ...ph, cue_id: cueId });
    });
  };

  const setArmed = (cueId: string | null) => {
    const cl = getCuelist(conn.doc, cuelistId);
    if (!cl) return;
    conn.doc.transact(() => {
      const ph = cl.get('playhead') as any;
      cl.set('playhead', { ...ph, armed_cue_id: cueId });
    });
  };

  const advance = () => {
    const idx = cues.findIndex(c => c.id === playheadCueId);
    const next = cues[idx + 1] ?? cues[0];
    if (next) setPlayhead(next.id);
  };
  const retreat = () => {
    const idx = cues.findIndex(c => c.id === playheadCueId);
    const prev = idx > 0 ? cues[idx - 1] : cues[cues.length - 1];
    if (prev) setPlayhead(prev.id);
  };
  const arm = (cueId: string) => setArmed(cueId);
  const unarm = () => setArmed(null);

  return { playheadCueId, armedCueId, advance, retreat, arm, unarm };
}
```

### StandbyPanel (full)

```tsx
export function StandbyPanel({ cuelistId, armedCueId, cues, onStandby }: { cuelistId: string; armedCueId: string | null; cues: Cue[]; onStandby: (cueId: string) => void }) {
  const armed = cues.find(c => c.id === armedCueId);
  const playheadIdx = cues.findIndex(c => c.id === armedCueId);
  const next3 = playheadIdx >= 0 ? cues.slice(playheadIdx + 1, playheadIdx + 4) : cues.slice(0, 3);

  return (
    <section role="status" aria-live="polite" style={{
      background: tokens.color.gray_50, borderTop: `2px solid ${tokens.color.ink}`,
      padding: tokens.space.l,
    }}>
      {armed && (
        <div style={{
          fontSize: 28, fontWeight: 700, color: tokens.color.red,
          animation: 'pulse 1.5s infinite',
        }}>
          STANDBY {armed.label} — {armed.standby_note}
        </div>
      )}
      <div style={{ display: 'flex', gap: tokens.space.m, marginTop: tokens.space.m, overflowX: 'auto' }}>
        {next3.map(c => (
          <button
            key={c.id}
            onClick={() => onStandby(c.id)}
            style={{ padding: tokens.space.m, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s, minWidth: 180 }}
            aria-label={`Arm cue ${c.label}`}
          >
            <div style={{ fontWeight: 700 }}>{c.label}</div>
            <div style={{ fontSize: 12, color: tokens.color.gray_700 }}>{c.standby_note}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
```

### GoConfirmDialog (override)

```tsx
export function GoConfirmDialog({ cue, onConfirm, onCancel }: { cue: Cue; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={dialogStyle}>
        <h2>Override fire?</h2>
        <p>Fire cue <strong>{cue.label}</strong> bypassing authority check?</p>
        <p>Use only for emergency / SM intervention. This is logged.</p>
        <div style={{ display: 'flex', gap: tokens.space.m }}>
          <button onClick={onConfirm} style={{ background: tokens.color.red, color: tokens.color.cream }}>Override fire</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

### HelpOverlay

```tsx
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div role="dialog" aria-label="Keyboard shortcuts" style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle}>
        <h2>Keyboard shortcuts</h2>
        <dl>
          <dt>Space</dt><dd>GO — fire armed cue</dd>
          <dt>Q</dt><dd>Standby — arm playhead cue</dd>
          <dt>↑ / ↓</dt><dd>Navigate playhead</dd>
          <dt>Esc</dt><dd>Unarm current cue</dd>
          <dt>Cmd+Shift+G (long-press)</dt><dd>Override fire</dd>
          <dt>?</dt><dd>This help</dd>
        </dl>
      </div>
    </div>
  );
}
```

### Composition

`SMMasterView` (B003-013) composes GoButton + StandbyPanel at the bottom. Wire `armedCueId` from `usePlayhead`, `onGo` from `useGoChannel.go`, `onOverride` to open GoConfirmDialog.

## Test plan

### `GoButton.test.tsx`

1. armedCueId=null → button disabled, label "GO — no armed cue".
2. armedCueId set → button enabled, label includes cue label.
3. Click triggers onGo callback; flash animation toggles.
4. SHOW mode background red; REHEARSAL teal.
5. rejectedReason set → button shake animation.
6. Long-press 1.5s triggers onOverride.
7. Non-authoritative + sm_called authority → button disabled.
8. Touch start/end mirrors mouse handlers.

### `StandbyPanel.test.tsx`

9. armedCueId null → no red banner; shows next cues.
10. armedCueId set → red "STANDBY <label>" pulsing.
11. Renders next 3 cues from playhead.
12. Clicking next-cue button calls onStandby with cueId.
13. role="status" aria-live="polite".

### `usePlayhead.test.tsx`

14. advance moves to next cue; wraps at end.
15. retreat moves to prev; wraps at beginning.
16. arm + unarm update Yjs cuelist.playhead.armed_cue_id.
17. setPlayhead updates Yjs cuelist.playhead.cue_id.
18. Two stations: playhead changes propagate via Yjs.

### Override flow

19. Override click opens GoConfirmDialog.
20. Confirm in dialog triggers go() with override=true.
21. Cancel closes dialog without firing.

## Out of scope

- Per-department GO button (B003-014 already has GO buttons in operator views — those are per-cue rows).
- Pyro fire double-tap (B003-014 PyroOperatorView).
- LTC sync display (post-MVP).
- Soft GO (rehearsal-only fire) (post-MVP).
- Multi-cuelist tab switching (post-MVP).
- Cue editor (B003-016).
- GO history sidebar (post-MVP).

## Notes for Critic

- Verify GO button is DISABLED when no armed cue (prevent accidental fires).
- Verify GO button is DISABLED when station is non-SM + cuelist.go_authority='sm_called'.
- Confirm override requires either 1.5s long-press OR Cmd+Shift+G — not just click.
- Confirm override opens a confirmation dialog (not immediate fire).
- Verify button shake animation on rejection (UX feedback).
- Confirm Spacebar focus handling — don't fire when focus is in search box / text input.
- Verify playhead updates persist via Yjs cuelist.playhead (so other stations see same NOW position).
- Confirm playhead.armed_cue_id resets to null on doc reload per data_model.md §2.4 (B003-002 handles this on load).
- Verify aria-live=polite for standby announcements (screen reader compatibility).
- Watch for keyboard accessibility — Tab order should reach GO button, Enter activates equally to Space.
