import type { Subscription } from './services.js';

export type FrameRate = 24 | 25 | 29.97 | 30;
export type ClockSource = 'internal' | 'mtc' | 'ltc';

export interface Timecode {
  hh: number;
  mm: number;
  ss: number;
  ff: number;
}

export interface ClockState {
  rate: FrameRate;
  dropFrame: boolean;
  totalFrames: number;
  running: boolean;
  source: ClockSource;
}

export interface MasterClock {
  start(): void;
  stop(): void;
  locate(target: number | Timecode): void;
  setRate(rate: FrameRate, dropFrame: boolean): void;
  setSource(source: ClockSource): void;
  getState(): ClockState;
  onChange(handler: (state: ClockState) => void): Subscription;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Integer fps used for frame counting (29.97 counts as 30 slots). */
export function intFps(rate: FrameRate): number {
  return rate === 29.97 ? 30 : rate;
}

/**
 * Convert a continuous frame counter to a Timecode label.
 * Drop-frame: applies only when dropFrame=true AND rate=29.97.
 */
export function framesToTc(totalFrames: number, rate: FrameRate, dropFrame: boolean): Timecode {
  const fps = intFps(rate);
  const df = dropFrame && rate === 29.97;

  if (df) {
    const d = 2; // frame numbers dropped per non-10th minute
    const framesPer10Min = fps * 60 * 10 - d * 9; // 17982
    const framesPerHour = framesPer10Min * 6; // 107892

    const hh = Math.floor(totalFrames / framesPerHour);
    let remainder = totalFrames % framesPerHour;

    const D10 = Math.floor(remainder / framesPer10Min);
    remainder = remainder % framesPer10Min;

    // Within 10-min block: first minute has 1800 frames (no drops), minutes 1-9 have 1798
    let minOf10: number;
    let framesIntoBlock: number;
    if (remainder < fps * 60) {
      minOf10 = 0;
      framesIntoBlock = remainder;
    } else {
      const r2 = remainder - fps * 60;
      const framesPerNonZeroMin = fps * 60 - d;
      minOf10 = 1 + Math.floor(r2 / framesPerNonZeroMin);
      framesIntoBlock = r2 % framesPerNonZeroMin;
    }

    const mm = D10 * 10 + minOf10;
    // Non-zero minutes have first d frame numbers dropped, so label starts at d
    const adjusted = framesIntoBlock + (minOf10 > 0 ? d : 0);
    const ss = Math.floor(adjusted / fps);
    const ff = adjusted % fps;

    return { hh, mm, ss, ff };
  }

  // Non-drop-frame (or DF not applicable to this rate)
  const framesPerSec = fps;
  const framesPerMin = framesPerSec * 60;
  const framesPerHour = framesPerMin * 60;

  const hh = Math.floor(totalFrames / framesPerHour);
  let rem = totalFrames % framesPerHour;
  const mm = Math.floor(rem / framesPerMin);
  rem = rem % framesPerMin;
  const ss = Math.floor(rem / framesPerSec);
  const ff = rem % framesPerSec;

  return { hh, mm, ss, ff };
}

/**
 * Convert a Timecode label back to totalFrames.
 * This is the inverse of framesToTc.
 */
export function tcToFrames(tc: Timecode, rate: FrameRate, dropFrame: boolean): number {
  const fps = intFps(rate);
  const df = dropFrame && rate === 29.97;
  const { hh, mm, ss, ff } = tc;

  // Compute as if no drops
  const framesNoDrop = ((hh * 3600 + mm * 60 + ss) * fps) + ff;

  if (df) {
    const d = 2;
    const totalMinutes = hh * 60 + mm;
    // Drops happen at every minute boundary except multiples of 10
    const drops = d * (totalMinutes - Math.floor(totalMinutes / 10));
    return framesNoDrop - drops;
  }

  return framesNoDrop;
}

/** Format a Timecode as 'HH:MM:SS:FF' (or 'HH:MM:SS;FF' for drop-frame). */
export function formatTc(tc: Timecode, dropFrame: boolean): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const frameSep = dropFrame ? ';' : ':';
  return `${p2(tc.hh)}:${p2(tc.mm)}:${p2(tc.ss)}${frameSep}${p2(tc.ff)}`;
}
