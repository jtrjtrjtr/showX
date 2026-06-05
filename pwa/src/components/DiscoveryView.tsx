import { useEffect, useState } from 'react';
import { discoverFromOrigin, probeLan, manualHost } from '../lib/discovery.js';
import type { DiscoveredHost } from '../lib/types.js';

interface Props {
  onPick: (host: DiscoveredHost) => void;
}

export function DiscoveryView({ onPick }: Props) {
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [scanning, setScanning] = useState(true);
  const [manualInput, setManualInput] = useState('');
  const [manualPort, setManualPort] = useState('8088');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromOrigin = await discoverFromOrigin();
      if (!cancelled && fromOrigin) {
        setHosts(fromOrigin.hosts);
        setScanning(false);
        return;
      }
      const found = await probeLan();
      if (!cancelled) {
        setHosts(found);
        setScanning(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    const port = parseInt(manualPort, 10) || 8088;
    onPick(manualHost(manualInput.trim(), port));
  }

  return (
    <div className="discovery-view">
      <h1>ShowX</h1>
      <p>{scanning ? 'Scanning LAN...' : hosts.length > 0 ? 'Select a show server:' : 'No servers found.'}</p>
      {hosts.map((h) => (
        <button key={`${h.host}:${h.port}`} onClick={() => onPick(h)}>
          {h.name ?? h.host}:{h.port}
        </button>
      ))}
      <form onSubmit={handleManual} style={{ marginTop: '1rem' }}>
        <input
          placeholder="Host (e.g. 192.168.1.10)"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
        />
        <input
          placeholder="Port"
          value={manualPort}
          onChange={(e) => setManualPort(e.target.value)}
          style={{ width: '80px', marginLeft: '0.5rem' }}
        />
        <button type="submit" style={{ marginLeft: '0.5rem' }}>Connect</button>
      </form>
    </div>
  );
}
