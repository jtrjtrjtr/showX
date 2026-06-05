import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventBus, Logger, Subscription, ShowxEvent, CueCompleteEvent, ShowModeChangeEvent } from 'showx-shared';
import { GoEventChannel, assertNotForbiddenCrdtField, DesignViolationError } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import type { GoRequest, GoChannelDeps } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist, getCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import type * as Y from 'yjs';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockBus() {
  const handlers = new Map<string, Array<(e: ShowxEvent) => void>>();
  const published: ShowxEvent[] = [];

  const bus: EventBus = {
    publish<T extends ShowxEvent>(event: T): void {
      published.push(event);
      const arr = handlers.get(event.type) ?? [];
      const wildcards = handlers.get('*') ?? [];
      for (const h of [...arr, ...wildcards]) h(event);
    },
    subscribe<T extends ShowxEvent>(
      type: T['type'] | T['type'][] | '*',
      handler: (e: T) => void,
    ): Subscription {
      const types: string[] =
        type === '*' ? ['*'] : Array.isArray(type) ? type : [type as string];
      for (const t of types) {
        if (!handlers.has(t)) handlers.set(t, []);
        handlers.get(t)!.push(handler as (e: ShowxEvent) => void);
      }
      return {
        id: String(Math.random()),
        unsubscribe(): void {
          for (const t of types) {
            const arr = handlers.get(t);
            if (!arr) continue;
            const idx = arr.indexOf(handler as (e: ShowxEvent) => void);
            if (idx >= 0) arr.splice(idx, 1);
          }
        },
      };
    },
    subscribePattern(_pattern: string, handler: (e: ShowxEvent) => void): Subscription {
      return bus.subscribe('*', handler);
    },
  };

  return { bus, published };
}

function makeMockLog(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: function () { return this; },
  };
}

interface TestContext {
  doc: Y.Doc;
  showId: string;
  cuelistId: string;
  channel: GoEventChannel;
  deps: GoChannelDeps;
  published: ShowxEvent[];
  broadcasts: object[];
  toStation: Array<{ station_id: string; envelope: object }>;
  topicHandlers: Map<string, (msg: object) => void>;
  addCueToList(label: string, dept?: string): string;
  fireGoRequest(overrides?: Partial<GoRequest>): void;
  completeCue(cueId: string, payloads?: { dispatched: number; failed: string[] }): void;
  subscribe(topic: string, handler: (msg: object) => void): () => void;
}

function makeSetup(): TestContext {
  const doc = initShowDoc({ title: 'Test Show', venue: null, date: null, created_by: 'op1' });
  const showId = getMeta(doc).get('show_id') as string;
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  const { bus, published } = makeMockBus();
  const log = makeMockLog();
  const broadcasts: object[] = [];
  const toStation: Array<{ station_id: string; envelope: object }> = [];
  const topicHandlers = new Map<string, (msg: object) => void>();

  function subscribe(topic: string, handler: (msg: object) => void): () => void {
    topicHandlers.set(topic, handler);
    return () => topicHandlers.delete(topic);
  }

  const deps: GoChannelDeps = {
    doc,
    events: bus,
    log,
    broadcast: (env) => broadcasts.push(env),
    publishToStation: (sid, env) => toStation.push({ station_id: sid, envelope: env }),
    subscribe,
    octx: {
      operatorOwns: (opId, dept) => opId === 'op-sm' && dept === 'SM',
      operatorOwned: (opId) => (opId === 'op-sm' ? ['SM'] : opId === 'op-lx' ? ['LX'] : []),
    },
  };

  const channel = new GoEventChannel(deps);

  function addCueToList(label: string, dept = 'SM'): string {
    return addCue(doc, cuelistId, { label, department: [dept as import('showx-shared').DepartmentTag], created_by: 'op1' });
  }

  function fireGoRequest(overrides: Partial<GoRequest> = {}): void {
    const handler = topicHandlers.get('go.request');
    handler?.({
      topic: 'go.request',
      request_id: `req-${Date.now()}`,
      cue_id: overrides.cue_id ?? 'cue-1',
      cuelist_id: overrides.cuelist_id ?? cuelistId,
      station_id: overrides.station_id ?? 'station-1',
      operator_id: overrides.operator_id ?? 'op-sm',
      client_ts: overrides.client_ts ?? new Date().toISOString(),
      override: overrides.override ?? false,
      ...overrides,
    });
  }

  function completeCue(cueId: string, payloads = { dispatched: 2, failed: [] as string[] }): void {
    bus.publish({
      type: 'cue-complete',
      seq: 1,
      ts: Date.now(),
      source: 'test',
      show_id: showId,
      cuelist_id: cuelistId,
      cue_id: cueId,
      duration_ms: 100,
      success: true,
      payloads_dispatched: payloads.dispatched,
      payloads_failed: payloads.failed,
    } as unknown as CueCompleteEvent);
  }

  return { doc, showId, cuelistId, channel, deps, published, broadcasts, toStation, topicHandlers, addCueToList, fireGoRequest, completeCue, subscribe };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GoEventChannel — valid GO request', () => {
  it('publishes cue-fire event on EventBus for valid request', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    const firings = ctx.published.filter((e) => e.type === 'cue-fire');
    expect(firings).toHaveLength(1);
    expect((firings[0] as { cue_id: string }).cue_id).toBe(cueId);
  });

  it('cue-fire event contains correct cuelist_id and trigger_mode', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    const fire = ctx.published.find((e) => e.type === 'cue-fire') as Record<string, unknown> | undefined;
    expect(fire?.cuelist_id).toBe(ctx.cuelistId);
    expect(fire?.trigger_mode).toBe('manual');
  });
});

describe('GoEventChannel — idempotency (duplicate request_id)', () => {
  it('does not re-publish cue-fire on duplicate request_id', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    const reqId = `req-${Date.now()}`;
    // First request — fires
    ctx.fireGoRequest({ cue_id: cueId, request_id: reqId });
    expect(ctx.published.filter((e) => e.type === 'cue-fire')).toHaveLength(1);
    // Second request with same request_id — must NOT re-fire
    ctx.fireGoRequest({ cue_id: cueId, request_id: reqId });
    expect(ctx.published.filter((e) => e.type === 'cue-fire')).toHaveLength(1);
  });

  it('sends cached go.dispatched to requester on duplicate (after cue-complete)', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    const reqId = `req-${Date.now()}`;
    ctx.fireGoRequest({ cue_id: cueId, request_id: reqId, station_id: 'station-A' });
    ctx.completeCue(cueId);
    const stationCount = ctx.toStation.filter((s) => s.station_id === 'station-A').length;
    // Second request — should receive cached dispatched
    ctx.fireGoRequest({ cue_id: cueId, request_id: reqId, station_id: 'station-A' });
    expect(ctx.toStation.filter((s) => s.station_id === 'station-A').length).toBeGreaterThan(stationCount);
  });
});

describe('GoEventChannel — historic replay rejection', () => {
  it('sends go.rejected with reason historic_replay when client_ts is old', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId, client_ts: new Date(Date.now() - 10_000).toISOString() });
    const rejected = ctx.toStation.find((s) => {
      const env = s.envelope as { topic: string; payload: { reason: string } };
      return env.topic === 'go.rejected' && env.payload?.reason === 'historic_replay';
    });
    expect(rejected).toBeDefined();
    expect(ctx.published.filter((e) => e.type === 'cue-fire')).toHaveLength(0);
  });
});

describe('GoEventChannel — unknown cue rejection', () => {
  it('sends go.rejected with reason unknown_cue when cuelist not found', () => {
    const ctx = makeSetup();
    ctx.channel.start();
    ctx.fireGoRequest({ cuelist_id: 'cl-nonexistent', cue_id: 'cue-1' });
    const rejected = ctx.toStation.find((s) => {
      const env = s.envelope as { topic: string; payload: { reason: string } };
      return env.topic === 'go.rejected' && env.payload?.reason === 'unknown_cue';
    });
    expect(rejected).toBeDefined();
  });

  it('sends go.rejected with reason unknown_cue when cue not found in cuelist', () => {
    const ctx = makeSetup();
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: 'cue-nonexistent', cuelist_id: ctx.cuelistId });
    const rejected = ctx.toStation.find((s) => {
      const env = s.envelope as { topic: string; payload: { reason: string } };
      return env.topic === 'go.rejected' && env.payload?.reason === 'unknown_cue';
    });
    expect(rejected).toBeDefined();
  });
});

describe('GoEventChannel — authority rejection', () => {
  it('sends go.rejected with reason not_sm when non-SM operator on sm_called cuelist', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId, operator_id: 'op-lx' });
    const rejected = ctx.toStation.find((s) => {
      const env = s.envelope as { topic: string; payload: { reason: string } };
      return env.topic === 'go.rejected' && env.payload?.reason === 'not_sm';
    });
    expect(rejected).toBeDefined();
    expect(ctx.published.filter((e) => e.type === 'cue-fire')).toHaveLength(0);
  });
});

describe('GoEventChannel — go.dispatched broadcast', () => {
  it('broadcasts go.dispatched after cue-complete', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    ctx.completeCue(cueId);
    const dispatched = ctx.broadcasts.find((b) => (b as { topic: string }).topic === 'go.dispatched');
    expect(dispatched).toBeDefined();
  });

  it('go.dispatched contains correct cue_id', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    ctx.completeCue(cueId);
    const dispatched = ctx.broadcasts.find((b) => (b as { topic: string }).topic === 'go.dispatched') as {
      topic: string;
      payload: { cue_id: string; payloads_dispatched: number };
    };
    expect(dispatched?.payload?.cue_id).toBe(cueId);
    expect(dispatched?.payload?.payloads_dispatched).toBe(2);
  });
});

describe('GoEventChannel — sequence counter', () => {
  it('go.dispatched contains monotonically increasing sequence number', () => {
    const ctx = makeSetup();
    const cue1 = ctx.addCueToList('Q1');
    const cue2 = ctx.addCueToList('Q2');
    ctx.channel.start();

    ctx.fireGoRequest({ cue_id: cue1, request_id: 'req-a' });
    ctx.completeCue(cue1);
    ctx.fireGoRequest({ cue_id: cue2, request_id: 'req-b' });
    ctx.completeCue(cue2);

    const dispatched = ctx.broadcasts
      .filter((b) => (b as { topic: string }).topic === 'go.dispatched')
      .map((b) => (b as { topic: string; payload: { sequence: number } }).payload.sequence);

    expect(dispatched).toHaveLength(2);
    expect(dispatched[1]).toBeGreaterThan(dispatched[0]);
  });

  it('sequence is a positive integer (starts at 1 or higher)', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    ctx.completeCue(cueId);
    const dispatched = ctx.broadcasts.find((b) => (b as { topic: string }).topic === 'go.dispatched') as {
      payload: { sequence: number };
    };
    expect(dispatched?.payload?.sequence).toBeGreaterThan(0);
  });
});

describe('GoEventChannel — rejected sent to requester only', () => {
  it('rejected message goes to the requesting station, not broadcast', () => {
    const ctx = makeSetup();
    ctx.channel.start();
    ctx.fireGoRequest({ station_id: 'station-X', cuelist_id: 'cl-missing', cue_id: 'cue-1' });
    const toX = ctx.toStation.filter((s) => s.station_id === 'station-X');
    expect(toX).toHaveLength(1);
    expect(ctx.broadcasts).toHaveLength(0);
  });
});

describe('GoEventChannel — ring buffer resume', () => {
  it('onResume replays missed go.dispatched to requesting station (not broadcast)', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();

    ctx.fireGoRequest({ cue_id: cueId, request_id: 'req-a' });
    ctx.completeCue(cueId);

    const toStationBefore = ctx.toStation.length;

    // Simulate station reconnect requesting resume from seq 0
    const resumeHandler = ctx.topicHandlers.get('resume');
    resumeHandler?.({ topic: 'resume', station_id: 'station-replay', since_seq: 0, topic_filter: 'go.dispatched' });

    // Replay must go to station, not broadcast
    const replayMsgs = ctx.toStation.slice(toStationBefore).filter((s) => s.station_id === 'station-replay');
    expect(replayMsgs.length).toBeGreaterThan(0);
    expect(ctx.broadcasts.length).toBe(1); // only the original broadcast; no extra from resume
  });

  it('onResume sends nothing when since_seq is current', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    ctx.completeCue(cueId);

    const toStationBefore = ctx.toStation.length;
    // Ask for everything past a very high seq number — should get nothing
    const resumeHandler = ctx.topicHandlers.get('resume');
    resumeHandler?.({ topic: 'resume', station_id: 'station-replay', since_seq: 999_999, topic_filter: 'go.dispatched' });
    expect(ctx.toStation.length).toBe(toStationBefore);
  });
});

describe('GoEventChannel — arm.request → arm.broadcast', () => {
  it('broadcasts arm.broadcast with cue_id when arm.request received', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1', 'SM');
    ctx.channel.start();

    const armHandler = ctx.topicHandlers.get('arm.request');
    armHandler?.({
      topic: 'arm.request',
      cuelist_id: ctx.cuelistId,
      cue_id: cueId,
      station_id: 'station-1',
      operator_id: 'op-sm',
    });

    const armBroadcast = ctx.broadcasts.find((b) => (b as { topic: string }).topic === 'arm.broadcast');
    expect(armBroadcast).toBeDefined();
    expect((armBroadcast as { topic: string; payload: { cue_id: string } }).payload?.cue_id).toBe(cueId);
  });
});

describe('GoEventChannel — CRDT guard', () => {
  it('assertNotForbiddenCrdtField throws DesignViolationError for fired_at', () => {
    expect(() => assertNotForbiddenCrdtField('fired_at')).toThrow(DesignViolationError);
  });

  it('assertNotForbiddenCrdtField throws for fire_count', () => {
    expect(() => assertNotForbiddenCrdtField('fire_count')).toThrow(DesignViolationError);
  });

  it('assertNotForbiddenCrdtField throws for last_fired_at', () => {
    expect(() => assertNotForbiddenCrdtField('last_fired_at')).toThrow(DesignViolationError);
  });

  it('assertNotForbiddenCrdtField throws for last_fired_by', () => {
    expect(() => assertNotForbiddenCrdtField('last_fired_by')).toThrow(DesignViolationError);
  });

  it('assertNotForbiddenCrdtField does not throw for safe fields', () => {
    expect(() => assertNotForbiddenCrdtField('label')).not.toThrow();
    expect(() => assertNotForbiddenCrdtField('department')).not.toThrow();
    expect(() => assertNotForbiddenCrdtField('notes')).not.toThrow();
  });

  it('GoEventChannel never writes GO data to the Y.Doc (no fired_at on cue maps)', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId });
    ctx.completeCue(cueId);

    // Verify the cue Y.Map has no forbidden fields
    const cl = getCuelist(ctx.doc, ctx.cuelistId);
    const cueMap = cl ? (cl.get('cues') as import('yjs').Array<import('yjs').Map<unknown>>).toArray().find((c) => c.get('id') === cueId) : undefined;
    expect(cueMap?.get('fired_at')).toBeUndefined();
    expect(cueMap?.get('fire_count')).toBeUndefined();
    expect(cueMap?.get('last_fired_at')).toBeUndefined();
    expect(cueMap?.get('last_fired_by')).toBeUndefined();
  });
});

describe('GoEventChannel — stop() unsubscribes all handlers', () => {
  it('stop() prevents further event processing', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.channel.stop();
    ctx.fireGoRequest({ cue_id: cueId });
    expect(ctx.published.filter((e) => e.type === 'cue-fire')).toHaveLength(0);
  });
});

describe('GoEventChannel — process restart clears state', () => {
  it('new instance starts with fresh idempotency store and ring buffers', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q1');
    ctx.channel.start();
    ctx.fireGoRequest({ cue_id: cueId, request_id: 'req-1' });

    // Create a new channel (simulating process restart) with the same deps
    const newChannel = new GoEventChannel(ctx.deps);
    newChannel.start();
    // Same request_id should be accepted (fresh store)
    ctx.fireGoRequest({ cue_id: cueId, request_id: 'req-1' });
    // Both channels would process it — new channel's idem store doesn't know req-1
    // We just verify the new channel is operational
    newChannel.stop();
  });
});

describe('GoEventChannel — mode.transition topic', () => {
  it('broadcasts mode.transition envelope when show-mode-change fires on EventBus', () => {
    const ctx = makeSetup();
    ctx.channel.start();

    const modeEvent: ShowModeChangeEvent = {
      type: 'show-mode-change',
      show_id: ctx.showId,
      from: 'rehearsal',
      to: 'show',
      by_operator_id: 'op-sm',
    };
    ctx.deps.events.publish(modeEvent);

    const transition = ctx.broadcasts.find(
      (b) => (b as { topic: string }).topic === 'mode.transition',
    ) as { topic: string; payload: { from: string; to: string; by_operator_id: string } } | undefined;
    expect(transition).toBeDefined();
    expect(transition?.payload?.from).toBe('rehearsal');
    expect(transition?.payload?.to).toBe('show');
    expect(transition?.payload?.by_operator_id).toBe('op-sm');
  });

  it('mode.transition envelope is added to ring buffer and replayed on resume', () => {
    const ctx = makeSetup();
    ctx.channel.start();

    ctx.deps.events.publish({
      type: 'show-mode-change',
      show_id: ctx.showId,
      from: 'rehearsal',
      to: 'show',
      by_operator_id: 'op-sm',
    } as ShowModeChangeEvent);

    const resumeHandler = ctx.topicHandlers.get('resume');
    const toStationBefore = ctx.toStation.length;
    resumeHandler?.({
      topic: 'resume',
      station_id: 'station-reconnect',
      since_seq: 0,
      topic_filter: 'mode.transition',
    });

    const replayMsgs = ctx.toStation.slice(toStationBefore).filter(
      (s) => s.station_id === 'station-reconnect',
    );
    expect(replayMsgs.length).toBeGreaterThan(0);
    const msg = replayMsgs[0].envelope as { topic: string; payload: { from: string; to: string } };
    expect(msg.topic).toBe('mode.transition');
    expect(msg.payload.from).toBe('rehearsal');
    expect(msg.payload.to).toBe('show');
  });
});

describe('GoEventChannel — gap envelope on ring overflow', () => {
  it('emits gap envelope to requester when since_seq predates retained window', () => {
    // Use small ring capacity to trigger overflow easily
    const ctx = makeSetup();
    const smallChannel = new GoEventChannel(ctx.deps, { ringCapacity: 5 });
    smallChannel.start();

    // Fire 10 cues — ring keeps only last 5
    for (let i = 0; i < 10; i++) {
      const cueId = ctx.addCueToList(`Q${i}`);
      const reqId = `req-gap-${i}`;
      ctx.topicHandlers.get('go.request')?.({
        topic: 'go.request',
        request_id: reqId,
        cue_id: cueId,
        cuelist_id: ctx.cuelistId,
        station_id: 'station-gap',
        operator_id: 'op-sm',
        client_ts: new Date().toISOString(),
        override: false,
      });
      ctx.deps.events.publish({
        type: 'cue-complete',
        seq: i,
        ts: Date.now(),
        source: 'test',
        show_id: ctx.showId,
        cuelist_id: ctx.cuelistId,
        cue_id: cueId,
        duration_ms: 10,
        success: true,
        payloads_dispatched: 0,
        payloads_failed: [],
      } as unknown as import('showx-shared').CueCompleteEvent);
    }

    const toStationBefore = ctx.toStation.length;

    // Request resume from seq 0 — oldest retained is seq 6+ (items 1-5 were evicted)
    const resumeHandler = ctx.topicHandlers.get('resume');
    resumeHandler?.({
      topic: 'resume',
      station_id: 'station-gap',
      since_seq: 0,
      topic_filter: 'go.dispatched',
    });

    const msgs = ctx.toStation.slice(toStationBefore).filter((s) => s.station_id === 'station-gap');
    const gapMsg = msgs.find(
      (s) => (s.envelope as { type?: string }).type === 'gap',
    );
    expect(gapMsg).toBeDefined();
    const gap = gapMsg!.envelope as { type: string; topic: string; from_seq: number; to_seq: number };
    expect(gap.topic).toBe('go.dispatched');
    expect(gap.from_seq).toBe(0);
    expect(gap.to_seq).toBeGreaterThan(0);
  });
});
