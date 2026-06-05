import { tokens } from './tokens.js';

export type HealthLevel = 'healthy' | 'warning' | 'error' | 'unknown';

interface StatusStripProps {
  health: HealthLevel;
  pkgPath: string;
  lastSaveAt?: string;
  autosaving?: boolean;
}

const healthColor: Record<HealthLevel, string> = {
  healthy: tokens.color.teal,
  warning: tokens.color.yellow,
  error: tokens.color.red,
  unknown: tokens.color.gray_300,
};

export function StatusStrip({ health, pkgPath, lastSaveAt, autosaving }: StatusStripProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.m,
        background: tokens.color.gray_50,
        borderRadius: tokens.radius.m,
        padding: `${tokens.space.s}px ${tokens.space.m}px`,
        fontFamily: tokens.font.ui,
        fontSize: 13,
        color: tokens.color.gray_700,
        marginTop: tokens.space.m,
      }}
    >
      <span
        aria-label={`health: ${health}`}
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: healthColor[health],
          flexShrink: 0,
          display: 'inline-block',
        }}
      />
      {pkgPath && (
        <span
          style={{
            fontFamily: tokens.font.mono,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={pkgPath}
        >
          {pkgPath}
        </span>
      )}
      {autosaving && <span>Autosaving…</span>}
      {!autosaving && lastSaveAt && <span>Saved {lastSaveAt}</span>}
    </div>
  );
}
