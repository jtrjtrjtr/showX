import type { Cue } from 'showx-shared';
import type { GoDispatched } from '../../lib/sideChannel.js';
import { tokens } from './tokens.js';

interface CallingTextProps {
  armedCue: Cue | null;
  lastFired: GoDispatched | null;
}

export function CallingText({ armedCue, lastFired }: CallingTextProps) {
  const isFiringNow =
    lastFired !== null && Date.now() - new Date(lastFired.dispatched_at).getTime() < 2000;

  return (
    <div
      data-testid="calling-text"
      aria-live="polite"
      style={{
        padding: `${tokens.space.m}px ${tokens.space.l}px`,
        background: isFiringNow ? tokens.color.teal : tokens.color.bg,
        fontSize: 32,
        fontWeight: 700,
        textAlign: 'center',
        fontFamily: tokens.font.ui,
        color: isFiringNow ? tokens.color.white : tokens.color.ink,
        transition: 'background 0.2s, color 0.2s',
        borderTop: `1px solid ${tokens.color.border}`,
      }}
    >
      {isFiringNow
        ? `GO ${lastFired!.cue_id}`
        : armedCue
          ? `STANDBY ${armedCue.label}`
          : 'Ready'}
    </div>
  );
}
