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
import { InlineEdit } from './InlineEdit.js';

export type InlineEditField = 'cue_number' | 'label' | 'duration_hint_ms' | 'standby_note';

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
  isSelected: boolean;
  isArmed: boolean;
  isFiring: boolean;
  /** ms timestamp when this cue was dispatched; null if not the active fired cue */
  firedAt: number | null;
  /** Current time in ms for countdown; driven by single parent ticker */
  now: number;
  onSelect: () => void;
  /** Called when operator clicks the 24px left gutter zone to set playhead */
  onSetPlayhead?: () => void;
  onEdit?: () => void;
  stations: StationAwareness[];
  mode: ShowMode;
  cues?: Cue[];
  onTriggerUpdate?: (trigger: Trigger) => void;
  /** Field being inline-edited on this row; null/undefined = no editing */
  inlineEditField?: InlineEditField | null;
  onInlineCommit?: (field: InlineEditField, value: string) => void;
  onInlineCancel?: () => void;
  onInlineTab?: (field: InlineEditField, value: string) => void;
  /** Standby+arm THIS cue (shown as STBY button on the selected row) */
  onStandby?: () => void;
}

export function CueRow({
  cue,
  isPlayhead,
  isSelected,
  isArmed,
  isFiring,
  firedAt,
  now,
  onSelect,
  onSetPlayhead,
  onEdit,
  stations,
  mode,
  cues = [],
  onTriggerUpdate,
  inlineEditField,
  onInlineCommit,
  onInlineCancel,
  onInlineTab,
  onStandby,
}: CueRowProps) {
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

  // Countdown: remaining ms if this cue is currently running
  const remaining =
    firedAt !== null && cue.duration_hint_ms !== null
      ? firedAt + cue.duration_hint_ms - now
      : null;
  const isCountingDown = remaining !== null && remaining > 0;
  const countdownProgress =
    isCountingDown && cue.duration_hint_ms !== null && cue.duration_hint_ms > 0
      ? 1 - remaining! / cue.duration_hint_ms
      : null;

  let bg: string = tokens.color.bg;
  if (isFiring) bg = tokens.color.green;
  else if (isPlayhead) bg = tokens.color.playhead_bg;

  const leftBorder =
    isArmed || isCountingDown ? `4px solid ${tokens.color.red}` : undefined;

  const selectionShadow =
    isSelected && !isPlayhead
      ? `inset 0 0 0 1.5px ${tokens.color.teal}`
      : undefined;

  const isCompound = cue.department.length > 1;
  const deptTag = cue.department.length === 1 ? cue.department[0] : undefined;

  // Duration in seconds for inline edit initial value
  const durationSecs = cue.duration_hint_ms !== null ? (cue.duration_hint_ms / 1000).toString() : '';

  return (
    <div
      role="row"
      aria-selected={isPlayhead || isSelected}
      data-testid="cue-row"
      data-cue-id={cue.id}
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
        gridTemplateColumns: '8px 48px minmax(180px, 300px) 1fr auto 80px auto',
        gap: tokens.space.m,
        alignItems: 'center',
        padding: `${tokens.space.m}px ${tokens.space.l}px`,
        paddingLeft: tokens.space.xl,
        borderBottom: `1px solid ${tokens.color.border}`,
        borderLeft: leftBorder,
        background: bg,
        boxShadow: selectionShadow,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* 24px gutter zone — click to set playhead without affecting selection */}
      <div
        data-testid="playhead-gutter"
        onClick={(e) => { e.stopPropagation(); onSetPlayhead?.(); }}
        role="button"
        tabIndex={-1}
        aria-label="Set playhead"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 24,
          cursor: 'crosshair',
          zIndex: 5,
        }}
      />

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

      {/* Cue number column — narrow, mono, ink_secondary */}
      <div
        data-testid="cue-number-cell"
        style={{ minWidth: 0 }}
      >
        {inlineEditField === 'cue_number' ? (
          <InlineEdit
            initialValue={cue.cue_number ?? ''}
            placeholder="#"
            maxLength={8}
            onCommit={(v) => onInlineCommit?.('cue_number', v)}
            onCancel={() => onInlineCancel?.()}
            onTab={(v) => onInlineTab?.('cue_number', v)}
          />
        ) : (
          <span
            style={{
              fontSize: 14,
              fontFamily: tokens.font.mono,
              color: tokens.color.ink_secondary,
              whiteSpace: 'nowrap',
            }}
          >
            {cue.cue_number ?? ''}
          </span>
        )}
      </div>

      {/* Label — own column, single line */}
      <div style={{ minWidth: 0 }}>
        {inlineEditField === 'label' ? (
          <InlineEdit
            initialValue={cue.label}
            onCommit={(v) => onInlineCommit?.('label', v)}
            onCancel={() => onInlineCancel?.()}
            onTab={(v) => onInlineTab?.('label', v)}
          />
        ) : (
          <div
            data-testid="cue-label"
            style={{
              fontSize: 22,
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
        )}
      </div>

      {/* Description + standby note + payload summary — fills the middle */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, color: tokens.color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cue.description}</div>
        {inlineEditField === 'standby_note' ? (
          <InlineEdit
            initialValue={cue.standby_note}
            onCommit={(v) => onInlineCommit?.('standby_note', v)}
            onCancel={() => onInlineCancel?.()}
            onTab={(v) => onInlineTab?.('standby_note', v)}
          />
        ) : (
          cue.standby_note && (
            <div style={{ fontStyle: 'italic', color: tokens.color.ink_secondary, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cue.standby_note}
            </div>
          )
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

      {/* Duration cell — inline editable (input in seconds) */}
      <div
        data-testid="duration-cell"
        style={{
          fontSize: 15,
          fontFamily: tokens.font.mono,
          color: tokens.color.ink,
          whiteSpace: 'nowrap',
          minWidth: 52,
          textAlign: 'right',
        }}
      >
        {inlineEditField === 'duration_hint_ms' ? (
          <InlineEdit
            initialValue={durationSecs}
            placeholder="secs"
            onCommit={(v) => onInlineCommit?.('duration_hint_ms', v)}
            onCancel={() => onInlineCancel?.()}
            onTab={(v) => onInlineTab?.('duration_hint_ms', v)}
          />
        ) : (
          formatDuration(cue.duration_hint_ms)
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s, alignItems: 'flex-end' }}>
        {isSelected && !isArmed && onStandby && (
          <button
            data-testid="row-standby-btn"
            aria-label={`Standby cue ${cue.label}`}
            onClick={(e) => { e.stopPropagation(); onStandby(); }}
            style={{
              padding: '4px 12px',
              background: tokens.color.raised,
              color: tokens.color.ink,
              border: `1px solid ${tokens.color.teal}`,
              borderRadius: tokens.radius.s,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: tokens.font.ui,
            }}
          >
            STBY
          </button>
        )}
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

      {/* Live countdown overlay — shown when cue is running with a known duration */}
      {isCountingDown && remaining !== null && (
        <div
          data-testid="row-countdown"
          style={{
            position: 'absolute',
            right: tokens.space.l,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            fontFamily: tokens.font.mono,
            color: tokens.color.red,
            fontWeight: 700,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {formatDuration(Math.max(0, remaining))}
        </div>
      )}

      {/* Progress bar along bottom — teal, fades out as cue completes */}
      {isCountingDown && countdownProgress !== null && remaining !== null && cue.duration_hint_ms !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 2,
            width: `${Math.min(countdownProgress * 100, 100)}%`,
            background: tokens.color.teal,
            opacity: Math.max(0, remaining / cue.duration_hint_ms),
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
