import { useState } from 'react';
import { useCue } from '../../hooks/useCue.js';
import { useMode } from '../../hooks/useMode.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { removeCue } from '../../../../src/modules/cuelist-core/src/document/cue.js';
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
              color: tokens.color.ink,
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
              color: tokens.color.ink,
              padding: `${tokens.space.s}px ${tokens.space.l}px`,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: tokens.space.m,
              flexShrink: 0,
            }}
          >
            <span>🔒 SHOW mode — payload edits locked.</span>
            <button
              type="button"
              onClick={() => alert('Proposal queue coming in ShowX 0.2')}
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(0,0,0,0.35)',
                color: tokens.color.ink,
                borderRadius: tokens.radius.s,
                padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Propose change
            </button>
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
              color: isLocked ? tokens.color.ink_disabled : tokens.color.ink,
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
