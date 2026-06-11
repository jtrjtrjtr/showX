import { describe, it, expect, vi } from 'vitest';
import type { MidiPayload } from 'showx-shared';
import * as Y from 'yjs';
import { dispatchCue } from '../../../../../src/modules/cuelist-core/src/dispatch/payloadDispatch.js';
import { initShowDoc, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addDevice } from '../../../../../src/modules/cuelist-core/src/document/devices.js';
import type { DispatchDeps } from '../../../../../src/modules/cuelist-core/src/dispatch/types.js';
import type { Cue } from 'showx-shared';

function makeDoc() {
  const doc = initShowDoc({ title: 'MIDI Test Show', venue: null, date: null, created_by: 'test' });
  setMode(doc, 'rehearsal');
  return doc;
}

function makeDeps(
  doc: Y.Doc,
  cuelistId: string,
  sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'midi', latencyMs: 0 }),
): DispatchDeps {
  return {
    doc,
    show_id: 'show-1',
    cuelist_id: cuelistId,
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }),
    },
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeMidiCue(deviceId: string, msg: MidiPayload['message']): Cue {
  const now = new Date().toISOString();
  const payload: MidiPayload = {
    id: 'mp1',
    type: 'midi',
    tag: null,
    note: '',
    device_id: deviceId,
    message: msg,
  };
  return {
    id: 'c1', label: 'MIDI Cue 1', description: '', department: ['LX'], standby_note: '',
    script_line_ref: null, trigger: { kind: 'manual' }, payloads: [payload],
    duration_hint_ms: null, notes: '', payload_frozen_at: null,
    created_at: now, created_by: 'test', modified_at: now, modified_by: 'test',
  };
}

describe('MIDI dispatch end-to-end (mock pool)', () => {
  it('note_on cue dispatched via routing to correct MIDI port', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'midi', latencyMs: 0 });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');

    addDevice(doc, {
      device_id: 'lx_midi',
      label: 'LX MIDI',
      transport: 'midi',
      midi_port: 'IAC Driver Bus 1',
    }, { actorId: 'test' });

    const deps = makeDeps(doc, clId, sendFn);
    const cue = makeMidiCue('lx_midi', { kind: 'note_on', channel: 1, note: 60, velocity: 100 });

    const result = await dispatchCue(cue, deps);

    expect(result.ok).toBe(true);
    expect(result.payloads_dispatched).toBe(1);
    expect(result.payloads_failed).toHaveLength(0);

    expect(sendFn).toHaveBeenCalledOnce();
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('midi');
    expect(msg.midiPortName).toBe('IAC Driver Bus 1');
    // note_on ch1: 0x90 | 0 = 0x90, note=60, velocity=100
    expect(msg.bytes).toEqual([0x90, 60, 100]);
  });

  it('cc message dispatches correct 3-byte sequence', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'midi', latencyMs: 0 });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');

    addDevice(doc, {
      device_id: 'pyro_midi',
      label: 'Pyro MIDI',
      transport: 'midi',
      midi_port: 'USB MIDI 1',
    }, { actorId: 'test' });

    const deps = makeDeps(doc, clId, sendFn);
    const cue = makeMidiCue('pyro_midi', { kind: 'cc', channel: 2, controller: 7, value: 127 });

    const result = await dispatchCue(cue, deps);

    expect(result.ok).toBe(true);
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('midi');
    expect(msg.midiPortName).toBe('USB MIDI 1');
    // cc ch2: 0xB0 | 1 = 0xB1, controller=7, value=127
    expect(msg.bytes).toEqual([0xb1, 7, 127]);
  });

  it('midi payload without device returns error, not exception', async () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    // No device/routing added
    const deps = makeDeps(doc, clId);
    const cue = makeMidiCue('nonexistent_device', { kind: 'note_on', channel: 1, note: 60, velocity: 127 });

    const result = await dispatchCue(cue, deps);

    expect(result.ok).toBe(false);
    expect(result.payloads_failed).toHaveLength(1);
    expect(result.payloads_failed[0].error).toMatch(/midi/);
  });

  it('dispatch details have transport=midi for Dispatch Log summary', async () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');

    addDevice(doc, {
      device_id: 'lx_midi',
      label: 'LX MIDI',
      transport: 'midi',
      midi_port: 'IAC Driver Bus 1',
    }, { actorId: 'test' });

    const deps = makeDeps(doc, clId);
    const cue = makeMidiCue('lx_midi', { kind: 'note_on', channel: 1, note: 60, velocity: 100 });
    const result = await dispatchCue(cue, deps);

    const midiDetails = result.details.filter((d) => d.transport === 'midi' && d.result === 'ok');
    expect(midiDetails).toHaveLength(1);
    // GoExecutor.buildTransportSummary would produce 'midi×1' from this
  });
});
