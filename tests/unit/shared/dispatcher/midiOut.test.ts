import { describe, it, expect, vi } from 'vitest';
import { MidiOutPool, listOutputPorts } from '../../../../src/main/src/shared/dispatcher/midiOut.js';
import type { MidiOutLike, MidiFactory } from '../../../../src/main/src/shared/dispatcher/midiOut.js';

function makeMockMidiOut(ports: string[] = ['IAC Driver Bus 1']): MidiOutLike & { _sent: number[][] } {
  const sent: number[][] = [];
  let open = false;
  return {
    getPortCount: () => ports.length,
    getPortName: (i: number) => ports[i] ?? '',
    openPort: vi.fn(() => { open = true; }),
    closePort: vi.fn(() => { open = false; }),
    sendMessage: vi.fn((bytes: number[]) => { sent.push([...bytes]); }),
    _sent: sent,
  } as unknown as MidiOutLike & { _sent: number[][] };
}

function makeFactory(handle: MidiOutLike): MidiFactory {
  return { output: vi.fn(() => handle) };
}

describe('MidiOutPool', () => {
  it('claim opens port and returns ok handle', () => {
    const handle = makeMockMidiOut();
    const pool = new MidiOutPool(makeFactory(handle));
    const result = pool.claim('IAC Driver Bus 1', 'm1');
    expect(result.ok).toBe(true);
    expect(handle.openPort).toHaveBeenCalledWith(0);
  });

  it('second claim for same port returns ClaimConflict with ownerSlug', () => {
    const handle = makeMockMidiOut();
    const pool = new MidiOutPool(makeFactory(handle));
    pool.claim('IAC Driver Bus 1', 'm1');
    const result = pool.claim('IAC Driver Bus 1', 'm2');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ownerSlug).toBe('m1');
      expect(result.reason).toBe('exclusive_owned');
    }
  });

  it('port not found throws with descriptive message', () => {
    const handle = makeMockMidiOut(['SomeOtherPort']);
    const pool = new MidiOutPool(makeFactory(handle));
    expect(() => pool.claim('IAC', 'm1')).toThrow('MIDI output port not found: IAC');
  });

  it('send() invokes handle.sendMessage with correct bytes', async () => {
    const handle = makeMockMidiOut();
    const pool = new MidiOutPool(makeFactory(handle));
    const claim = pool.claim('IAC', 'm1');
    if (!claim.ok) throw new Error('expected ok');
    const result = await claim.send({ transport: 'midi', midiPortName: 'IAC Driver Bus 1', bytes: [0x90, 60, 100] });
    expect(result.ok).toBe(true);
    expect(handle.sendMessage).toHaveBeenCalledWith([0x90, 60, 100]);
  });

  it('release() calls closePort and removes from map', () => {
    const handle = makeMockMidiOut();
    const pool = new MidiOutPool(makeFactory(handle));
    const claim = pool.claim('IAC', 'm1');
    if (!claim.ok) throw new Error('expected ok');
    claim.release();
    expect(handle.closePort).toHaveBeenCalledOnce();
    expect(pool.status()).toHaveLength(0);
  });

  it('substring port matching: claim with "IAC" matches "IAC Driver Bus 1"', () => {
    const handle = makeMockMidiOut(['IAC Driver Bus 1']);
    const pool = new MidiOutPool(makeFactory(handle));
    const result = pool.claim('IAC', 'm1');
    expect(result.ok).toBe(true);
    expect(handle.openPort).toHaveBeenCalledWith(0);
  });

  it('listOutputPorts returns port names from factory', () => {
    const handle = makeMockMidiOut(['IAC Driver Bus 1', 'USB MIDI Interface']);
    const factory = makeFactory(handle);
    const ports = listOutputPorts(factory);
    expect(ports).toEqual([
      { index: 0, name: 'IAC Driver Bus 1' },
      { index: 1, name: 'USB MIDI Interface' },
    ]);
  });

  it('listOutputPorts returns empty array when factory throws', () => {
    const factory: MidiFactory = { output: () => { throw new Error('midi unavailable'); } };
    const ports = listOutputPorts(factory);
    expect(ports).toEqual([]);
  });

  it('status() reflects current port owners', () => {
    const handle1 = makeMockMidiOut(['Port A']);
    const handle2 = makeMockMidiOut(['Port B']);
    let callIdx = 0;
    const factory: MidiFactory = { output: vi.fn(() => callIdx++ === 0 ? handle1 : handle2) };
    const pool = new MidiOutPool(factory);
    pool.claim('Port A', 'mod-a');
    pool.claim('Port B', 'mod-b');
    const status = pool.status();
    expect(status).toHaveLength(2);
    const portA = status.find((s) => s.portName === 'Port A');
    expect(portA?.ownerSlug).toBe('mod-a');
  });
});
