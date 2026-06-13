import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventBus, Logger, Subscription, ShowxEvent, CueFireEvent } from 'showx-shared';
import { GoEventChannel } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import type { GoChannelDeps, GoRequest } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';
import { initShowDoc, getMeta, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue, setCuePreWait, updateCueFields } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { ValidationError } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { LockedError } from '../../../../../src/modules/cuelist-core/src/mode/lockGuards.js';
import { TriggerEngine } from '../../../../../src/modules/cuelist-core/src/trigger/triggerEngine.js';
import type { CuelistGoEvent } from 'showx-shared';
import type * as Y from 'yjs';

// ── Shared mock helpers ────────────────────────────────────────────────────────

function makeMockBus() {
  const handlers = new Map<string, Array<(e: ShowxEvent) => void>>();
  const published: ShowxEvent[] = [];

  const bus: EventBus = {
    publish<T extends ShowxEvent>(event: T): void {
      published.push(event);
      for (const h of handlers.get(event.type) ?? []) h(event);
      for (const h of handlers.get('*') ?? []) h(event);
    },
    subscribe<T extends ShowxEvent>(
      type: T['type'] | T['type'][] | '*',
      handler: (e: T) => void,
    ): Subscription {
      const types: string[] = type === '*' ? ['*'] : Array.isArray(type) ? type : [type as string];
      for (const t of types) {
        if (!handlers.has(t)) handlers.set(t, []);
        handlers.get(t)!.push(handler as (e: ShowxEvent) => void);
      }
      return {
        id: String(Math.random()),
        unsubscribe() {
          for (const t of types) {
            const arr = handlers.get(t);
            if (arr) {
              const idx = arr.indexOf(handler as (e: ShowxEvent) => void);
              if (idx >= 0) arr.splice(idx, 1);
            }
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

// ── Channel test setup (mirrors goEventChannel.test.ts pattern) ───────────────

interface Setup {
  doc: Y.Doc;
  showId: string;
  cuelistId: string;
  channel: GoEventChannel;
  bus: EventBus;
  published: ShowxEvent[];
  broadcasts: object[];
  topicHandlers: Map<string, (msg: object) => void>;
  addCueToList(label: string, preWaitMs?: number): string;
  fireGoRequest(cueId: string, overrides?: Partial<GoRequest>): void;
  fireEvents(): CueFireEvent[];
  goEvents(): CuelistGoEvent[];
}

let reqCounter = 0;

function makeSetup(): Setup {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const showId = getMeta(doc).get('show_id') as string;
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  const { bus, published } = makeMockBus();
  const log = makeMockLog();
  const broadcasts: object[] = [];
  const topicHandlers = new Map<string, (msg: object) => void>();

  const deps: GoChannelDeps = {
    doc,
    events: bus,
    log,
    broadcast: (env) => broadcasts.push(env),
    publishToStation: (_sid, env) => broadcasts.push(env),
    subscribe: (topic, handler) => {
      topicHandlers.set(topic, handler);
      return () => topicHandlers.delete(topic);
    },
    // SM authority: 'op-sm' owns SM department
    octx: {
      operatorOwns: (opId, dept) => opId === 'op-sm' && dept === 'SM',
      operatorOwned: (opId) => (opId === 'op-sm' ? ['SM'] : []),
    },
  };

  const channel = new GoEventChannel(deps);
  channel.start();

  function addCueToList(label: string, preWaitMs?: number): string {
    const id = addCue(doc, cuelistId, { label, department: ['SM'], created_by: 'op1' });
    if (preWaitMs !== undefined && preWaitMs > 0) {
      setCuePreWait(doc, cuelistId, id, preWaitMs, 'op1');
    }
    return id;
  }

  function fireGoRequest(cueId: string, overrides?: Partial<GoRequest>): void {
    const handler = topicHandlers.get('go.request');
    handler?.({
      topic: 'go.request',
      request_id: `req-${++reqCounter}-${Date.now()}`,
      cue_id: cueId,
      cuelist_id: cuelistId,
      station_id: 'station-1',
      operator_id: 'op-sm',
      client_ts: new Date().toISOString(),
      override: false,
      ...overrides,
    });
  }

  function fireEvents(): CueFireEvent[] {
    return published.filter((e): e is CueFireEvent => e.type === 'cue-fire');
  }

  function goEvents(): CuelistGoEvent[] {
    return published.filter((e): e is CuelistGoEvent => e.type === 'cuelist-go');
  }

  return { doc, showId, cuelistId, channel, bus, published, broadcasts, topicHandlers, addCueToList, fireGoRequest, fireEvents, goEvents };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => { reqCounter = 0; vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

// ── A. setCuePreWait document helper ──────────────────────────────────────────

describe('setCuePreWait — validation', () => {
  it('sets pre_wait_ms on a cue', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    setCuePreWait(doc, cuelistId, id, 500, 'op1');
    const cl = (doc.getArray('cuelists').toArray() as Y.Map<unknown>[]).find(
      (c) => c.get('id') === cuelistId,
    )!;
    const cueMap = (cl.get('cues') as import('yjs').Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === id)!;
    expect(cueMap.get('pre_wait_ms')).toBe(500);
  });

  it('rejects negative values', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    expect(() => setCuePreWait(doc, cuelistId, id, -1, 'op1')).toThrow(ValidationError);
  });

  it('rejects NaN', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    expect(() => setCuePreWait(doc, cuelistId, id, NaN, 'op1')).toThrow(ValidationError);
  });

  it('rejects non-integer (float)', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    expect(() => setCuePreWait(doc, cuelistId, id, 1.5, 'op1')).toThrow(ValidationError);
  });

  it('allows 0', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    expect(() => setCuePreWait(doc, cuelistId, id, 0, 'op1')).not.toThrow();
  });

  it('succeeds in SHOW mode (pre_wait_ms is a meta/timing field, not structural)', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    setMode(doc, 'show');
    expect(() => setCuePreWait(doc, cuelistId, id, 500, 'op1')).not.toThrow();
  });
});

describe('updateCueFields — pre_wait_ms', () => {
  it('sets pre_wait_ms via updateCueFields', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    updateCueFields(doc, cuelistId, id, { pre_wait_ms: 1000 }, 'op1');
    const cl = (doc.getArray('cuelists').toArray() as Y.Map<unknown>[]).find(
      (c) => c.get('id') === cuelistId,
    )!;
    const cueMap = (cl.get('cues') as import('yjs').Array<Y.Map<unknown>>)
      .toArray()
      .find((c) => c.get('id') === id)!;
    expect(cueMap.get('pre_wait_ms')).toBe(1000);
  });

  it('rejects negative via updateCueFields', () => {
    const { doc, cuelistId } = makeSetup();
    const id = addCue(doc, cuelistId, { label: 'A', department: ['LX'], created_by: 'op1' });
    expect(() => updateCueFields(doc, cuelistId, id, { pre_wait_ms: -100 }, 'op1')).toThrow(ValidationError);
  });
});

// ── B. pre_wait_ms = 0 → immediate cue-fire ───────────────────────────────────

describe('pre_wait_ms = 0 → immediate dispatch', () => {
  it('publishes cue-fire immediately when pre_wait_ms is 0', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0');
    ctx.fireGoRequest(cueId);
    expect(ctx.fireEvents()).toHaveLength(1);
    expect(ctx.fireEvents()[0].cue_id).toBe(cueId);
  });
});

// ── C. Lazy default: cue without pre_wait_ms field → resolves to 0 ────────────

describe('lazy default — cue missing pre_wait_ms field', () => {
  it('dispatches immediately for cue without pre_wait_ms field', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0'); // no pre_wait set → field absent
    ctx.fireGoRequest(cueId);
    expect(ctx.fireEvents()).toHaveLength(1);
    vi.runAllTimers();
    expect(ctx.fireEvents()).toHaveLength(1); // no duplicate fire
  });
});

// ── D. pre_wait_ms = 2000 → delayed dispatch ──────────────────────────────────

describe('pre_wait_ms > 0 delays cue-fire', () => {
  it('does not publish cue-fire at t=0 when pre_wait=2000', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0', 2000);
    ctx.fireGoRequest(cueId);
    expect(ctx.fireEvents()).toHaveLength(0);
  });

  it('publishes cue-fire after exactly 2000ms', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0', 2000);
    ctx.fireGoRequest(cueId);
    vi.advanceTimersByTime(1999);
    expect(ctx.fireEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(ctx.fireEvents()).toHaveLength(1);
    expect(ctx.fireEvents()[0].cue_id).toBe(cueId);
  });

  it('cue-fire ts reflects dispatch time (>= trigger_time + pre_wait)', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0', 1000);
    const t0 = Date.now();
    ctx.fireGoRequest(cueId);
    vi.advanceTimersByTime(1000);
    expect(ctx.fireEvents()[0].ts).toBeGreaterThanOrEqual(t0 + 1000);
  });
});

// ── E. Cancel pending pre_wait when new GO fires ─────────────────────────────

describe('pre_wait cancellation', () => {
  it('cancels cue A dispatch when cue B fires at t=500 during A pre_wait=2000', () => {
    const ctx = makeSetup();
    const cueA = ctx.addCueToList('Q_A', 2000);
    const cueB = ctx.addCueToList('Q_B'); // pre_wait=0

    ctx.fireGoRequest(cueA);
    vi.advanceTimersByTime(500);
    expect(ctx.fireEvents()).toHaveLength(0);

    ctx.fireGoRequest(cueB);
    vi.advanceTimersByTime(3000); // full A pre_wait elapses — but A was canceled
    const ids = ctx.fireEvents().map((e) => e.cue_id);
    expect(ids).not.toContain(cueA);
    expect(ids).toContain(cueB);
  });

  it('cancels pending pre_wait on stop()', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0', 2000);
    ctx.fireGoRequest(cueId);
    ctx.channel.stop();
    vi.advanceTimersByTime(3000);
    expect(ctx.fireEvents()).toHaveLength(0);
  });

  it('cancels pending pre_wait on mode transition', () => {
    const ctx = makeSetup();
    const cueId = ctx.addCueToList('Q0', 2000);
    ctx.fireGoRequest(cueId);
    ctx.bus.publish({
      type: 'show-mode-change',
      show_id: ctx.showId,
      from: 'rehearsal',
      to: 'show',
      by_operator_id: 'op1',
    });
    vi.advanceTimersByTime(3000);
    expect(ctx.fireEvents()).toHaveLength(0);
  });
});

// ── F. auto_continue delay measures from dispatch (post-pre_wait) ─────────────

describe('auto_continue + pre_wait: delay measured from dispatch', () => {
  it('cue B (auto_continue 3000ms) fires 4000ms after A trigger when A.pre_wait=1000', () => {
    const ctx = makeSetup();
    const log = makeMockLog();
    const ac = new AbortController();
    const engine = new TriggerEngine({ doc: ctx.doc, events: ctx.bus, log, abortSignal: ac.signal });
    engine.start();

    const cueA = ctx.addCueToList('Q_A', 1000);
    const cueB = addCue(ctx.doc, ctx.cuelistId, {
      label: 'Q_B',
      department: ['SM'],
      created_by: 'op1',
      trigger: { kind: 'auto_continue', delay_ms: 3000 },
    });

    const t0 = Date.now();
    ctx.fireGoRequest(cueA);

    // t=0: no cue-fire yet (pre_wait pending)
    expect(ctx.fireEvents()).toHaveLength(0);

    // t=1000: A's cue-fire fires; TriggerEngine schedules B at fire_at = ts+3000
    vi.advanceTimersByTime(1000);
    expect(ctx.fireEvents().filter((e) => e.cue_id === cueA)).toHaveLength(1);
    // B not yet: 3000ms still pending
    expect(ctx.goEvents()).toHaveLength(0);

    vi.advanceTimersByTime(2999);
    expect(ctx.goEvents()).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(ctx.goEvents()).toHaveLength(1);
    expect(ctx.goEvents()[0].next_cue_id).toBe(cueB);
    // Total elapsed from trigger = 1000 (pre_wait) + 3000 (auto_continue) = 4000ms
    expect(Date.now() - t0).toBe(4000);

    engine.stop();
    ac.abort();
  });
});
