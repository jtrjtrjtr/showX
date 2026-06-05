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
  const bg = mode === 'show' ? tokens.color.red : tokens.color.teal;

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
        background: flash ? tokens.color.cream : bg,
        color: flash ? tokens.color.ink : tokens.color.cream,
        border: 'none',
        borderRadius: tokens.radius.l,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 80ms',
        animation: shaking ? 'goShake 0.5s' : 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      GO{armedCueId && cueLabel ? ` · ${cueLabel}` : ''}
    </button>
  );
}
