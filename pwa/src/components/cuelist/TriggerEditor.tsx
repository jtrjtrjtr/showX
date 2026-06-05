import { useState } from 'react';
import type { Cue, Trigger, TriggerKind } from 'showx-shared';
import { tokens } from './tokens.js';

interface TriggerEditorProps {
  cuelistId: string;
  cue: Cue;
  cues: Cue[];
  onChange: (t: Trigger) => void;
  disabled?: boolean;
}

export function TriggerEditor({ cue, cues, onChange, disabled }: TriggerEditorProps) {
  const [kind, setKind] = useState<TriggerKind>(cue.trigger.kind);

  const handleKindChange = (k: TriggerKind) => {
    setKind(k);
    if (k === 'manual') {
      onChange({ kind: 'manual' });
    } else if (k === 'auto_continue') {
      onChange({ kind: 'auto_continue', delay_ms: 0 });
    } else if (k === 'auto_follow') {
      const idx = cues.findIndex((c) => c.id === cue.id);
      const prev = cues[idx - 1];
      onChange({ kind: 'auto_follow', prev_cue_id: prev?.id ?? '' });
    } else if (k === 'timecode') {
      onChange({ kind: 'timecode', time_ms: 0, source: 'internal' });
    }
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    color: tokens.color.gray_700,
    marginBottom: tokens.space.xs,
    fontWeight: 600,
  } as const;

  const inputStyle = {
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: disabled ? tokens.color.gray_50 : '#fff',
  } as const;

  return (
    <div>
      <label style={labelStyle}>Trigger</label>
      <select
        value={kind}
        onChange={(e) => handleKindChange(e.target.value as TriggerKind)}
        disabled={disabled}
        style={{ ...inputStyle, marginBottom: tokens.space.s }}
        aria-label="Trigger kind"
      >
        <option value="manual">Manual (GO press)</option>
        <option value="auto_continue">Auto continue (delay after prev fire)</option>
        <option value="auto_follow">Auto follow (after prev complete)</option>
        <option value="timecode" disabled>Timecode (post-MVP, ShowX 0.2)</option>
      </select>

      {cue.trigger.kind === 'auto_continue' && (
        <label style={{ ...labelStyle, marginTop: tokens.space.s }}>
          Delay after previous (ms)
          <input
            type="number"
            min={0}
            value={(cue.trigger as { kind: 'auto_continue'; delay_ms: number }).delay_ms}
            onChange={(e) =>
              onChange({ kind: 'auto_continue', delay_ms: Number(e.target.value) })
            }
            disabled={disabled}
            style={inputStyle}
            aria-label="Auto continue delay ms"
          />
        </label>
      )}

      {cue.trigger.kind === 'auto_follow' && (
        <label style={{ ...labelStyle, marginTop: tokens.space.s }}>
          Previous cue
          <select
            value={(cue.trigger as { kind: 'auto_follow'; prev_cue_id: string }).prev_cue_id}
            onChange={(e) => onChange({ kind: 'auto_follow', prev_cue_id: e.target.value })}
            disabled={disabled}
            style={inputStyle}
            aria-label="Auto follow previous cue"
          >
            <option value="">— select previous cue —</option>
            {cues
              .filter((c) => c.id !== cue.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
      )}

      {cue.trigger.kind === 'timecode' && (
        <div
          style={{
            color: tokens.color.yellow,
            fontSize: 12,
            marginTop: tokens.space.xs,
            padding: `${tokens.space.xs}px ${tokens.space.s}px`,
            background: tokens.color.gray_50,
            borderRadius: tokens.radius.s,
          }}
          role="status"
        >
          Timecode triggers deferred to ShowX 0.2; cue treated as manual until then.
        </div>
      )}
    </div>
  );
}
