import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { LxOperatorView } from './variants/LxOperatorView.js';
import { SxOperatorView } from './variants/SxOperatorView.js';
import { VideoOperatorView } from './variants/VideoOperatorView.js';
import { AutoOperatorView } from './variants/AutoOperatorView.js';
import { PyroOperatorView } from './variants/PyroOperatorView.js';
import { FsOperatorView } from './variants/FsOperatorView.js';
import { GenericOperatorView } from './variants/GenericOperatorView.js';
import { usePlayhead } from '../../hooks/usePlayhead.js';
import { useCuelist } from '../../hooks/useCuelist.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { tokens } from './tokens.js';
import { TimecodeDisplay } from './TimecodeDisplay.js';
import { OperatorStandbyAlert } from './StandbyPanel.js';

export interface OperatorViewProps {
  cuelistId: string;
  owned: string[];
  watched: string[];
}

function PlayheadBanner({ cuelistId }: { cuelistId: string }) {
  const conn = useConnection();
  const { playhead, smOnline } = usePlayhead(cuelistId);

  // Operator stations are not SM — declare role in awareness
  useEffect(() => {
    conn.awareness.setLocalStateField('role', 'operator');
  }, [conn.awareness]);

  if (!playhead?.cue_id) return null;

  return (
    <div
      aria-live="polite"
      data-testid="operator-playhead-banner"
      style={{
        padding: `${tokens.space.xs}px ${tokens.space.m}px`,
        background: smOnline ? tokens.color.teal_dim : tokens.color.panel,
        borderBottom: `1px solid ${smOnline ? tokens.color.teal : tokens.color.border}`,
        fontSize: 11,
        color: smOnline ? tokens.color.ink : tokens.color.ink_secondary,
        fontFamily: tokens.font.ui,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.s,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          background: smOnline ? tokens.color.teal : tokens.color.border,
          color: tokens.color.white,
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 4px',
          borderRadius: tokens.radius.s,
        }}
      >
        NOW
      </span>
      <span>
        Cue: {playhead.cue_id}
        {!smOnline && ' — SM offline, playhead frozen'}
      </span>
    </div>
  );
}

interface ActiveStandby {
  cue_id: string;
  cuelist_id: string;
  department: string;
}

export function OperatorView({ cuelistId, owned, watched }: OperatorViewProps) {
  const conn = useConnection();
  const { cues } = useCuelist(cuelistId);

  const [pendingStandby, setPendingStandby] = useState<ActiveStandby | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Stable ref for owned set so the subscription effect doesn't re-fire on every render
  const ownedSetRef = useRef(new Set(owned));
  useEffect(() => { ownedSetRef.current = new Set(owned); }, [owned]);

  // Subscribe to standby.broadcast — filter to owned departments only
  useEffect(() => {
    return conn.sideChannel.on('standby.broadcast', (event) => {
      const matchDept = event.departments.find((d) => ownedSetRef.current.has(d));
      if (!matchDept) return;
      if (event.standby) {
        setPendingStandby({ cue_id: event.cue_id, cuelist_id: event.cuelist_id, department: matchDept });
        setAcknowledged(false);
      } else {
        setPendingStandby((ps) => (ps?.cue_id === event.cue_id ? null : ps));
        setAcknowledged(false);
      }
    });
  }, [conn.sideChannel]);

  // Clear standby alert on GO
  useEffect(() => {
    return conn.sideChannel.on('go.dispatched', () => {
      setPendingStandby(null);
      setAcknowledged(false);
    });
  }, [conn.sideChannel]);

  const handleAcknowledge = useCallback(() => {
    if (!pendingStandby) return;
    conn.sideChannel.sendAcknowledgeRequest(
      pendingStandby.cuelist_id,
      pendingStandby.cue_id,
      pendingStandby.department,
    );
    setAcknowledged(true);
  }, [conn.sideChannel, pendingStandby]);

  const cueLabel = useMemo(
    () => (pendingStandby ? (cues.find((c) => c.id === pendingStandby.cue_id)?.label ?? pendingStandby.cue_id) : null),
    [pendingStandby, cues],
  );

  function renderVariant() {
    if (owned.length === 1) {
      switch (owned[0]) {
        case 'LX':
          return <LxOperatorView cuelistId={cuelistId} watched={watched} />;
        case 'SX':
          return <SxOperatorView cuelistId={cuelistId} watched={watched} />;
        case 'VIDEO':
          return <VideoOperatorView cuelistId={cuelistId} watched={watched} />;
        case 'AUTO':
          return <AutoOperatorView cuelistId={cuelistId} watched={watched} />;
        case 'PYRO':
          return <PyroOperatorView cuelistId={cuelistId} watched={watched} />;
        case 'FS':
          return <FsOperatorView cuelistId={cuelistId} watched={watched} />;
      }
    }
    return <GenericOperatorView cuelistId={cuelistId} owned={owned} watched={watched} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        data-testid="operator-tc-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `${tokens.space.xs}px ${tokens.space.m}px`,
          borderBottom: `1px solid ${tokens.color.border}`,
          background: tokens.color.panel,
          flexShrink: 0,
        }}
      >
        <TimecodeDisplay size={32} />
      </div>
      <PlayheadBanner cuelistId={cuelistId} />
      {pendingStandby && (
        <OperatorStandbyAlert
          cueLabel={cueLabel}
          department={pendingStandby.department}
          acknowledged={acknowledged}
          onAcknowledge={handleAcknowledge}
        />
      )}
      {renderVariant()}
    </div>
  );
}
