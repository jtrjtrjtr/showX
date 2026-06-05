import type { CSSProperties } from 'react';
import type { Cue } from 'showx-shared';
import { tokens } from './tokens.js';

export interface GoConfirmDialogProps {
  cue: Cue;
  onConfirm: () => void;
  onCancel: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(27,26,24,0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const dialogStyle: CSSProperties = {
  background: tokens.color.cream,
  padding: tokens.space.xxl,
  borderRadius: tokens.radius.l,
  minWidth: 320,
  maxWidth: 480,
};

export function GoConfirmDialog({ cue, onConfirm, onCancel }: GoConfirmDialogProps) {
  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-dialog-title"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="override-dialog-title" style={{ marginTop: 0 }}>
          Override fire?
        </h2>
        <p>
          Fire cue <strong>{cue.label}</strong> bypassing authority check?
        </p>
        <p style={{ color: tokens.color.gray_700, fontSize: 14 }}>
          Use only for emergency / SM intervention. This action is logged.
        </p>
        <div style={{ display: 'flex', gap: tokens.space.m, marginTop: tokens.space.l }}>
          <button
            onClick={onConfirm}
            style={{
              background: tokens.color.red,
              color: tokens.color.cream,
              border: 'none',
              borderRadius: tokens.radius.m,
              padding: `${tokens.space.s}px ${tokens.space.xl}px`,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Override fire
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: `1px solid ${tokens.color.gray_300}`,
              borderRadius: tokens.radius.m,
              padding: `${tokens.space.s}px ${tokens.space.xl}px`,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
