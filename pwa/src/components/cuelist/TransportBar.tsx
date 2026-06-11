import type { CSSProperties } from 'react';
import { tokens } from './tokens.js';

export interface TransportBarProps {
  onBack: () => void;
  onUnarm: () => void;
  backDisabled: boolean;
  unarmDisabled: boolean;
}

export function TransportBar({ onBack, onUnarm, backDisabled, unarmDisabled }: TransportBarProps) {
  const base: CSSProperties = {
    flex: 1,
    minHeight: 56,
    fontSize: 12,
    fontWeight: 700,
    background: tokens.color.raised,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.m,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    transition: 'opacity 80ms',
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s, flex: '0 0 auto', minWidth: 100 }}
    >
      <button
        type="button"
        data-testid="transport-back"
        aria-label="BACK — re-arm previous cue"
        disabled={backDisabled}
        onClick={onBack}
        style={{
          ...base,
          color: backDisabled ? tokens.color.ink_disabled : tokens.color.ink_secondary,
          cursor: backDisabled ? 'not-allowed' : 'pointer',
          opacity: backDisabled ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>←</span>
        <span>BACK</span>
        <span style={{ fontSize: 9, color: tokens.color.ink_disabled }}>B</span>
      </button>
      <button
        type="button"
        data-testid="transport-unarm"
        aria-label="UNARM — disarm current cue"
        disabled={unarmDisabled}
        onClick={onUnarm}
        style={{
          ...base,
          color: unarmDisabled ? tokens.color.ink_disabled : tokens.color.ink_secondary,
          cursor: unarmDisabled ? 'not-allowed' : 'pointer',
          opacity: unarmDisabled ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
        <span>UNARM</span>
        <span style={{ fontSize: 9, color: tokens.color.ink_disabled }}>Esc</span>
      </button>
    </div>
  );
}
