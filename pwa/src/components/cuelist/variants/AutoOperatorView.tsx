import { useState, useMemo, useCallback } from 'react';
import type { FilterContext } from '../../../hooks/useDepartment.js';
import { useDepartment } from '../../../hooks/useDepartment.js';
import { useGoChannel } from '../../../hooks/useGoChannel.js';
import { useCuelist } from '../../../hooks/useCuelist.js';
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts.js';
import { OperatorCueRow } from '../OperatorCueRow.js';
import { automationPosSummary } from '../payloadSummaries.js';
import { tokens } from '../tokens.js';

interface AutoOperatorViewProps {
  cuelistId: string;
  watched: string[];
}

const OWNED_SET = new Set(['AUTO']);

export function AutoOperatorView({ cuelistId, watched }: AutoOperatorViewProps) {
  const watchedKey = watched.slice().sort().join(',');
  const ctx = useMemo<FilterContext>(
    () => ({ owned: OWNED_SET, watched: new Set(watched) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [watchedKey],
  );
  const { visible, actionable } = useDepartment(cuelistId, ctx);
  const { go, standby } = useGoChannel(cuelistId);
  const { cuelist } = useCuelist(cuelistId);
  const goLabel = cuelist?.go_authority === 'per_dept' ? 'GO' : 'Confirm';

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
      Space: () => {
        if (selectedId && actionable.has(selectedId)) void go(selectedId);
      },
      KeyQ: () => {
        if (selectedId && actionable.has(selectedId)) standby(selectedId);
      },
      ArrowUp: () => navDelta(-1),
      ArrowDown: () => navDelta(1),
    }),
    [selectedId, actionable, go, standby, navDelta],
  );
  useKeyboardShortcuts(shortcuts);

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
        style={{
          padding: `${tokens.space.m}px ${tokens.space.l}px`,
          borderBottom: `1px solid ${tokens.color.gray_300}`,
          background: tokens.color.dept['AUTO'],
          color: '#fff',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>AUTO</h2>
      </header>
      <div
        role="grid"
        aria-label="AUTO operator view"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {visible.map((c) => (
          <OperatorCueRow
            key={c.id}
            cue={c}
            isActionable={actionable.has(c.id)}
            owned={OWNED_SET}
            extraColumns={[{ label: 'Position', content: automationPosSummary(c) }]}
            goLabel={goLabel}
            onGo={() => { void go(c.id); }}
            onStandby={() => standby(c.id)}
            isSelected={c.id === selectedId}
            onSelect={() => setSelectedId(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
