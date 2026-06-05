import type { Cue } from 'showx-shared';
import { tokens } from './tokens.js';

// Inject pulse keyframe once
if (typeof document !== 'undefined') {
  const styleId = 'showx-standby-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes standbypulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.55; }
      }
    `;
    document.head.appendChild(style);
  }
}

interface StandbyPanelProps {
  nextCues: Cue[];
  armedCueId: string | null;
  cues: Cue[];
  onStandby?: (cueId: string) => void;
}

export function StandbyPanel({ nextCues, armedCueId, cues, onStandby }: StandbyPanelProps) {
  const armed = armedCueId ? cues.find((c) => c.id === armedCueId) : undefined;
  return (
    <section
      role="status"
      aria-live="polite"
      style={{
        padding: tokens.space.l,
        background: tokens.color.gray_50,
        borderTop: `2px solid ${tokens.color.ink}`,
      }}
    >
      <h3
        style={{
          margin: `0 0 ${tokens.space.s}px 0`,
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Standby
      </h3>
      {armed && (
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: tokens.color.red,
            marginBottom: tokens.space.s,
            animation: 'standbypulse 1.5s ease-in-out infinite',
          }}
        >
          Standby {armed.label}
          {armed.standby_note ? ` — ${armed.standby_note}` : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: tokens.space.m, flexWrap: 'wrap' }}>
        {nextCues.map((c) =>
          onStandby ? (
            <button
              key={c.id}
              onClick={() => onStandby(c.id)}
              aria-label={`Arm cue ${c.label}`}
              style={{
                padding: `${tokens.space.s}px ${tokens.space.m}px`,
                border: `1px solid ${tokens.color.gray_300}`,
                borderRadius: tokens.radius.m,
                background: tokens.color.cream,
                minWidth: 80,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              {c.standby_note && (
                <div style={{ fontSize: 12, color: tokens.color.gray_700 }}>{c.standby_note}</div>
              )}
            </button>
          ) : (
            <div
              key={c.id}
              style={{
                padding: `${tokens.space.s}px ${tokens.space.m}px`,
                border: `1px solid ${tokens.color.gray_300}`,
                borderRadius: tokens.radius.m,
                background: tokens.color.cream,
                minWidth: 80,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              {c.standby_note && (
                <div style={{ fontSize: 12, color: tokens.color.gray_700 }}>{c.standby_note}</div>
              )}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
