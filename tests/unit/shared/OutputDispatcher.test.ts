import { describe, it, expect, vi } from 'vitest';
import { OutputDispatcher } from '../../../src/main/src/shared/OutputDispatcher.js';
import { OscPool } from '../../../src/main/src/shared/dispatcher/oscClient.js';
import { MidiOutPool } from '../../../src/main/src/shared/dispatcher/midiOut.js';
import { DmxPool } from '../../../src/main/src/shared/dispatcher/dmxOut.js';
import { WebhookOut } from '../../../src/main/src/shared/dispatcher/webhookOut.js';
import { encodeMsc } from '../../../src/main/src/shared/dispatcher/mscOut.js';
import type { OscSocketFactory } from '../../../src/main/src/shared/dispatcher/oscClient.js';
import type { MidiOutLike, MidiFactory } from '../../../src/main/src/shared/dispatcher/midiOut.js';
import type { DmxAdapter, DmxFactories } from '../../../src/main/src/shared/dispatcher/dmxOut.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockOscPool(): OscPool {
  const sends: Array<unknown> = [];
  const socket = {
    send: vi.fn((_buf: unknown, _port: unknown, _host: unknown, cb: (err?: Error) => void) => {
      sends.push({ _port, _host });
      cb();
    }),
    close: vi.fn(),
  };
  const factory: OscSocketFactory = { create: vi.fn(() => socket as unknown as ReturnType<OscSocketFactory['create']>) };
  return new OscPool(factory);
}

function makeMockMidiOut(ports: string[] = ['IAC Driver Bus 1']): MidiOutLike {
  return {
    getPortCount: () => ports.length,
    getPortName: (i: number) => ports[i] ?? '',
    openPort: vi.fn(),
    closePort: vi.fn(),
    sendMessage: vi.fn(),
  };
}

function makeMidiPool(handle: MidiOutLike): MidiOutPool {
  const factory: MidiFactory = { output: vi.fn(() => handle) };
  return new MidiOutPool(factory);
}

function makeMockDmxAdapter(): DmxAdapter {
  return {
    send: vi.fn(async () => { /* noop */ }),
    close: vi.fn(async () => { /* noop */ }),
  };
}

function makeDmxPool(artnet?: DmxAdapter, sacn?: DmxAdapter): DmxPool {
  const factories: DmxFactories = {
    artnet: artnet ? () => artnet : undefined,
    sacn: sacn ? () => sacn : undefined,
  };
  return new DmxPool(factories);
}

function makeDispatcher(opts: {
  ports?: string[];
  artnetAdapter?: DmxAdapter;
  sacnAdapter?: DmxAdapter;
} = {}) {
  const oscPool = makeMockOscPool();
  const midiHandle = makeMockMidiOut(opts.ports ?? ['IAC Driver Bus 1']);
  const midiPool = makeMidiPool(midiHandle);
  const artnet = opts.artnetAdapter ?? makeMockDmxAdapter();
  const sacn = opts.sacnAdapter ?? makeMockDmxAdapter();
  const dmxPool = makeDmxPool(artnet, sacn);
  const webhook = new WebhookOut();
  const dispatcher = new OutputDispatcher('test-slug', { oscPool, midiPool, dmxPool, webhook });
  return { dispatcher, oscPool, midiPool, midiHandle, artnet, sacn };
}

// ── encodeMsc unit tests ──────────────────────────────────────────────────────

describe('encodeMsc', () => {
  it('produces correct SysEx frame shape', () => {
    const bytes = encodeMsc({ transport: 'msc', midiPortName: 'x', deviceId: 0x10, commandFormat: 0x10, command: 0x01, data: [0x35] });
    expect(bytes).toEqual([0xf0, 0x7f, 0x10, 0x02, 0x10, 0x01, 0x35, 0xf7]);
  });

  it('masks bytes > 0x7F to 7 bits', () => {
    const bytes = encodeMsc({ transport: 'msc', midiPortName: 'x', deviceId: 0x80, commandFormat: 0xff, command: 0x81, data: [0x80] });
    expect(bytes[2]).toBe(0x00); // 0x80 & 0x7F
    expect(bytes[4]).toBe(0x7f); // 0xFF & 0x7F
    expect(bytes[5]).toBe(0x01); // 0x81 & 0x7F
    expect(bytes[6]).toBe(0x00); // data 0x80 & 0x7F
    expect(bytes[0]).toBe(0xf0);
    expect(bytes[bytes.length - 1]).toBe(0xf7);
  });
});

// ── OutputDispatcher tests ────────────────────────────────────────────────────

describe('OutputDispatcher', () => {
  it('OSC send without prior claim: auto-claims, sends, releases (0 connections after)', async () => {
    const { dispatcher, oscPool } = makeDispatcher();
    const result = await dispatcher.send({
      transport: 'osc', host: '10.0.1.10', port: 8000, address: '/cue/go', args: [1],
    });
    expect(result.ok).toBe(true);
    expect(result.transport).toBe('osc');
    expect(oscPool.status()).toHaveLength(0);
  });

  it('MIDI send after claim() uses the existing claim handle (no re-claim)', async () => {
    const { dispatcher, midiPool, midiHandle } = makeDispatcher();
    await dispatcher.claim({ transport: 'midi', midiPortName: 'IAC Driver Bus 1' });
    await dispatcher.send({ transport: 'midi', midiPortName: 'IAC Driver Bus 1', bytes: [0x90, 60, 100] });
    // handle.output() should have been called only once (for the claim, not again for send)
    expect(midiPool.status()).toHaveLength(1);
    expect(midiHandle.sendMessage).toHaveBeenCalledWith([0x90, 60, 100]);
  });

  it('MIDI send without prior claim: auto-claims and releases', async () => {
    const { dispatcher, midiPool, midiHandle } = makeDispatcher();
    const result = await dispatcher.send({ transport: 'midi', midiPortName: 'IAC Driver Bus 1', bytes: [0x80, 60, 0] });
    expect(result.ok).toBe(true);
    expect(midiHandle.sendMessage).toHaveBeenCalledWith([0x80, 60, 0]);
    expect(midiPool.status()).toHaveLength(0);
  });

  it('MIDI send to exclusive port owned by another slug → ok:false, error contains owner', async () => {
    // Two dispatchers share the same pools (realistic: two modules at shell boot)
    const midiHandle = makeMockMidiOut();
    const factory: MidiFactory = { output: vi.fn(() => midiHandle) };
    const sharedMidiPool = new MidiOutPool(factory);
    const dispA = new OutputDispatcher('mod-a', { midiPool: sharedMidiPool });
    const dispB = new OutputDispatcher('mod-b', { midiPool: sharedMidiPool });
    // Module A claims the port
    await dispA.claim({ transport: 'midi', midiPortName: 'IAC Driver Bus 1' });
    // Module B tries to auto-send — pool reports conflict
    const result = await dispB.send({ transport: 'midi', midiPortName: 'IAC Driver Bus 1', bytes: [0x90, 60, 100] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('mod-a');
  });

  it('MSC send: encodeMsc produces correct SysEx start/end bytes', async () => {
    const { dispatcher, midiHandle } = makeDispatcher();
    const result = await dispatcher.send({
      transport: 'msc', midiPortName: 'IAC Driver Bus 1', deviceId: 0x01, commandFormat: 0x01, command: 0x01, data: [],
    });
    expect(result.transport).toBe('msc');
    const sentBytes = (midiHandle.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number[];
    expect(sentBytes[0]).toBe(0xf0);
    expect(sentBytes[sentBytes.length - 1]).toBe(0xf7);
  });

  it('DMX artnet dispatch routes to artnet adapter', async () => {
    const artnet = makeMockDmxAdapter();
    const { dispatcher } = makeDispatcher({ artnetAdapter: artnet });
    const result = await dispatcher.send({
      transport: 'dmx-artnet', host: '255.255.255.255', universe: 1, data: [255, 0, 128],
    });
    expect(result.ok).toBe(true);
    expect(result.transport).toBe('dmx-artnet');
    expect(artnet.send).toHaveBeenCalledOnce();
  });

  it('DMX sacn dispatch routes to sacn adapter (not artnet)', async () => {
    const artnet = makeMockDmxAdapter();
    const sacn = makeMockDmxAdapter();
    const { dispatcher } = makeDispatcher({ artnetAdapter: artnet, sacnAdapter: sacn });
    await dispatcher.send({ transport: 'dmx-sacn', universe: 1, priority: 100, data: [100] });
    expect(sacn.send).toHaveBeenCalledOnce();
    expect(artnet.send).not.toHaveBeenCalled();
  });

  it('webhook send delegates to WebhookOut and returns result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const { dispatcher } = makeDispatcher();
    const result = await dispatcher.send({
      transport: 'webhook', url: 'https://example.com', method: 'POST', body: '{}', timeout_ms: 5_000,
    });
    expect(result.ok).toBe(true);
    expect(result.transport).toBe('webhook');
    vi.unstubAllGlobals();
  });

  it('poolStatus() reflects current state across pools', async () => {
    const { dispatcher } = makeDispatcher();
    await dispatcher.claim({ transport: 'midi', midiPortName: 'IAC Driver Bus 1' });
    const status = dispatcher.poolStatus();
    expect(status.midiOutputs).toHaveLength(1);
    expect(status.midiOutputs[0]?.ownerSlug).toBe('test-slug');
    expect(status.oscConnections).toHaveLength(0);
  });

  it('claim returns ClaimConflict when exclusive resource already owned', async () => {
    const { dispatcher } = makeDispatcher();
    await dispatcher.claim({ transport: 'midi', midiPortName: 'IAC Driver Bus 1' }, 'mod-a');
    const result = await dispatcher.claim({ transport: 'midi', midiPortName: 'IAC Driver Bus 1' }, 'mod-b');
    expect((result as { ok: boolean }).ok).toBe(false);
    const conflict = result as { ok: false; ownerSlug: string };
    expect(conflict.ownerSlug).toBe('mod-a');
  });

  it('OSC destinations are shared (not exclusive): two modules can claim same host:port', async () => {
    const { dispatcher } = makeDispatcher();
    const r1 = await dispatcher.claim({ transport: 'osc', host: '10.0.0.1', port: 8000 }, 'mod-a');
    const r2 = await dispatcher.claim({ transport: 'osc', host: '10.0.0.1', port: 8000 }, 'mod-b');
    expect((r1 as { ok?: unknown }).ok === false).toBe(false);
    expect((r2 as { ok?: unknown }).ok === false).toBe(false);
    // Both succeeded — verify status shows refcount 2
    const status = dispatcher.poolStatus();
    expect(status.oscConnections[0]?.refcount).toBe(2);
  });
});
