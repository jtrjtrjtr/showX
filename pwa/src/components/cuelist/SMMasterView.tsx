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
        color: tokens.color.ink_secondary,
        gap: tokens.space.l,
      }}
    >
      <div style={{ fontSize: 18, color: tokens.color.ink_secondary }}>No cues yet — click + to add</div>
      <button
        aria-label="Add first cue"
        style={{
          padding: `${tokens.space.m}px ${tokens.space.xl}px`,
          background: tokens.color.teal,
          color: tokens.color.bg,
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
  const { mode, transition } = useMode();
  const stations = useStations();
  const { go, standby, lastDispatched, lastHistoric } = useGoChannel(cuelistId);
  const { playheadCueId, armedCueId, setPlayhead, advance, retreat, arm, unarm, smOnline } =
    usePlayhead(cuelistId);

  // Declare this station as SM in awareness so all stations can identify the authority
  useEffect(() => {
    conn.awareness.setLocalStateField('role', 'sm');
  }, [conn.awareness]);

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
        background: tokens.color.bg,
        fontFamily: tokens.font.ui,
        overflow: 'hidden',
        color: tokens.color.ink,
      }}
    >
      <header
        style={{
          padding: `${tokens.space.m}px ${tokens.space.l}px`,
          borderBottom: `1px solid ${tokens.color.border}`,
          background: tokens.color.panel,
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space.l,
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: tokens.color.ink }}>
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
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.m,
            fontSize: 14,
            background: tokens.color.raised,
            color: tokens.color.ink,
            flex: 1,
            maxWidth: 320,
          }}
        />
        <button
          data-testid="mode-badge"
          aria-label={`Current mode: ${mode}. Click to toggle`}
          onClick={() => transition(mode === 'rehearsal' ? 'show' : 'rehearsal')}
          style={{
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            borderRadius: tokens.radius.s,
            border: `1px solid ${mode === 'show' ? tokens.color.red : tokens.color.teal}`,
            background: mode === 'show' ? tokens.color.red : tokens.color.teal,
            color: tokens.color.white,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {mode === 'show' ? 'SHOW' : 'REHEARSAL'}
        </button>
        <button
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          onClick={() => setShowHelp(true)}
          style={{
            background: 'none',
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.s,
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            cursor: 'pointer',
            fontSize: 13,
            color: tokens.color.ink,
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
      {!smOnline && (
        <div
          data-testid="sm-offline-indicator"
          aria-live="polite"
          style={{
            padding: `${tokens.space.xs}px ${tokens.space.m}px`,
            background: tokens.color.panel,
            borderTop: `1px solid ${tokens.color.border}`,
            fontSize: 11,
            color: tokens.color.ink_secondary,
            textAlign: 'center',
            fontFamily: tokens.font.ui,
          }}
        >
          SM offline — playhead frozen
        </div>
      )}
      <div style={{ padding: tokens.space.m, flexShrink: 0 }}>
        {displayReason && (
          <div
            data-testid="go-rejected-toast"
            role="alert"
            aria-live="assertive"
            style={{
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              marginBottom: tokens.space.s,
              background: tokens.color.red,
              color: tokens.color.white,
              borderRadius: tokens.radius.m,
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            Rejected: {displayReason}
          </div>
        )}
        {lastHistoric && (
          <div
            data-testid="cue-history-marker"
            aria-live="polite"
            style={{
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              marginBottom: tokens.space.s,
              background: tokens.color.panel,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.m,
              fontSize: 12,
              color: tokens.color.ink_secondary,
            }}
          >
            Missed: {lastHistoric.cue_id}
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
