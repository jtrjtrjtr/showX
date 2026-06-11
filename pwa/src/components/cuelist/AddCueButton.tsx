import { tokens } from './tokens.js';

interface AddCueButtonProps {
  onClick: () => void;
  label?: string;
  compact?: boolean;
}

export function AddCueButton({ onClick, label = '+ Add cue', compact = false }: AddCueButtonProps) {
  return (
    <button
      data-testid="add-cue-btn"
      aria-label={label}
      onClick={onClick}
      style={{
        padding: compact
          ? `${tokens.space.xs}px ${tokens.space.m}px`
          : `${tokens.space.m}px ${tokens.space.xl}px`,
        background: tokens.color.teal,
        color: tokens.color.bg,
        border: 'none',
        borderRadius: tokens.radius.m,
        fontSize: compact ? 13 : 16,
        cursor: 'pointer',
        fontWeight: 600,
        fontFamily: tokens.font.ui,
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}
