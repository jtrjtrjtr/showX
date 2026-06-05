import { describe, it, expect } from 'vitest';
import { MidiPortListener, parseMidi } from '../../../../src/main/src/shared/input/midiIn.js';
import { Logger } from '../../../../src/main/src/shared/Logger.js';

const logSink = new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });

describe('parseMidi', () => {
  it('noteOn → type noteOn', () => {
    const msg = parseMidi([0x90, 60, 100]);
    expect(msg?.type).toBe('noteOn');
    expect(msg?.channel).toBe(0);
    expect(msg?.data1).toBe(60);
    expect(msg?.data2).toBe(100);
  });

  it('noteOn velocity 0 → noteOff', () => {
    expect(parseMidi([0x90, 60, 0])?.type).toBe('noteOff');
  });

  it('noteOff → type noteOff', () => {
    expect(parseMidi([0x80, 60, 0])?.type).toBe('noteOff');
  });

  it('cc → type cc with data1/data2', () => {
    const msg = parseMidi([0xb0, 7, 64]);
    expect(msg?.type).toBe('cc');
    expect(msg?.data1).toBe(7);
    expect(msg?.data2).toBe(64);
  });

  it('programChange → type programChange', () => {
    expect(parseMidi([0xc0, 5])?.type).toBe('programChange');
  });

  it('sysex → type sysex with full raw array', () => {
    const bytes = [0xf0, 0x7e, 0x7f, 0xf7];
    const msg = parseMidi(bytes);
    expect(msg?.type).toBe('sysex');
    expect(msg?.raw).toEqual(bytes);
  });

  it('channel nibble correctly decoded', () => {
    expect(parseMidi([0x93, 60, 100])?.channel).toBe(3);
    expect(parseMidi([0x9f, 60, 100])?.channel).toBe(15);
  });

  it('unknown status byte → null', () => {
    expect(parseMidi([0xf8])).toBeNull();  // MIDI clock
    expect(parseMidi([0xfe])).toBeNull();  // Active sensing
  });

  it('empty bytes → null', () => {
    expect(parseMidi([])).toBeNull();
  });
});

describe('MidiPortListener (_injectForTest)', () => {
  it('noteOn delivered to handler', () => {
    const listener = new MidiPortListener('Test', logSink);
    const received: Array<{ type: string; channel: number; data1: number; data2: number }> = [];
    listener.addHandler((m) => received.push({ type: m.type, channel: m.channel, data1: m.data1, data2: m.data2 }));

    listener._injectForTest([0x90, 60, 100]);

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('noteOn');
    expect(received[0]!.channel).toBe(0);
    expect(received[0]!.data1).toBe(60);
    expect(received[0]!.data2).toBe(100);
  });

  it('noteOn velocity 0 → noteOff to handler', () => {
    const listener = new MidiPortListener('Test', logSink);
    const types: string[] = [];
    listener.addHandler((m) => types.push(m.type));
    listener._injectForTest([0x90, 60, 0]);
    expect(types[0]).toBe('noteOff');
  });

  it('sysex packet → sysex with full raw array', () => {
    const listener = new MidiPortListener('Test', logSink);
    const received: Array<{ type: string; raw: number[] }> = [];
    listener.addHandler((m) => received.push({ type: m.type, raw: m.raw }));
    listener._injectForTest([0xf0, 0x7e, 0x7f, 0xf7]);
    expect(received[0]!.type).toBe('sysex');
    expect(received[0]!.raw).toEqual([0xf0, 0x7e, 0x7f, 0xf7]);
  });

  it('handler throw is caught — sibling handler still receives', () => {
    const listener = new MidiPortListener('Test', logSink);
    const received: string[] = [];
    listener.addHandler(() => { throw new Error('boom'); });
    listener.addHandler((m) => received.push(m.type));

    listener._injectForTest([0x90, 60, 100]);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('noteOn');
  });

  it('unknown status byte → no handler called', () => {
    const listener = new MidiPortListener('Test', logSink);
    const called: number[] = [];
    listener.addHandler(() => called.push(1));
    listener._injectForTest([0xf8]); // MIDI clock
    expect(called).toHaveLength(0);
  });

  it('multiple handlers all receive the message', () => {
    const listener = new MidiPortListener('Test', logSink);
    const a: string[] = [];
    const b: string[] = [];
    listener.addHandler((m) => a.push(m.type));
    listener.addHandler((m) => b.push(m.type));
    listener._injectForTest([0xb0, 7, 64]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('handlerCount tracks add/remove', () => {
    const listener = new MidiPortListener('Test', logSink);
    const h = (): void => { /* noop */ };
    expect(listener.handlerCount).toBe(0);
    listener.addHandler(h);
    expect(listener.handlerCount).toBe(1);
    listener.removeHandler(h);
    expect(listener.handlerCount).toBe(0);
  });
});
