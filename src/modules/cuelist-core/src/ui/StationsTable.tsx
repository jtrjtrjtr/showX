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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: tokens.color.gray_50,
        color: tokens.color.gray_700,
        borderRadius: tokens.radius.s,
        padding: `${tokens.space.xs}px ${tokens.space.s}px`,
        fontSize: 12,
        marginRight: tokens.space.xs,
        display: 'inline-block',
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
}

export function StationsTable({ stations, canKick, onKick }: StationsTableProps) {
  if (stations.length === 0) {
    return <p style={{ color: tokens.color.gray_300, fontFamily: tokens.font.ui }}>No stations connected.</p>;
  }
  return (
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
  );
}
