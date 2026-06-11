import { useEffect, useState } from 'react';
import { discoverFromOrigin, probeLan, manualHost } from '../lib/discovery.js';
import type { DiscoveredHost } from '../lib/types.js';
import { tokens } from './cuelist/tokens.js';

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

  const inputStyle = {
    padding: `${tokens.space.s}px ${tokens.space.m}px`,
    background: tokens.color.raised,
    color: tokens.color.ink,
    border: `1px solid ${tokens.color.border}`,
    borderRadius: tokens.radius.m,
    fontSize: 14,
    fontFamily: tokens.font.ui,
  };

  return (
    <div
      className="discovery-view"
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
      <h1 style={{ color: tokens.color.teal, marginTop: 0, fontSize: 28, fontWeight: 800 }}>
        ShowX
      </h1>
      <p style={{ color: tokens.color.ink_secondary }}>
        {scanning ? 'Scanning LAN…' : hosts.length > 0 ? 'Select a show server:' : 'No servers found.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space.s, marginBottom: tokens.space.l }}>
        {hosts.map((h) => (
          <button
            key={`${h.host}:${h.port}`}
            onClick={() => onPick(h)}
            style={{
              padding: `${tokens.space.m}px ${tokens.space.l}px`,
              background: tokens.color.raised,
              color: tokens.color.ink,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.m,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: tokens.font.ui,
            }}
          >
            {h.name ?? h.host}:{h.port}
          </button>
        ))}
      </div>
      <form onSubmit={handleManual} style={{ display: 'flex', gap: tokens.space.s, marginTop: tokens.space.l }}>
        <input
          placeholder="Host (e.g. 192.168.1.10)"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          placeholder="Port"
          value={manualPort}
          onChange={(e) => setManualPort(e.target.value)}
          style={{ ...inputStyle, width: 80 }}
        />
        <button
          type="submit"
          style={{
            padding: `${tokens.space.s}px ${tokens.space.m}px`,
            background: tokens.color.teal,
            color: tokens.color.bg,
            border: 'none',
            borderRadius: tokens.radius.m,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: tokens.font.ui,
          }}
        >
          Connect
        </button>
      </form>
    </div>
  );
}
