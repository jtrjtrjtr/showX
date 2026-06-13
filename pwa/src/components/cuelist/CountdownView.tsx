import { useEffect, useRef, useState } from 'react';
import type { Cue } from 'showx-shared';
import { useClock } from '../../hooks/useClock.js';
import { useCuelist } from '../../hooks/useCuelist.js';
import { useGoChannel } from '../../hooks/useGoChannel.js';
import { usePlayhead } from '../../hooks/usePlayhead.js';
import { TimecodeDisplayView } from './TimecodeDisplay.js';
import { tokens } from './tokens.js';

function formatCountdown(ms: number): string {
  const totalSecs = Math.max(0, ms) / 1000;
  const minutes = Math.floor(totalSecs / 60);
  const secs = Math.floor(totalSecs % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function cueDisplayLabel(cue: Cue | undefined): string {
  if (!cue) return '—';
  const num = cue.cue_number ? `${cue.cue_number} ` : '';
  return `${num}${cue.label}`;
}

interface CountdownBlockProps {
  preWaitMs: number | null;
  preWaitLabel: string | null;
}

function CountdownBlock({ preWaitMs, preWaitLabel }: CountdownBlockProps) {
  const [now, setNow] = useState(Date.now);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (preWaitMs === null) return;
    function tick() {
      setNow(Date.now());
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [preWaitMs]);

  if (preWaitMs === null) {
    return (
      <div
        data-testid="countdown-idle"
        style={{
          fontFamily: tokens.font.mono,
          fontSize: 96,
          fontWeight: 700,
          color: tokens.color.ink_disabled,
          lineHeight: 1,
          letterSpacing: '0.02em',
          userSelect: 'none',
        }}
      >
        —:——
      </div>
    );
  }

  const remaining = Math.max(0, preWaitMs - now);
  const isExpiring = remaining < 3000;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: tokens.space.s }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isExpiring ? tokens.color.red : tokens.color.yellow,
          fontFamily: tokens.font.ui,
        }}
      >
        WAITING — {preWaitLabel}
      </span>
      <div
        data-testid="countdown-prewait"
        style={{
          fontFamily: tokens.font.mono,
          fontSize: 120,
          fontWeight: 700,
          color: isExpiring ? tokens.color.red : tokens.color.yellow,
          lineHeight: 1,
          letterSpacing: '0.02em',
          userSelect: 'none',
        }}
      >
        {formatCountdown(remaining)}
      </div>
    </div>
  );
}

export interface CountdownViewProps {
  cuelistId: string;
}

export function CountdownView({ cuelistId }: CountdownViewProps) {
  const clock = useClock();
  const { cues } = useCuelist(cuelistId);
  const { playheadCueId, armedCueId } = usePlayhead(cuelistId);
  const { preWait, lastDispatched } = useGoChannel(cuelistId);

  // Derive current and next cue from playhead + cue list
  const standingCueId = armedCueId ?? playheadCueId;
  const standingCue = cues.find((c: Cue) => c.id === standingCueId);

  // Last fired cue from go.dispatched events
  const lastFiredCue = lastDispatched
    ? cues.find((c: Cue) => c.id === lastDispatched.cue_id)
    : null;

  // Next cue after the standing one
  const standingIdx = standingCue ? cues.indexOf(standingCue) : -1;
  const nextCue: Cue | undefined = standingIdx >= 0 && standingIdx < cues.length - 1
    ? cues[standingIdx + 1]
    : undefined;

  // Pre-wait countdown data
  const preWaitMs = preWait ? preWait.waiting_until : null;
  const preWaitCue = preWait ? cues.find((c: Cue) => c.id === preWait.cue_id) : null;
  const preWaitLabel = preWaitCue ? cueDisplayLabel(preWaitCue) : null;

  return (
    <div
      data-testid="countdown-view"
      style={{
        width: '100vw',
        height: '100vh',
        background: tokens.color.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '48px 64px',
        boxSizing: 'border-box',
        fontFamily: tokens.font.ui,
        overflow: 'hidden',
      }}
    >
      {/* Top: show time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TimecodeDisplayView clock={clock} size={72} />
      </div>

      {/* Center: countdown */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: tokens.space.xl,
        }}
      >
        <CountdownBlock preWaitMs={preWaitMs} preWaitLabel={preWaitLabel} />
      </div>

      {/* Bottom: cue labels */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: tokens.space.xl,
        }}
      >
        <div
          data-testid="countdown-last-fired"
          style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.xs }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: tokens.color.ink_secondary,
            }}
          >
            Last
          </span>
          <span
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 28,
              fontWeight: 700,
              color: tokens.color.ink,
              lineHeight: 1.2,
            }}
          >
            {lastFiredCue ? cueDisplayLabel(lastFiredCue) : '—'}
          </span>
        </div>

        <div
          data-testid="countdown-next-cue"
          style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.xs, alignItems: 'flex-end' }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: tokens.color.teal,
            }}
          >
            Next / standby
          </span>
          <span
            style={{
              fontFamily: tokens.font.mono,
              fontSize: 36,
              fontWeight: 700,
              color: tokens.color.teal,
              lineHeight: 1.2,
              textAlign: 'right',
            }}
          >
            {standingCue ? cueDisplayLabel(standingCue) : '—'}
          </span>
          {nextCue && (
            <span
              data-testid="countdown-after-next"
              style={{
                fontFamily: tokens.font.mono,
                fontSize: 20,
                color: tokens.color.ink_secondary,
                textAlign: 'right',
              }}
            >
              then: {cueDisplayLabel(nextCue)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
