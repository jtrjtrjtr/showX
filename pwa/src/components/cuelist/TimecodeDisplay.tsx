import { useClock } from '../../hooks/useClock.js';
import type { ClockDisplay } from '../../hooks/useClock.js';
import { tokens } from './tokens.js';

export type { ClockDisplay };

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
}

/** Pure presentational TC display — no hooks. Pass ClockDisplay directly. */
export function TimecodeDisplayView({ clock, size = 48 }: TimecodeDisplayViewProps) {
  const { formatted, source, running, locked } = clock;
  const active = running && locked;

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
          color: active ? tokens.color.teal : tokens.color.ink_disabled,
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
            color: active ? tokens.color.teal : tokens.color.ink_disabled,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {sourceLabel(source)}
        </span>
        <span
          data-testid="timecode-status-dot"
          aria-label={active ? 'Clock running' : 'Clock stopped'}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: active ? tokens.color.green : tokens.color.ink_disabled,
          }}
        />
      </div>
    </div>
  );
}

/** Smart TC display — calls useClock() internally. Use in standalone contexts. */
export function TimecodeDisplay({ size = 48 }: { size?: number }) {
  const clock = useClock();
  return <TimecodeDisplayView clock={clock} size={size} />;
}
