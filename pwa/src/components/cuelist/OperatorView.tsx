import React, { useEffect } from 'react';
import { LxOperatorView } from './variants/LxOperatorView.js';
import { SxOperatorView } from './variants/SxOperatorView.js';
import { VideoOperatorView } from './variants/VideoOperatorView.js';
import { AutoOperatorView } from './variants/AutoOperatorView.js';
import { PyroOperatorView } from './variants/PyroOperatorView.js';
import { FsOperatorView } from './variants/FsOperatorView.js';
import { GenericOperatorView } from './variants/GenericOperatorView.js';
import { usePlayhead } from '../../hooks/usePlayhead.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { tokens } from './tokens.js';

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
        background: smOnline ? tokens.color.teal_dim : tokens.color.gray_50,
        borderBottom: `1px solid ${smOnline ? tokens.color.teal : tokens.color.gray_300}`,
        fontSize: 11,
        color: smOnline ? tokens.color.ink : tokens.color.gray_700,
        fontFamily: tokens.font.ui,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.s,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          background: smOnline ? tokens.color.teal : tokens.color.gray_300,
          color: '#fff',
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

export function OperatorView({ cuelistId, owned, watched }: OperatorViewProps) {
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
      <PlayheadBanner cuelistId={cuelistId} />
      {renderVariant()}
    </div>
  );
}
