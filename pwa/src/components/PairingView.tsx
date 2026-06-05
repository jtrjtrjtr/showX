import { useState } from 'react';
import { saveSession } from '../lib/auth.js';
import type { DiscoveredHost, PairedSession } from '../lib/types.js';

interface Props {
  host: DiscoveredHost;
  onPaired: (session: PairedSession) => void;
}

export function PairingView({ host, onPaired }: Props) {
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`http://${host.host}:${host.port}/pairing/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, display_name: displayName }),
      });
      if (!r.ok) {
        setError(r.status === 401 ? 'PIN invalid or expired' : 'Pairing failed');
        return;
      }
      const { token, device } = await r.json() as { token: string; device: { device_id: string } };
      const session: PairedSession = {
        host: host.host,
        port: host.port,
        token,
        display_name: displayName,
        device_id: device.device_id,
        paired_at: Date.now(),
      };
      await saveSession(session);
      onPaired(session);
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pairing-view">
      <h2>Pair with {host.host}:{host.port}</h2>
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
        {error && <p style={{ color: '#f66' }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Pairing…' : 'Pair'}
        </button>
      </form>
    </div>
  );
}
