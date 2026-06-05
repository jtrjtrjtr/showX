import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Cue } from 'showx-shared';
import { useCuelist } from '../../hooks/useCuelist.js';
import { useMode } from '../../hooks/useMode.js';
import { useStations } from '../../hooks/useStations.js';
import { useGoChannel } from '../../hooks/useGoChannel.js';
import { usePlayhead } from '../../hooks/usePlayhead.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { tokens } from './tokens.js';
import { CueRow } from './CueRow.js';
import { StandbyPanel } from './StandbyPanel.js';
import { CallingText } from './CallingText.js';
import { GoButton } from './GoButton.js';
import { GoConfirmDialog } from './GoConfirmDialog.js';
import { HelpOverlay } from './HelpOverlay.js';

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

export function SMMasterView({ cuelistId }: SMMasterViewProps) {
  const conn = useConnection();
  const { cuelist, cues } = useCuelist(cuelistId);
  const { mode } = useMode();
  const stations = useStations();
  const { go, standby, lastDispatched } = useGoChannel(cuelistId);
  const { playheadCueId, armedCueId, setPlayhead, advance, retreat, arm, unarm } =
    usePlayhead(cuelistId);

  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const rejectionSeqRef = useRef(0);

  // Subscribe to go.rejected events — encode seq so even same reason re-triggers shake
  useEffect(() => {
    return conn.sideChannel.on('go.rejected', (event) => {
      rejectionSeqRef.current += 1;
      const key = `${event.reason}:${rejectionSeqRef.current}`;
      setRejectedReason(key);
      const t = setTimeout(() => setRejectedReason(null), 2000);
      return () => clearTimeout(t);
    });
  }, [conn.sideChannel]);

  // Cmd+Shift+G emergency override shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.code === 'KeyG') {
        e.preventDefault();
        if (armedCueId) setShowConfirmDialog(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedCueId]);

  const shortcuts = useMemo(
    () => ({
      Space: () => {
        if (armedCueId) go(armedCueId);
      },
      KeyQ: () => {
        if (playheadCueId) {
          standby(playheadCueId);
          arm(playheadCueId);
        }
      },
      ArrowUp: () => retreat(),
      ArrowDown: () => advance(),
      Escape: () => unarm(),
      Slash: () => setShowHelp((v) => !v),
    }),
    [armedCueId, playheadCueId, go, standby, arm, unarm, advance, retreat],
  );

  useKeyboardShortcuts(shortcuts);

  const filtered = useMemo(() => {
    if (!search) return cues;
    const q = search.toLowerCase();
    return cues.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [cues, search]);

  const armedCue = armedCueId ? (cues.find((c) => c.id === armedCueId) ?? null) : null;
  // Strip the :seq counter suffix before display
  const displayReason = rejectedReason ? rejectedReason.replace(/:\d+$/, '') : null;

  const handleGoOverride = useCallback(() => {
    if (armedCueId) setShowConfirmDialog(true);
  }, [armedCueId]);

  const handleConfirmOverride = useCallback(() => {
    if (armedCueId) go(armedCueId, true);
    setShowConfirmDialog(false);
  }, [armedCueId, go]);

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
              onSelect={() => setPlayhead(cue.id)}
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
        onStandby={(cueId) => {
          standby(cueId);
          arm(cueId);
        }}
      />
      <CallingText armedCue={armedCue} lastFired={lastDispatched} />
      <div style={{ padding: tokens.space.m, flexShrink: 0 }}>
        {displayReason && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              marginBottom: tokens.space.s,
              background: tokens.color.red,
              color: '#fff',
              borderRadius: tokens.radius.m,
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            Rejected: {displayReason}
          </div>
        )}
        <GoButton
          armedCueId={armedCueId}
          cueLabel={armedCue?.label}
          mode={mode}
          onGo={() => (armedCueId ? go(armedCueId) : '')}
          onOverride={handleGoOverride}
          rejectedReason={rejectedReason}
          isAuthoritative={true}
        />
      </div>

      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {showConfirmDialog && armedCue && (
        <GoConfirmDialog
          cue={armedCue}
          onConfirm={handleConfirmOverride}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}
    </div>
  );
}
