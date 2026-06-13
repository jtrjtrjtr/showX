import { useState, useCallback } from 'react';
import { useCue } from '../../hooks/useCue.js';
import { useMode } from '../../hooks/useMode.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { removeCue } from '../../../../src/modules/cuelist-core/src/document/cue.js';
import { addProposal } from '../../../../src/modules/cuelist-core/src/document/proposals.js';
import type { ProposalKind } from '../../../../src/modules/cuelist-core/src/document/proposals.js';
import { CueMetaFields } from './CueMetaFields.js';
import { PayloadList } from './PayloadList.js';
import { tokens } from './tokens.js';

interface DeleteConfirmDialogProps {
  cueLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ cueLabel, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete cue"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        style={{
          background: tokens.color.raised,
          borderRadius: tokens.radius.l,
          padding: tokens.space.xl,
          maxWidth: 360,
          width: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <h3 style={{ margin: `0 0 ${tokens.space.m}px`, fontSize: 16, fontWeight: 700, color: tokens.color.ink }}>
          Delete cue?
        </h3>
        <p style={{ margin: `0 0 ${tokens.space.l}px`, fontSize: 14, color: tokens.color.ink_secondary }}>
          &quot;{cueLabel}&quot; will be permanently removed. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: tokens.space.m, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              background: tokens.color.raised,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.s,
              fontSize: 14,
              cursor: 'pointer',
              color: tokens.color.ink,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              background: tokens.color.red,
              color: tokens.color.bg,
              border: 'none',
              borderRadius: tokens.radius.s,
              fontSize: 14,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Delete cue
          </button>
        </div>
      </div>
    </div>
  );
}

interface CueEditorProps {
  cuelistId: string;
  cueId: string;
  onClose: () => void;
}

export function CueEditor({ cuelistId, cueId, onClose }: CueEditorProps) {
  const cue = useCue(cuelistId, cueId);
  const { mode } = useMode();
  const conn = useConnection();
  const isLocked = mode === 'show';
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Proposal submit state (SHOW mode only)
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [propKind, setPropKind] = useState<ProposalKind>('cue');
  const [propField, setPropField] = useState('');
  const [propValue, setPropValue] = useState('');
  const [propSubmitError, setPropSubmitError] = useState<string | null>(null);
  const [propSubmitSuccess, setPropSubmitSuccess] = useState(false);

  const handleSubmitProposal = useCallback(() => {
    if (!propField.trim()) { setPropSubmitError('Field name is required'); return; }
    if (!propValue.trim()) { setPropSubmitError('Proposed value is required'); return; }
    setPropSubmitError(null);
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(propValue);
    } catch {
      parsedValue = propValue; // treat as plain string
    }
    addProposal(conn.doc, {
      cue_id: cueId,
      cuelist_id: cuelistId,
      author_operator_id: String(conn.doc.clientID),
      kind: propKind,
      target_field: propField.trim(),
      proposed_value: parsedValue,
    });
    setPropField('');
    setPropValue('');
    setShowProposalForm(false);
    setPropSubmitSuccess(true);
    setTimeout(() => setPropSubmitSuccess(false), 3000);
  }, [conn.doc, cueId, cuelistId, propKind, propField, propValue]);

  if (!cue) return null;

  const drawerStyle = {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(100vw, 520px)',
    background: tokens.color.panel,
    boxShadow: '-4px 0 32px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 150,
    fontFamily: tokens.font.ui,
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit cue: ${cue.label}`}
        style={drawerStyle}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.space.m,
            padding: `${tokens.space.m}px ${tokens.space.l}px`,
            borderBottom: `1px solid ${tokens.color.border}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: tokens.color.ink_secondary,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.ink }}>
            {cue.label || 'Untitled cue'}
          </h2>
        </header>

        {isLocked && (
          <div
            data-testid="show-lock-banner"
            role="status"
            aria-label="SHOW mode lock banner"
            style={{
              background: tokens.color.red,
              color: tokens.color.bg,
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.m }}>
              <span>🔒 SHOW mode — payload edits locked.</span>
              {propSubmitSuccess ? (
                <span
                  data-testid="proposal-submitted-confirm"
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(0,0,0,0.35)',
                    borderRadius: tokens.radius.s,
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    fontSize: 12,
                    color: tokens.color.bg,
                  }}
                >
                  ✓ Proposal submitted
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="propose-change-btn"
                  onClick={() => setShowProposalForm((v) => !v)}
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(0,0,0,0.35)',
                    color: tokens.color.bg,
                    borderRadius: tokens.radius.s,
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  Propose change
                </button>
              )}
            </div>

            {showProposalForm && (
              <div
                data-testid="proposal-form"
                style={{
                  marginTop: tokens.space.s,
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: tokens.radius.m,
                  padding: tokens.space.m,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: tokens.space.s,
                }}
              >
                <div style={{ display: 'flex', gap: tokens.space.s }}>
                  <label
                    style={{ fontSize: 11, fontWeight: 700, color: tokens.color.bg, alignSelf: 'center' }}
                    htmlFor="prop-kind"
                  >
                    Kind:
                  </label>
                  <select
                    id="prop-kind"
                    data-testid="proposal-kind-select"
                    value={propKind}
                    onChange={(e) => setPropKind(e.target.value as ProposalKind)}
                    style={{
                      fontSize: 12,
                      borderRadius: tokens.radius.s,
                      border: 'none',
                      padding: `1px ${tokens.space.s}px`,
                      background: 'rgba(0,0,0,0.3)',
                      color: tokens.color.bg,
                    }}
                  >
                    <option value="cue">Cue field</option>
                    <option value="payload">Payload</option>
                  </select>
                </div>
                <input
                  data-testid="proposal-field-input"
                  type="text"
                  placeholder={propKind === 'cue' ? 'Field (e.g. label, description)' : 'Target field / payload type'}
                  value={propField}
                  onChange={(e) => { setPropField(e.target.value); setPropSubmitError(null); }}
                  style={{
                    fontSize: 12,
                    borderRadius: tokens.radius.s,
                    border: propSubmitError && !propField.trim() ? '1px solid #ff8888' : 'none',
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    background: 'rgba(0,0,0,0.3)',
                    color: tokens.color.bg,
                  }}
                />
                <textarea
                  data-testid="proposal-value-input"
                  placeholder="Proposed value (JSON or plain text)"
                  value={propValue}
                  onChange={(e) => { setPropValue(e.target.value); setPropSubmitError(null); }}
                  rows={3}
                  style={{
                    fontSize: 12,
                    borderRadius: tokens.radius.s,
                    border: propSubmitError && !propValue.trim() ? '1px solid #ff8888' : 'none',
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    background: 'rgba(0,0,0,0.3)',
                    color: tokens.color.bg,
                    resize: 'vertical',
                    fontFamily: 'monospace',
                  }}
                />
                {propSubmitError && (
                  <div data-testid="proposal-error" style={{ fontSize: 11, color: '#ffcccc' }}>
                    {propSubmitError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: tokens.space.s }}>
                  <button
                    type="button"
                    data-testid="proposal-submit-btn"
                    onClick={handleSubmitProposal}
                    style={{
                      background: tokens.color.bg,
                      color: tokens.color.red,
                      border: 'none',
                      borderRadius: tokens.radius.s,
                      padding: `${tokens.space.xs}px ${tokens.space.m}px`,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowProposalForm(false); setPropSubmitError(null); }}
                    style={{
                      background: 'none',
                      color: tokens.color.bg,
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: tokens.radius.s,
                      padding: `${tokens.space.xs}px ${tokens.space.m}px`,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Meta fields: editable in both modes per Q7 (meta allowed in SHOW) */}
          <CueMetaFields cue={cue} cuelistId={cuelistId} disabled={false} />

          <div style={{ borderTop: `1px solid ${tokens.color.border}`, margin: `0 ${tokens.space.m}px` }} />

          <div style={{ paddingTop: tokens.space.m }}>
            <PayloadList cue={cue} cuelistId={cuelistId} locked={isLocked} />
          </div>
        </div>

        <footer
          style={{
            padding: tokens.space.m,
            borderTop: `1px solid ${tokens.color.border}`,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isLocked}
            style={{
              background: isLocked ? tokens.color.raised : tokens.color.red,
              color: isLocked ? tokens.color.ink_disabled : tokens.color.bg,
              border: 'none',
              borderRadius: tokens.radius.s,
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              fontSize: 14,
              cursor: isLocked ? 'default' : 'pointer',
              fontWeight: 600,
            }}
            aria-label="Delete cue"
          >
            Delete cue
          </button>
        </footer>
      </div>

      {confirmDelete && (
        <DeleteConfirmDialog
          cueLabel={cue.label}
          onConfirm={() => {
            removeCue(conn.doc, cuelistId, cueId);
            onClose();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
