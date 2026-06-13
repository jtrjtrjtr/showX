import { useState, useRef, useSyncExternalStore } from 'react';
import type { DmxPayload, DmxChannel } from 'showx-shared';
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

interface RowError { channelErr: string | null; valueErr: string | null }

interface DmxPayloadEditorProps {
  payload: DmxPayload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

export function DmxPayloadEditor({ payload, cuelistId, cueId, locked }: DmxPayloadEditorProps) {
  const conn = useConnection();
  const deviceIds = useDeviceIds();
  const [universeErr, setUniverseErr] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>(() =>
    payload.channels.map(() => ({ channelErr: null, valueErr: null }))
  );

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    color: tokens.color.ink_secondary,
    fontWeight: 600,
    marginBottom: tokens.space.xs,
  } as const;

  const inputStyle = (err?: boolean) => ({
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    border: `1px solid ${err ? tokens.color.red : tokens.color.border}`,
    borderRadius: tokens.radius.s,
    fontSize: 13,
    width: '100%',
    minHeight: 44,
    background: locked ? tokens.color.raised : tokens.color.panel,
    color: tokens.color.ink,
    boxSizing: 'border-box' as const,
  });

  const writeChannels = (channels: DmxChannel[]) => {
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { channels });
  };

  const updateRowChannel = (idx: number, ch: number) => {
    if (isNaN(ch) || ch < 1 || ch > 512) {
      setRowErrors((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], channelErr: 'Channel must be 1–512' };
        return next;
      });
      return;
    }
    setRowErrors((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], channelErr: null };
      return next;
    });
    writeChannels(payload.channels.map((r, i) => (i === idx ? { ...r, channel: ch } : r)));
  };

  const updateRowValue = (idx: number, v: number) => {
    if (isNaN(v) || v < 0 || v > 255) {
      setRowErrors((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], valueErr: 'Value must be 0–255' };
        return next;
      });
      return;
    }
    setRowErrors((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], valueErr: null };
      return next;
    });
    writeChannels(payload.channels.map((r, i) => (i === idx ? { ...r, value: v } : r)));
  };

  const addRow = () => {
    writeChannels([...payload.channels, { channel: 1, value: 0 }]);
    setRowErrors((prev) => [...prev, { channelErr: null, valueErr: null }]);
  };

  const removeRow = (idx: number) => {
    if (payload.channels.length <= 1) return;
    writeChannels(payload.channels.filter((_, i) => i !== idx));
    setRowErrors((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s }}>
      <label style={labelStyle}>
        Device
        <select
          value={payload.device_id}
          onChange={(e) => updatePayload(conn.doc, cuelistId, cueId, payload.id, { device_id: e.target.value })}
          disabled={locked}
          style={inputStyle()}
          aria-label="DMX device"
        >
          <option value="">— none —</option>
          {deviceIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>

      <label style={labelStyle}>
        Universe (≥ 0)
        <input
          type="number"
          min={0}
          step={1}
          value={payload.universe}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (isNaN(v) || v < 0) {
              setUniverseErr('Universe must be ≥ 0');
              return;
            }
            setUniverseErr(null);
            updatePayload(conn.doc, cuelistId, cueId, payload.id, { universe: v });
          }}
          disabled={locked}
          style={inputStyle(!!universeErr)}
          aria-label="DMX universe"
        />
        {universeErr && (
          <span role="alert" style={{ color: tokens.color.red, fontSize: 12 }}>{universeErr}</span>
        )}
      </label>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: tokens.color.ink_secondary,
            fontWeight: 600,
            marginBottom: tokens.space.xs,
          }}
        >
          <span>Channels</span>
          {!locked && (
            <button
              type="button"
              onClick={addRow}
              aria-label="Add DMX channel"
              style={{
                fontSize: 11,
                padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                minHeight: 36,
                background: tokens.color.teal,
                color: tokens.color.bg,
                border: 'none',
                borderRadius: tokens.radius.s,
                cursor: 'pointer',
              }}
            >
              + channel
            </button>
          )}
        </div>

        {payload.channels.length === 0 && (
          <div style={{ fontSize: 12, color: tokens.color.gray_700, marginBottom: tokens.space.s }}>
            No channels — add one above.
          </div>
        )}

        {payload.channels.map((row, idx) => {
          const err = rowErrors[idx] ?? { channelErr: null, valueErr: null };
          return (
            <div
              key={idx}
              style={{ display: 'flex', gap: tokens.space.s, marginBottom: tokens.space.s, alignItems: 'flex-start' }}
            >
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min={1}
                  max={512}
                  step={1}
                  value={row.channel}
                  disabled={locked}
                  onChange={(e) => updateRowChannel(idx, parseInt(e.target.value, 10))}
                  style={{
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    border: `1px solid ${err.channelErr ? tokens.color.red : tokens.color.border}`,
                    borderRadius: tokens.radius.s,
                    fontSize: 13,
                    width: '100%',
                    minHeight: 44,
                    background: locked ? tokens.color.raised : tokens.color.panel,
                    color: tokens.color.ink,
                    boxSizing: 'border-box' as const,
                  }}
                  aria-label={`Channel ${idx + 1} number`}
                />
                {err.channelErr && (
                  <span role="alert" style={{ color: tokens.color.red, fontSize: 11 }}>{err.channelErr}</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  min={0}
                  max={255}
                  step={1}
                  value={row.value}
                  disabled={locked}
                  onChange={(e) => updateRowValue(idx, parseInt(e.target.value, 10))}
                  style={{
                    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                    border: `1px solid ${err.valueErr ? tokens.color.red : tokens.color.border}`,
                    borderRadius: tokens.radius.s,
                    fontSize: 13,
                    width: '100%',
                    minHeight: 44,
                    background: locked ? tokens.color.raised : tokens.color.panel,
                    color: tokens.color.ink,
                    boxSizing: 'border-box' as const,
                  }}
                  aria-label={`Channel ${idx + 1} value`}
                />
                {err.valueErr && (
                  <span role="alert" style={{ color: tokens.color.red, fontSize: 11 }}>{err.valueErr}</span>
                )}
              </div>
              {!locked && payload.channels.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  aria-label={`Remove channel ${idx + 1}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: tokens.color.red,
                    cursor: 'pointer',
                    fontSize: 18,
                    minHeight: 44,
                    minWidth: 36,
                    padding: `0 ${tokens.space.xs}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
