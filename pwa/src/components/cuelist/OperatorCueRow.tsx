import type { Cue } from 'showx-shared';
import { tokens } from './tokens.js';
import { summarizePayload, highlightedPayloads } from './payloadSummaries.js';

export interface ExtraColumn {
  label: string;
  content: string;
}

export interface OperatorCueRowProps {
  cue: Cue;
  isActionable: boolean;
  owned: ReadonlySet<string>;
  extraColumns: ExtraColumn[];
  goLabel: string;
  onGo: () => void;
  onStandby: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function OperatorCueRow({
  cue,
  isActionable,
  owned,
  extraColumns,
  goLabel,
  onGo,
  onStandby,
  isSelected = false,
  onSelect,
}: OperatorCueRowProps) {
  const highlighted = highlightedPayloads(cue, owned);
  const opacity = isActionable ? 1 : 0.4;

  return (
    <div
      role="row"
      aria-label={`Cue ${cue.label}`}
      aria-selected={isSelected}
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr auto auto',
        gap: tokens.space.m,
        opacity,
        padding: tokens.space.m,
        borderBottom: `1px solid ${tokens.color.border}`,
        alignItems: 'start',
        background: isSelected ? tokens.color.teal_dim : tokens.color.bg,
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: tokens.font.ui }}>
        {cue.label}
      </div>
      <div>
        {extraColumns.map((col) => (
          <div key={col.label}>
            <strong>{col.label}:</strong> {col.content}
          </div>
        ))}
        {cue.description && (
          <div style={{ fontSize: 14, color: tokens.color.ink }}>{cue.description}</div>
        )}
        {cue.standby_note && (
          <div style={{ fontStyle: 'italic', fontSize: 13, color: tokens.color.gray_700 }}>
            {cue.standby_note}
          </div>
        )}
        {cue.payloads.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: tokens.space.xs,
              marginTop: tokens.space.xs,
            }}
          >
            {cue.payloads.map((p) => (
              <span
                key={p.id}
                style={{
                  fontWeight: highlighted.has(p.id) ? 700 : 400,
                  color: highlighted.has(p.id) ? tokens.color.teal : tokens.color.gray_700,
                  fontSize: highlighted.has(p.id) ? 13 : 11,
                }}
              >
                {summarizePayload(p)}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        aria-label={`Standby ${cue.label}`}
        onClick={(e) => { e.stopPropagation(); onStandby(); }}
        disabled={!isActionable}
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: tokens.color.yellow,
          color: tokens.color.ink,
          border: 'none',
          borderRadius: tokens.radius.s,
          cursor: isActionable ? 'pointer' : 'default',
          fontWeight: 600,
        }}
      >
        Standby
      </button>
      <button
        aria-label={`${goLabel} ${cue.label}`}
        onClick={(e) => { e.stopPropagation(); onGo(); }}
        disabled={!isActionable}
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: isActionable ? tokens.color.teal : tokens.color.gray_300,
          color: isActionable ? tokens.color.bg : tokens.color.ink_disabled,
          border: 'none',
          borderRadius: tokens.radius.s,
          cursor: isActionable ? 'pointer' : 'default',
          fontWeight: 700,
        }}
      >
        {goLabel}
      </button>
    </div>
  );
}
