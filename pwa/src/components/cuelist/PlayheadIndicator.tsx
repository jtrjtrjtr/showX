import { tokens } from './tokens.js';

interface PlayheadIndicatorProps {
  visible: boolean;
}

export function PlayheadIndicator({ visible }: PlayheadIndicatorProps) {
  if (!visible) return null;
  return (
    <div
      aria-label="Now playing"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        background: tokens.color.teal,
        borderRadius: `${tokens.radius.s}px 0 0 ${tokens.radius.s}px`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: 6,
          background: tokens.color.teal,
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 4px',
          borderRadius: tokens.radius.s,
          whiteSpace: 'nowrap',
        }}
      >
        NOW
      </span>
    </div>
  );
}
