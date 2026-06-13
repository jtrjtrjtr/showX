import { useEffect, useRef, useState } from 'react';
import { framesToTc, formatTc } from 'showx-shared';
import type { ClockAnchor } from '../lib/sideChannel.js';
import { useConnection } from '../lib/ConnectionProvider.js';

export interface ClockDisplay {
  totalFrames: number;
  /** HH:MM:SS:FF (or HH:MM:SS;FF for drop-frame) */
  formatted: string;
  rate: number;
  dropFrame: boolean;
  running: boolean;
  source: string;
  /** true when a clock.anchor has been received within the last 5 s */
  locked: boolean;
}

const STALE_THRESHOLD_MS = 5000;

interface AnchorEntry {
  anchor: ClockAnchor;
  /** LOCAL performance.now() at the moment this anchor was received. */
  receivedAt: number;
}

function computeDisplay(entry: AnchorEntry | null): ClockDisplay {
  if (!entry) {
    return {
      totalFrames: 0,
      formatted: '00:00:00:00',
      rate: 25,
      dropFrame: false,
      running: false,
      source: 'internal',
      locked: false,
    };
  }
  const { anchor, receivedAt } = entry;
  const now = performance.now();

  let totalFrames: number;
  if (anchor.running) {
    // Interpolate from LOCAL receipt time — do NOT use anchor.at_wall_ms for this
    // (shell vs station clocks differ). Standard anchor pattern: F = F0 + elapsed*fps/1000.
    const elapsedMs = now - receivedAt;
    const fps = anchor.rate === 29.97 ? 30000 / 1001 : anchor.rate;
    totalFrames = anchor.totalFrames + Math.floor(elapsedMs * fps / 1000);
  } else {
    totalFrames = anchor.totalFrames;
  }

  const tc = framesToTc(totalFrames, anchor.rate, anchor.dropFrame);
  return {
    totalFrames,
    formatted: formatTc(tc, anchor.dropFrame),
    rate: anchor.rate,
    dropFrame: anchor.dropFrame,
    running: anchor.running,
    source: anchor.source,
    locked: now - receivedAt < STALE_THRESHOLD_MS,
  };
}

/**
 * Subscribes to clock.anchor messages from the shell and interpolates a smooth
 * 60fps display locally via requestAnimationFrame.
 *
 * Interpolation uses LOCAL performance.now() elapsed since anchor receipt, not
 * the anchor's at_wall_ms (which is shell time and differs from station time).
 */
export function useClock(): ClockDisplay {
  const conn = useConnection();
  const anchorRef = useRef<AnchorEntry | null>(null);
  const rafRef = useRef<number | null>(null);
  const [display, setDisplay] = useState<ClockDisplay>(() => computeDisplay(null));

  useEffect(() => {
    return conn.sideChannel.on('clock.anchor', (msg) => {
      anchorRef.current = { anchor: msg, receivedAt: performance.now() };
    });
  }, [conn.sideChannel]);

  useEffect(() => {
    function tick() {
      setDisplay(computeDisplay(anchorRef.current));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return display;
}
