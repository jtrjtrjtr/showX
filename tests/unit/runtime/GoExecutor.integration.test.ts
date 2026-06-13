/**
 * Integration test: real GoEventChannel + fake SyncBroker + fake EventBus.
 * Verifies the complete wire: go.request → cue-fire → dispatchCue → cue-complete → go.dispatched.
 * dispatchCue is mocked so routing setup is not required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';

// Mock ONLY dispatchCue — GoEventChannel is the real implementation.
// The mock publishes cue-complete (mirroring the real dispatchCue) so GoEventChannel can
// broadcast go.dispatched. Without this, the GoEventChannel → go.dispatched chain is broken.
vi.mock('../../../src/modules/cuelist-core/dist/dispatch/payloadDispatch.js', () => ({
  dispatchCue: vi.fn().mockImplementation(
    async (cue: Record<string, unknown>, deps: Record<string, unknown>) => {
      const result = {
        ok: true,
        payloads_dispatched: 1,
        payloads_failed: [],
        duration_ms: 5,
        details: [],
      };
      const events = deps['events'] as { publish: (e: Record<string, unknown>) => void };
      events.publish({
        type: 'cue-complete',
        seq: 0,
        ts: Date.now(),
        source: 'cuelist-core',
        show_id: deps['show_id'],
        cuelist_id: deps['cuelist_id'],
        cue_id: cue['id'],
        duration_ms: 5,
        success: true,
        errors: [],
        payloads_dispatched: 1,
        payloads_failed: [],
      });
      return result;
    },
  ),
}));

import { GoExecutor } from '../../../src/main/src/runtime/GoExecutor.js';

// ── Fake SyncBroker ───────────────────────────────────────────────────────────

type AnyMsg = Record<string, unknown>;
type ServerHandler = (m: AnyMsg) => void;

function makeFakeSyncBroker() {
  const subs = new Map<string, Set<{ handler: ServerHandler; unsub: () => void }>>();
  const broadcasts: AnyMsg[] = [];

  function subscribeSideChannel(showId: string, handler: (m: unknown) => void) {
    if (!subs.has(showId)) subs.set(showId, new Set());
    const entry = {
      handler: handler as ServerHandler,
      unsub: () => subs.get(showId)?.delete(entry as typeof entry),
    };
    // Use `entry` itself inside the closure — reference is stable after object creation
    const self = { handler: entry.handler, unsub: () => subs.get(showId)?.delete(self) };
    subs.get(showId)!.add(self);
    return { id: 'fake', unsubscribe: self.unsub };
  }

  function publishSideChannel(showId: string, msg: unknown) {
    broadcasts.push(msg as AnyMsg);
    for (const sub of subs.get(showId) ?? []) sub.handler(msg as AnyMsg);
  }

  function simulateClientMessage(showId: string, msg: AnyMsg) {
    for (const sub of subs.get(showId) ?? []) sub.handler(msg);
  }

  return { subscribeSideChannel, publishSideChannel, simulateClientMessage, broadcasts };
}

// ── Fake EventBus ─────────────────────────────────────────────────────────────

function makeFakeEventBus() {
  const handlers = new Map<string, Set<(e: AnyMsg) => void>>();

  function subscribe(type: string | string[], handler: (e: AnyMsg) => void) {
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      if (!handlers.has(t)) handlers.set(t, new Set());
      handlers.get(t)!.add(handler);
    }
    return {
      id: 'fake',
      unsubscribe: () => { for (const t of types) handlers.get(t)?.delete(handler); },
    };
  }

  function publish(event: AnyMsg) {
    const t = event['type'] as string;
    for (const h of handlers.get(t) ?? []) h(event);
  }

  function subscribePattern(_: string, handler: (e: AnyMsg) => void) {
    if (!handlers.has('*')) handlers.set('*', new Set());
    handlers.get('*')!.add(handler);
    return { id: 'fp', unsubscribe: () => handlers.get('*')?.delete(handler) };
  }

  return { subscribe, publish, subscribePattern };
}

// ── Y.Doc factory with real cuelist + cue ─────────────────────────────────────

function makeDocWithCuelist(showId: string, cuelistId: string, cueId: string): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getMap('meta').set('show_id', showId);

    const clMap = new Y.Map<unknown>();
    clMap.set('id', cuelistId);
    clMap.set('name', 'Main Show');
    clMap.set('go_authority', 'auto_cascade'); // bypasses SM authority check
    clMap.set('sm_offline_policy', { kind: 'freeze' });
    clMap.set('playhead', { cue_id: null, armed_cue_id: null });

    const cuesArr = new Y.Array<Y.Map<unknown>>();
    const cueMap = new Y.Map<unknown>();
    cueMap.set('id', cueId);
    cueMap.set('label', 'House Lights Up');
    cueMap.set('department', ['LX']);
    cueMap.set('payloads', new Y.Array<Y.Map<unknown>>());
    cueMap.set('sort_key', 1000);
    cuesArr.push([cueMap]);
    clMap.set('cues', cuesArr);

    doc.getArray<Y.Map<unknown>>('cuelists').push([clMap]);
    doc.getMap('devices');
    doc.getMap('routing');
  });
  return doc;
}

// ── Logger stub ───────────────────────────────────────────────────────────────

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(function (this: unknown) { return this; }) };
}

// ── Pairing stub ─────────────────────────────────────────────────────────────

function makeFakePairing(devices: Array<{ device_id: string; owned_departments: string[]; revoked_at?: number }> = []) {
  return {
    getDevice: (id: string) => devices.find((d) => d.device_id === id) ?? null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GoExecutor integration (real GoEventChannel)', () => {
  let syncBroker: ReturnType<typeof makeFakeSyncBroker>;
  let events: ReturnType<typeof makeFakeEventBus>;
  let log: ReturnType<typeof makeLogger>;
  let output: ReturnType<typeof vi.fn>;

  const SHOW_ID = 'integ-show-1';
  const CUELIST_ID = 'integ-cl-1';
  const CUE_ID = 'integ-cue-1';

  beforeEach(() => {
    vi.clearAllMocks();
    syncBroker = makeFakeSyncBroker();
    events = makeFakeEventBus();
    log = makeLogger();
    output = vi.fn();
  });

  it('go.request → dispatchCue called → go.dispatched broadcast via real GoEventChannel', async () => {
    const { dispatchCue } = await import('../../../src/modules/cuelist-core/dist/dispatch/payloadDispatch.js');
    const fakeOutput = {
      send: vi.fn().mockResolvedValue({ ok: true, transport: 'osc', latencyMs: 1 }),
      claim: vi.fn(),
      release: vi.fn(),
      poolStatus: vi.fn(() => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] })),
    };

    const executor = new GoExecutor({
      syncBroker: syncBroker as unknown as ConstructorParameters<typeof GoExecutor>[0]['syncBroker'],
      events: events as unknown as ConstructorParameters<typeof GoExecutor>[0]['events'],
      output: fakeOutput as unknown as ConstructorParameters<typeof GoExecutor>[0]['output'],
      log: log as unknown as ConstructorParameters<typeof GoExecutor>[0]['log'],
      pairing: makeFakePairing([{ device_id: 'op-sm', owned_departments: ['SM'] }]),
    });

    const doc = makeDocWithCuelist(SHOW_ID, CUELIST_ID, CUE_ID);
    executor.attach(SHOW_ID, doc);

    // Simulate a go.request arriving from the PWA via side-channel
    const requestId = 'req-integ-001';
    syncBroker.simulateClientMessage(SHOW_ID, {
      topic: 'go.request',
      request_id: requestId,
      cue_id: CUE_ID,
      cuelist_id: CUELIST_ID,
      station_id: 'station-pwA',
      operator_id: 'op-sm',
      client_ts: new Date().toISOString(),
      override: false,
    });

    // Let the cue-fire handler run (it's async)
    await new Promise((r) => setTimeout(r, 30));

    // dispatchCue must have been called
    expect(dispatchCue).toHaveBeenCalledOnce();

    // go.dispatched must have been broadcast
    const dispatched = syncBroker.broadcasts.find(
      (m) => (m['payload'] as AnyMsg | undefined)?.['topic'] === 'go.dispatched' ||
              m['topic'] === 'go.dispatched',
    );
    expect(dispatched).toBeDefined();

    executor.detach();
  });

  it('go.request for unknown cue → go.rejected broadcast, dispatchCue not called', async () => {
    const { dispatchCue } = await import('../../../src/modules/cuelist-core/dist/dispatch/payloadDispatch.js');
    const fakeOutput = {
      send: vi.fn(),
      claim: vi.fn(),
      release: vi.fn(),
      poolStatus: vi.fn(() => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] })),
    };

    const executor = new GoExecutor({
      syncBroker: syncBroker as unknown as ConstructorParameters<typeof GoExecutor>[0]['syncBroker'],
      events: events as unknown as ConstructorParameters<typeof GoExecutor>[0]['events'],
      output: fakeOutput as unknown as ConstructorParameters<typeof GoExecutor>[0]['output'],
      log: log as unknown as ConstructorParameters<typeof GoExecutor>[0]['log'],
      pairing: makeFakePairing([{ device_id: 'op-sm', owned_departments: ['SM'] }]),
    });

    const doc = makeDocWithCuelist(SHOW_ID, CUELIST_ID, CUE_ID);
    executor.attach(SHOW_ID, doc);

    syncBroker.simulateClientMessage(SHOW_ID, {
      topic: 'go.request',
      request_id: 'req-unknown-cue',
      cue_id: 'nonexistent-cue',
      cuelist_id: CUELIST_ID,
      station_id: 'station-pwa',
      operator_id: 'op-sm',
      client_ts: new Date().toISOString(),
      override: false,
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(dispatchCue).not.toHaveBeenCalled();

    const rejected = syncBroker.broadcasts.find(
      (m) => (m['payload'] as AnyMsg | undefined)?.['topic'] === 'go.rejected' ||
              m['topic'] === 'go.rejected',
    );
    expect(rejected).toBeDefined();

    executor.detach();
  });
});
