import type { GroupPayload, Cue } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { useCuelist } from '../../../hooks/useCuelist.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

interface GroupPayloadEditorProps {
  payload: GroupPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function GroupPayloadEditor({ payload, cuelistId, cueId, locked }: GroupPayloadEditorProps) {
  const conn = useConnection();
  const { cues } = useCuelist(cuelistId);

  const otherCues = cues.filter((c: Cue) => c.id !== cueId);

  const toggleChild = (childId: string) => {
    const ids = payload.child_cue_ids.includes(childId)
      ? payload.child_cue_ids.filter((id) => id !== childId)
      : [...payload.child_cue_ids, childId];
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { child_cue_ids: ids });
  };

  const labelStyle = { display: 'block', fontSize: 12, color: tokens.color.ink_secondary, fontWeight: 600, marginBottom: tokens.space.xs } as const;
  const inputStyle = {
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: locked ? tokens.color.raised : tokens.color.panel,
    color: tokens.color.ink,
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <div>
        <div style={labelStyle}>Child cues</div>
        {otherCues.length === 0 ? (
          <div style={{ fontSize: 12, color: tokens.color.gray_700 }}>No other cues in this cuelist.</div>
        ) : (
          otherCues.map((c: Cue) => {
            const selected = payload.child_cue_ids.includes(c.id);
            return (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.space.s,
                  marginBottom: tokens.space.xs,
                  fontSize: 13,
                  cursor: locked ? 'default' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => { if (!locked) toggleChild(c.id); }}
                  disabled={locked}
                  aria-label={`Include cue ${c.label}`}
                />
                {c.label}
              </label>
            );
          })
        )}
      </div>

      <label style={labelStyle}>
        Fire mode
        <select
          value={payload.fire_mode}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { fire_mode: e.target.value as GroupPayload['fire_mode'] })}
          disabled={locked}
          style={inputStyle}
          aria-label="Group fire mode"
        >
          <option value="parallel">Parallel (all at once)</option>
          <option value="series">Series (one after another)</option>
        </select>
      </label>
    </div>
  );
}
