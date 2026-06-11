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
  let bg: string = tokens.color.bg;
  if (isFiring) bg = tokens.color.green;
  else if (isPlayhead) bg = tokens.color.playhead_bg;

  const isCompound = cue.department.length > 1;
  const deptTag = cue.department.length === 1 ? cue.department[0] : undefined;

  return (
    <div
      role="row"
      aria-selected={isPlayhead}
      data-testid="cue-row"
      data-cue-type={isCompound ? 'compound' : deptTag}
      onClick={onSelect}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '8px 80px 1fr auto auto auto',
        gap: tokens.space.m,
        alignItems: 'center',
        padding: `${tokens.space.m}px ${tokens.space.l}px`,
        paddingLeft: tokens.space.xl,
        borderBottom: `1px solid ${tokens.color.border}`,
        borderLeft: isArmed ? `4px solid ${tokens.color.red}` : undefined,
        background: bg,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <PlayheadIndicator visible={isPlayhead} />
      <DepartmentSideBar departments={cue.department} />
      <div
        data-testid="cue-label"
        style={{
          fontSize: 24,
          fontWeight: 700,
          fontFamily: tokens.font.ui,
          color: isFiring ? tokens.color.bg : tokens.color.ink,
        }}
      >
        {cue.label}
        {isFiring && (
          <span
            data-testid="cue-fire-animation"
            aria-label="Firing"
            style={{ marginLeft: 8, fontSize: 14, color: tokens.color.bg }}
          >
            ●
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 16, color: tokens.color.ink }}>{cue.description}</div>
        {cue.standby_note && (
          <div style={{ fontStyle: 'italic', color: tokens.color.ink_secondary, fontSize: 14 }}>
            {cue.standby_note}
          </div>
        )}
        <div
          data-testid="payload-summary"
          style={{ fontSize: 12, color: tokens.color.ink_secondary, marginTop: 2 }}
        >
          {cue.payloads.length > 0
            ? `${cue.payloads.length} payload${cue.payloads.length > 1 ? 's' : ''} — ${cue.payloads.map((p) => ('cue_number' in p ? `cue ${(p as { cue_number: number }).cue_number}` : '')).filter(Boolean).join(', ')}`
            : ''}
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
