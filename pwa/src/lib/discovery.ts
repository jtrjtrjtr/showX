import type { DiscoveredHost } from './types.js';

export interface DiscoveryResult {
  hosts: DiscoveredHost[];
  source: 'origin' | 'probe' | 'manual';
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { signal: c.signal, mode: 'cors' });
  } finally {
    clearTimeout(t);
  }
}

export async function discoverFromOrigin(): Promise<DiscoveryResult | null> {
  try {
    // TODO(B001-005-contract): acceptance criterion says /system/health; spec body says /_showx/ping.
    // Using /_showx/ping pending Architect ratification of canonical path.
    const r = await fetchWithTimeout(`${window.location.origin}/_showx/ping`, 1500);
    if (!r.ok) return null;
    return {
      hosts: [{
        host: window.location.hostname,
        port: Number(window.location.port) || 80,
        pairingAvailable: true,
      }],
      source: 'origin',
    };
  } catch {
    return null;
  }
}

// TODO(ShowX-3): replace hardcoded hints with saved sessions + user input
const DEFAULT_LAN_HINTS = [
  '192.168.1.1', '192.168.1.10', '192.168.0.1', '192.168.0.10',
  '10.0.0.1', '10.0.0.5', '172.16.0.1',
];

export async function probeLan(hints: string[] = DEFAULT_LAN_HINTS): Promise<DiscoveredHost[]> {
  const probes = hints.map(async (host) => {
    try {
      const r = await fetchWithTimeout(`http://${host}:8088/_showx/ping`, 800);
      if (r.ok) {
        const body = await r.json() as { port?: number; name?: string };
        return { host, port: body.port ?? 8088, name: body.name, pairingAvailable: true } as DiscoveredHost;
      }
    } catch {
      // host not reachable
    }
    return null;
  });
  return (await Promise.all(probes)).filter((x): x is DiscoveredHost => x !== null);
}

export function manualHost(host: string, port: number): DiscoveredHost {
  return { host, port, pairingAvailable: true };
}
