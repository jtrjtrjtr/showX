import { useState } from 'react';
import { saveSession, getOrCreateClientPubkey } from '../lib/auth.js';
import type { DiscoveredHost, PairedSession } from '../lib/types.js';

interface Props {
  host: DiscoveredHost;
  onPaired: (session: PairedSession) => void;
}

const DEPARTMENTS = ['LX', 'SND', 'VID', 'SM'];

type Phase = 'idle' | 'claiming' | 'waiting';

export function PairingView({ host, onPaired }: Props) {
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ownedDepts, setOwnedDepts] = useState<string[]>([]);
  const [watchedDepts, setWatchedDepts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  const offerId = new URLSearchParams(window.location.search).get('offer') ?? '';

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

      const claimR = await fetch(`http://${host.host}:${host.port}/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_id: offerId,
          pin,
          display_name: displayName,
          owned_departments: ownedDepts,
          watched_departments: watchedDepts,
          client_pubkey,
        }),
      });

      if (!claimR.ok) {
        setError(claimR.status === 401 ? 'PIN invalid or expired' : 'Pairing failed');
        setPhase('idle');
        return;
      }

      const { request_id } = (await claimR.json()) as { request_id: string };
      setPhase('waiting');

      // Long-poll for SM approval — check immediately, then every 1s, give up after 120s
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const statusR = await fetch(
          `http://${host.host}:${host.port}/pairing/${request_id}/status`,
        );
        if (statusR.ok) {
          const body = (await statusR.json()) as {
            status: string;
            token?: string;
            device?: { device_id: string };
          };

          if (body.status === 'allowed' && body.token && body.device) {
            const session: PairedSession = {
              host: host.host,
              port: host.port,
              token: body.token,
              display_name: displayName,
              device_id: body.device.device_id,
              paired_at: Date.now(),
            };
            await saveSession(session);
            onPaired(session);
            return;
          }

          if (body.status === 'refused') {
            setError('Pairing refused by SM');
            setPhase('idle');
            return;
          }
        }
        await new Promise<void>((res) => setTimeout(res, 1_000));
      }

      setError('Pairing timed out (SM did not respond in 120s)');
      setPhase('idle');
    } catch {
      setError('Network error');
      setPhase('idle');
    }
  }

  return (
    <div className="pairing-view">
      <h2>Pair with {host.host}:{host.port}</h2>

      {phase === 'waiting' && <p>Waiting for SM approval…</p>}

      {phase !== 'waiting' && (
        <form onSubmit={handleSubmit}>
          <div>
            <label>Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. LX Op"
              required
            />
          </div>
          <div>
            <label>PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="6-digit PIN"
              maxLength={6}
              required
            />
          </div>
          <div>
            <span>Owned departments</span>
            {DEPARTMENTS.map((d) => (
              <label key={`own-${d}`}>
                <input
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
          <button type="submit" disabled={phase === 'claiming'}>
            {phase === 'claiming' ? 'Claiming…' : 'Pair'}
          </button>
        </form>
      )}

      {error && <p style={{ color: '#f66' }}>{error}</p>}
    </div>
  );
}
