import { useState, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Cue } from 'showx-shared';
import type { CueFieldPatch } from '../../hooks/useCuelist.js';
import { tokens } from './tokens.js';

export interface CueEditDialogProps {
  cue: Cue;
  onSave: (patch: CueFieldPatch) => void;
  onCancel: () => void;
}

export function CueEditDialog({ cue, onSave, onCancel }: CueEditDialogProps) {
  const [label, setLabel] = useState(cue.label);
  const [description, setDescription] = useState(cue.description);
  const [standbyNote, setStandbyNote] = useState(cue.standby_note);
  const [labelError, setLabelError] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
    labelRef.current?.select();
  }, []);

  const handleSave = useCallback(() => {
    if (label.trim() === '') {
      setLabelError(true);
      labelRef.current?.focus();
      return;
    }
    onSave({ label: label.trim(), description, standby_note: standbyNote });
  }, [label, description, standbyNote, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave, onCancel],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit cue"
      data-testid="cue-edit-dialog"
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: tokens.color.panel,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.l,
          padding: tokens.space.xxl,
          minWidth: 420,
          maxWidth: 560,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.space.l,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: tokens.color.ink,
            fontFamily: tokens.font.ui,
          }}
        >
          Edit cue
        </h2>

        <Field label="Label" error={labelError ? 'Label is required' : undefined}>
          <input
            ref={labelRef}
            data-testid="cue-edit-label"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setLabelError(false); }}
            placeholder="Cue label"
            style={inputStyle(labelError)}
          />
        </Field>

        <Field label="Description">
          <input
            data-testid="cue-edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={inputStyle(false)}
          />
        </Field>

        <Field label="Standby note">
          <input
            data-testid="cue-edit-standby-note"
            value={standbyNote}
            onChange={(e) => setStandbyNote(e.target.value)}
            placeholder="Standby note (optional)"
            style={inputStyle(false)}
          />
        </Field>

        <div style={{ display: 'flex', gap: tokens.space.m, justifyContent: 'flex-end', marginTop: tokens.space.s }}>
          <button
            data-testid="cue-edit-cancel"
            onClick={onCancel}
            style={{
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              background: 'none',
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.s,
              color: tokens.color.ink_secondary,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: tokens.font.ui,
            }}
          >
            Cancel
          </button>
          <button
            data-testid="cue-edit-save"
            onClick={handleSave}
            style={{
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              background: tokens.color.teal,
              border: 'none',
              borderRadius: tokens.radius.s,
              color: tokens.color.bg,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: tokens.font.ui,
            }}
          >
            Save
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: tokens.color.ink_disabled,
            fontFamily: tokens.font.ui,
          }}
        >
          Cmd/Ctrl+Enter to save · Esc to cancel
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.xs }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: tokens.color.ink_secondary,
          fontFamily: tokens.font.ui,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <span
          data-testid="cue-edit-label-error"
          style={{ fontSize: 12, color: tokens.color.red }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function inputStyle(hasError: boolean): CSSProperties {
  return {
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    background: tokens.color.raised,
    border: `1px solid ${hasError ? tokens.color.red : tokens.color.border}`,
    borderRadius: tokens.radius.s,
    color: tokens.color.ink,
    fontSize: 15,
    fontFamily: tokens.font.ui,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };
}
