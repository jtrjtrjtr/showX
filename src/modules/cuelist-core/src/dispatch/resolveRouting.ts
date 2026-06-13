import * as Y from 'yjs';
import { getRoutingRules } from '../document/routing.js';
import type { RoutingRule, RulePayloadType } from '../document/routing.js';

// ── Transport descriptor types (exported for transport files) ─────────────────

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

// ── Old shape (pre-B003-101) — kept for backward compat with transport files ──

export interface RoutingEntry {
  id: string;
  match: { device_id?: string; payload_type?: string; tag?: string };
  transport: TransportDescriptor;
  enabled: boolean;
  notes: string;
}

/**
 * Legacy resolver — accepts flat Record<string, RoutingEntry> (old shape with embedded transport).
 * Used by transport files (osc.ts, lxRef.ts, midi.ts, msc.ts). Preserved for backward compat.
 * Most-specific match wins per data_model.md §10.3 v0 scoring.
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
    // A specified match field that DOESN'T match disqualifies the rule entirely;
    // an unspecified field is a wildcard worth 0 points. (Previously
    // `undefined === undefined` scored +4, letting a payload_type-mismatched rule
    // beat the explicit catch-all fallback — packets silently went to a dead device.)
    if (e.match.device_id !== undefined) {
      if (e.match.device_id !== device_id) continue;
      s += 4;
    }
    if (e.match.payload_type !== undefined) {
      if (e.match.payload_type !== payload_type) continue;
      s += 2;
    }
    if (e.match.tag) s += 1;
    ranked.push({ entry: e, specificity: s });
  }

  ranked.sort((a, b) => b.specificity - a.specificity);
  return ranked[0]?.entry.transport ?? null;
}

// ── Device → TransportDescriptor conversion ───────────────────────────────────

type DeviceDriver = 'eos' | 'ma3' | 'hog4' | 'chamsys' | 'qlab' | 'generic';

function driverToEncoding(driver: DeviceDriver): OscTransport['encoding'] {
  switch (driver) {
    case 'eos': return 'eos';
    case 'ma3': return 'ma3';
    case 'hog4': return 'hog';
    case 'chamsys': return 'chamsys';
    case 'qlab': return 'qlab';
    default: return undefined;
  }
}

function deviceToTransportDescriptor(device: Record<string, unknown>): TransportDescriptor | null {
  const t = device['transport'] as string | undefined;
  switch (t) {
    case 'osc': {
      const host = device['host'] as string | undefined;
      const port = device['port'] as number | undefined;
      if (!host || port === undefined) return null;
      const driver = device['driver'] as DeviceDriver | undefined;
      const encoding = driver ? driverToEncoding(driver) : undefined;
      return { kind: 'osc', host, port, ...(encoding !== undefined ? { encoding } : {}) };
    }
    case 'midi': {
      const midi_port = device['midi_port'] as string | undefined;
      if (!midi_port) return null;
      return { kind: 'midi', port_name: midi_port };
    }
    case 'msc': {
      const midi_port = device['midi_port'] as string | undefined;
      if (!midi_port) return null;
      return { kind: 'msc', port_name: midi_port };
    }
    case 'dmx': {
      const universe = device['dmx_universe'] as number | undefined;
      if (universe === undefined) return null;
      return { kind: 'dmx', universe };
    }
    default:
      return null;
  }
}

// ── New Y.Doc-based resolver (B003-101 RoutingRule shape) ─────────────────────

export interface ResolveRoutingParams {
  payloadType: RulePayloadType;
  deviceId?: string;
  tag?: string;
}

export type RoutingResolution = TransportDescriptor | { error: 'no_route' };

function tagMatches(tag: string, pattern: string): boolean {
  if (tag === pattern) return true;
  try {
    return new RegExp(pattern).test(tag);
  } catch {
    return false;
  }
}

/**
 * Returns precedence class (1 = highest, 2 = lower) or null if the rule doesn't match.
 * Class 1: rule has match.device_id that equals params.deviceId.
 * Class 2: rule matches by payload_type + optional tag_pattern (no device_id on rule).
 */
function matchPrecedenceClass(rule: RoutingRule, params: ResolveRoutingParams): 1 | 2 | null {
  if (rule.match.device_id !== undefined) {
    return params.deviceId === rule.match.device_id ? 1 : null;
  }

  if (rule.match.payload_type !== undefined && rule.match.payload_type !== params.payloadType) {
    return null;
  }

  if (rule.match.tag_pattern !== undefined) {
    if (!params.tag) return null;
    if (!tagMatches(params.tag, rule.match.tag_pattern)) return null;
  }

  return 2;
}

// ── Shared candidate resolution ───────────────────────────────────────────────

interface RuleWithTransport {
  rule: RoutingRule;
  transport: TransportDescriptor;
}

/**
 * Finds the highest-precedence RoutingRule that has a valid device transport.
 * Returns null if no matching rule or no device transport found.
 */
function findBestMatchingRuleWithTransport(
  rules: RoutingRule[],
  params: ResolveRoutingParams,
  devicesRaw: Record<string, Record<string, unknown>>,
): RuleWithTransport | null {
  const candidates: Array<{ rule: RoutingRule; cls: 1 | 2 }> = [];
  for (const rule of rules) {
    const cls = matchPrecedenceClass(rule, params);
    if (cls !== null) candidates.push({ rule, cls });
  }
  if (candidates.length === 0) return null;

  // Class 1 < Class 2 numerically → ascending sort puts class 1 first.
  // Within same class, lower sort_key wins.
  candidates.sort((a, b) => {
    if (a.cls !== b.cls) return a.cls - b.cls;
    return a.rule.sort_key - b.rule.sort_key;
  });

  for (const { rule } of candidates) {
    const device = devicesRaw[rule.target_device_id];
    if (!device) continue;
    const transport = deviceToTransportDescriptor(device);
    if (transport) return { rule, transport };
  }
  return null;
}

/**
 * New Y.Doc-based resolver implementing B003-101 RoutingRule shape.
 *
 * Precedence per data_model.md §10.3:
 *   1. Exact match.device_id match (class 1)
 *   2. payload_type + optional tag_pattern match (class 2)
 * Within same class, sort_key ascending; first match wins.
 *
 * Returns `{ error: 'no_route' }` if no rule matches or device is missing.
 */
export function resolveRoutingForPayload(
  doc: Y.Doc,
  params: ResolveRoutingParams,
): RoutingResolution {
  const rules = getRoutingRules(doc);
  const devicesRaw = doc.getMap('devices').toJSON() as Record<string, Record<string, unknown>>;
  const match = findBestMatchingRuleWithTransport(rules, params, devicesRaw);
  return match ? match.transport : { error: 'no_route' };
}

// ── Backup resolution ─────────────────────────────────────────────────────────

export interface BackupDescriptor {
  transport: TransportDescriptor;
  deviceId: string;
}

export type RoutingResolutionWithBackup =
  | { error: 'no_route' }
  | { primary: TransportDescriptor; primaryDeviceId: string; backup?: BackupDescriptor };

/**
 * Resolves the primary transport for a payload and also returns the backup transport
 * if the matched rule has backup_device_id set.
 *
 * Failover semantics: backup is only used when primary dispatch fails.
 * Both-send (primary + backup always) is NOT implemented; use separate routing rules for that.
 */
export function resolveRoutingWithBackup(
  doc: Y.Doc,
  params: ResolveRoutingParams,
): RoutingResolutionWithBackup {
  const rules = getRoutingRules(doc);
  const devicesRaw = doc.getMap('devices').toJSON() as Record<string, Record<string, unknown>>;
  const match = findBestMatchingRuleWithTransport(rules, params, devicesRaw);
  if (!match) return { error: 'no_route' };

  let backup: BackupDescriptor | undefined;
  if (match.rule.backup_device_id) {
    const backupDevice = devicesRaw[match.rule.backup_device_id];
    if (backupDevice) {
      const backupTransport = deviceToTransportDescriptor(backupDevice);
      if (backupTransport) {
        backup = { transport: backupTransport, deviceId: match.rule.backup_device_id };
      }
    }
  }

  return {
    primary: match.transport,
    primaryDeviceId: match.rule.target_device_id,
    ...(backup !== undefined ? { backup } : {}),
  };
}

// ── Legacy routing table builder (for payloadDispatch.ts adapter) ─────────────

/**
 * Builds a Record<string, RoutingEntry> from Y.Doc for use by transport dispatch files.
 * Handles both old-shape (RoutingEntry with embedded transport stored as plain object)
 * and new-shape (RoutingRule with target_device_id stored as Y.Map).
 */
export function buildDispatchRoutingTable(doc: Y.Doc): Record<string, RoutingEntry> {
  const rawRouting = doc.getMap('routing').toJSON() as Record<string, Record<string, unknown>>;
  const rawDevices = doc.getMap('devices').toJSON() as Record<string, Record<string, unknown>>;
  const result: Record<string, RoutingEntry> = {};

  for (const [key, raw] of Object.entries(rawRouting)) {
    if (!raw || typeof raw !== 'object') continue;

    if (typeof raw['target_device_id'] === 'string') {
      // New shape (B003-101): look up device and build TransportDescriptor
      const device = rawDevices[raw['target_device_id']];
      if (!device) continue;
      const transport = deviceToTransportDescriptor(device);
      if (!transport) continue;

      const matchRaw = (raw['match'] ?? {}) as {
        device_id?: string;
        payload_type?: string;
        tag_pattern?: string;
        tag?: string;
      };
      result[key] = {
        id: typeof raw['rule_id'] === 'string' ? raw['rule_id'] : key,
        match: {
          device_id: matchRaw.device_id,
          payload_type: matchRaw.payload_type,
          tag: matchRaw.tag_pattern ?? matchRaw.tag,
        },
        transport,
        enabled: true,
        notes: typeof raw['notes'] === 'string' ? raw['notes'] : '',
      };
    } else {
      // Old shape (pre-B003-101): plain RoutingEntry with embedded transport — pass through
      const transportRaw = raw['transport'];
      if (transportRaw && typeof transportRaw === 'object' && 'kind' in (transportRaw as object)) {
        const entry = raw as unknown as RoutingEntry;
        if (entry.enabled !== false) {
          result[key] = entry;
        }
      }
    }
  }

  return result;
}
