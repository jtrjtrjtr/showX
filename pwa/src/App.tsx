import { useEffect, useState } from 'react';
import { DiscoveryView } from './components/DiscoveryView.js';
import { PairingView } from './components/PairingView.js';
import { PlaceholderShowView } from './components/PlaceholderShowView.js';
import { AppShell } from './components/AppShell.js';
import { listSessions } from './lib/auth.js';
import type { AppMode, PairedSession, DiscoveredHost } from './lib/types.js';

function modeFromUrl(): AppMode | null {
  const u = new URLSearchParams(window.location.search);
  const m = u.get('mode');
  if (m === 'shell') return 'shell';
  return null;
}

function hostFromLocation(): DiscoveredHost | null {
  if (window.location.pathname === '/pairing') {
    return {
      host: window.location.hostname,
      port: Number(window.location.port) || 80,
      pairingAvailable: true,
    };
  }
  return null;
}

export function App() {
  const [mode, setMode] = useState<AppMode>('discover');
  const [host, setHost] = useState<DiscoveredHost | null>(null);
  const [session, setSession] = useState<PairedSession | null>(null);

  useEffect(() => {
    const urlMode = modeFromUrl();
    if (urlMode === 'shell') { setMode('shell'); return; }

    const pairingHost = hostFromLocation();
    if (pairingHost) {
      setHost(pairingHost);
      setMode('pair');
      return;
    }

    listSessions().then((sessions) => {
      const latest = sessions.sort((a, b) => b.paired_at - a.paired_at)[0];
      if (latest) {
        setSession(latest);
        setHost({ host: latest.host, port: latest.port, pairingAvailable: false });
        setMode('show');
      }
    });
  }, []);

  if (mode === 'shell') return <AppShell title="ShowX Shell" subtitle="Module sidebar — UI in later bundle" />;
  if (mode === 'discover') return <DiscoveryView onPick={(h) => { setHost(h); setMode('pair'); }} />;
  if (mode === 'pair' && host) return <PairingView host={host} onPaired={(s) => { setSession(s); setMode('show'); }} />;
  if (mode === 'show' && session) return <PlaceholderShowView session={session} />;
  return <DiscoveryView onPick={(h) => { setHost(h); setMode('pair'); }} />;
}
