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
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: tokens.color.panel,
          color: tokens.color.ink,
          padding: tokens.space.xxl,
          borderRadius: tokens.radius.l,
          minWidth: 340,
          border: `1px solid ${tokens.color.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, color: tokens.color.ink }}>Keyboard shortcuts</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {([
              ['Space', 'GO — fire armed cue (SHOW mode: hold 250ms)'],
              ['Q', 'Standby — arm playhead cue'],
              ['B', 'BACK — re-arm previous cue (no dispatch)'],
              ['E', 'Edit playhead cue (REHEARSAL only)'],
              ['↑ / ↓', 'Navigate playhead'],
              ['Esc', 'Unarm / close inline edit'],
              ['N', 'Edit cue number of selected row (REHEARSAL)'],
              ['L', 'Edit label of selected row (REHEARSAL)'],
              ['D', 'Edit duration of selected row in seconds (REHEARSAL)'],
              ['O', 'Edit standby note of selected row (REHEARSAL)'],
              ['Tab', 'Commit inline edit + move to next field'],
              ['Cmd+Shift+G', 'Override fire (SM emergency)'],
              ['?', 'This help'],
            ] as [string, string][]).map(([key, desc]) => (
              <tr key={key}>
                <td
                  style={{
                    padding: '4px 12px 4px 0',
                    fontFamily: tokens.font.mono,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: tokens.color.teal,
                  }}
                >
                  {key}
                </td>
                <td style={{ padding: '4px 0', color: tokens.color.ink_secondary }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: tokens.color.ink_secondary, marginTop: tokens.space.l }}>
          GO authority: only the Stage Manager station can fire. Operators see the button but cannot
          dispatch.
        </p>
        <button
          onClick={onClose}
          style={{
            marginTop: tokens.space.l,
            padding: `${tokens.space.s}px ${tokens.space.l}px`,
            background: tokens.color.teal,
            color: tokens.color.bg,
            border: 'none',
            borderRadius: tokens.radius.s,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
