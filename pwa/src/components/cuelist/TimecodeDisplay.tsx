import { useEffect, useRef, useState } from 'react';
import { useClock } from '../../hooks/useClock.js';
import type { ClockDisplay } from '../../hooks/useClock.js';
import { tokens } from './tokens.js';

export type { ClockDisplay };

/** Chase status from the LTC/MTC receiver (B008-004). */
export type ChaseStatus = 'locked' | 'searching' | 'inactive';

function sourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s === 'mtc') return 'MTC';
  if (s === 'ltc') return 'LTC';
  return 'INT';
}

export interface TimecodeDisplayViewProps {
  clock: ClockDisplay;
  /** Font-size for the digit block in px; default 48 */
  size?: number;
  /**
   * Chase lock state for MTC/LTC sources (B008-004).
   * When provided for a chase source, overrides the plain locked-dot color:
   *   locked   → green
   *   searching → yellow (signal detected, waiting for lock gate)
   *   inactive  → dim
   * Ignored when source is 'internal'.
   */
  chaseStatus?: ChaseStatus;
}

/** Pure presentational TC display — no hooks. Pass ClockDisplay directly. */
export function TimecodeDisplayView({ clock, size = 48, chaseStatus }: TimecodeDisplayViewProps) {
  const { formatted, source, running, locked } = clock;

  // For chase sources use the richer chaseStatus when available.
  const isChaseSource = source === 'mtc' || source === 'ltc';
  const chaseLocked = isChaseSource && chaseStatus === 'locked';
  const chaseSearching = isChaseSource && chaseStatus === 'searching';

  // Digit / source label colour: teal when clock active.
  // Chase source with chaseStatus: teal only when locked.
  // Chase source without chaseStatus (no B008-004 wiring yet): fall back to running&&locked.
  // INT source: running&&locked.
  const digitActive = isChaseSource
    ? (chaseStatus !== undefined ? chaseLocked : (running && locked))
    : (running && locked);
  const digitColor = digitActive ? tokens.color.teal : tokens.color.ink_disabled;

  // Status-dot colour
  let dotColor: string;
  let dotLabel: string;
  if (isChaseSource && chaseStatus !== undefined) {
    if (chaseLocked) {
      dotColor = tokens.color.green;
      dotLabel = 'Chase locked';
    } else if (chaseSearching) {
      dotColor = tokens.color.yellow;
      dotLabel = 'Chase searching';
    } else {
      dotColor = tokens.color.ink_disabled;
      dotLabel = 'Chase inactive';
    }
  } else {
    // INT source or chase source without chaseStatus — original behaviour
    const active = running && locked;
    dotColor = active ? tokens.color.green : tokens.color.ink_disabled;
    dotLabel = active ? 'Clock running' : 'Clock stopped';
  }

  return (
    <div
      data-testid="timecode-display"
      style={{ display: 'flex', alignItems: 'center', gap: tokens.space.s }}
    >
      <span
        data-testid="timecode-digits"
        style={{
          fontFamily: tokens.font.mono,
          fontSize: size,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '0.01em',
          color: digitColor,
          userSelect: 'none',
        }}
      >
        {formatted}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span
          data-testid="timecode-source"
          style={{
            fontSize: 9,
            fontWeight: 700,
            fontFamily: tokens.font.ui,
            letterSpacing: '0.06em',
            color: digitActive ? tokens.color.teal : tokens.color.ink_disabled,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {sourceLabel(source)}
        </span>
        <span
          data-testid="timecode-status-dot"
          aria-label={dotLabel}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Subscribe to clock:lock:change IPC push events (Electron shell only).
 * Returns 'locked' | 'searching' | 'inactive' based on LTC receiver status.
 */
function useChaseStatus(): ChaseStatus | undefined {
  const api =
    typeof window !== 'undefined'
      ? (window as Window & { showxApi?: { cuelistCore?: { on?(ch: string, h: (...a: unknown[]) => void): () => void } } }).showxApi?.cuelistCore
      : undefined;

  const [status, setStatus] = useState<ChaseStatus | undefined>(undefined);
  const statusRef = useRef<ChaseStatus | undefined>(undefined);

  useEffect(() => {
    if (!api?.on) return;

    const unsub = api.on('clock:lock:change', (...args: unknown[]) => {
      const payload = args[0] as { source?: string; locked?: boolean } | undefined;
      if (!payload) return;
      const src = payload.source ?? 'internal';
      const isChase = src === 'mtc' || src === 'ltc';
      let next: ChaseStatus | undefined;
      if (!isChase) {
        next = undefined;
      } else {
        next = payload.locked ? 'locked' : 'searching';
      }
      if (next !== statusRef.current) {
        statusRef.current = next;
        setStatus(next);
      }
    });
    return unsub;
  }, [api]);

  return status;
}

/** Smart TC display — calls useClock() and useChaseStatus() internally. */
export function TimecodeDisplay({ size = 48 }: { size?: number }) {
  const clock = useClock();
  const chaseStatus = useChaseStatus();
  return <TimecodeDisplayView clock={clock} size={size} chaseStatus={chaseStatus} />;
}
