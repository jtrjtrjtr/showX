import type { Cue } from 'showx-shared';
import type { ShowMode } from 'showx-shared';
import type { StationAwareness } from '../../lib/awareness.js';
import { tokens } from './tokens.js';
import { CueTypeBadge } from './CueTypeBadge.js';
import { DepartmentChips, DepartmentSideBar } from './DepartmentChips.js';
import { OperatorPresenceIndicators } from './OperatorPresenceIndicators.js';
import { PlayheadIndicator } from './PlayheadIndicator.js';

export interface CueRowProps {
  cue: Cue;
  isPlayhead: boolean;
  isArmed: boolean;
  isFiring: boolean;
  onSelect: () => void;
  stations: StationAwareness[];
  mode: ShowMode;
}

export function CueRow({ cue, isPlayhead, isArmed, isFiring, onSelect, stations, mode }: CueRowProps) {
  let bg: string = tokens.color.cream;
  if (isFiring) bg = tokens.color.green;
  else if (isPlayhead) bg = tokens.color.teal_dim;

  return (
    <div
      role="row"
      aria-selected={isPlayhead}
      onClick={onSelect}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '8px 80px 1fr auto auto auto',
        gap: tokens.space.m,
        alignItems: 'center',
        padding: `${tokens.space.m}px ${tokens.space.l}px`,
        paddingLeft: tokens.space.xl,
        borderBottom: `1px solid ${tokens.color.gray_300}`,
        background: bg,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <PlayheadIndicator visible={isPlayhead} />
      <DepartmentSideBar departments={cue.department} />
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: tokens.font.ui }}>
        {cue.label}
      </div>
      <div>
        <div style={{ fontSize: 16, color: tokens.color.ink }}>{cue.description}</div>
        {cue.standby_note && (
          <div style={{ fontStyle: 'italic', color: tokens.color.gray_700, fontSize: 14 }}>
            {cue.standby_note}
          </div>
        )}
        <div style={{ fontSize: 12, color: tokens.color.gray_700, marginTop: 2 }}>
          {cue.payloads.length > 0 && `${cue.payloads.length} payload${cue.payloads.length > 1 ? 's' : ''}`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s, alignItems: 'flex-end' }}>
        <CueTypeBadge trigger={cue.trigger} />
        <DepartmentChips departments={cue.department} />
        {mode === 'show' && (
          <span aria-label="Payload locked" title="Payload locked" style={{ fontSize: 14 }}>🔒</span>
        )}
        {isArmed && (
          <span
            aria-label="Armed"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: tokens.color.red,
              border: `1px solid ${tokens.color.red}`,
              borderRadius: tokens.radius.s,
              padding: '2px 6px',
            }}
          >
            STBY
          </span>
        )}
      </div>
      <OperatorPresenceIndicators stations={stations} />
    </div>
  );
}
