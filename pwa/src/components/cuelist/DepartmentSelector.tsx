import type { DepartmentTag } from 'showx-shared';
import { tokens } from './tokens.js';

const CANONICAL: DepartmentTag[] = ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'];

interface DepartmentSelectorProps {
  value: DepartmentTag[];
  onChange: (v: DepartmentTag[]) => void;
  disabled?: boolean;
}

export function DepartmentSelector({ value, onChange, disabled }: DepartmentSelectorProps) {
  const toggle = (d: DepartmentTag) => {
    if (disabled) return;
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d];
    if (next.length === 0) return;
    onChange(next);
  };

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: tokens.color.gray_700,
          marginBottom: tokens.space.xs,
          fontWeight: 600,
        }}
      >
        Departments
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space.xs }}>
        {CANONICAL.map((d) => {
          const active = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={active}
              disabled={disabled}
              style={{
                background: active ? tokens.color.teal : tokens.color.gray_50,
                color: active ? '#fff' : tokens.color.ink,
                border: `1px solid ${active ? tokens.color.teal : tokens.color.gray_300}`,
                borderRadius: tokens.radius.s,
                padding: `${tokens.space.xs}px ${tokens.space.s}px`,
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <div role="alert" style={{ color: tokens.color.red, fontSize: 12, marginTop: tokens.space.xs }}>
          Must have ≥ 1 department
        </div>
      )}
    </div>
  );
}
