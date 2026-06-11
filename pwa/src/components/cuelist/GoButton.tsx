import { useState, useEffect, useRef } from 'react';
import { tokens } from './tokens.js';

export const HOLD_GO_THRESHOLD_MS = 250;

export interface GoButtonProps {
  armedCueId: string | null;
  cueLabel?: string;
  mode: 'rehearsal' | 'show';
  onGo: () => void;
  onOverride: () => void;
  rejectedReason: string | null;
  isAuthoritative: boolean;
  /** True during the 300ms debounce window after a GO fires — button is visually inert. */
  goInert?: boolean;
  /** Shown at the bottom of the button for 3s post-GO; set by parent. */
  firedConfirmLabel?: string | null;
  /** Count of auto-follow/auto-continue cues chained after the armed cue, capped at 9. */
  followCount?: number;
  /** 0–1 hold fraction driven by the keyboard Space hold, for show mode radial fill. */
  externalHoldFraction?: number;
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
  goInert = false,
  firedConfirmLabel,
  followCount = 0,
  externalHoldFraction,
}: GoButtonProps) {
  const [flash, setFlash] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [holdFraction, setHoldFraction] = useState(0);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overrideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const disabled = !armedCueId || !isAuthoritative;

  useEffect(() => {
    if (!rejectedReason) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 500);
    return () => clearTimeout(t);
  }, [rejectedReason]);

  // Clean up hold state on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current != null) clearTimeout(holdTimerRef.current);
      if (overrideTimerRef.current != null) clearTimeout(overrideTimerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const clearHold = () => {
    if (holdTimerRef.current != null) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    holdStartRef.current = null;
    setHoldFraction(0);
  };

  const clearOverride = () => {
    if (overrideTimerRef.current != null) { clearTimeout(overrideTimerRef.current); overrideTimerRef.current = null; }
  };

  const fireGo = () => {
    onGo();
    setFlash(true);
    setTimeout(() => setFlash(false), 300);
  };

  // Rehearsal: instant click fires GO
  const handleClick = () => {
    if (disabled || goInert || mode === 'show') return;
    fireGo();
  };

  const handlePressStart = () => {
    if (disabled || goInert) return;
    if (mode === 'show') {
      // Hold-to-fire: 250ms with radial fill
      holdStartRef.current = Date.now();
      const animate = () => {
        if (holdStartRef.current === null) return;
        const elapsed = Date.now() - holdStartRef.current;
        setHoldFraction(Math.min(1, elapsed / HOLD_GO_THRESHOLD_MS));
        if (elapsed < HOLD_GO_THRESHOLD_MS) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
      holdTimerRef.current = setTimeout(() => {
        clearHold();
        fireGo();
      }, HOLD_GO_THRESHOLD_MS);
    } else {
      // Rehearsal: 1.5s long-press triggers override confirmation
      overrideTimerRef.current = setTimeout(() => onOverride(), 1500);
    }
  };

  const handlePressEnd = () => {
    if (mode === 'show') {
      clearHold();
    } else {
      clearOverride();
    }
  };

  const activeBg = mode === 'show' ? tokens.color.red : tokens.color.teal;
  const disabledReason = !armedCueId ? 'No cue armed' : 'Operators cannot fire';

  const displayHoldFraction = Math.max(holdFraction, externalHoldFraction ?? 0);

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
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      disabled={disabled}
      aria-label={armedCueId ? `GO — fire armed cue ${cueLabel ?? armedCueId}` : 'GO — no armed cue'}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 80,
        fontSize: 36,
        fontWeight: 800,
        background: bg,
        color,
        border: 'none',
        borderRadius: tokens.radius.l,
        cursor: disabled ? 'not-allowed' : goInert ? 'wait' : 'pointer',
        transition: 'background 80ms',
        animation: shaking ? 'goShake 0.5s' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: goInert && !disabled ? 0.55 : 1,
        overflow: 'hidden',
      }}
    >
      {/* Radial fill overlay for show-mode hold (button press or Space hold) */}
      {displayHoldFraction > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: tokens.radius.l,
            background: `conic-gradient(${tokens.color.green}70 ${displayHoldFraction * 360}deg, transparent 0deg)`,
            pointerEvents: 'none',
          }}
        />
      )}

      <span style={{ position: 'relative', zIndex: 1 }}>
        {mode === 'show' && !disabled && '🔒 '}
        GO{armedCueId && cueLabel ? ` · ${cueLabel}` : ''}
      </span>

      {/* +N follow: next cues chain via auto_follow / auto_continue */}
      {!disabled && followCount > 0 && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 400,
            color: tokens.color.white,
            opacity: 0.75,
            position: 'relative',
            zIndex: 1,
          }}
        >
          +{Math.min(followCount, 9)} follow
        </span>
      )}

      {disabled && (
        <span
          data-testid="go-disabled-reason"
          style={{ fontSize: 12, fontWeight: 400, color: tokens.color.ink_disabled }}
        >
          {disabledReason}
        </span>
      )}

      {/* Post-GO confirmation — operator can confirm which cue just fired without looking away */}
      {!disabled && firedConfirmLabel != null && (
        <span
          data-testid="go-fired-confirm"
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 400,
            color: tokens.color.white,
            opacity: 0.8,
            zIndex: 1,
          }}
        >
          fired: {firedConfirmLabel}
        </span>
      )}
    </button>
  );
}
