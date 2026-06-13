import React, { useState, useEffect, useCallback, useRef } from 'react';
import { tokens } from './tokens.js';
import { RoutingRuleEditDialog } from './RoutingRuleEditDialog.js';
import type { RoutingRule } from '../document/routing.js';
import type { Device } from '../document/devices.js';
import type { IpcBridge } from './CuelistCorePanel.js';

interface DeviceHealth {
  status: 'ok' | 'fail' | 'none';
  updatedAt: number;
}

const HEALTH_TTL_MS = 60_000;

function DeviceHealthDot({ deviceId, health }: { deviceId: string; health: Map<string, DeviceHealth> }) {
  const entry = health.get(deviceId);
  const now = Date.now();
  let color: string = tokens.color.gray_300;
  let label = 'no recent dispatch';
  if (entry && now - entry.updatedAt < HEALTH_TTL_MS) {
    if (entry.status === 'ok') { color = tokens.color.teal; label = 'healthy'; }
    else if (entry.status === 'fail') { color = tokens.color.red; label = 'error'; }
  }
  return (
    <span
      aria-label={`device health: ${label}`}
      title={label}
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0, marginRight: 6 }}
    />
  );
}

interface RoutingTableProps {
  ipc: IpcBridge;
  mode?: 'rehearsal' | 'show';
}

export function RoutingTable({ ipc, mode }: RoutingTableProps) {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceHealth, setDeviceHealth] = useState<Map<string, DeviceHealth>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<RoutingRule | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const locked = mode === 'show';

  const loadData = useCallback(async () => {
    try {
      const [ruleList, deviceList] = await Promise.all([
        ipc.invoke<RoutingRule[]>('cuelist-core/get-routing'),
        ipc.invoke<Device[]>('cuelist-core/get-devices'),
      ]);
      setRules(ruleList ?? []);
      setDevices(deviceList ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, [ipc]);

  useEffect(() => {
    void loadData();

    void ipc.invoke<Array<{ slug: string; status: string; updatedAt: number }>>('health:snapshot')
      .then((snaps) => {
        if (!Array.isArray(snaps)) return;
        setDeviceHealth((prev) => {
          const next = new Map(prev);
          for (const s of snaps) {
            if (typeof s?.slug !== 'string' || !s.slug.startsWith('device:')) continue;
            const id = s.slug.slice('device:'.length);
            const status = s.status === 'healthy' ? 'ok' : s.status === 'error' ? 'fail' : 'none';
            next.set(id, { status: status as DeviceHealth['status'], updatedAt: s.updatedAt });
          }
          return next;
        });
      })
      .catch(() => { /* non-fatal */ });

    const offRules = ipc.on('cuelist-core/routing-changed', (list) => {
      setRules((list as RoutingRule[]) ?? []);
    });
    const offDevices = ipc.on('cuelist-core/devices-changed', (list) => {
      setDevices((list as Device[]) ?? []);
    });
    const offHealth = ipc.on('health:change', (snaps) => {
      const healthSnaps = snaps as Array<{ slug: string; status: string; updatedAt: number }>;
      if (!Array.isArray(healthSnaps)) return;
      setDeviceHealth((prev) => {
        const next = new Map(prev);
        for (const s of healthSnaps) {
          if (!s.slug.startsWith('device:')) continue;
          const id = s.slug.slice('device:'.length);
          const status = s.status === 'healthy' ? 'ok' : s.status === 'error' ? 'fail' : 'none';
          next.set(id, { status: status as DeviceHealth['status'], updatedAt: s.updatedAt });
        }
        return next;
      });
    });
    return () => { offRules(); offDevices(); offHealth(); };
  }, [ipc, loadData]);

  const handleAdd = () => {
    setEditRule(undefined);
    setDialogOpen(true);
  };

  const handleEdit = (rule: RoutingRule) => {
    setEditRule(rule);
    setDialogOpen(true);
  };

  const handleSaveRule = async (data: Omit<RoutingRule, 'rule_id' | 'sort_key'>) => {
    setDialogOpen(false);
    try {
      if (editRule) {
        await ipc.invoke('cuelist-core/routing-update', editRule.rule_id, data);
      } else {
        await ipc.invoke('cuelist-core/routing-add', data);
      }
      await loadData();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDelete = async (ruleId: string) => {
    setConfirmDeleteId(null);
    try {
      await ipc.invoke('cuelist-core/routing-remove', ruleId);
      await loadData();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDragStart = (ruleId: string) => {
    dragId.current = ruleId;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId.current || dragId.current === targetId) return;
    const fromId = dragId.current;
    dragId.current = null;

    const fromIdx = rules.findIndex((r) => r.rule_id === fromId);
    const toIdx = rules.findIndex((r) => r.rule_id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...rules];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setRules(reordered);

    try {
      await ipc.invoke('cuelist-core/routing-reorder', reordered.map((r) => r.rule_id));
    } catch (e) {
      setError(String(e));
      await loadData();
    }
  };

  const deviceLabel = (id: string) => {
    const d = devices.find((dev) => dev.device_id === id);
    return d ? `${d.label} (${id})` : id;
  };

  const matchDisplay = (rule: RoutingRule): string => {
    const parts: string[] = [];
    if (rule.match.payload_type) parts.push(`type=${rule.match.payload_type}`);
    if (rule.match.tag_pattern) parts.push(`tag=${rule.match.tag_pattern}`);
    if (rule.match.device_id) parts.push(`device=${rule.match.device_id}`);
    return parts.length > 0 ? parts.join(', ') : '(any)';
  };

  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: `${tokens.space.s}px`,
    fontSize: 12,
    color: tokens.color.gray_700,
    fontFamily: tokens.font.ui,
    whiteSpace: 'nowrap',
  };

  const td: React.CSSProperties = {
    padding: `${tokens.space.s}px`,
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
        <h3 style={{ margin: 0, fontSize: 15, color: tokens.color.ink, fontFamily: tokens.font.ui }}>Routing Rules</h3>
        {!locked && (
          <button
            onClick={handleAdd}
            aria-label="Add routing rule"
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
            + Add Rule
          </button>
        )}
      </div>

      {!locked && rules.length > 1 && (
        <p style={{ fontSize: 11, color: tokens.color.gray_700, fontFamily: tokens.font.ui, marginBottom: tokens.space.s }}>
          Drag rows to reorder. Higher rules are matched first.
        </p>
      )}

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

      {rules.length === 0 ? (
        <p style={{ color: tokens.color.ink_secondary, fontFamily: tokens.font.ui, fontSize: 13 }}>
          No routing rules configured. Rules determine which device each cue payload goes to.
        </p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.font.ui }}
          aria-label="Routing rules"
        >
          <thead>
            <tr>
              {!locked && <th style={{ ...th, width: 24 }}></th>}
              <th style={{ ...th, width: 40 }}>#</th>
              <th style={th}>Match</th>
              <th style={th}>Primary Device</th>
              <th style={th}>Backup Device</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, idx) => (
              <tr
                key={rule.rule_id}
                draggable={!locked}
                onDragStart={() => handleDragStart(rule.rule_id)}
                onDragOver={handleDragOver}
                onDrop={() => void handleDrop(rule.rule_id)}
                style={{ borderTop: `1px solid ${tokens.color.gray_50}`, cursor: locked ? 'default' : 'grab' }}
              >
                {!locked && (
                  <td style={{ ...td, color: tokens.color.ink_disabled, fontSize: 16, cursor: 'grab' }} aria-hidden>
                    ⠿
                  </td>
                )}
                <td style={{ ...td, color: tokens.color.gray_700, fontSize: 11 }}>{idx + 1}</td>
                <td style={{ ...td, fontFamily: tokens.font.mono, fontSize: 12 }}>
                  {matchDisplay(rule)}
                </td>
                <td style={{ ...td, display: 'flex', alignItems: 'center' }}>
                  <DeviceHealthDot deviceId={rule.target_device_id} health={deviceHealth} />
                  <a
                    href="#devices-tab"
                    onClick={(e) => e.preventDefault()}
                    style={{ color: tokens.color.teal, textDecoration: 'none', fontSize: 13 }}
                    title="Go to Devices tab"
                  >
                    {deviceLabel(rule.target_device_id)}
                  </a>
                </td>
                <td style={{ ...td }}>
                  {rule.backup_device_id ? (
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <DeviceHealthDot deviceId={rule.backup_device_id} health={deviceHealth} />
                      <span style={{ fontSize: 12, color: tokens.color.ink_secondary }}>
                        {deviceLabel(rule.backup_device_id)}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: tokens.color.ink_disabled }}>—</span>
                  )}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {!locked && (
                    <>
                      <button
                        onClick={() => handleEdit(rule)}
                        aria-label={`Edit rule ${rule.rule_id}`}
                        style={actionBtn(tokens.color.teal)}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(rule.rule_id)}
                        aria-label={`Delete rule ${rule.rule_id}`}
                        style={actionBtn(tokens.color.red)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <RoutingRuleEditDialog
        open={dialogOpen}
        initial={editRule}
        isEdit={!!editRule}
        devices={devices}
        onSave={(r) => void handleSaveRule(r)}
        onClose={() => setDialogOpen(false)}
      />

      {confirmDeleteId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete routing rule"
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
              maxWidth: 400,
              fontFamily: tokens.font.ui,
            }}
          >
            <h3 style={{ margin: 0, marginBottom: tokens.space.m, color: tokens.color.red, fontSize: 15 }}>
              Delete Routing Rule
            </h3>
            <p style={{ margin: 0, marginBottom: tokens.space.l, fontSize: 14, color: tokens.color.ink }}>
              Delete this routing rule? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space.s }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
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
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                aria-label="Confirm delete rule"
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
