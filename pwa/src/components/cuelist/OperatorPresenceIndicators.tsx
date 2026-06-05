import type { StationAwareness } from '../../lib/awareness.js';

interface OperatorPresenceIndicatorsProps {
  stations: StationAwareness[];
}

export function OperatorPresenceIndicators({ stations }: OperatorPresenceIndicatorsProps) {
  const visible = stations.slice(0, 5);
  const overflow = stations.length - 5;
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {visible.map((s) => (
        <div
          key={s.station_id}
          title={s.display_name}
          aria-label={`${s.display_name} is here`}
          data-testid={`presence-dot-${s.owned_departments[0] ?? 'unknown'}`}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: s.presence_color,
            flexShrink: 0,
          }}
        />
      ))}
      {overflow > 0 && (
        <span style={{ fontSize: 11, marginLeft: 2 }}>+{overflow}</span>
      )}
    </div>
  );
}
