import { useState, useRef, useSyncExternalStore } from 'react';
import type { LxRefPayload } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

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

interface LxRefPayloadEditorProps {
  payload: LxRefPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function LxRefPayloadEditor({ payload, cuelistId, cueId, locked }: LxRefPayloadEditorProps) {
  const conn = useConnection();
  const deviceIds = useDeviceIds();
  const [cueListErr, setCueListErr] = useState<string | null>(null);
  const [cueNumErr, setCueNumErr] = useState<string | null>(null);

  const labelStyle = { display: 'block', fontSize: 12, color: tokens.color.gray_700, fontWeight: 600, marginBottom: tokens.space.xs } as const;
  const inputStyle = (err?: boolean) => ({
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${err ? tokens.color.red : tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: locked ? tokens.color.gray_50 : '#fff',
  } as const);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <label style={labelStyle}>
        Device
        <select
          value={payload.device_id}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id: e.target.value })}
          disabled={locked}
          style={inputStyle()}
          aria-label="LX Ref device"
        >
          <option value="">— none —</option>
          {deviceIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>

      <label style={labelStyle}>
        Cue List (≥ 1)
        <input
          type="number"
          min={1}
          step={1}
          value={payload.cue_list}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < 1) {
              setCueListErr('Cue list must be ≥ 1');
              return;
            }
            setCueListErr(null);
            updatePayload(conn.doc, cuelistId, cueId, payload.id, { cue_list: v });
          }}
          disabled={locked}
          style={inputStyle(!!cueListErr)}
          aria-label="LX Ref cue list"
        />
        {cueListErr && <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>{cueListErr}</span>}
      </label>

      <label style={labelStyle}>
        Cue Number (≥ 0, fractional OK)
        <input
          type="number"
          min={0}
          step={0.1}
          value={payload.cue_number}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (isNaN(v) || v < 0) {
              setCueNumErr('Cue number must be ≥ 0');
              return;
            }
            setCueNumErr(null);
            updatePayload(conn.doc, cuelistId, cueId, payload.id, { cue_number: v });
          }}
          disabled={locked}
          style={inputStyle(!!cueNumErr)}
          aria-label="LX Ref cue number"
        />
        {cueNumErr && <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>{cueNumErr}</span>}
      </label>
    </div>
  );
}
