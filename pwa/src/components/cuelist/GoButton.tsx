import { useState, useEffect, useRef } from 'react';
import { tokens } from './tokens.js';

export interface GoButtonProps {
  armedCueId: string | null;
  cueLabel?: string;
  mode: 'rehearsal' | 'show';
  onGo: () => string;
  onOverride: () => void;
  rejectedReason: string | null;
  isAuthoritative: boolean;
}

// Inject shake keyframe once when module is loaded in browser
if (typeof document !== 'undefined') {
  const styleId = 'showx-go-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes goShake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-6px); }
        40%, 80% { transform: translateX(6px); }
      }
    `;
    document.head.appendChild(style);
  }
}

export function GoButton({
  armedCueId,
  cueLabel,
  mode,
  onGo,
  onOverride,
  rejectedReason,
  isAuthoritative,
}: GoButtonProps) {
  const [flash, setFlash] = useState(false);
  const [shaking, setShaking] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disabled = !armedCueId || !isAuthoritative;
  const activeBg = mode === 'show' ? tokens.color.red : tokens.color.teal;

  useEffect(() => {
    if (!rejectedReason) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 500);
    return () => clearTimeout(t);
  }, [rejectedReason]);

  const clearLong = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (disabled) return;
    onGo();
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
  };

  const handlePressStart = () => {
    longPressTimer.current = setTimeout(() => onOverride(), 1500);
  };

  const disabledReason = !armedCueId ? 'No cue armed' : 'Operators cannot fire';

  let bg: string;
  let color: string;
  if (disabled) {
    bg = tokens.color.raised;
    color = tokens.color.ink_disabled;
  } else if (flash) {
    bg = tokens.color.green;
    color = tokens.color.bg;
  } else {
    bg = activeBg;
    color = tokens.color.white;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={handlePressStart}
      onMouseUp={clearLong}
      onMouseLeave={clearLong}
      onTouchStart={handlePressStart}
      onTouchEnd={clearLong}
      disabled={disabled}
      aria-label={armedCueId ? `GO — fire armed cue ${cueLabel ?? armedCueId}` : 'GO — no armed cue'}
      style={{
        width: '100%',
        minHeight: 80,
        fontSize: 36,
        fontWeight: 800,
        background: bg,
        color,
        border: 'none',
        borderRadius: tokens.radius.l,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 80ms',
        animation: shaking ? 'goShake 0.5s' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <span>
        {mode === 'show' && !disabled && '🔒 '}
        GO{armedCueId && cueLabel ? ` · ${cueLabel}` : ''}
      </span>
      {disabled && (
        <span
          data-testid="go-disabled-reason"
          style={{ fontSize: 12, fontWeight: 400, color: tokens.color.ink_disabled }}
        >
          {disabledReason}
        </span>
      )}
    </button>
  );
}
