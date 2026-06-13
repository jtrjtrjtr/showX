import { useState, useEffect } from 'react';
import { saveSession as saveAuthSession, getOrCreateClientPubkey } from '../lib/auth.js';
import { saveSession, loadSession, clearSession } from '../lib/session.js';
import type { DiscoveredHost, PairedSession } from '../lib/types.js';
import { tokens } from './cuelist/tokens.js';

interface Props {
  host: DiscoveredHost;
  onPaired: (session: PairedSession) => void;
}

const DEPARTMENTS = ['LX', 'SND', 'VID', 'SM'];

type Phase = 'validating' | 'idle' | 'claiming';

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: `${tokens.space.s}px ${tokens.space.m}px`,
  background: tokens.color.raised,
  color: tokens.color.ink,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.m,
  fontSize: 14,
  fontFamily: tokens.font.ui,
  boxSizing: 'border-box' as const,
};

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: tokens.color.ink_secondary,
  marginBottom: tokens.space.xs,
};

function urlParams(): { pin: string | null; name: string | null } {
  const u = new URLSearchParams(window.location.search);
  return { pin: u.get('pin'), name: u.get('name') };
}

export function PairingView({ host, onPaired }: Props) {
  const params = urlParams();
  const [pin, setPin] = useState(params.pin ?? '');
  const [displayName, setDisplayName] = useState(params.name ?? '');
  const [role, setRole] = useState<'sm' | 'operator' | 'countdown'>('operator');
  const [ownedDepts, setOwnedDepts] = useState<string[]>([]);
  const [watchedDepts, setWatchedDepts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('validating');
  const [pairedDevice, setPairedDevice] = useState<{ device_id: string; token: string } | null>(null);

  // On mount: try to restore a stored session for this host
  useEffect(() => {
    const stored = loadSession();
    if (!stored || stored.host !== host.host || stored.port !== host.port) {
      setPhase('idle');
      return;
    }
    fetch(`http://${host.host}:${host.port}/api/pairing/validate`, {
      headers: { Authorization: `Bearer ${stored.token}` },
    })
      .then((r) => r.json() as Promise<{ valid: boolean }>)
      .then((data) => {
        if (data.valid) {
          onPaired(stored);
        } else {
          clearSession();
          setPhase('idle');
        }
      })
      .catch(() => {
        setPhase('idle');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit when both pin and name come from URL params and form is idle
  useEffect(() => {
    if (phase !== 'idle') return;
    if (params.pin && params.name) {
      void doSubmit(params.pin, params.name);
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDept(list: string[], setList: (v: string[]) => void, dept: string) {
    setList(list.includes(dept) ? list.filter((d) => d !== dept) : [...list, dept]);
  }

  async function doSubmit(submitPin: string, submitName: string) {
    setError(null);
    setPhase('claiming');
    try {
      const client_pubkey = await getOrCreateClientPubkey();
      const owned_departments = role === 'sm' ? ['SM', ...ownedDepts] : role === 'countdown' ? [] : ownedDepts;

      const claimR = await fetch(`http://${host.host}:${host.port}/api/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: submitPin,
          display_name: submitName,
          owned_departments,
          watched_departments: watchedDepts,
          client_pubkey,
        }),
      });

      if (!claimR.ok) {
        const body = (await claimR.json().catch(() => ({}))) as { error?: string };
        setError(claimR.status === 401 ? 'PIN invalid or expired' : (body.error ?? 'Pairing failed'));
        setPhase('idle');
        return;
      }

      const claimResp = (await claimR.json()) as {
        token: string;
        device: { device_id: string };
        show_id?: string | null;
      };

      const session: PairedSession = {
        host: host.host,
        port: host.port,
        token: claimResp.token,
        display_name: submitName,
        device_id: claimResp.device.device_id,
        paired_at: Date.now(),
        show_id: claimResp.show_id ?? undefined,
        role,
        owned_departments,
        watched_departments: watchedDepts,
      };

      // Legacy: expose token for test helpers
      localStorage.setItem('showx_pair_token', claimResp.token);

      // Save full session for next-launch restore
      saveSession(session);
      await saveAuthSession(session);

      setPairedDevice({ device_id: claimResp.device.device_id, token: claimResp.token });
      onPaired(session);
    } catch {
      setError('Network error');
      setPhase('idle');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== 'idle') return;
    await doSubmit(pin, displayName);
  }

  if (phase === 'validating') {
    return (
      <div
        data-testid="pairing-validating"
        style={{
          background: tokens.color.bg,
          color: tokens.color.ink_secondary,
          fontFamily: tokens.font.ui,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Connecting…
      </div>
    );
  }

  if (pairedDevice) {
    return (
      <div
        data-testid="paired-success"
        className="pairing-view"
        style={{
          background: tokens.color.bg,
          color: tokens.color.ink,
          padding: tokens.space.xxl,
          fontFamily: tokens.font.ui,
          minHeight: '100vh',
        }}
      >
        <p style={{ color: tokens.color.green, fontWeight: 700 }}>Paired successfully!</p>
        <span
          data-testid="station-id"
          data-id={pairedDevice.device_id}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  return (
    <div
      className="pairing-view"
      style={{
        background: tokens.color.bg,
        color: tokens.color.ink,
        fontFamily: tokens.font.ui,
        minHeight: '100vh',
        padding: tokens.space.xxl,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <h2 style={{ color: tokens.color.ink, marginTop: 0 }}>
        Pair with {host.host}:{host.port}
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.l }}>
        <div>
          <label style={labelStyle}>Display name</label>
          <input
            data-testid="device-name-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. LX Op"
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>PIN</label>
          <input
            data-testid="pin-input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6-digit PIN"
            maxLength={6}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Role</label>
          <select
            data-testid="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as 'sm' | 'operator' | 'countdown')}
            style={inputStyle}
          >
            <option value="sm">Stage Manager</option>
            <option value="operator">Operator</option>
            <option value="countdown">Countdown display</option>
          </select>
        </div>
        <div>
          <span style={labelStyle}>Owned departments</span>
          <div style={{ display: 'flex', gap: tokens.space.s, flexWrap: 'wrap' }}>
            {DEPARTMENTS.map((d) => (
              <label
                key={`own-${d}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.space.xs,
                  color: tokens.color.ink,
                  cursor: 'pointer',
                }}
              >
                <input
                  data-testid={`dept-chip-${d}`}
                  type="checkbox"
                  checked={ownedDepts.includes(d)}
                  onChange={() => toggleDept(ownedDepts, setOwnedDepts, d)}
                  style={{ accentColor: tokens.color.teal }}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div>
          <span style={labelStyle}>Watched departments</span>
          <div style={{ display: 'flex', gap: tokens.space.s, flexWrap: 'wrap' }}>
            {DEPARTMENTS.map((d) => (
              <label
                key={`watch-${d}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.space.xs,
                  color: tokens.color.ink,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={watchedDepts.includes(d)}
                  onChange={() => toggleDept(watchedDepts, setWatchedDepts, d)}
                  style={{ accentColor: tokens.color.teal }}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <button
          data-testid="submit-pairing"
          type="submit"
          disabled={phase === 'claiming'}
          style={{
            padding: `${tokens.space.m}px ${tokens.space.xl}px`,
            background: phase === 'claiming' ? tokens.color.raised : tokens.color.teal,
            color: phase === 'claiming' ? tokens.color.ink_disabled : tokens.color.bg,
            border: 'none',
            borderRadius: tokens.radius.m,
            fontSize: 16,
            fontWeight: 700,
            cursor: phase === 'claiming' ? 'not-allowed' : 'pointer',
            fontFamily: tokens.font.ui,
          }}
        >
          {phase === 'claiming' ? 'Pairing…' : 'Pair'}
        </button>
      </form>

      {error && (
        <p style={{ color: tokens.color.red, marginTop: tokens.space.m }}>{error}</p>
      )}
    </div>
  );
}
