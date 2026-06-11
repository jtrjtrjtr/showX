import { useRef, useSyncExternalStore } from 'react';
import type { MscPayload } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

const MSC_COMMANDS = ['go', 'stop', 'resume', 'load', 'set', 'fire', 'all_off'] as const;

function useDeviceIds(): string[] {
  const conn = useConnection();
  const cache = useRef<string[] | null>(null);
  return useSyncExternalStore(
    (cb) => {
      const devices = conn.doc.getMap('devices');
      const handler = () => { cache.current = null; cb(); };
      devices.observe(handler);
      return () => devices.unobserve(handler);
    },
    () => {
      if (cache.current !== null) return cache.current;
      cache.current = [...conn.doc.getMap('devices').keys()];
      return cache.current;
    },
    () => [],
  );
}

interface MscPayloadEditorProps {
  payload: MscPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function MscPayloadEditor({ payload, cuelistId, cueId, locked }: MscPayloadEditorProps) {
  const conn = useConnection();
  const deviceIds = useDeviceIds();

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
      <label style={labelStyle}>
        Command
        <select
          value={payload.command}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { command: e.target.value as MscPayload['command'] })}
          disabled={locked}
          style={inputStyle}
          aria-label="MSC command"
        >
          {MSC_COMMANDS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        Cue List
        <input
          type="text"
          value={payload.cue_list ?? ''}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { cue_list: e.target.value || null })}
          disabled={locked}
          style={inputStyle}
          aria-label="MSC cue list"
          placeholder="e.g. 1"
        />
      </label>

      <label style={labelStyle}>
        Cue Number
        <input
          type="text"
          value={payload.cue_number ?? ''}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { cue_number: e.target.value || null })}
          disabled={locked}
          style={inputStyle}
          aria-label="MSC cue number"
          placeholder="e.g. 1.5"
        />
      </label>

      <label style={labelStyle}>
        Device
        <select
          value={payload.device_id}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id: e.target.value })}
          disabled={locked}
          style={inputStyle}
          aria-label="MSC device"
        >
          <option value="">— none —</option>
          {deviceIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        MSC Device ID (0–127)
        <input
          type="number"
          min={0}
          max={127}
          value={payload.device_id_msc}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < 0 || v > 127) return;
            updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id_msc: v });
          }}
          disabled={locked}
          style={inputStyle}
          aria-label="MSC device ID numeric"
        />
      </label>
    </div>
  );
}
