import { tokens } from './tokens.js';

interface PlayheadIndicatorProps {
  visible: boolean;
  smOnline?: boolean;
}

export function PlayheadIndicator({ visible, smOnline = true }: PlayheadIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      aria-label="Now playing"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        background: smOnline ? tokens.color.teal : tokens.color.border,
        borderRadius: `${tokens.radius.s}px 0 0 ${tokens.radius.s}px`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: 6,
          background: smOnline ? tokens.color.teal : tokens.color.border,
          color: tokens.color.white,
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 4px',
          borderRadius: tokens.radius.s,
          whiteSpace: 'nowrap',
        }}
      >
        NOW
        {!smOnline && (
          <span style={{ marginLeft: 4, fontWeight: 400, fontSize: 9 }}>
            (SM offline)
          </span>
        )}
      </span>
    </div>
  );
}
