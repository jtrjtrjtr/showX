import { tokens } from './tokens.js';

interface DepartmentChipsProps {
  departments: string[];
}

export function DepartmentChips({ departments }: DepartmentChipsProps) {
  return (
    <div style={{ display: 'flex', gap: tokens.space.xs, flexWrap: 'wrap' }}>
      {departments.map((d) => {
        const bg = tokens.color.dept[d] ?? tokens.color.dept['OTHER'];
        return (
          <span
            key={d}
            style={{
              padding: `2px ${tokens.space.s}px`,
              borderRadius: tokens.radius.s,
              background: bg,
              fontSize: 11,
              fontWeight: 600,
              color: tokens.color.bg,
            }}
          >
            {d}
          </span>
        );
      })}
    </div>
  );
}

export function DepartmentSideBar({ departments }: DepartmentChipsProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 8,
        alignSelf: 'stretch',
        borderRadius: tokens.radius.s,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {departments.length === 0 ? (
        <div style={{ flex: 1, background: tokens.color.border }} />
      ) : (
        departments.map((d) => (
          <div
            key={d}
            style={{ flex: 1, background: tokens.color.dept[d] ?? tokens.color.dept['OTHER'] }}
            title={d}
          />
        ))
      )}
    </div>
  );
}
