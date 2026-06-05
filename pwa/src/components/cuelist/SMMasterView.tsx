import { useState, useMemo, useCallback } from 'react';
import type { Cue } from 'showx-shared';
import { useCuelist } from '../../hooks/useCuelist.js';
import { useMode } from '../../hooks/useMode.js';
import { useStations } from '../../hooks/useStations.js';
import { useGoChannel } from '../../hooks/useGoChannel.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { tokens } from './tokens.js';
import { CueRow } from './CueRow.js';
import { StandbyPanel } from './StandbyPanel.js';
import { CallingText } from './CallingText.js';

interface SMMasterViewProps {
  cuelistId: string;
}

function getNextCues(cues: Cue[], playheadCueId: string | null, count: number): Cue[] {
  if (!playheadCueId) return cues.slice(0, count);
  const idx = cues.findIndex((c) => c.id === playheadCueId);
  if (idx < 0) return cues.slice(0, count);
  return cues.slice(idx + 1, idx + 1 + count);
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.space.xxl,
        color: tokens.color.gray_700,
        gap: tokens.space.l,
      }}
    >
      <div style={{ fontSize: 18 }}>No cues yet — click + to add</div>
      <button
        aria-label="Add first cue"
        style={{
          padding: `${tokens.space.m}px ${tokens.space.xl}px`,
          background: tokens.color.teal,
          color: '#fff',
          border: 'none',
          borderRadius: tokens.radius.m,
          fontSize: 16,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        + Add cue
      </button>
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(27,26,24,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: tokens.color.cream,
          padding: tokens.space.xxl,
          borderRadius: tokens.radius.l,
          minWidth: 300,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Keyboard shortcuts</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['Space', 'GO (fire armed cue)'],
              ['Q', 'Standby next cue'],
              ['↑ / ↓', 'Navigate playhead'],
              ['Enter', 'Focus selected cue'],
              ['?', 'Show this help'],
            ].map(([key, desc]) => (
              <tr key={key}>
                <td style={{ padding: '4px 12px 4px 0', fontFamily: tokens.font.mono, fontWeight: 600 }}>{key}</td>
                <td style={{ padding: '4px 0', color: tokens.color.gray_700 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={onClose}
          style={{
            marginTop: tokens.space.l,
            padding: `${tokens.space.s}px ${tokens.space.l}px`,
            background: tokens.color.teal,
            color: '#fff',
            border: 'none',
            borderRadius: tokens.radius.s,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function SMMasterView({ cuelistId }: SMMasterViewProps) {
  const { cuelist, cues } = useCuelist(cuelistId);
  const { mode } = useMode();
  const stations = useStations();
  const { go, standby, lastDispatched } = useGoChannel(cuelistId);

  const [playheadCueId, setPlayheadCueId] = useState<string | null>(
    cuelist?.playhead?.cue_id ?? null,
  );
  const [armedCueId, setArmedCueId] = useState<string | null>(
    cuelist?.playhead?.armed_cue_id ?? null,
  );
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const navPlayhead = useCallback(
    (delta: number) => {
      setPlayheadCueId((prev) => {
        if (cues.length === 0) return prev;
        const idx = prev ? cues.findIndex((c) => c.id === prev) : -1;
        const next = Math.max(0, Math.min(cues.length - 1, idx + delta));
        return cues[next]?.id ?? prev;
      });
    },
    [cues],
  );

  const shortcuts = useMemo(
    () => ({
      Space: () => {
        if (armedCueId) go(armedCueId);
      },
      KeyQ: () => {
        if (playheadCueId) {
          standby(playheadCueId);
          setArmedCueId(playheadCueId);
        }
      },
      ArrowUp: () => navPlayhead(-1),
      ArrowDown: () => navPlayhead(+1),
      Enter: () => {
        // focus event already handled by onClick on CueRow; here just a noop
      },
      Slash: () => setShowHelp((v) => !v),
    }),
    [armedCueId, playheadCueId, go, standby, navPlayhead],
  );

  useKeyboardShortcuts(shortcuts);

  const filtered = useMemo(() => {
    if (!search) return cues;
    const q = search.toLowerCase();
    return cues.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [cues, search]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: tokens.color.cream,
        fontFamily: tokens.font.ui,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: `${tokens.space.m}px ${tokens.space.l}px`,
          borderBottom: `1px solid ${tokens.color.gray_300}`,
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space.l,
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          {cuelist?.name ?? 'Cuelist'}
        </h1>
        <input
          type="search"
          placeholder="Search cues…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search cues"
          style={{
            padding: `${tokens.space.s}px ${tokens.space.m}px`,
            border: `1px solid ${tokens.color.gray_300}`,
            borderRadius: tokens.radius.m,
            fontSize: 14,
            background: '#fff',
            flex: 1,
            maxWidth: 320,
          }}
        />
        <button
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShowHelp(true)}
          style={{
            background: 'none',
            border: `1px solid ${tokens.color.gray_300}`,
            borderRadius: tokens.radius.s,
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          ?
        </button>
      </header>

      <main
        role="grid"
        aria-label="Cue list"
        style={{ flex: 1, overflowY: 'auto', padding: 0 }}
      >
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          filtered.map((cue) => (
            <CueRow
              key={cue.id}
              cue={cue}
              isPlayhead={cue.id === playheadCueId}
              isArmed={cue.id === armedCueId}
              isFiring={
                lastDispatched?.cue_id === cue.id &&
                Date.now() - new Date(lastDispatched.dispatched_at).getTime() < 2000
              }
              onSelect={() => setPlayheadCueId(cue.id)}
              stations={stations.filter((s) => s.cursor.cue_id === cue.id)}
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
      <CallingText
        armedCue={armedCueId ? (cues.find((c) => c.id === armedCueId) ?? null) : null}
        lastFired={lastDispatched}
      />

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
