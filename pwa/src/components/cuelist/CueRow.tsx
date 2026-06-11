import { useRef, useCallback } from 'react';
import type { Cue, Trigger } from 'showx-shared';
import type { ShowMode } from 'showx-shared';
import type { StationAwareness } from '../../lib/awareness.js';
import { tokens } from './tokens.js';
import { CueTypeBadge } from './CueTypeBadge.js';
import { DepartmentChips, DepartmentSideBar } from './DepartmentChips.js';
import { OperatorPresenceIndicators } from './OperatorPresenceIndicators.js';
import { PlayheadIndicator } from './PlayheadIndicator.js';
import { TriggerCell } from './TriggerCell.js';

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalSecs = ms / 1000;
  const minutes = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${secs}`;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_THRESHOLD = 10;

export interface CueRowProps {
  cue: Cue;
  isPlayhead: boolean;
  isArmed: boolean;
  isFiring: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  stations: StationAwareness[];
  mode: ShowMode;
  cues?: Cue[];
  onTriggerUpdate?: (trigger: Trigger) => void;
}

export function CueRow({ cue, isPlayhead, isArmed, isFiring, onSelect, onEdit, stations, mode, cues = [], onTriggerUpdate }: CueRowProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    clearLongPress();
    longPressFiredRef.current = false;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (onEdit && mode === 'rehearsal') {
        longPressFiredRef.current = true;
        onEdit();
      }
    }, LONG_PRESS_MS);
  }, [clearLongPress, onEdit, mode]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

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
      onClick={(e) => {
        if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
        if (e.detail !== 2) onSelect();
      }}
      onDoubleClick={() => { if (onEdit && mode === 'rehearsal') onEdit(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '8px 80px 1fr auto auto auto auto auto',
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
      {cue.trigger.kind !== 'manual' && !isPlayhead && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: tokens.color.ink_disabled,
            fontWeight: 700,
            pointerEvents: 'none',
          }}
        >
          &gt;
        </span>
      )}
      <DepartmentSideBar departments={cue.department} />
      <div
        data-testid="cue-label"
        style={{
          fontSize: 24,
          fontWeight: 700,
          fontFamily: tokens.font.ui,
          color: isFiring ? tokens.color.bg : tokens.color.ink,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={cue.label}
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
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, color: tokens.color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cue.description}</div>
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
      <TriggerCell
        cue={cue}
        cues={cues}
        mode={mode}
        editable={mode === 'rehearsal'}
        onUpdate={(trigger) => onTriggerUpdate?.(trigger)}
      />
      <div
        data-testid="duration-cell"
        style={{
          fontSize: 12,
          fontFamily: tokens.font.mono,
          color: tokens.color.ink_secondary,
          whiteSpace: 'nowrap',
          minWidth: 52,
          textAlign: 'right',
        }}
      >
        {formatDuration(cue.duration_hint_ms)}
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
