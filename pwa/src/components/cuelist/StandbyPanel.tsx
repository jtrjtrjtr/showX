import type { Cue } from 'showx-shared';
import { tokens } from './tokens.js';

// ── OperatorStandbyAlert ──────────────────────────────────────────────────────
// Operator-side cue light: big glanceable standby + acknowledge button.

export interface OperatorStandbyAlertProps {
  cueLabel: string | null;
  department: string;
  acknowledged: boolean;
  onAcknowledge: () => void;
}

export function OperatorStandbyAlert({
  cueLabel,
  department,
  acknowledged,
  onAcknowledge,
}: OperatorStandbyAlertProps) {
  if (acknowledged) {
    return (
      <div
        role="status"
        data-testid="operator-standby-ready"
        aria-live="polite"
        style={{
          padding: `${tokens.space.l}px ${tokens.space.xl}px`,
          background: '#0D2B22',
          borderBottom: `2px solid ${tokens.color.green}`,
          textAlign: 'center',
          color: tokens.color.green,
          fontWeight: 700,
          fontSize: 24,
          fontFamily: tokens.font.ui,
          letterSpacing: '0.02em',
        }}
      >
        READY — waiting for GO
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="operator-standby-alert"
      aria-live="assertive"
      style={{
        padding: `${tokens.space.l}px ${tokens.space.xl}px`,
        background: '#2B1F06',
        borderBottom: `2px solid ${tokens.color.yellow}`,
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.xl,
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: tokens.color.yellow,
            fontFamily: tokens.font.ui,
            marginBottom: tokens.space.xs,
          }}
        >
          {department} — STANDBY
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: tokens.color.ink,
            fontFamily: tokens.font.ui,
            lineHeight: 1.1,
          }}
        >
          {cueLabel ?? '—'}
        </div>
      </div>
      <button
        data-testid="operator-ack-btn"
        onClick={onAcknowledge}
        aria-label={`Acknowledge standby for ${cueLabel ?? 'cue'}`}
        style={{
          padding: `${tokens.space.l}px ${tokens.space.xl}px`,
          background: tokens.color.yellow,
          color: '#1A1200',
          border: 'none',
          borderRadius: tokens.radius.m,
          fontSize: 22,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: tokens.font.ui,
          minWidth: 160,
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        ACKNOWLEDGE
      </button>
    </div>
  );
}

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
        background: tokens.color.panel,
        borderTop: `2px solid ${tokens.color.ink}`,
      }}
    >
      <h3
        style={{
          margin: `0 0 ${tokens.space.s}px 0`,
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: tokens.color.ink_secondary,
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
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.m,
                background: tokens.color.raised,
                color: tokens.color.ink,
                minWidth: 80,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              {c.standby_note && (
                <div style={{ fontSize: 12, color: tokens.color.ink_secondary }}>{c.standby_note}</div>
              )}
            </button>
          ) : (
            <div
              key={c.id}
              style={{
                padding: `${tokens.space.s}px ${tokens.space.m}px`,
                border: `1px solid ${tokens.color.border}`,
                borderRadius: tokens.radius.m,
                background: tokens.color.raised,
                minWidth: 80,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: tokens.color.ink }}>{c.label}</div>
              {c.standby_note && (
                <div style={{ fontSize: 12, color: tokens.color.ink_secondary }}>{c.standby_note}</div>
              )}
            </div>
          ),
        )}
      </div>
    </section>
  );
}
