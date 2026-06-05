import { tokens } from './tokens.js';

export interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(27,26,24,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: tokens.color.cream,
          padding: tokens.space.xxl,
          borderRadius: tokens.radius.l,
          minWidth: 340,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Keyboard shortcuts</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {([
              ['Space', 'GO — fire armed cue'],
              ['Q', 'Standby — arm playhead cue'],
              ['↑ / ↓', 'Navigate playhead'],
              ['Esc', 'Unarm current cue'],
              ['Cmd+Shift+G (long-press)', 'Override fire (SM emergency)'],
              ['?', 'This help'],
            ] as [string, string][]).map(([key, desc]) => (
              <tr key={key}>
                <td
                  style={{
                    padding: '4px 12px 4px 0',
                    fontFamily: tokens.font.mono,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </td>
                <td style={{ padding: '4px 0', color: tokens.color.gray_700 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: tokens.color.gray_700, marginTop: tokens.space.l }}>
          GO authority: only the Stage Manager station can fire. Operators see the button but cannot
          dispatch.
        </p>
        <button
          onClick={onClose}
          style={{
            marginTop: tokens.space.l,
            padding: `${tokens.space.s}px ${tokens.space.l}px`,
            background: tokens.color.teal,
            color: '#fff',
            border: 'none',
            borderRadius: tokens.radius.s,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
