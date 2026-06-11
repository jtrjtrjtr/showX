import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

// ── Fake SideChannel transport ────────────────────────────────────────────────

type ServerHandler = (m: Record<string, unknown>) => void;
type Subscriber = { handler: ServerHandler; unsubscribe: () => void };

function makeFakeSyncBroker() {
  const serverSubs = new Map<string, Set<Subscriber>>();
  const published: Array<{ showId: string; msg: Record<string, unknown> }> = [];

  function subscribeSideChannel(
    showId: string,
    handler: (m: unknown) => void,
  ): { id: string; unsubscribe: () => void } {
    if (!serverSubs.has(showId)) serverSubs.set(showId, new Set());
    const sub: Subscriber = {
      handler: handler as ServerHandler,
      unsubscribe: () => serverSubs.get(showId)?.delete(sub),
    };
    serverSubs.get(showId)!.add(sub);
    return { id: 'fake-sub', unsubscribe: sub.unsubscribe };
  }

  function publishSideChannel(showId: string, msg: unknown): void {
    published.push({ showId, msg: msg as Record<string, unknown> });
    // Deliver to server-side subscribers (go.request comes from PWA via WS)
    for (const sub of serverSubs.get(showId) ?? []) {
      sub.handler(msg as Record<string, unknown>);
    }
  }

  /** Simulate a PWA client sending a message over the side channel */
  function simulateClientMessage(showId: string, msg: Record<string, unknown>): void {
    for (const sub of serverSubs.get(showId) ?? []) {
      sub.handler(msg);
    }
  }

  return { subscribeSideChannel, publishSideChannel, simulateClientMessage, published };
}

// ── Fake EventBus ─────────────────────────────────────────────────────────────

type Handler = (e: Record<string, unknown>) => void;

function makeFakeEventBus() {
  const handlers = new Map<string, Set<Handler>>();

  const bus = {
    publish(event: Record<string, unknown>): void {
      const type = event['type'] as string;
      for (const h of handlers.get(type) ?? []) h(event);
      for (const h of handlers.get('*') ?? []) h(event);
    },
    subscribe(type: string | string[], handler: Handler) {
      const types = Array.isArray(type) ? type : [type];
      for (const t of types) {
        if (!handlers.has(t)) handlers.set(t, new Set());
        handlers.get(t)!.add(handler);
      }
      return {
        id: 'fake',
        unsubscribe: () => {
          for (const t of types) handlers.get(t)?.delete(handler);
        },
      };
    },
    subscribePattern(_: string, handler: Handler) {
      if (!handlers.has('*')) handlers.set('*', new Set());
      handlers.get('*')!.add(handler);
      return { id: 'fake-pat', unsubscribe: () => handlers.get('*')?.delete(handler) };
    },
  };

  return bus;
}

// ── Fake OutputDispatcher ────────────────────────────────────────────────────

function makeFakeOutput(opts: { failSend?: boolean } = {}) {
  const dispatches: Array<Record<string, unknown>> = [];
  return {
    dispatches,
    send: vi.fn(async (msg: Record<string, unknown>) => {
      dispatches.push(msg);
      if (opts.failSend) return { ok: false, transport: 'osc', latencyMs: 0, error: 'test-fail' };
      return { ok: true, transport: 'osc', latencyMs: 1 };
    }),
    claim: vi.fn(async () => ({ id: 'tok', slug: 'test', destination: { transport: 'osc', host: '127.0.0.1', port: 7000 } })),
    release: vi.fn(async () => {}),
    poolStatus: vi.fn(() => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] })),
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: unknown) { return this; }),
  };
}

// ── Mock cuelist-core modules ────────────────────────────────────────────────

const { mockDispatchCue, mockGoEventChannelStart, mockGoEventChannelStop } = vi.hoisted(() => ({
  mockDispatchCue: vi.fn(),
  mockGoEventChannelStart: vi.fn(),
  mockGoEventChannelStop: vi.fn(),
}));

vi.mock('../../../src/modules/cuelist-core/dist/go/goEventChannel.js', () => {
  class GoEventChannel {
    private deps: Record<string, unknown>;
    constructor(deps: Record<string, unknown>) { this.deps = deps; }
    start() { mockGoEventChannelStart(this.deps); }
    stop() { mockGoEventChannelStop(); }
  }
  return { GoEventChannel };
});

vi.mock('../../../src/modules/cuelist-core/dist/dispatch/payloadDispatch.js', () => ({
  dispatchCue: mockDispatchCue,
}));

import { GoExecutor } from '../../../src/main/src/runtime/GoExecutor.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(showId = 'test-show-id'): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap('meta').set('show_id', showId);
  return doc;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GoExecutor', () => {
  let syncBroker: ReturnType<typeof makeFakeSyncBroker>;
  let events: ReturnType<typeof makeFakeEventBus>;
  let output: ReturnType<typeof makeFakeOutput>;
  let log: ReturnType<typeof makeLogger>;
  let executor: GoExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    syncBroker = makeFakeSyncBroker();
    events = makeFakeEventBus();
    output = makeFakeOutput();
    log = makeLogger();
    executor = new GoExecutor({
      syncBroker: syncBroker as unknown as Parameters<typeof GoExecutor.prototype.attach>[0] extends never ? never : ConstructorParameters<typeof GoExecutor>[0]['syncBroker'],
      events: events as unknown as Parameters<typeof GoExecutor.prototype.attach>[0] extends never ? never : ConstructorParameters<typeof GoExecutor>[0],
      output: output as unknown as ConstructorParameters<typeof GoExecutor>[0]['output'],
      log: log as unknown as ConstructorParameters<typeof GoExecutor>[0]['log'],
    } as unknown as ConstructorParameters<typeof GoExecutor>[0]);

    mockDispatchCue.mockResolvedValue({
      ok: true,
      payloads_dispatched: 1,
      payloads_failed: [],
      duration_ms: 5,
      details: [],
    });
  });

  afterEach(() => {
    executor.detach();
  });

  it('starts GoEventChannel on attach', () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);
    expect(mockGoEventChannelStart).toHaveBeenCalledOnce();
  });

  it('stops GoEventChannel on detach', () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);
    executor.detach();
    expect(mockGoEventChannelStop).toHaveBeenCalledOnce();
  });

  it('calls dispatchCue when cue-fire event fires', async () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);

    events.publish({
      type: 'cue-fire',
      seq: 1,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      cue_id: 'cue-1',
      cue_label: 'House up',
      departments: ['LX'],
      payloads: [{ id: 'p1', type: 'osc', tag: 'LX', note: '', address: '/cue/1', args: [] }],
      fired_by: 'op-1',
      trigger_mode: 'manual',
    });

    // Wait for async dispatch
    await new Promise((r) => setTimeout(r, 10));

    expect(mockDispatchCue).toHaveBeenCalledOnce();
    const [cue, deps] = mockDispatchCue.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(cue['id']).toBe('cue-1');
    expect(cue['label']).toBe('House up');
    expect((cue['payloads'] as unknown[]).length).toBe(1);
    expect(deps['show_id']).toBe('show-1');
    expect(deps['cuelist_id']).toBe('cl-1');
  });

  it('logs cue.dispatched at info level on success', async () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);

    events.publish({
      type: 'cue-fire',
      seq: 1,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      cue_id: 'cue-1',
      cue_label: 'House up',
      departments: ['LX'],
      payloads: [],
      fired_by: 'op-1',
      trigger_mode: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(log.info).toHaveBeenCalledWith('cue.dispatched', expect.objectContaining({ cue_id: 'cue-1' }));
    expect(log.warn).not.toHaveBeenCalledWith('cue.dispatched', expect.anything());
  });

  it('logs at warn level when payloads fail', async () => {
    mockDispatchCue.mockResolvedValue({
      ok: false,
      payloads_dispatched: 0,
      payloads_failed: [{ payload_id: 'p1', error: 'no route' }],
      duration_ms: 3,
      details: [],
    });

    const doc = makeDoc();
    executor.attach('show-1', doc);

    events.publish({
      type: 'cue-fire',
      seq: 1,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      cue_id: 'cue-2',
      cue_label: 'Storm starts',
      departments: ['LX'],
      payloads: [],
      fired_by: 'op-1',
      trigger_mode: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(log.warn).toHaveBeenCalledWith('cue.dispatched', expect.objectContaining({ cue_id: 'cue-2', payloads_failed: 1 }));
  });

  it('does not dispatch after detach', async () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);
    executor.detach();

    events.publish({
      type: 'cue-fire',
      seq: 1,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      cue_id: 'cue-3',
      cue_label: 'Blackout',
      departments: ['LX'],
      payloads: [],
      fired_by: 'op-1',
      trigger_mode: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockDispatchCue).not.toHaveBeenCalled();
  });

  it('can attach again after detach', () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);
    executor.detach();
    executor.attach('show-2', makeDoc('show-2'));
    expect(mockGoEventChannelStart).toHaveBeenCalledTimes(2);
    expect(mockGoEventChannelStop).toHaveBeenCalledTimes(1);
  });

  it('subscribes to side-channel with showId on attach', () => {
    const doc = makeDoc();
    executor.attach('show-abc', doc);
    // GoEventChannel constructor receives deps with a subscribe fn that uses syncBroker
    // Verify the subscribe fn was passed to GoEventChannel
    expect(mockGoEventChannelStart).toHaveBeenCalledOnce();
    const deps = mockGoEventChannelStart.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof deps['subscribe']).toBe('function');
    expect(typeof deps['broadcast']).toBe('function');
    expect(typeof deps['publishToStation']).toBe('function');
  });

  it('passes abortSignal to dispatchCue deps', async () => {
    const doc = makeDoc();
    executor.attach('show-1', doc);

    events.publish({
      type: 'cue-fire',
      seq: 1,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: 'show-1',
      cuelist_id: 'cl-1',
      cue_id: 'cue-4',
      cue_label: 'Act 1 open',
      departments: ['LX'],
      payloads: [],
      fired_by: 'op-1',
      trigger_mode: 'manual',
    });

    await new Promise((r) => setTimeout(r, 10));

    const deps = mockDispatchCue.mock.calls[0][1] as Record<string, unknown>;
    expect(deps['abortSignal']).toBeDefined();
    expect(deps['abortSignal']).toBeInstanceOf(AbortSignal);
  });

  it('injects integration OSC device when SHOWX_OSC_OUT is set', () => {
    const orig = process.env['SHOWX_OSC_OUT'];
    process.env['SHOWX_OSC_OUT'] = '127.0.0.1:7000';

    try {
      const doc = makeDoc();
      executor.attach('show-osc', doc);

      const devicesMap = doc.getMap<Y.Map<unknown>>('devices');
      expect(devicesMap.has('integration_osc')).toBe(true);
      const dm = devicesMap.get('integration_osc')!;
      expect(dm.get('host')).toBe('127.0.0.1');
      expect(dm.get('port')).toBe(7000);
      expect(dm.get('transport')).toBe('osc');

      const routingMap = doc.getMap<Y.Map<unknown>>('routing');
      expect(routingMap.has('integration_osc_fallback')).toBe(true);
    } finally {
      if (orig === undefined) {
        delete process.env['SHOWX_OSC_OUT'];
      } else {
        process.env['SHOWX_OSC_OUT'] = orig;
      }
    }
  });

  it('does not duplicate fallback rule on second attach with SHOWX_OSC_OUT', () => {
    const orig = process.env['SHOWX_OSC_OUT'];
    process.env['SHOWX_OSC_OUT'] = '127.0.0.1:7000';

    try {
      const doc = makeDoc();
      executor.attach('show-osc', doc);
      executor.detach();
      executor.attach('show-osc', doc);

      const routingMap = doc.getMap<Y.Map<unknown>>('routing');
      // fallback rule should appear exactly once
      let count = 0;
      routingMap.forEach((_, key) => { if (key === 'integration_osc_fallback') count++; });
      expect(count).toBe(1);
    } finally {
      if (orig === undefined) {
        delete process.env['SHOWX_OSC_OUT'];
      } else {
        process.env['SHOWX_OSC_OUT'] = orig;
      }
    }
  });
});
