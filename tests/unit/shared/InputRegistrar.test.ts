import { describe, it, expect, vi, afterEach } from 'vitest';
import { InputRegistrarImpl } from '../../../src/main/src/shared/InputRegistrar.js';
import { Logger } from '../../../src/main/src/shared/Logger.js';
import type { OscMessage, MidiMessage } from '../../../src/main/src/shared/input/types.js';

const logSink = new Logger({ output: { write: () => true } as unknown as NodeJS.WritableStream });

// ── Mock listener factories ───────────────────────────────────────────────────

class MockOscListener {
  private _handlers = new Set<(msg: OscMessage) => void>();
  public started = false;
  public stopped = false;
  readonly boundPort: number;

  constructor(public readonly port: number, _logger: Logger) {
    this.boundPort = port === 0 ? 49152 : port; // ephemeral sim
  }

  async start(): Promise<void> { this.started = true; }
  async stop(): Promise<void> { this.stopped = true; this._handlers.clear(); }
  addHandler(fn: (msg: OscMessage) => void): void { this._handlers.add(fn); }
  removeHandler(fn: (msg: OscMessage) => void): void { this._handlers.delete(fn); }
  get handlerCount(): number { return this._handlers.size; }

  inject(msg: OscMessage): void {
    for (const h of this._handlers) h(msg);
  }
}

class MockMidiListener {
  private _handlers = new Set<(msg: MidiMessage) => void>();
  public started = false;
  public stopped = false;

  constructor(public readonly portName: string, _logger: Logger) {}

  async start(): Promise<void> { this.started = true; }
  async stop(): Promise<void> { this.stopped = true; this._handlers.clear(); }
  addHandler(fn: (msg: MidiMessage) => void): void { this._handlers.add(fn); }
  removeHandler(fn: (msg: MidiMessage) => void): void { this._handlers.delete(fn); }
  get handlerCount(): number { return this._handlers.size; }

  inject(msg: MidiMessage): void {
    for (const h of this._handlers) h(msg);
  }
}

function makeOscMsg(address: string, fromHost = '127.0.0.1'): OscMessage {
  return { address, args: [], fromHost, fromPort: 12345, receivedAt: Date.now() };
}

function makeMidiMsg(type: MidiMessage['type'] = 'noteOn', channel = 0): MidiMessage {
  return { type, channel, data1: 60, data2: 100, raw: [0x90, 60, 100], receivedAt: Date.now() };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRegistrar() {
  const oscListeners = new Map<number, MockOscListener>();
  const midiListeners = new Map<string, MockMidiListener>();

  const oscFactory = vi.fn((port: number, log: Logger) => {
    const l = new MockOscListener(port, log);
    oscListeners.set(port, l);
    return l as unknown as InstanceType<typeof import('../../../src/main/src/shared/input/oscListener.js').OscPortListener>;
  });

  const midiFactory = vi.fn((portName: string, log: Logger) => {
    const l = new MockMidiListener(portName, log);
    midiListeners.set(portName, l);
    return l as unknown as InstanceType<typeof import('../../../src/main/src/shared/input/midiIn.js').MidiPortListener>;
  });

  const registrar = new InputRegistrarImpl(logSink, oscFactory, midiFactory);
  return { registrar, oscListeners, midiListeners };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InputRegistrarImpl — OSC', () => {
  let registrar: InputRegistrarImpl;
  let oscListeners: Map<number, MockOscListener>;

  afterEach(async () => {
    await registrar?.shutdown();
  });

  it('two subscriptions to the same port share one OscPortListener', async () => {
    ({ registrar, oscListeners } = makeRegistrar());
    await registrar.init();

    const sub1 = await registrar.subscribeOsc({ address: '/showx/cue/*' }, () => {}, { port: 8000 });
    const sub2 = await registrar.subscribeOsc({ address: '/lights/scene/*' }, () => {}, { port: 8000 });

    const active = registrar.listActiveListeners();
    expect(active).toHaveLength(1);
    expect(active[0]!.subscriberCount).toBe(2);

    await sub1.unsubscribe();
    await sub2.unsubscribe();
  });

  it('glob filter routes /showx/cue/go to first handler only', async () => {
    ({ registrar, oscListeners } = makeRegistrar());

    const a: string[] = [];
    const b: string[] = [];
    await registrar.subscribeOsc({ address: '/showx/cue/*' }, (m) => a.push(m.address), { port: 8000 });
    await registrar.subscribeOsc({ address: '/lights/scene/*' }, (m) => b.push(m.address), { port: 8000 });

    const listener = oscListeners.get(8000)!;
    listener.inject(makeOscMsg('/showx/cue/go'));
    listener.inject(makeOscMsg('/lights/scene/1'));

    expect(a).toEqual(['/showx/cue/go']);
    expect(b).toEqual(['/lights/scene/1']);
  });

  it('glob: /eventx/poll/? matches single segment char', async () => {
    ({ registrar, oscListeners } = makeRegistrar());
    const received: string[] = [];
    await registrar.subscribeOsc({ address: '/eventx/poll/?' }, (m) => received.push(m.address), { port: 8000 });

    const listener = oscListeners.get(8000)!;
    listener.inject(makeOscMsg('/eventx/poll/1'));
    listener.inject(makeOscMsg('/eventx/poll/ab')); // 2 chars — should NOT match

    expect(received).toEqual(['/eventx/poll/1']);
  });

  it('unsubscribe first of two — listener still up (refcount 1)', async () => {
    ({ registrar, oscListeners } = makeRegistrar());

    const sub1 = await registrar.subscribeOsc({ address: '/a/*' }, () => {}, { port: 8000 });
    await registrar.subscribeOsc({ address: '/b/*' }, () => {}, { port: 8000 });

    await sub1.unsubscribe();

    const listener = oscListeners.get(8000)!;
    expect(listener.stopped).toBe(false);
    expect(registrar.listActiveListeners()).toHaveLength(1);
    expect(registrar.listActiveListeners()[0]!.subscriberCount).toBe(1);
  });

  it('unsubscribe both — listener closed, listActiveListeners empty', async () => {
    ({ registrar, oscListeners } = makeRegistrar());

    const sub1 = await registrar.subscribeOsc({ address: '/a/*' }, () => {}, { port: 8000 });
    const sub2 = await registrar.subscribeOsc({ address: '/b/*' }, () => {}, { port: 8000 });

    await sub1.unsubscribe();
    await sub2.unsubscribe();

    const listener = oscListeners.get(8000)!;
    expect(listener.stopped).toBe(true);
    expect(registrar.listActiveListeners()).toHaveLength(0);
  });

  it('handler throw → logged, sibling handler on same port still receives next message', async () => {
    const errorSpy = vi.spyOn(logSink, 'error');
    ({ registrar, oscListeners } = makeRegistrar());

    const good: string[] = [];
    await registrar.subscribeOsc({ address: '/test' }, () => { throw new Error('bad'); }, { port: 8000 });
    await registrar.subscribeOsc({ address: '/test' }, (m) => good.push(m.address), { port: 8000 });

    const listener = oscListeners.get(8000)!;
    listener.inject(makeOscMsg('/test'));

    expect(good).toEqual(['/test']);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fromHost filter — only delivers if fromHost matches', async () => {
    ({ registrar, oscListeners } = makeRegistrar());
    const received: string[] = [];
    await registrar.subscribeOsc({ address: '/*', fromHost: '10.0.0.1' }, (m) => received.push(m.fromHost), { port: 8000 });

    const listener = oscListeners.get(8000)!;
    listener.inject({ ...makeOscMsg('/x'), fromHost: '10.0.0.2' });
    listener.inject({ ...makeOscMsg('/x'), fromHost: '10.0.0.1' });

    expect(received).toEqual(['10.0.0.1']);
  });

  it('shutdown() stops all listeners', async () => {
    ({ registrar, oscListeners } = makeRegistrar());

    await registrar.subscribeOsc({ address: '/a' }, () => {}, { port: 8000 });
    await registrar.subscribeOsc({ address: '/b' }, () => {}, { port: 9000 });
    await registrar.shutdown();

    expect(oscListeners.get(8000)!.stopped).toBe(true);
    expect(oscListeners.get(9000)!.stopped).toBe(true);
    expect(registrar.listActiveListeners()).toHaveLength(0);
  });

  it('5 subscribers to same port, unsubscribe 4 in random order — listener still up; 5th → closed', async () => {
    ({ registrar, oscListeners } = makeRegistrar());

    // Sequential subscriptions to avoid race on the lazy-init path
    const subs = [];
    for (let i = 0; i < 5; i++) {
      subs.push(await registrar.subscribeOsc({ address: `/ch/${i}` }, () => {}, { port: 8000 }));
    }
    expect(oscListeners.get(8000)!.handlerCount).toBe(5);

    // Unsubscribe in shuffled order [2,0,3,1]
    for (const i of [2, 0, 3, 1]) await subs[i]!.unsubscribe();

    expect(oscListeners.get(8000)!.stopped).toBe(false);
    expect(oscListeners.get(8000)!.handlerCount).toBe(1);

    await subs[4]!.unsubscribe();
    expect(oscListeners.get(8000)!.stopped).toBe(true);
    expect(registrar.listActiveListeners()).toHaveLength(0);
  });
});

describe('InputRegistrarImpl — MIDI', () => {
  let registrar: InputRegistrarImpl;
  let midiListeners: Map<string, MockMidiListener>;

  afterEach(async () => {
    await registrar?.shutdown();
  });

  it('two subscriptions to same portName share one MidiPortListener', async () => {
    ({ registrar, midiListeners } = makeRegistrar());

    const sub1 = await registrar.subscribeMidi({ type: 'noteOn' }, () => {}, { portName: 'IAC' });
    const sub2 = await registrar.subscribeMidi({ type: 'cc' }, () => {}, { portName: 'IAC' });

    const active = registrar.listActiveListeners();
    expect(active).toHaveLength(1);
    expect(active[0]!.subscriberCount).toBe(2);

    await sub1.unsubscribe();
    await sub2.unsubscribe();
  });

  it('MIDI type filter routes correctly', async () => {
    ({ registrar, midiListeners } = makeRegistrar());
    const notes: string[] = [];
    const ccs: string[] = [];

    await registrar.subscribeMidi({ type: 'noteOn' }, (m) => notes.push(m.type), { portName: 'IAC' });
    await registrar.subscribeMidi({ type: 'cc' }, (m) => ccs.push(m.type), { portName: 'IAC' });

    const listener = midiListeners.get('IAC')!;
    listener.inject(makeMidiMsg('noteOn'));
    listener.inject(makeMidiMsg('cc'));

    expect(notes).toEqual(['noteOn']);
    expect(ccs).toEqual(['cc']);
  });

  it('channel filter routes to correct subscriber only', async () => {
    ({ registrar, midiListeners } = makeRegistrar());
    const ch0: number[] = [];
    const ch1: number[] = [];

    await registrar.subscribeMidi({ channel: 0 }, (m) => ch0.push(m.channel), { portName: 'IAC' });
    await registrar.subscribeMidi({ channel: 1 }, (m) => ch1.push(m.channel), { portName: 'IAC' });

    const listener = midiListeners.get('IAC')!;
    listener.inject(makeMidiMsg('noteOn', 0));
    listener.inject(makeMidiMsg('noteOn', 1));

    expect(ch0).toEqual([0]);
    expect(ch1).toEqual([1]);
  });

  it('MIDI unsubscribe refcount — last unsub closes listener', async () => {
    ({ registrar, midiListeners } = makeRegistrar());

    const sub1 = await registrar.subscribeMidi({}, () => {}, { portName: 'IAC' });
    const sub2 = await registrar.subscribeMidi({}, () => {}, { portName: 'IAC' });

    await sub1.unsubscribe();
    expect(midiListeners.get('IAC')!.stopped).toBe(false);

    await sub2.unsubscribe();
    expect(midiListeners.get('IAC')!.stopped).toBe(true);
  });
});
