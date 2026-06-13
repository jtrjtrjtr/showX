import { useState, useCallback } from 'react';
import { useCuelist } from '../../hooks/useCuelist.js';
import { useStations } from '../../hooks/useStations.js';
import { useClock } from '../../hooks/useClock.js';
import { tokens } from './tokens.js';
import {
  runPreShowChecks,
  type CheckItem,
  type CheckStatus,
  type DeviceInfo,
  type DeviceHealthEntry,
  type CueRef,
  type PreShowCheckResult,
} from '@showx/module-cuelist-core/health/preShowChecks.js';

// ── Health API (shell context only) ──────────────────────────────────────────

type ShowxApiHealth = {
  snapshot: () => Promise<Array<{ slug: string; status: string; detail?: string }>>;
};

function getHealthApi(): ShowxApiHealth | null {
  const api = (window as unknown as {
    showxApi?: { health?: ShowxApiHealth };
  }).showxApi?.health;
  return api ?? null;
}

// ── Device list via cuelistCore.invoke ────────────────────────────────────────

type CuelistCoreApi = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function getCuelistCoreApi(): CuelistCoreApi | null {
  const api = (window as unknown as {
    showxApi?: { cuelistCore?: CuelistCoreApi };
  }).showxApi?.cuelistCore;
  return api ?? null;
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  const color =
    status === 'pass' ? tokens.color.teal :
    status === 'warn' ? '#f59e0b' :
    tokens.color.red;
  const symbol = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
  return (
    <span
      aria-label={status}
      style={{
        display: 'inline-block',
        width: 20,
        textAlign: 'center',
        fontWeight: 700,
        fontSize: 14,
        color,
        flexShrink: 0,
      }}
    >
      {symbol}
    </span>
  );
}

// ── Verdict summary ───────────────────────────────────────────────────────────

function VerdictBanner({ result }: { result: PreShowCheckResult }) {
  const { verdict, warning_count, failure_count } = result;
  const bg =
    verdict === 'all_pass' ? tokens.color.teal :
    verdict === 'has_failures' ? tokens.color.red :
    '#92400e';
  const text =
    verdict === 'all_pass' ? 'All checks passed' :
    verdict === 'has_failures'
      ? `${failure_count} failure${failure_count > 1 ? 's' : ''}${warning_count > 0 ? `, ${warning_count} warning${warning_count > 1 ? 's' : ''}` : ''}`
      : `${warning_count} warning${warning_count > 1 ? 's' : ''}`;

  return (
    <div
      data-testid="preshow-verdict"
      role="status"
      aria-live="polite"
      style={{
        padding: `${tokens.space.s}px ${tokens.space.m}px`,
        background: bg,
        color: tokens.color.white,
        borderRadius: tokens.radius.s,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: tokens.font.ui,
        textAlign: 'center',
        marginBottom: tokens.space.m,
      }}
    >
      {text}
    </div>
  );
}

// ── Check item row ────────────────────────────────────────────────────────────

function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div
      data-testid={`check-item-${item.id}`}
      style={{
        display: 'flex',
        gap: tokens.space.s,
        padding: `${tokens.space.s}px 0`,
        borderBottom: `1px solid ${tokens.color.border}`,
        alignItems: 'flex-start',
      }}
    >
      <StatusIcon status={item.status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: tokens.color.ink, fontFamily: tokens.font.ui }}>
          {item.label}
        </div>
        {item.hint && (
          <div
            style={{
              fontSize: 11,
              color: tokens.color.ink_secondary,
              fontFamily: tokens.font.ui,
              marginTop: 2,
            }}
          >
            {item.hint}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PreShowCheckProps {
  cuelistId: string;
  onClose: () => void;
}

export function PreShowCheck({ cuelistId, onClose }: PreShowCheckProps) {
  const { cues } = useCuelist(cuelistId);
  const stations = useStations();
  const clock = useClock();

  const [result, setResult] = useState<PreShowCheckResult | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      // Collect device health from shell API if available
      const deviceHealthMap = new Map<string, DeviceHealthEntry>();
      let devices: DeviceInfo[] = [];

      const healthApi = getHealthApi();
      const coreApi = getCuelistCoreApi();

      if (healthApi) {
        try {
          const snaps = await healthApi.snapshot();
          for (const s of snaps) {
            if (!s.slug.startsWith('device:')) continue;
            const deviceId = s.slug.slice('device:'.length);
            const status =
              s.status === 'healthy' ? 'healthy' :
              s.status === 'error' ? 'error' :
              s.status === 'warning' ? 'warning' :
              'unknown';
            deviceHealthMap.set(deviceId, { status, last_error: s.detail });
          }
        } catch { /* non-fatal */ }
      }

      if (coreApi) {
        try {
          const list = await coreApi.invoke('cuelist-core/get-devices') as Array<{ device_id: string; label: string }>;
          devices = list.map((d) => ({ device_id: d.device_id, label: d.label }));
        } catch { /* non-fatal */ }
      }

      // Build cue refs from Yjs cues
      const cueRefs: CueRef[] = cues.map((c) => ({
        id: c.id,
        label: c.label,
        trigger: { kind: c.trigger.kind },
        payloads: (c.payloads ?? []).map((p) => ({
          type: p.type,
          device_id: 'device_id' in p ? (p as { device_id: string }).device_id : undefined,
        })),
      }));

      const checkResult = runPreShowChecks({
        devices,
        deviceHealth: deviceHealthMap,
        cues: cueRefs,
        stationCount: stations.length,
        clockLocked: clock.locked,
      });
      setResult(checkResult);
    } finally {
      setRunning(false);
    }
  }, [cues, stations, clock]);

  return (
    <div
      data-testid="preshow-check-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pre-show health check"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 500,
        overflowY: 'auto',
        padding: `${tokens.space.xxl}px ${tokens.space.m}px`,
      }}
    >
      <div
        style={{
          background: tokens.color.panel,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.m,
          padding: tokens.space.xl,
          width: '100%',
          maxWidth: 520,
          fontFamily: tokens.font.ui,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: tokens.space.l,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: tokens.color.ink }}>
            Pre-show check
          </h2>
          <button
            data-testid="preshow-check-close"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: tokens.color.ink_secondary,
              fontSize: 20,
              cursor: 'pointer',
              padding: `0 ${tokens.space.xs}px`,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <button
          data-testid="preshow-run-btn"
          onClick={() => { void handleRun(); }}
          disabled={running}
          style={{
            width: '100%',
            padding: `${tokens.space.s}px`,
            background: running ? tokens.color.raised : tokens.color.teal,
            color: running ? tokens.color.ink_disabled : tokens.color.white,
            border: 'none',
            borderRadius: tokens.radius.s,
            fontSize: 14,
            fontWeight: 700,
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: tokens.font.ui,
            marginBottom: tokens.space.m,
          }}
        >
          {running ? 'Running…' : result ? 'Re-run check' : 'Run check'}
        </button>

        {result && (
          <>
            <VerdictBanner result={result} />
            <div role="list" aria-label="Check results">
              {result.items.map((item) => (
                <CheckRow key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        {!result && !running && (
          <p
            style={{
              color: tokens.color.ink_secondary,
              fontSize: 13,
              textAlign: 'center',
              margin: `${tokens.space.l}px 0`,
            }}
          >
            Click "Run check" to verify devices, stations, and clock before the show.
          </p>
        )}

        <div
          style={{
            marginTop: tokens.space.l,
            fontSize: 11,
            color: tokens.color.ink_secondary,
            textAlign: 'center',
            fontFamily: tokens.font.ui,
          }}
        >
          Advisory only — you can proceed regardless of check results.
        </div>
      </div>
    </div>
  );
}
