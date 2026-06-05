import { describe, it, expect } from 'vitest';
import { resolveDeviceTransport } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import type { RoutingEntry } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';

function makeOscEntry(overrides: Partial<RoutingEntry> = {}): RoutingEntry {
  return {
    id: 'r1',
    match: {},
    transport: { kind: 'osc', host: '192.168.1.10', port: 8000 },
    enabled: true,
    notes: '',
    ...overrides,
  };
}

describe('resolveDeviceTransport', () => {
  it('returns null when no entries', () => {
    expect(resolveDeviceTransport('dev1', 'osc', {})).toBeNull();
  });

  it('device_id + payload_type + tag: highest specificity wins', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1', payload_type: 'osc', tag: 'LX' }, transport: { kind: 'osc', host: 'best', port: 9000 } }),
      r2: makeOscEntry({ id: 'r2', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device-only', port: 9001 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('best');
  });

  it('device_id alone match: specificity 4', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device-only', port: 9001 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('device-only');
  });

  it('payload_type alone match: specificity 2', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { payload_type: 'osc' }, transport: { kind: 'osc', host: 'type-match', port: 9002 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('type-match');
  });

  it('no match when only unrelated device_id', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'other-device' } }),
    };
    expect(resolveDeviceTransport('dev1', 'osc', routing)).toBeNull();
  });

  it('disabled entry skipped', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1' }, enabled: false }),
    };
    expect(resolveDeviceTransport('dev1', 'osc', routing)).toBeNull();
  });

  it('device_id (4) beats payload_type (2) when both match', () => {
    const routing: Record<string, RoutingEntry> = {
      rA: makeOscEntry({ id: 'rA', match: { payload_type: 'osc' }, transport: { kind: 'osc', host: 'type', port: 1 } }),
      rB: makeOscEntry({ id: 'rB', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device', port: 2 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect((t as { host: string }).host).toBe('device');
  });
});
