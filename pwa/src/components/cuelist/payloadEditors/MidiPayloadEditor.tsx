import { useRef, useSyncExternalStore } from 'react';
import type { MidiPayload } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

type MidiKind = MidiPayload['message']['kind'];
const MIDI_KINDS: MidiKind[] = ['note_on', 'note_off', 'cc', 'program_change', 'raw'];

function makeDefaultMessage(kind: MidiKind): MidiPayload['message'] {
  switch (kind) {
    case 'note_on': return { kind: 'note_on', channel: 1, note: 60, velocity: 127 };
    case 'note_off': return { kind: 'note_off', channel: 1, note: 60, velocity: 0 };
    case 'cc': return { kind: 'cc', channel: 1, controller: 0, value: 0 };
    case 'program_change': return { kind: 'program_change', channel: 1, program: 0 };
    case 'raw': return { kind: 'raw', bytes: [] };
  }
}

function useDeviceIds(): string[] {
  const conn = useConnection();
  const cache = useRef<string[] | null>(null);
  return useSyncExternalStore(
    (cb) => {
      const d = conn.doc.getMap('devices');
      const handler = () => { cache.current = null; cb(); };
      d.observe(handler);
      return () => d.unobserve(handler);
    },
    () => {
      if (cache.current !== null) return cache.current;
      cache.current = [...conn.doc.getMap('devices').keys()];
      return cache.current;
    },
    () => [],
  );
}

interface MidiPayloadEditorProps {
  payload: MidiPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function MidiPayloadEditor({ payload, cuelistId, cueId, locked }: MidiPayloadEditorProps) {
  const conn = useConnection();
  const deviceIds = useDeviceIds();
  const msg = payload.message;

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

  const updateMsg = (partial: Record<string, unknown>) => {
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { message: { ...msg, ...partial } as unknown as MidiPayload['message'] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <label style={labelStyle}>
        Device
        <select value={payload.device_id} onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id: e.target.value })} disabled={locked} style={inputStyle} aria-label="MIDI device">
          <option value="">— none —</option>
          {deviceIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        Message Kind
        <select
          value={msg.kind}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { message: makeDefaultMessage(e.target.value as MidiKind) })}
          disabled={locked}
          style={inputStyle}
          aria-label="MIDI message kind"
        >
          {MIDI_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </label>

      {(msg.kind === 'note_on' || msg.kind === 'note_off' || msg.kind === 'cc' || msg.kind === 'program_change') && (
        <label style={labelStyle}>
          Channel (1–16)
          <input type="number" min={1} max={16} value={(msg as { channel: number }).channel} onChange={(e) => updateMsg({ channel: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI channel" />
        </label>
      )}

      {(msg.kind === 'note_on' || msg.kind === 'note_off') && (
        <>
          <label style={labelStyle}>
            Note (0–127)
            <input type="number" min={0} max={127} value={(msg as { note: number }).note} onChange={(e) => updateMsg({ note: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI note" />
          </label>
          <label style={labelStyle}>
            Velocity (0–127)
            <input type="number" min={0} max={127} value={(msg as { velocity: number }).velocity} onChange={(e) => updateMsg({ velocity: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI velocity" />
          </label>
        </>
      )}

      {msg.kind === 'cc' && (
        <>
          <label style={labelStyle}>
            Controller (0–127)
            <input type="number" min={0} max={127} value={(msg as { controller: number }).controller} onChange={(e) => updateMsg({ controller: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI controller" />
          </label>
          <label style={labelStyle}>
            Value (0–127)
            <input type="number" min={0} max={127} value={(msg as { value: number }).value} onChange={(e) => updateMsg({ value: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI CC value" />
          </label>
        </>
      )}

      {msg.kind === 'program_change' && (
        <label style={labelStyle}>
          Program (0–127)
          <input type="number" min={0} max={127} value={(msg as { program: number }).program} onChange={(e) => updateMsg({ program: Number(e.target.value) } as Partial<MidiPayload['message']>)} disabled={locked} style={inputStyle} aria-label="MIDI program" />
        </label>
      )}

      {msg.kind === 'raw' && (
        <label style={labelStyle}>
          Raw bytes (comma-separated 0–255)
          <input
            type="text"
            value={(msg as { bytes: number[] }).bytes.join(',')}
            onChange={(e) => {
              const bytes = e.target.value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
              updateMsg({ bytes } as Partial<MidiPayload['message']>);
            }}
            disabled={locked}
            style={inputStyle}
            aria-label="MIDI raw bytes"
          />
        </label>
      )}
    </div>
  );
}
