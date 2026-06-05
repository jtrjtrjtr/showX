import * as Y from 'yjs';
import type { Cue, DepartmentTag, Trigger } from 'showx-shared';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { useCuelist } from '../../hooks/useCuelist.js';
import {
  setCueLabel,
  setCueDescription,
  setCueStandbyNote,
  setCueNotes,
  setCueDepartments,
  setCueTrigger,
  setCueDurationHint,
} from '../../../../src/modules/cuelist-core/src/document/cue.js';
import { DepartmentSelector } from './DepartmentSelector.js';
import { TriggerEditor } from './TriggerEditor.js';
import { tokens } from './tokens.js';

interface CueMetaFieldsProps {
  cue: Cue;
  cuelistId: string;
  disabled?: boolean;
}

export function CueMetaFields({ cue, cuelistId, disabled }: CueMetaFieldsProps) {
  const conn = useConnection();
  const { cues } = useCuelist(cuelistId);
  const modifiedBy = String(conn.doc.clientID);

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    color: tokens.color.gray_700,
    fontWeight: 600,
    marginBottom: tokens.space.xs,
  } as const;

  const inputStyle = {
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    border: `1px solid ${tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 14,
    width: '100%',
    background: disabled ? tokens.color.gray_50 : '#fff',
    boxSizing: 'border-box' as const,
  };

  const fieldStyle = { marginBottom: tokens.space.m };

  return (
    <div style={{ padding: tokens.space.m }}>
      <div style={fieldStyle}>
        <label style={labelStyle}>
          Label
          <input
            data-testid="cue-label-input"
            type="text"
            value={cue.label}
            onChange={(e) => setCueLabel(conn.doc, cuelistId, cue.id, e.target.value, modifiedBy)}
            disabled={disabled}
            style={inputStyle}
            aria-label="Cue label"
          />
        </label>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>
          Description
          <textarea
            value={cue.description}
            onChange={(e) => setCueDescription(conn.doc, cuelistId, cue.id, e.target.value, modifiedBy)}
            disabled={disabled}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            aria-label="Cue description"
          />
        </label>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>
          Standby note
          <input
            type="text"
            value={cue.standby_note}
            onChange={(e) => setCueStandbyNote(conn.doc, cuelistId, cue.id, e.target.value, modifiedBy)}
            disabled={disabled}
            style={inputStyle}
            aria-label="Standby note"
          />
        </label>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>
          Notes
          <textarea
            value={cue.notes}
            onChange={(e) => setCueNotes(conn.doc, cuelistId, cue.id, e.target.value, modifiedBy)}
            disabled={disabled}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            aria-label="Cue notes"
          />
        </label>
      </div>

      <div style={fieldStyle}>
        <DepartmentSelector
          value={cue.department}
          onChange={(depts: DepartmentTag[]) => setCueDepartments(conn.doc, cuelistId, cue.id, depts, modifiedBy)}
          disabled={disabled}
        />
      </div>

      <div style={fieldStyle}>
        <TriggerEditor
          cuelistId={cuelistId}
          cue={cue}
          cues={cues}
          onChange={(t: Trigger) => setCueTrigger(conn.doc, cuelistId, cue.id, t, modifiedBy)}
          disabled={disabled}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>
          Duration hint (ms, optional)
          <input
            type="number"
            min={0}
            value={cue.duration_hint_ms ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value);
              setCueDurationHint(conn.doc, cuelistId, cue.id, v, modifiedBy);
            }}
            disabled={disabled}
            style={inputStyle}
            aria-label="Duration hint ms"
            placeholder="optional"
          />
        </label>
      </div>
    </div>
  );
}
