// Interrupt control — B007-007
// Large, always-reachable TAKE OVER / MUTE button for the AI Showcaller.
// When active: big red TAKE OVER button stops AI audio and latches MANUAL mode.
// When in MANUAL: shows state label + RESUME AI to hand control back.

import { tokens } from '../cuelist/tokens.js';

export interface InterruptButtonProps {
  onInterrupt: () => void;
  onResume: () => void;
  /** True when CallerAudio is in 'manual' state. */
  isManual: boolean;
  /** True when the AI caller is enabled (i.e. CallerPlayer toggle is ON). */
  callerEnabled: boolean;
}

export function InterruptButton({ onInterrupt, onResume, isManual, callerEnabled }: InterruptButtonProps) {
  if (!callerEnabled) return null;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space.m,
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    background: isManual ? '#1A0D0D' : tokens.color.panel,
    border: `1px solid ${isManual ? tokens.color.red : tokens.color.border}`,
    borderRadius: tokens.radius.s,
    fontFamily: tokens.font.ui,
  };

  const stateStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: isManual ? tokens.color.red : tokens.color.teal,
    fontFamily: tokens.font.ui,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    flexShrink: 0,
  };

  if (isManual) {
    return (
      <div data-testid="interrupt-container" style={containerStyle}>
        <span data-testid="interrupt-state-label" style={stateStyle}>
          MANUAL (you speak)
        </span>
        <button
          data-testid="interrupt-resume-btn"
          onClick={onResume}
          aria-label="Resume AI caller — hand control back to AI"
          style={{
            padding: `${tokens.space.s}px ${tokens.space.l}px`,
            background: tokens.color.teal_dim,
            color: tokens.color.teal,
            border: `1px solid ${tokens.color.teal}`,
            borderRadius: tokens.radius.s,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: tokens.font.ui,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          RESUME AI
        </button>
      </div>
    );
  }

  return (
    <div data-testid="interrupt-container" style={containerStyle}>
      <span data-testid="interrupt-state-label" style={stateStyle}>
        AI CALLER ACTIVE
      </span>
      <button
        data-testid="interrupt-takeover-btn"
        onClick={onInterrupt}
        aria-label="Take over — mute AI caller immediately and speak live"
        style={{
          padding: `${tokens.space.s}px ${tokens.space.l}px`,
          background: tokens.color.red,
          color: tokens.color.white,
          border: 'none',
          borderRadius: tokens.radius.s,
          fontSize: 15,
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: tokens.font.ui,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          flexShrink: 0,
          minWidth: 160,
        }}
      >
        TAKE OVER / MUTE
      </button>
    </div>
  );
}
