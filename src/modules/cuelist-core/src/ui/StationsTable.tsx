import React from 'react';
import { tokens } from './tokens.js';

export interface Awareness {
  station_id: string;
  display_name: string;
  owned_departments: string[];
  watched_departments: string[];
  last_heartbeat_at: string;
  presence_color: string;
}

export interface OperatorRecord {
  device_id: string;
  display_name: string;
  owned_departments: string[];
  role: 'sm' | 'operator';
  status: 'active' | 'revoked';
  last_seen_at: number | null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function relativeMs(ms: number | null): string {
  if (ms === null) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      style={{
        background: muted ? tokens.color.gray_50 : tokens.color.gray_50,
        color: muted ? tokens.color.gray_700 : tokens.color.gray_700,
        borderRadius: tokens.radius.s,
        padding: `${tokens.space.xs}px ${tokens.space.s}px`,
        fontSize: 12,
        marginRight: tokens.space.xs,
        display: 'inline-block',
        opacity: muted ? 0.5 : 1,
      }}
    >
      {children}
    </span>
  );
}

interface StationsTableProps {
  stations: Awareness[];
  canKick: boolean;
  onKick: (id: string) => void;
  operators?: OperatorRecord[];
  onRevoke?: (id: string) => void;
}

export function StationsTable({ stations, canKick, onKick, operators, onRevoke }: StationsTableProps) {
  return (
    <div>
      {operators && operators.length > 0 && (
        <div style={{ marginBottom: tokens.space.l }}>
          <h3 style={{ color: tokens.color.ink, fontSize: 14, marginBottom: tokens.space.s, marginTop: 0 }}>
            Paired Devices
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.font.ui }}>
            <thead>
              <tr style={{ color: tokens.color.gray_700, fontSize: 13 }}>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Name</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Role</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Departments</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Status</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr
                  key={op.device_id}
                  style={{
                    borderTop: `1px solid ${tokens.color.gray_50}`,
                    opacity: op.status === 'revoked' ? 0.5 : 1,
                  }}
                >
                  <td style={{ padding: `${tokens.space.s}px` }}>{op.display_name}</td>
                  <td style={{ padding: `${tokens.space.s}px`, fontSize: 12, color: tokens.color.gray_700 }}>
                    {op.role === 'sm' ? 'SM' : 'Operator'}
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    {op.owned_departments.map((d) => (
                      <Chip key={d} muted={op.status === 'revoked'}>{d}</Chip>
                    ))}
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: op.status === 'revoked' ? tokens.color.red : tokens.color.teal,
                      }}
                    >
                      {op.status === 'revoked' ? 'revoked' : 'active'}
                    </span>
                  </td>
                  <td style={{ padding: `${tokens.space.s}px`, fontSize: 12, color: tokens.color.gray_700 }}>
                    {relativeMs(op.last_seen_at)}
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    {canKick && op.status === 'active' && onRevoke && (
                      <button
                        onClick={() => onRevoke(op.device_id)}
                        style={{
                          background: 'none',
                          border: `1px solid ${tokens.color.red}`,
                          color: tokens.color.red,
                          borderRadius: tokens.radius.s,
                          cursor: 'pointer',
                          padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                          fontFamily: tokens.font.ui,
                          fontSize: 12,
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 style={{ color: tokens.color.ink, fontSize: 14, marginBottom: tokens.space.s, marginTop: 0 }}>
          Connected Stations
        </h3>
        {stations.length === 0 ? (
          <p style={{ color: tokens.color.ink_secondary, fontFamily: tokens.font.ui }}>No stations connected.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: tokens.font.ui }}>
            <thead>
              <tr style={{ color: tokens.color.gray_700, fontSize: 13 }}>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px 0` }}></th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Name</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Owned</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Watched</th>
                <th style={{ textAlign: 'left', padding: `${tokens.space.s}px` }}>Last seen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s) => (
                <tr key={s.station_id} style={{ borderTop: `1px solid ${tokens.color.gray_50}` }}>
                  <td style={{ padding: `${tokens.space.s}px 0` }}>
                    <span
                      aria-label={`presence: ${s.presence_color}`}
                      style={{
                        background: s.presence_color,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>{s.display_name}</td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    {s.owned_departments.map((d) => <Chip key={d}>{d}</Chip>)}
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    {s.watched_departments.map((d) => <Chip key={d}>{d}</Chip>)}
                  </td>
                  <td style={{ padding: `${tokens.space.s}px` }}>{relativeTime(s.last_heartbeat_at)}</td>
                  <td style={{ padding: `${tokens.space.s}px` }}>
                    {canKick && (
                      <button
                        onClick={() => onKick(s.station_id)}
                        style={{
                          background: 'none',
                          border: `1px solid ${tokens.color.red}`,
                          color: tokens.color.red,
                          borderRadius: tokens.radius.s,
                          cursor: 'pointer',
                          padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                          fontFamily: tokens.font.ui,
                          fontSize: 12,
                        }}
                      >
                        Kick
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
