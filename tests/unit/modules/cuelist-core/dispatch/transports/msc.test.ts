import { describe, it, expect, vi } from 'vitest';
import type { MscPayload } from 'showx-shared';
import { buildMscSysEx, dispatchMsc } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/msc.js';
import type { RoutingEntry } from '../../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'msc', latencyMs: 0 })): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc, show_id: 'show-1', cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }), subscribePattern: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeMscPayload(overrides: Partial<MscPayload> = {}): MscPayload {
  return {
    id: 'p1', type: 'msc', tag: null, note: '',
    device_id: 'eos-console',
    command: 'go',
    cue_list: '1',
    cue_number: '11',
    device_id_msc: 0x01,
    ...overrides,
  };
}

function makeMscRouting(deviceIdMsc?: number): Record<string, RoutingEntry> {
  return {
    r1: { id: 'r1', match: { device_id: 'eos-console' }, transport: { kind: 'msc', port_name: 'IAC Driver', device_id_msc: deviceIdMsc }, enabled: true, notes: '' },
  };
}

describe('buildMscSysEx', () => {
  it('GO command produces correct bytes: F0 7F 01 02 01 01 31 31 00 31 00 F7', () => {
    // go, list=1, number=11: F0 7F 01 02 01 01 31 31 00 31 00 F7
    const p: MscPayload = makeMscPayload({ cue_number: '11', cue_list: '1', device_id_msc: 0x01 });
    const bytes = buildMscSysEx(p, 0x01);
    expect(bytes).toEqual([0xf0, 0x7f, 0x01, 0x02, 0x01, 0x01, 0x31, 0x31, 0x00, 0x31, 0x00, 0xf7]);
  });

  it('STOP command uses 0x02 command byte', () => {
    const p = makeMscPayload({ command: 'stop', cue_number: null, cue_list: null, device_id_msc: 0x7f });
    const bytes = buildMscSysEx(p, 0x7f);
    expect(bytes[5]).toBe(0x02);
  });

  it('device_id_msc=127 (0x7F) used when provided', () => {
    const p = makeMscPayload({ cue_number: null, cue_list: null, device_id_msc: 0x7f });
    const bytes = buildMscSysEx(p, 0x7f);
    expect(bytes[2]).toBe(0x7f);
  });

  it('command format is 0x01 (lighting)', () => {
    const bytes = buildMscSysEx(makeMscPayload({ cue_number: null, cue_list: null }), 1);
    expect(bytes[4]).toBe(0x01);
  });
});

describe('dispatchMsc', () => {
  it('calls output.send with msc transport, correct port name, deviceId, command', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'msc', latencyMs: 0 });
    const deps = makeDeps(sendFn);
    await dispatchMsc(makeMscPayload(), makeMscRouting(0x01), deps);
    expect(sendFn).toHaveBeenCalledOnce();
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('msc');
    expect(msg.midiPortName).toBe('IAC Driver');
    expect(msg.deviceId).toBe(0x01);
    expect(msg.commandFormat).toBe(0x01);
    expect(msg.command).toBe(0x01); // 'go' = 0x01
    expect(Array.isArray(msg.data)).toBe(true);
  });

  it('returns error when no msc routing', async () => {
    const deps = makeDeps();
    const r = await dispatchMsc(makeMscPayload({ device_id: 'unknown' }), makeMscRouting(), deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no msc routing/);
  });

  it('routing device_id_msc overrides payload device_id_msc', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'msc', latencyMs: 0 });
    const deps = makeDeps(sendFn);
    // routing says device_id_msc=5, payload says 1
    await dispatchMsc(makeMscPayload({ device_id_msc: 1 }), makeMscRouting(5), deps);
    expect(sendFn.mock.calls[0][0].deviceId).toBe(5);
  });
});
