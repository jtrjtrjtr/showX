import React, { useState, useEffect, useCallback } from 'react';
import { tokens } from './tokens.js';
import { DeviceEditDialog } from './DeviceEditDialog.js';
import type { Device } from '../document/devices.js';
import type { IpcBridge } from './CuelistCorePanel.js';

interface DeviceStatus {
  deviceId: string;
  status: 'ok' | 'fail' | 'none';
  updatedAt: number;
}

interface TestResult {
  deviceId: string;
  result: 'ok' | 'fail' | null;
}

const STATUS_TTL_MS = 60_000;

function StatusDot({ deviceId, statuses }: { deviceId: string; statuses: Map<string, DeviceStatus> }) {
  const s = statuses.get(deviceId);
  const now = Date.now();
  let color = tokens.color.gray_300;
  let label = 'no recent dispatch';

  if (s && now - s.updatedAt < STATUS_TTL_MS) {
    if (s.status === 'ok') { color = tokens.color.teal; label = 'ok'; }
    else if (s.status === 'fail') { color = tokens.color.red; label = 'fail'; }
  }

  // TODO: wire to OutputDispatcher.onDeviceStatus when B001-007 adds onDeviceStatus API
  return (
    <span
      aria-label={`device status: ${label}`}
      title={label}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 4,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

interface ConfirmDeleteState {
  deviceId: string;
  label: string;
  deps: string[];
}

interface DevicesTableProps {
  ipc: IpcBridge;
  mode?: 'rehearsal' | 'show';
}

export function DevicesTable({ ipc, mode }: DevicesTableProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [statuses, setStatuses] = useState<Map<string, DeviceStatus>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locked = mode === 'show';

  const loadDevices = useCallback(async () => {
    try {
      const list = await ipc.invoke<Device[]>('cuelist-core/get-devices');
      setDevices(list ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [ipc]);

  useEffect(() => {
    void loadDevices();
    const offUpdated = ipc.on('cuelist-core/devices-changed', (list) => {
      setDevices((list as Device[]) ?? []);
    });
    const offStatus = ipc.on('cuelist-core/device-status', (s) => {
      const update = s as DeviceStatus;
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(update.deviceId, update);
        return next;
      });
    });
    return () => { offUpdated(); offStatus(); };
  }, [ipc, loadDevices]);

  const handleAdd = () => {
    setEditDevice(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (device: Device) => {
    setEditDevice(device);
    setDialogOpen(true);
  };

  const handleSaveDevice = async (d: Device) => {
    setDialogOpen(false);
    try {
      if (editDevice) {
        const patch: Partial<Omit<Device, 'device_id'>> = {};
        for (const [k, v] of Object.entries(d)) {
          if (k !== 'device_id') (patch as Record<string, unknown>)[k] = v;
        }
        await ipc.invoke('cuelist-core/device-update', d.device_id, patch);
      } else {
        await ipc.invoke('cuelist-core/device-add', d);
      }
      await loadDevices();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteRequest = async (device: Device) => {
    try {
      const deps = await ipc.invoke<string[]>('cuelist-core/device-deps', device.device_id);
      setConfirmDelete({ deviceId: device.device_id, label: device.label, deps: deps ?? [] });
    } catch {
      setConfirmDelete({ deviceId: device.device_id, label: device.label, deps: [] });
    }
  };

  const handleConfirmDelete = async (force: boolean) => {
    if (!confirmDelete) return;
    const { deviceId } = confirmDelete;
    setConfirmDelete(null);
    try {
      await ipc.invoke('cuelist-core/device-remove', deviceId, { force });
      await loadDevices();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleTest = async (deviceId: string) => {
    setTestResult({ deviceId, result: null });
    try {
      const ok = await ipc.invoke<boolean>('cuelist-core/device-test', deviceId);
      setTestResult({ deviceId, result: ok ? 'ok' : 'fail' });
      setTimeout(() => setTestResult(null), 2000);
    } catch {
      setTestResult({ deviceId, result: 'fail' });
      setTimeout(() => setTestResult(null), 2000);
    }
  };

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: `${tokens.space.s}px ${tokens.space.s}px`,
    fontSize: 12,
    color: tokens.color.gray_700,
    fontFamily: tokens.font.ui,
    whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: `${tokens.space.s}px ${tokens.space.s}px`,
    fontFamily: tokens.font.ui,
    fontSize: 13,
    verticalAlign: 'middle',
  };

  const actionBtn = (color: string): React.CSSProperties => ({
    fontFamily: tokens.font.ui,
    fontSize: 12,
    border: `1px solid ${color}`,
    borderRadius: tokens.radius.s,
    padding: `${tokens.space.xs}px ${tokens.space.s}px`,
    background: 'none',
    color,
    cursor: 'pointer',
    marginRight: tokens.space.xs,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.space.m }}>
        <h3 style={{ margin: 0, fontSize: 15, color: tokens.color.ink, fontFamily: tokens.font.ui }}>Devices</h3>
        {!locked && (
          <button
            onClick={handleAdd}
            aria-label="Add device"
            style={{
              fontFamily: tokens.font.ui,
              fontSize: 13,
              border: 'none',
              borderRadius: tokens.radius.s,
              padding: `${tokens.space.xs}px ${tokens.space.l}px`,
              background: tokens.color.teal,
              color: tokens.color.cream,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + Add Device
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: tokens.color.red,
            color: tokens.color.cream,
            padding: tokens.space.s,
            borderRadius: tokens.radius.s,
            marginBottom: tokens.space.m,
            fontSize: 13,
            fontFamily: tokens.font.ui,
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: tokens.space.s, background: 'none', border: 'none', color: tokens.color.cream, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {devices.length === 0 ? (
        <p style={{ color: tokens.color.gray_300, fontFamily: tokens.font.ui, fontSize: 13 }}>
          No devices configured. Add a device to enable cue dispatch.
        </p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.font.ui }}
          aria-label="Devices"
        >
          <thead>
            <tr>
              <th style={th}></th>
              <th style={th}>ID</th>
              <th style={th}>Label</th>
              <th style={th}>Transport</th>
              <th style={th}>Host</th>
              <th style={th}>Port</th>
              <th style={th}>Driver</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const testing = testResult?.deviceId === device.device_id;
              return (
                <tr
                  key={device.device_id}
                  style={{ borderTop: `1px solid ${tokens.color.gray_50}` }}
                >
                  <td style={td}>
                    <StatusDot deviceId={device.device_id} statuses={statuses} />
                  </td>
                  <td style={{ ...td, fontFamily: tokens.font.mono, fontSize: 12, color: tokens.color.gray_700 }}>
                    {device.device_id}
                  </td>
                  <td style={td}>{device.label}</td>
                  <td style={{ ...td, textTransform: 'uppercase', fontSize: 11, color: tokens.color.gray_700 }}>
                    {device.transport}
                  </td>
                  <td style={{ ...td, fontFamily: tokens.font.mono, fontSize: 12 }}>
                    {device.host ?? '—'}
                  </td>
                  <td style={{ ...td, fontFamily: tokens.font.mono, fontSize: 12 }}>
                    {device.port ?? '—'}
                  </td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {device.driver ?? '—'}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {testing && testResult!.result !== null && (
                      <span
                        aria-label={`test result: ${testResult!.result}`}
                        style={{
                          marginRight: tokens.space.s,
                          color: testResult!.result === 'ok' ? tokens.color.teal : tokens.color.red,
                          fontSize: 12,
                          fontFamily: tokens.font.ui,
                        }}
                      >
                        {testResult!.result === 'ok' ? '✓ OK' : '✗ FAIL'}
                      </span>
                    )}
                    {testing && testResult!.result === null && (
                      <span style={{ marginRight: tokens.space.s, fontSize: 12, color: tokens.color.gray_700, fontFamily: tokens.font.ui }}>
                        Testing…
                      </span>
                    )}
                    {!locked && (
                      <>
                        <button
                          onClick={() => handleEdit(device)}
                          aria-label={`Edit ${device.device_id}`}
                          style={actionBtn(tokens.color.teal)}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void handleDeleteRequest(device)}
                          aria-label={`Delete ${device.device_id}`}
                          style={actionBtn(tokens.color.red)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => void handleTest(device.device_id)}
                      aria-label={`Test ${device.device_id}`}
                      style={actionBtn(tokens.color.gray_700)}
                      disabled={testing && testResult!.result === null}
                    >
                      Test
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <DeviceEditDialog
        open={dialogOpen}
        initial={editDevice}
        isEdit={!!editDevice}
        onSave={(d) => void handleSaveDevice(d)}
        onClose={() => setDialogOpen(false)}
      />

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete device"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: tokens.color.cream,
              border: `1px solid ${tokens.color.gray_300}`,
              borderRadius: tokens.radius.m,
              padding: tokens.space.xl,
              maxWidth: 460,
              fontFamily: tokens.font.ui,
            }}
          >
            <h3 style={{ margin: 0, marginBottom: tokens.space.m, color: tokens.color.red, fontSize: 15 }}>
              Delete Device
            </h3>
            <p style={{ margin: 0, marginBottom: tokens.space.m, fontSize: 14, color: tokens.color.ink }}>
              Delete <strong>{confirmDelete.label}</strong> ({confirmDelete.deviceId})?
            </p>
            {confirmDelete.deps.length > 0 && (
              <div
                style={{
                  background: tokens.color.gray_50,
                  borderRadius: tokens.radius.s,
                  padding: tokens.space.s,
                  marginBottom: tokens.space.m,
                  fontSize: 12,
                  color: tokens.color.gray_700,
                }}
              >
                <strong>Warning:</strong> This device is referenced by {confirmDelete.deps.length} routing rule(s):{' '}
                {confirmDelete.deps.join(', ')}. Force-delete will remove them too.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space.s }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  fontFamily: tokens.font.ui,
                  fontSize: 13,
                  border: `1px solid ${tokens.color.gray_300}`,
                  borderRadius: tokens.radius.s,
                  padding: `${tokens.space.xs}px ${tokens.space.l}px`,
                  background: 'none',
                  cursor: 'pointer',
                  color: tokens.color.gray_700,
                }}
              >
                Cancel
              </button>
              {confirmDelete.deps.length > 0 && (
                <button
                  onClick={() => void handleConfirmDelete(true)}
                  aria-label="Force delete device and dependent rules"
                  style={{
                    fontFamily: tokens.font.ui,
                    fontSize: 13,
                    border: `1px solid ${tokens.color.red}`,
                    borderRadius: tokens.radius.s,
                    padding: `${tokens.space.xs}px ${tokens.space.l}px`,
                    background: 'none',
                    cursor: 'pointer',
                    color: tokens.color.red,
                  }}
                >
                  Force Delete
                </button>
              )}
              <button
                onClick={() => void handleConfirmDelete(false)}
                aria-label="Confirm delete device"
                style={{
                  fontFamily: tokens.font.ui,
                  fontSize: 13,
                  border: 'none',
                  borderRadius: tokens.radius.s,
                  padding: `${tokens.space.xs}px ${tokens.space.l}px`,
                  background: tokens.color.red,
                  cursor: 'pointer',
                  color: tokens.color.cream,
                  fontWeight: 600,
                }}
                disabled={confirmDelete.deps.length > 0}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
