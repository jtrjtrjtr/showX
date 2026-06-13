// Pre-show health check — pure logic, no I/O.
// Takes plain data; UI layer is responsible for fetching from HealthBus / awareness.

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  hint?: string;
}

export interface PreShowCheckResult {
  items: CheckItem[];
  verdict: 'all_pass' | 'has_warnings' | 'has_failures';
  warning_count: number;
  failure_count: number;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface DeviceInfo {
  device_id: string;
  label: string;
}

export type DeviceHealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export interface DeviceHealthEntry {
  status: DeviceHealthStatus;
  last_error?: string;
}

/** Payload sub-object: only the fields we need for checks. */
export interface PayloadRef {
  type: string;
  device_id?: string;
}

/** Cue sub-object: only what we need for checks. */
export interface CueRef {
  id: string;
  label: string;
  trigger: { kind: string };
  payloads: PayloadRef[];
}

export interface PreShowInput {
  /** All devices defined in the show doc. */
  devices: DeviceInfo[];
  /** Health snapshot keyed by device_id (from HealthBus.getDeviceHealth()). */
  deviceHealth: Map<string, DeviceHealthEntry>;
  /** All cues across all cuelists in the show. */
  cues: CueRef[];
  /** Number of stations currently visible in awareness (excluding local shell). */
  stationCount: number;
  /** Whether the timecode clock is currently locked/running. */
  clockLocked: boolean;
}

// ── Check functions ───────────────────────────────────────────────────────────

function checkDeviceHealth(
  devices: DeviceInfo[],
  deviceHealth: Map<string, DeviceHealthEntry>,
): CheckItem[] {
  if (devices.length === 0) {
    return [{
      id: 'devices:none',
      label: 'No devices configured',
      status: 'warn',
      hint: 'Add at least one output device in the Devices panel',
    }];
  }

  return devices.map((d) => {
    const h = deviceHealth.get(d.device_id);
    if (!h) {
      return {
        id: `device:${d.device_id}`,
        label: `${d.label} — no health data`,
        status: 'warn' as CheckStatus,
        hint: 'Trigger a cue to this device or run a test ping to verify connectivity',
      };
    }
    switch (h.status) {
      case 'healthy':
        return { id: `device:${d.device_id}`, label: `${d.label}`, status: 'pass' as CheckStatus };
      case 'warning':
        return {
          id: `device:${d.device_id}`,
          label: `${d.label} — degraded`,
          status: 'warn' as CheckStatus,
          hint: h.last_error ?? 'Device is intermittent — check network/cable',
        };
      case 'error':
        return {
          id: `device:${d.device_id}`,
          label: `${d.label} — unreachable`,
          status: 'fail' as CheckStatus,
          hint: h.last_error ?? 'Check host/port in Devices panel and verify network path',
        };
      default:
        return {
          id: `device:${d.device_id}`,
          label: `${d.label} — unknown`,
          status: 'warn' as CheckStatus,
          hint: 'No recent dispatch to this device',
        };
    }
  });
}

function checkAssetRefs(
  devices: DeviceInfo[],
  cues: CueRef[],
): CheckItem {
  const knownIds = new Set(devices.map((d) => d.device_id));
  const broken: string[] = [];

  for (const cue of cues) {
    for (const p of cue.payloads) {
      if (p.device_id && !knownIds.has(p.device_id)) {
        const ref = `${cue.label} → ${p.type}:${p.device_id}`;
        if (!broken.includes(ref)) broken.push(ref);
      }
    }
  }

  if (broken.length === 0) {
    return { id: 'refs', label: 'Payload device references', status: 'pass' };
  }
  return {
    id: 'refs',
    label: `${broken.length} broken device reference${broken.length > 1 ? 's' : ''}`,
    status: 'fail',
    hint: `Cues reference missing devices: ${broken.slice(0, 3).join('; ')}${broken.length > 3 ? ' …' : ''}`,
  };
}

function checkStations(stationCount: number): CheckItem {
  if (stationCount === 0) {
    return {
      id: 'stations',
      label: 'No operator stations connected',
      status: 'warn',
      hint: 'Open ShowX on operator devices and pair to this shell before the show',
    };
  }
  return {
    id: 'stations',
    label: `${stationCount} operator station${stationCount > 1 ? 's' : ''} connected`,
    status: 'pass',
  };
}

function checkClockSource(cues: CueRef[], clockLocked: boolean): CheckItem | null {
  const hasTimecodeCues = cues.some((c) => c.trigger.kind === 'timecode');
  if (!hasTimecodeCues) return null;

  if (!clockLocked) {
    return {
      id: 'clock',
      label: 'Clock source not locked',
      status: 'warn',
      hint: 'Timecode cues will not fire without a running clock — connect MTC/LTC source or start internal clock',
    };
  }
  return { id: 'clock', label: 'Clock source locked', status: 'pass' };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function runPreShowChecks(input: PreShowInput): PreShowCheckResult {
  const { devices, deviceHealth, cues, stationCount, clockLocked } = input;

  const items: CheckItem[] = [
    ...checkDeviceHealth(devices, deviceHealth),
    checkAssetRefs(devices, cues),
    checkStations(stationCount),
  ];

  const clockItem = checkClockSource(cues, clockLocked);
  if (clockItem) items.push(clockItem);

  const warning_count = items.filter((i) => i.status === 'warn').length;
  const failure_count = items.filter((i) => i.status === 'fail').length;

  let verdict: PreShowCheckResult['verdict'];
  if (failure_count > 0) verdict = 'has_failures';
  else if (warning_count > 0) verdict = 'has_warnings';
  else verdict = 'all_pass';

  return { items, verdict, warning_count, failure_count };
}
