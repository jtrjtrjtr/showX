import { describe, it, expect, vi } from 'vitest';
import type { MidiPayload } from 'showx-shared';
import { dispatchMidi } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/midi.js';
import type { RoutingEntry } from '../../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(sendFn = vi.fn().mockResolvedValue({ ok: true })): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc, show_id: 'show-1', cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeRouting(): Record<string, RoutingEntry> {
  return { r1: { id: 'r1', match: { device_id: 'pyro-board' }, transport: { kind: 'midi', port_name: 'IAC Bus 1' }, enabled: true, notes: '' } };
}

function makeMidiPayload(message: MidiPayload['message']): MidiPayload {
  return { id: 'p1', type: 'midi', tag: null, note: '', device_id: 'pyro-board', message };
}

describe('dispatchMidi', () => {
  it('note_on builds 3-byte MIDI message: 0x9n note velocity', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchMidi(makeMidiPayload({ kind: 'note_on', channel: 1, note: 60, velocity: 127 }), makeRouting(), deps);
    const bytes = sendFn.mock.calls[0][0].bytes;
    expect(bytes).toEqual([0x90, 60, 127]);
  });

  it('note_off builds 3-byte MIDI message: 0x8n note velocity', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchMidi(makeMidiPayload({ kind: 'note_off', channel: 2, note: 60, velocity: 0 }), makeRouting(), deps);
    const bytes = sendFn.mock.calls[0][0].bytes;
    expect(bytes).toEqual([0x81, 60, 0]);
  });

  it('cc builds 3-byte CC message: 0xBn controller value', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    await dispatchMidi(makeMidiPayload({ kind: 'cc', channel: 1, controller: 7, value: 100 }), makeRouting(), deps);
    const bytes = sendFn.mock.calls[0][0].bytes;
    expect(bytes).toEqual([0xb0, 7, 100]);
  });

  it('raw bytes pass through unchanged', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(sendFn);
    const raw = [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7];
    await dispatchMidi(makeMidiPayload({ kind: 'raw', bytes: raw }), makeRouting(), deps);
    expect(sendFn.mock.calls[0][0].bytes).toEqual(raw);
  });

  it('returns error when no midi routing', async () => {
    const deps = makeDeps();
    const r = await dispatchMidi(makeMidiPayload({ kind: 'note_on', channel: 1, note: 60, velocity: 127 }), {}, deps);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no midi routing/);
  });
});
