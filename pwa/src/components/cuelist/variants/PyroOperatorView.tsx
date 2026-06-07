import { useState, useMemo, useCallback } from 'react';
import type { Cue } from 'showx-shared';
import type { FilterContext } from '../../../hooks/useDepartment.js';
import { useDepartment } from '../../../hooks/useDepartment.js';
import { useGoChannel } from '../../../hooks/useGoChannel.js';
import { useCuelist } from '../../../hooks/useCuelist.js';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts.js';
import { pyroChargeRef } from '../payloadSummaries.js';
import { tokens } from '../tokens.js';

interface PyroOperatorViewProps {
  cuelistId: string;
  watched: string[];
}

interface PyroCueRowProps {
  cue: Cue;
  isActionable: boolean;
  isArmed: boolean;
  isSelected: boolean;
  onArm: () => void;
  onFire: () => void;
  onSelect: () => void;
}

function PyroCueRow({ cue, isActionable, isArmed, isSelected, onArm, onFire, onSelect }: PyroCueRowProps) {
  return (
    <div
      role="row"
      aria-label={`Cue ${cue.label}`}
      aria-selected={isSelected}
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr auto auto auto',
        gap: tokens.space.m,
        opacity: isActionable ? 1 : 0.4,
        padding: tokens.space.m,
        borderBottom: `1px solid ${tokens.color.gray_300}`,
        background: isArmed ? '#fff0f0' : isSelected ? tokens.color.teal_dim : tokens.color.cream,
        alignItems: 'center',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700 }}>{cue.label}</div>
      <div>
        <div style={{ fontWeight: 600, color: tokens.color.red }}>
          Charge: {pyroChargeRef(cue)}
        </div>
        {cue.description && (
          <div style={{ fontSize: 14, color: tokens.color.gray_700 }}>{cue.description}</div>
        )}
      </div>
      <div
        aria-label="Arm state"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: isArmed ? tokens.color.red : tokens.color.gray_700,
          border: `1px solid ${isArmed ? tokens.color.red : tokens.color.gray_300}`,
          borderRadius: tokens.radius.s,
          padding: '2px 8px',
          textAlign: 'center',
        }}
      >
        {isArmed ? 'ARMED' : 'SAFE'}
      </div>
      <button
        aria-label={`Arm ${cue.label}`}
        onClick={onArm}
        disabled={!isActionable || isArmed}
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: tokens.color.yellow,
          color: tokens.color.ink,
          border: 'none',
          borderRadius: tokens.radius.s,
          fontWeight: 600,
          cursor: isActionable && !isArmed ? 'pointer' : 'default',
        }}
      >
        Arm
      </button>
      <button
        aria-label={`Fire ${cue.label}`}
        onClick={onFire}
        disabled={!isActionable || !isArmed}
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: isActionable && isArmed ? tokens.color.red : tokens.color.gray_300,
          color: isActionable && isArmed ? '#fff' : tokens.color.gray_700,
          border: 'none',
          borderRadius: tokens.radius.s,
          fontWeight: 700,
          cursor: isActionable && isArmed ? 'pointer' : 'default',
        }}
      >
        Fire
      </button>
    </div>
  );
}

const OWNED_SET = new Set(['PYRO']);

export function PyroOperatorView({ cuelistId, watched }: PyroOperatorViewProps) {
  const watchedKey = watched.slice().sort().join(',');
  const ctx = useMemo<FilterContext>(
    () => ({ owned: OWNED_SET, watched: new Set(watched) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedKey],
  );
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  const { go, standby } = useGoChannel(cuelistId);
  const { cuelist } = useCuelist(cuelistId);
  const isSmCalled = (cuelist?.go_authority ?? 'sm_called') === 'sm_called';

  const [armed, setArmed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const navDelta = useCallback(
    (delta: number) => {
      setSelectedId((prev) => {
        if (visible.length === 0) return prev;
        const idx = prev ? visible.findIndex((c) => c.id === prev) : -1;
        const next = Math.max(0, Math.min(visible.length - 1, idx + delta));
        return visible[next]?.id ?? prev;
      });
    },
    [visible],
  );

  const shortcuts = useMemo(
    () => ({
      ArrowUp: () => navDelta(-1),
      ArrowDown: () => navDelta(1),
    }),
    [navDelta],
  );
  useKeyboardShortcuts(shortcuts);

  const handleArm = useCallback((cueId: string) => {
    setArmed((prev) => new Set(prev).add(cueId));
    standby(cueId);
  }, [standby]);

  const handleFire = useCallback(
    (cueId: string) => {
      if (!armed.has(cueId)) return;
      void go(cueId);
      setArmed((prev) => {
        const next = new Set(prev);
        next.delete(cueId);
        return next;
      });
    },
    [armed, go],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: tokens.font.ui,
      }}
    >
      <header
        aria-label="PYRO safety header"
        style={{
          padding: `${tokens.space.l}px`,
          background: tokens.color.red,
          color: '#fff',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>PYRO — DOUBLE-TAP FIRE</h2>
        <p style={{ margin: `${tokens.space.s}px 0 0`, fontSize: 14 }}>
          SM must call standby. Operator must Arm then Fire to confirm.
        </p>
      </header>
      <div
        role="grid"
        aria-label="PYRO operator view"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {visible.map((c) => (
          <PyroCueRow
            key={c.id}
            cue={c}
            isActionable={actionable.has(c.id) && isSmCalled}
            isArmed={armed.has(c.id)}
            isSelected={c.id === selectedId}
            onArm={() => handleArm(c.id)}
            onFire={() => handleFire(c.id)}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
