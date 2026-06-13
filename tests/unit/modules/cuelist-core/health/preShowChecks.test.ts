import { describe, it, expect } from 'vitest';
import {
  runPreShowChecks,
  type PreShowInput,
  type DeviceInfo,
  type DeviceHealthEntry,
  type CueRef,
} from '../../../../../src/modules/cuelist-core/src/health/preShowChecks.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDevice(id: string, label?: string): DeviceInfo {
  return { device_id: id, label: label ?? id };
}

function makeHealth(
  entries: Array<[string, Partial<DeviceHealthEntry>]>,
): Map<string, DeviceHealthEntry> {
  const m = new Map<string, DeviceHealthEntry>();
  for (const [id, e] of entries) {
    m.set(id, { status: e.status ?? 'healthy', last_error: e.last_error });
  }
  return m;
}

function makeCue(opts: {
  id?: string;
  label?: string;
  trigger?: { kind: string };
  deviceIds?: string[];
  type?: string;
}): CueRef {
  return {
    id: opts.id ?? 'cue-1',
    label: opts.label ?? 'Cue 1',
    trigger: opts.trigger ?? { kind: 'manual' },
    payloads: (opts.deviceIds ?? []).map((d) => ({ type: opts.type ?? 'osc', device_id: d })),
  };
}

function baseInput(overrides: Partial<PreShowInput> = {}): PreShowInput {
  return {
    devices: [],
    deviceHealth: new Map(),
    cues: [],
    stationCount: 1,
    clockLocked: false,
    ...overrides,
  };
}

// ── All-pass scenario ─────────────────────────────────────────────────────────

describe('runPreShowChecks — all pass', () => {
  it('returns all_pass when devices healthy, refs ok, 1+ station, no timecode', () => {
    const input = baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'healthy' }]]),
      cues: [makeCue({ deviceIds: ['eos'] })],
      stationCount: 2,
    });
    const r = runPreShowChecks(input);
    expect(r.verdict).toBe('all_pass');
    expect(r.failure_count).toBe(0);
    expect(r.warning_count).toBe(0);
    expect(r.items.every((i) => i.status === 'pass')).toBe(true);
  });
});

// ── Device health checks ──────────────────────────────────────────────────────

describe('device health check', () => {
  it('no devices → warn item "No devices configured"', () => {
    const r = runPreShowChecks(baseInput({ stationCount: 1 }));
    const devItem = r.items.find((i) => i.id === 'devices:none');
    expect(devItem).toBeDefined();
    expect(devItem!.status).toBe('warn');
  });

  it('device with status error → fail item', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'error', last_error: 'timeout' }]]),
      stationCount: 1,
    }));
    const devItem = r.items.find((i) => i.id === 'device:eos');
    expect(devItem?.status).toBe('fail');
    expect(devItem?.hint).toContain('timeout');
  });

  it('device with no health data → warn', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: new Map(),
      stationCount: 1,
    }));
    const devItem = r.items.find((i) => i.id === 'device:eos');
    expect(devItem?.status).toBe('warn');
  });

  it('device healthy → pass', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'healthy' }]]),
      stationCount: 1,
    }));
    const devItem = r.items.find((i) => i.id === 'device:eos');
    expect(devItem?.status).toBe('pass');
  });

  it('device warning → warn', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'warning' }]]),
      stationCount: 1,
    }));
    const devItem = r.items.find((i) => i.id === 'device:eos');
    expect(devItem?.status).toBe('warn');
  });
});

// ── Asset / routing reference checks ─────────────────────────────────────────

describe('payload device reference check', () => {
  it('cue payload referencing missing device → fail', () => {
    const r = runPreShowChecks(baseInput({
      devices: [],
      cues: [makeCue({ deviceIds: ['missing-device'] })],
      stationCount: 1,
    }));
    const refItem = r.items.find((i) => i.id === 'refs');
    expect(refItem?.status).toBe('fail');
    expect(refItem?.hint).toContain('missing-device');
  });

  it('all payload device_ids present → pass', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'healthy' }]]),
      cues: [makeCue({ deviceIds: ['eos'] })],
      stationCount: 1,
    }));
    const refItem = r.items.find((i) => i.id === 'refs');
    expect(refItem?.status).toBe('pass');
  });

  it('cues with no payloads → refs pass', () => {
    const r = runPreShowChecks(baseInput({
      devices: [],
      cues: [makeCue({})],
      stationCount: 1,
    }));
    const refItem = r.items.find((i) => i.id === 'refs');
    expect(refItem?.status).toBe('pass');
  });
});

// ── Station presence ──────────────────────────────────────────────────────────

describe('station presence check', () => {
  it('no stations → warn', () => {
    const r = runPreShowChecks(baseInput({ stationCount: 0 }));
    const sItem = r.items.find((i) => i.id === 'stations');
    expect(sItem?.status).toBe('warn');
    expect(sItem?.hint).toBeDefined();
  });

  it('1+ stations → pass', () => {
    const r = runPreShowChecks(baseInput({ stationCount: 3 }));
    const sItem = r.items.find((i) => i.id === 'stations');
    expect(sItem?.status).toBe('pass');
  });
});

// ── Clock source ──────────────────────────────────────────────────────────────

describe('clock source check', () => {
  it('no timecode cues → no clock check item', () => {
    const r = runPreShowChecks(baseInput({ cues: [makeCue({})] }));
    expect(r.items.find((i) => i.id === 'clock')).toBeUndefined();
  });

  it('timecode cue without clock locked → warn', () => {
    const r = runPreShowChecks(baseInput({
      cues: [makeCue({ trigger: { kind: 'timecode' } })],
      clockLocked: false,
    }));
    const clockItem = r.items.find((i) => i.id === 'clock');
    expect(clockItem?.status).toBe('warn');
  });

  it('timecode cue with clock locked → pass', () => {
    const r = runPreShowChecks(baseInput({
      cues: [makeCue({ trigger: { kind: 'timecode' } })],
      clockLocked: true,
    }));
    const clockItem = r.items.find((i) => i.id === 'clock');
    expect(clockItem?.status).toBe('pass');
  });
});

// ── Verdict aggregation ───────────────────────────────────────────────────────

describe('verdict aggregation', () => {
  it('any fail → has_failures', () => {
    const r = runPreShowChecks(baseInput({
      devices: [makeDevice('eos')],
      deviceHealth: makeHealth([['eos', { status: 'error' }]]),
      stationCount: 1,
    }));
    expect(r.verdict).toBe('has_failures');
    expect(r.failure_count).toBeGreaterThan(0);
  });

  it('only warns → has_warnings', () => {
    const r = runPreShowChecks(baseInput({
      stationCount: 0,  // warn
    }));
    expect(r.verdict).toBe('has_warnings');
    expect(r.warning_count).toBeGreaterThan(0);
    expect(r.failure_count).toBe(0);
  });
});
