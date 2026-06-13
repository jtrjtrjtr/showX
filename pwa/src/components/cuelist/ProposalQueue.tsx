import { useState, useEffect, useCallback } from 'react';
import type { Cue } from 'showx-shared';
import { listProposals, resolveProposal, pendingProposalCount } from '../../../../src/modules/cuelist-core/src/document/proposals.js';
import type { Proposal } from '../../../../src/modules/cuelist-core/src/document/proposals.js';
import { useConnection } from '../../lib/ConnectionProvider.js';
import { tokens } from './tokens.js';

// ── useProposals ──────────────────────────────────────────────────────────────

function useProposals(): { proposals: Proposal[]; pendingCount: number } {
  const conn = useConnection();
  const [proposals, setProposals] = useState<Proposal[]>(() => listProposals(conn.doc));
  const [pendingCount, setPendingCount] = useState<number>(() => pendingProposalCount(conn.doc));

  useEffect(() => {
    const arr = conn.doc.getArray('proposals');
    const refresh = () => {
      setProposals(listProposals(conn.doc));
      setPendingCount(pendingProposalCount(conn.doc));
    };
    arr.observe(refresh);
    return () => arr.unobserve(refresh);
  }, [conn.doc]);

  return { proposals, pendingCount };
}

// ── ProposalBadge ─────────────────────────────────────────────────────────────

interface ProposalBadgeProps {
  count: number;
  onClick: () => void;
}

export function ProposalBadge({ count, onClick }: ProposalBadgeProps) {
  return (
    <button
      data-testid="proposal-queue-badge"
      aria-label={`${count} pending proposal${count !== 1 ? 's' : ''} — click to review`}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.xs,
        padding: `${tokens.space.xs}px ${tokens.space.s}px`,
        background: count > 0 ? tokens.color.yellow : 'none',
        color: count > 0 ? '#1a1200' : tokens.color.ink_disabled,
        border: `1px solid ${count > 0 ? tokens.color.yellow : tokens.color.border}`,
        borderRadius: tokens.radius.s,
        fontSize: 11,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: tokens.font.ui,
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}
    >
      PROPOSALS
      {count > 0 && (
        <span
          style={{
            background: '#1a1200',
            color: tokens.color.yellow,
            borderRadius: 10,
            padding: '1px 5px',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── ProposalQueue ─────────────────────────────────────────────────────────────

interface ProposalQueueProps {
  cues: Cue[];
  onClose: () => void;
}

export function ProposalQueue({ cues, onClose }: ProposalQueueProps) {
  const conn = useConnection();
  const { proposals } = useProposals();
  const resolvedById = String(conn.doc.clientID);

  const handleAccept = useCallback(
    (id: string) => {
      try {
        resolveProposal(conn.doc, id, 'accepted', resolvedById);
      } catch (e) {
        console.error('ProposalQueue accept failed:', e);
      }
    },
    [conn.doc, resolvedById],
  );

  const handleReject = useCallback(
    (id: string) => {
      try {
        resolveProposal(conn.doc, id, 'rejected', resolvedById);
      } catch (e) {
        console.error('ProposalQueue reject failed:', e);
      }
    },
    [conn.doc, resolvedById],
  );

  const pending = proposals.filter((p) => p.status === 'pending');
  const resolved = proposals.filter((p) => p.status !== 'pending');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proposal queue"
      data-testid="proposal-queue"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        zIndex: 220,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: tokens.color.panel,
          borderLeft: `1px solid ${tokens.color.border}`,
          width: 'min(100vw, 480px)',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: tokens.font.ui,
        }}
        onClick={(e) => e.stopPropagation()}
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: tokens.color.ink, flex: 1 }}>
            Proposal Queue
            {pending.length > 0 && (
              <span style={{ marginLeft: tokens.space.s, fontSize: 13, color: tokens.color.yellow }}>
                ({pending.length} pending)
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close proposal queue"
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
        </header>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {proposals.length === 0 && (
            <div
              style={{
                padding: tokens.space.xxl,
                textAlign: 'center',
                color: tokens.color.ink_secondary,
                fontSize: 13,
              }}
            >
              No proposals yet
            </div>
          )}

          {pending.length > 0 && (
            <section>
              <div
                style={{
                  padding: `${tokens.space.s}px ${tokens.space.l}px`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: tokens.color.ink_secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${tokens.color.border}`,
                }}
              >
                Pending
              </div>
              {pending.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  cues={cues}
                  onAccept={() => handleAccept(p.id)}
                  onReject={() => handleReject(p.id)}
                />
              ))}
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <div
                style={{
                  padding: `${tokens.space.s}px ${tokens.space.l}px`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: tokens.color.ink_secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  borderBottom: `1px solid ${tokens.color.border}`,
                  borderTop: `1px solid ${tokens.color.border}`,
                }}
              >
                Resolved
              </div>
              {resolved.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  cues={cues}
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProposalCard ──────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: Proposal;
  cues: Cue[];
  onAccept?: () => void;
  onReject?: () => void;
}

function ProposalCard({ proposal, cues, onAccept, onReject }: ProposalCardProps) {
  const cueName = cues.find((c) => c.id === proposal.cue_id)?.label ?? proposal.cue_id;
  const isPending = proposal.status === 'pending';

  let parsedDisplay = proposal.proposed_value;
  try {
    parsedDisplay = JSON.stringify(JSON.parse(proposal.proposed_value), null, 1);
  } catch {
    // keep raw string
  }

  const statusColor =
    proposal.status === 'accepted'
      ? tokens.color.green
      : proposal.status === 'rejected'
        ? tokens.color.red
        : tokens.color.yellow;

  return (
    <div
      data-testid={`proposal-card-${proposal.id}`}
      style={{
        padding: `${tokens.space.m}px ${tokens.space.l}px`,
        borderBottom: `1px solid ${tokens.color.border}`,
        opacity: isPending ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space.s,
          marginBottom: tokens.space.xs,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: statusColor,
            border: `1px solid ${statusColor}`,
            borderRadius: tokens.radius.s,
            padding: '1px 5px',
          }}
        >
          {proposal.status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: tokens.color.ink_secondary,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.s,
            padding: '1px 5px',
          }}
        >
          {proposal.kind}
        </span>
        <span style={{ fontSize: 12, color: tokens.color.ink, fontWeight: 600 }}>{cueName}</span>
      </div>

      <div style={{ fontSize: 12, color: tokens.color.ink_secondary, marginBottom: tokens.space.xs }}>
        <strong style={{ color: tokens.color.ink }}>Field:</strong> {proposal.target_field}
      </div>

      <div
        style={{
          fontSize: 11,
          color: tokens.color.ink_secondary,
          background: tokens.color.raised,
          borderRadius: tokens.radius.s,
          padding: `${tokens.space.xs}px ${tokens.space.s}px`,
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          marginBottom: tokens.space.s,
          whiteSpace: 'pre-wrap',
        }}
      >
        {parsedDisplay}
      </div>

      <div style={{ fontSize: 11, color: tokens.color.ink_secondary, marginBottom: isPending ? tokens.space.s : 0 }}>
        From: {proposal.author_operator_id}
        {proposal.resolved_by && ` · Resolved by: ${proposal.resolved_by}`}
      </div>

      {isPending && onAccept && onReject && (
        <div style={{ display: 'flex', gap: tokens.space.s }}>
          <button
            data-testid={`proposal-accept-${proposal.id}`}
            type="button"
            onClick={onAccept}
            style={{
              padding: `${tokens.space.xs}px ${tokens.space.m}px`,
              background: tokens.color.green,
              color: tokens.color.bg,
              border: 'none',
              borderRadius: tokens.radius.s,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: tokens.font.ui,
            }}
          >
            Accept
          </button>
          <button
            data-testid={`proposal-reject-${proposal.id}`}
            type="button"
            onClick={onReject}
            style={{
              padding: `${tokens.space.xs}px ${tokens.space.m}px`,
              background: 'none',
              color: tokens.color.red,
              border: `1px solid ${tokens.color.red}`,
              borderRadius: tokens.radius.s,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: tokens.font.ui,
            }}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
