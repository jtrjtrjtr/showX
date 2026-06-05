import { useState } from 'react';
import { saveSession, getOrCreateClientPubkey } from '../lib/auth.js';
import type { DiscoveredHost, PairedSession } from '../lib/types.js';

interface Props {
  host: DiscoveredHost;
  onPaired: (session: PairedSession) => void;
}

const DEPARTMENTS = ['LX', 'SND', 'VID', 'SM'];

type Phase = 'idle' | 'claiming';

export function PairingView({ host, onPaired }: Props) {
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'sm' | 'operator'>('operator');
  const [ownedDepts, setOwnedDepts] = useState<string[]>([]);
  const [watchedDepts, setWatchedDepts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pairedDevice, setPairedDevice] = useState<{ device_id: string; token: string } | null>(null);

  function toggleDept(list: string[], setList: (v: string[]) => void, dept: string) {
    setList(list.includes(dept) ? list.filter((d) => d !== dept) : [...list, dept]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== 'idle') return;
    setError(null);
    setPhase('claiming');

    try {
      const client_pubkey = await getOrCreateClientPubkey();

      const owned_departments = role === 'sm' ? ['SM', ...ownedDepts] : ownedDepts;

      const claimR = await fetch(`http://${host.host}:${host.port}/api/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin,
          display_name: displayName,
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

      const { token, device } = (await claimR.json()) as { token: string; device: { device_id: string } };

      const session: PairedSession = {
        host: host.host,
        port: host.port,
        token,
        display_name: displayName,
        device_id: device.device_id,
        paired_at: Date.now(),
      };

      // Expose token for test helpers to read from localStorage
      localStorage.setItem('showx_pair_token', token);

      await saveSession(session);
      setPairedDevice({ device_id: device.device_id, token });
      onPaired(session);
    } catch {
      setError('Network error');
      setPhase('idle');
    }
  }

  if (pairedDevice) {
    return (
      <div data-testid="paired-success" className="pairing-view">
        <p>Paired successfully!</p>
        <span
          data-testid="station-id"
          data-id={pairedDevice.device_id}
          style={{ display: 'none' }}
        />
      </div>
    );
  }

  return (
    <div className="pairing-view">
      <h2>Pair with {host.host}:{host.port}</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Display name</label>
          <input
            data-testid="device-name-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. LX Op"
            required
          />
        </div>
        <div>
          <label>PIN</label>
          <input
            data-testid="pin-input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6-digit PIN"
            maxLength={6}
            required
          />
        </div>
        <div>
          <label>Role</label>
          <select
            data-testid="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as 'sm' | 'operator')}
          >
            <option value="sm">Stage Manager</option>
            <option value="operator">Operator</option>
          </select>
        </div>
        <div>
          <span>Owned departments</span>
          {DEPARTMENTS.map((d) => (
            <label key={`own-${d}`}>
              <input
                data-testid={`dept-chip-${d}`}
                type="checkbox"
                checked={ownedDepts.includes(d)}
                onChange={() => toggleDept(ownedDepts, setOwnedDepts, d)}
              />
              {d}
            </label>
          ))}
        </div>
        <div>
          <span>Watched departments</span>
          {DEPARTMENTS.map((d) => (
            <label key={`watch-${d}`}>
              <input
                type="checkbox"
                checked={watchedDepts.includes(d)}
                onChange={() => toggleDept(watchedDepts, setWatchedDepts, d)}
              />
              {d}
            </label>
          ))}
        </div>
        <button
          data-testid="submit-pairing"
          type="submit"
          disabled={phase === 'claiming'}
        >
          {phase === 'claiming' ? 'Pairing…' : 'Pair'}
        </button>
      </form>

      {error && <p style={{ color: '#f66' }}>{error}</p>}
    </div>
  );
}
