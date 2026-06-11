import { useState } from 'react';
import type { Cue, Payload, PayloadType } from 'showx-shared';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type PayloadInput = DistributiveOmit<Payload, 'id'>;
import { useConnection } from '../../lib/ConnectionProvider.js';
import {
  addPayload,
  removePayload,
} from '../../../../src/modules/cuelist-core/src/document/payload.js';
import { reorderPayloads } from '../../../../src/modules/cuelist-core/src/cue/payloadOps.js';
import { PayloadEditorSwitch } from './payloadEditors/PayloadEditorSwitch.js';
import { AddPayloadMenu } from './AddPayloadMenu.js';
import { summarizePayload } from './payloadSummaries.js';
import { tokens } from './tokens.js';

function makeDefaultPayload(type: PayloadType): PayloadInput {
  switch (type) {
    case 'osc':
      return { type: 'osc', tag: null, note: '', device_id: '', address: '/', args: [] };
    case 'msc':
      return { type: 'msc', tag: null, note: '', device_id: '', command: 'go', cue_list: null, cue_number: null, device_id_msc: 127 };
    case 'lx_ref':
      return { type: 'lx_ref', tag: null, note: '', device_id: '', cue_list: 1, cue_number: 1 };
    case 'midi':
      return { type: 'midi', tag: null, note: '', device_id: '', message: { kind: 'note_on', channel: 1, note: 60, velocity: 127 } };
    case 'webhook':
      return { type: 'webhook', tag: null, note: '', url: 'https://', method: 'POST', headers: {}, body: null, timeout_ms: 5000 };
    case 'wait':
      return { type: 'wait', tag: null, note: '', duration_ms: 1000 };
    case 'group':
      return { type: 'group', tag: null, note: '', child_cue_ids: [], fire_mode: 'parallel' };
  }
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  osc: tokens.color.teal,
  msc: '#7C5BCF',
  lx_ref: tokens.color.yellow,
  midi: '#E97B3B',
  webhook: '#4A88C7',
  wait: tokens.color.gray_700,
  group: tokens.color.green,
};

interface PayloadListProps {
  cue: Cue;
  cuelistId: string;
  locked: boolean;
}

export function PayloadList({ cue, cuelistId, locked }: PayloadListProps) {
  const conn = useConnection();
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDrop = (dropIdx: number) => {
    if (draggingIdx == null || draggingIdx === dropIdx) return;
    const newOrder = cue.payloads.map((p) => p.id);
    const [moved] = newOrder.splice(draggingIdx, 1);
    newOrder.splice(dropIdx, 0, moved);
    reorderPayloads(conn.doc, cuelistId, cue.id, newOrder);
    setDraggingIdx(null);
  };

  return (
    <div style={{ padding: `0 ${tokens.space.m}px` }}>
      <div style={{ fontSize: 12, color: tokens.color.gray_700, fontWeight: 600, marginBottom: tokens.space.s }}>
        Payloads ({cue.payloads.length})
      </div>

      {cue.payloads.length === 0 && (
        <div style={{ fontSize: 13, color: tokens.color.gray_700, marginBottom: tokens.space.m }}>
          No payloads — add one below.
        </div>
      )}

      {cue.payloads.map((p: Payload, i: number) => (
        <div
          key={p.id}
          data-testid={p.tag ? `payload-${p.tag}` : `payload-${p.type}-${i}`}
          draggable={!locked}
          onDragStart={() => setDraggingIdx(i)}
          onDrop={() => handleDrop(i)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={() => setDraggingIdx(null)}
          style={{
            marginBottom: tokens.space.s,
            border: `1px solid ${tokens.color.gray_300}`,
            borderRadius: tokens.radius.m,
            overflow: 'hidden',
            opacity: draggingIdx === i ? 0.5 : 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.space.s,
              padding: `${tokens.space.s}px ${tokens.space.m}px`,
              background: tokens.color.raised,
              cursor: locked ? 'default' : 'grab',
            }}
          >
            {!locked && (
              <span style={{ color: tokens.color.gray_300, fontSize: 16, cursor: 'grab' }} aria-hidden>⠿</span>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: TYPE_BADGE_COLORS[p.type] ?? tokens.color.gray_300,
                color: tokens.color.bg,
                padding: `1px 6px`,
                borderRadius: 3,
                textTransform: 'uppercase',
              }}
            >
              {p.type}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: tokens.color.ink, fontFamily: tokens.font.mono }}>
              {summarizePayload(p)}
            </span>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
              style={{ background: 'none', border: 'none', fontSize: 12, cursor: 'pointer', color: tokens.color.teal }}
              aria-label={expandedId === p.id ? `Collapse ${p.type} payload` : `Expand ${p.type} payload`}
              aria-expanded={expandedId === p.id}
            >
              {expandedId === p.id ? '▲' : '▼'}
            </button>
            {!locked && (
              <button
                type="button"
                onClick={() => removePayload(conn.doc, cuelistId, cue.id, p.id)}
                style={{ background: 'none', border: 'none', color: tokens.color.red, cursor: 'pointer', fontSize: 16 }}
                aria-label={`Remove ${p.type} payload`}
              >
                ×
              </button>
            )}
          </div>

          {expandedId === p.id && (
            <div style={{ padding: tokens.space.m }}>
              <PayloadEditorSwitch
                payload={p}
                cuelistId={cuelistId}
                cueId={cue.id}
                locked={locked}
              />
            </div>
          )}
        </div>
      ))}

      <AddPayloadMenu
        onAdd={(type: PayloadType) => addPayload(conn.doc, cuelistId, cue.id, makeDefaultPayload(type))}
        disabled={locked}
      />
    </div>
  );
}
