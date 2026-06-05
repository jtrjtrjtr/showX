export type OscTransport = {
  kind: 'osc';
  host: string;
  port: number;
  encoding?: 'plain' | 'eos' | 'ma3' | 'chamsys' | 'hog' | 'qlab';
};

export type MidiTransport = { kind: 'midi'; port_name: string };

export type MscTransport = {
  kind: 'msc';
  port_name: string;
  device_id_msc?: number;
};

export type HttpTransport = { kind: 'http'; base_url: string };

export type DmxTransport = { kind: 'dmx'; universe: number };

export type InprocTransport = { kind: 'inproc'; module_slug: string };

export type TransportDescriptor =
  | OscTransport
  | MidiTransport
  | MscTransport
  | HttpTransport
  | DmxTransport
  | InprocTransport;

export interface RoutingEntry {
  id: string;
  match: { device_id?: string; payload_type?: string; tag?: string };
  transport: TransportDescriptor;
  enabled: boolean;
  notes: string;
}

/**
 * Most-specific match wins per data_model.md §10.3.
 * Specificity scoring: device_id match = 4, payload_type match = 2, tag present = 1.
 * Returns null if no enabled entry matches.
 */
export function resolveDeviceTransport(
  device_id: string,
  payload_type: string,
  routing: Record<string, RoutingEntry>,
): TransportDescriptor | null {
  const entries = Object.values(routing).filter((e) => e.enabled);
  const ranked: Array<{ entry: RoutingEntry; specificity: number }> = [];

  for (const e of entries) {
    let s = 0;
    if (e.match.device_id === device_id) s += 4;
    if (e.match.payload_type === payload_type) s += 2;
    if (e.match.tag) s += 1;
    if (s > 0) ranked.push({ entry: e, specificity: s });
  }

  ranked.sort((a, b) => b.specificity - a.specificity);
  return ranked[0]?.entry.transport ?? null;
}
