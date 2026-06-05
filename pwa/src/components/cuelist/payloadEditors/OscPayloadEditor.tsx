import { useState, useRef, useSyncExternalStore } from 'react';
import type { OscPayload, OscArg } from 'showx-shared';
import { useConnection } from '../../../lib/ConnectionProvider.js';
import { updatePayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { tokens } from '../tokens.js';

const OSC_ARG_TYPES = ['int', 'float', 'string', 'bool', 'nil'] as const;

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

interface OscPayloadEditorProps {
  payload: OscPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function OscPayloadEditor({ payload, cuelistId, cueId, locked }: OscPayloadEditorProps) {
  const conn = useConnection();
  const deviceIds = useDeviceIds();
  const [addrErr, setAddrErr] = useState<string | null>(null);

  const modifiedBy = String(conn.doc.clientID);

  const labelStyle = { display: 'block', fontSize: 12, color: tokens.color.gray_700, fontWeight: 600, marginBottom: tokens.space.xs } as const;
  const inputStyle = (err?: boolean) => ({
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${err ? tokens.color.red : tokens.color.gray_300}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    background: locked ? tokens.color.gray_50 : '#fff',
  } as const);

  const updateAddress = (addr: string) => {
    if (!addr.startsWith('/')) {
      setAddrErr('Address must start with /');
      return;
    }
    setAddrErr(null);
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { address: addr });
  };

  const updateArg = (idx: number, arg: OscArg) => {
    const newArgs = payload.args.map((a, i) => (i === idx ? arg : a));
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { args: newArgs });
  };

  const addArg = () => {
    const newArgs: OscArg[] = [...payload.args, { type: 'int', value: 0 }];
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { args: newArgs });
  };

  const removeArg = (idx: number) => {
    const newArgs = payload.args.filter((_, i) => i !== idx);
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { args: newArgs });
  };

  void modifiedBy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <label style={labelStyle}>
        OSC Address
        <input
          type="text"
          value={payload.address}
          onChange={(e) => updateAddress(e.target.value)}
          disabled={locked}
          style={inputStyle(!!addrErr)}
          aria-label="OSC address"
        />
        {addrErr && (
          <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>
            {addrErr}
          </span>
        )}
      </label>

      <label style={labelStyle}>
        Device
        <select
          value={payload.device_id}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id: e.target.value })}
          disabled={locked}
          style={inputStyle()}
          aria-label="OSC device"
        >
          <option value="">— none —</option>
          {deviceIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Arguments</span>
          {!locked && (
            <button
              type="button"
              onClick={addArg}
              style={{
                fontSize: 11,
                padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                background: tokens.color.teal,
                color: '#fff',
                border: 'none',
                borderRadius: tokens.radius.s,
                cursor: 'pointer',
              }}
            >
              + arg
            </button>
          )}
        </div>
        {payload.args.map((arg, idx) => (
          <div key={idx} style={{ display: 'flex', gap: tokens.space.s, marginBottom: tokens.space.xs, alignItems: 'center' }}>
            <select
              value={arg.type}
              disabled={locked}
              onChange={(e) => {
                const t = e.target.value as OscArg['type'];
                const next: OscArg = t === 'nil' ? { type: 'nil' } : t === 'bool' ? { type: 'bool', value: false } : t === 'string' ? { type: 'string', value: '' } : { type: t as 'int' | 'float', value: 0 };
                updateArg(idx, next);
              }}
              style={{ padding: `${tokens.space.xs}px`, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s, fontSize: 12 }}
              aria-label={`Arg ${idx + 1} type`}
            >
              {OSC_ARG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {arg.type !== 'nil' && (
              arg.type === 'bool' ? (
                <input
                  type="checkbox"
                  checked={arg.value as boolean}
                  disabled={locked}
                  onChange={(e) => updateArg(idx, { type: 'bool', value: e.target.checked })}
                  aria-label={`Arg ${idx + 1} value`}
                />
              ) : (
                <input
                  type={arg.type === 'int' || arg.type === 'float' ? 'number' : 'text'}
                  value={String(arg.value)}
                  disabled={locked}
                  onChange={(e) => {
                    const v = arg.type === 'int' ? parseInt(e.target.value, 10) : arg.type === 'float' ? parseFloat(e.target.value) : e.target.value;
                    updateArg(idx, { type: arg.type, value: v } as OscArg);
                  }}
                  style={{ flex: 1, padding: `${tokens.space.xs}px`, border: `1px solid ${tokens.color.gray_300}`, borderRadius: tokens.radius.s, fontSize: 12 }}
                  aria-label={`Arg ${idx + 1} value`}
                />
              )
            )}
            {!locked && (
              <button
                type="button"
                onClick={() => removeArg(idx)}
                style={{ background: 'none', border: 'none', color: tokens.color.red, cursor: 'pointer', fontSize: 14 }}
                aria-label={`Remove arg ${idx + 1}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
