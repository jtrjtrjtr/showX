import { tokens } from './tokens.js';
import type { ClockDisplay } from '../../hooks/useClock.js';
import { TimecodeDisplayView } from './TimecodeDisplay.js';

function formatTimeAgo(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')} ago`;
}

function formatElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatCountdown(ms: number): string {
  const totalSecs = ms / 1000;
  const minutes = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${secs}`;
}

export interface PlaybackHeaderProps {
  lastFiredLabel: string | null;
  lastFiredAt: number | null;
  playheadCueLabel: string | null;
  firstGoAt: number | null;
  now: number;
  /** Label of the cue currently in pre-wait; null = no active pre-wait. */
  preWaitingCueLabel?: string | null;
  /** Absolute ms timestamp when the pre-wait expires; null = no active pre-wait. */
  preWaitUntil?: number | null;
  /** When provided, renders big TC display prominently in the header. */
  clock?: ClockDisplay;
}

export function PlaybackHeader({
  lastFiredLabel,
  lastFiredAt,
  playheadCueLabel,
  firstGoAt,
  now,
  preWaitingCueLabel = null,
  preWaitUntil = null,
  clock,
}: PlaybackHeaderProps) {
  const timeAgo = lastFiredAt !== null ? formatTimeAgo(Math.max(0, now - lastFiredAt)) : null;
  const elapsed = firstGoAt !== null ? formatElapsed(Math.max(0, now - firstGoAt)) : null;
  const preWaitRemaining =
    preWaitUntil !== null && preWaitUntil - now > 0 ? preWaitUntil - now : null;
  const isPreWaiting = preWaitRemaining !== null && preWaitingCueLabel !== null;

  return (
    <div
      data-testid="playback-header"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.xl,
        padding: `${tokens.space.xs}px ${tokens.space.l}px`,
        borderBottom: `1px solid ${tokens.color.border}`,
        background: tokens.color.panel,
        fontSize: 15,
        fontFamily: tokens.font.ui,
        color: tokens.color.ink,
        flexShrink: 0,
        minHeight: 38,
      }}
    >
      {clock && (
        <span data-testid="ph-timecode-block" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <TimecodeDisplayView clock={clock} size={48} />
        </span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_secondary, fontSize: 11 }}>
          Last fired
        </span>
        {lastFiredLabel !== null && timeAgo !== null ? (
          <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink }}>
            {lastFiredLabel}
            <span style={{ color: tokens.color.ink_secondary }}> · {timeAgo}</span>
          </span>
        ) : (
          <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink_disabled }}>—</span>
        )}
      </span>

      <span style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_secondary, fontSize: 11 }}>
          Next
        </span>
        <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink }}>
          {playheadCueLabel ?? '—'}
        </span>
      </span>

      {isPreWaiting && preWaitRemaining !== null && (
        <span
          data-testid="prewait-indicator"
          aria-live="assertive"
          style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}
        >
          <span
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontSize: 11,
              fontWeight: 700,
              color: tokens.color.yellow,
              border: `1px solid ${tokens.color.yellow}`,
              borderRadius: tokens.radius.s,
              padding: '1px 5px',
            }}
          >
            WAITING
          </span>
          <span style={{ fontFamily: tokens.font.mono, color: tokens.color.yellow, fontWeight: 700 }}>
            {preWaitingCueLabel}
          </span>
          <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink_secondary, fontSize: 13 }}>
            {formatCountdown(Math.max(0, preWaitRemaining))}
          </span>
        </span>
      )}

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_secondary, fontSize: 11 }}>
          Elapsed
        </span>
        <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink, fontSize: 18, fontWeight: 700 }}>
          {elapsed ?? '—'}
        </span>
      </span>
    </div>
  );
}
