import { useState } from 'react';
import type { PayloadType } from 'showx-shared';
import { tokens } from './tokens.js';

const PAYLOAD_TYPES: { type: PayloadType; label: string }[] = [
  { type: 'osc', label: 'OSC' },
  { type: 'msc', label: 'MSC' },
  { type: 'lx_ref', label: 'LX Ref (Eos)' },
  { type: 'midi', label: 'MIDI' },
  { type: 'webhook', label: 'Webhook' },
  { type: 'wait', label: 'Wait' },
  { type: 'group', label: 'Group' },
];

interface AddPayloadMenuProps {
  onAdd: (type: PayloadType) => void;
  disabled?: boolean;
}

export function AddPayloadMenu({ onAdd, disabled }: AddPayloadMenuProps) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: tokens.color.raised,
          color: tokens.color.ink_disabled,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.s,
          fontSize: 13,
          cursor: 'default',
          marginTop: tokens.space.s,
        }}
      >
        + Add payload
      </button>
    );
  }

  return (
    <div style={{ position: 'relative', marginTop: tokens.space.s }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          padding: `${tokens.space.s}px ${tokens.space.m}px`,
          background: tokens.color.teal,
          color: tokens.color.bg,
          border: 'none',
          borderRadius: tokens.radius.s,
          fontSize: 13,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        + Add payload
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            background: tokens.color.raised,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.m,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            zIndex: 100,
            overflow: 'hidden',
            minWidth: 160,
          }}
        >
          {PAYLOAD_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: `${tokens.space.s}px ${tokens.space.m}px`,
                background: 'none',
                border: 'none',
                textAlign: 'left',
                fontSize: 13,
                cursor: 'pointer',
                color: tokens.color.ink_secondary,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
