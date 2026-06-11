import { tokens } from './tokens.js';

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

export interface PlaybackHeaderProps {
  lastFiredLabel: string | null;
  lastFiredAt: number | null;
  playheadCueLabel: string | null;
  firstGoAt: number | null;
  now: number;
}

export function PlaybackHeader({
  lastFiredLabel,
  lastFiredAt,
  playheadCueLabel,
  firstGoAt,
  now,
}: PlaybackHeaderProps) {
  const timeAgo = lastFiredAt !== null ? formatTimeAgo(Math.max(0, now - lastFiredAt)) : null;
  const elapsed = firstGoAt !== null ? formatElapsed(Math.max(0, now - firstGoAt)) : null;

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
        fontSize: 11,
        fontFamily: tokens.font.ui,
        color: tokens.color.ink_secondary,
        flexShrink: 0,
        minHeight: 28,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_disabled, fontSize: 9 }}>
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
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_disabled, fontSize: 9 }}>
          Next
        </span>
        <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink }}>
          {playheadCueLabel ?? '—'}
        </span>
      </span>

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: tokens.space.s }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.color.ink_disabled, fontSize: 9 }}>
          Elapsed
        </span>
        <span style={{ fontFamily: tokens.font.mono, color: tokens.color.ink_secondary }}>
          {elapsed ?? '—'}
        </span>
      </span>
    </div>
  );
}
