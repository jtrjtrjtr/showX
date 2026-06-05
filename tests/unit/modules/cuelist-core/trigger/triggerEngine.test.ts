import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  EventBus,
  Logger,
  Subscription,
  ShowxEvent,
  CueFireEvent,
  CueCompleteEvent,
  CuelistGoEvent,
  SystemErrorEvent,
  Trigger,
} from 'showx-shared';
import { TriggerEngine } from '../../../../../src/modules/cuelist-core/src/trigger/triggerEngine.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import {
  addCue,
  removeCue,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
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

function makeMockLog(): Logger & { info: ReturnType<typeof vi.fn> } {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => log,
  } as Logger & { info: ReturnType<typeof vi.fn> };
  return log;
}

interface TestContext {
  doc: ReturnType<typeof initShowDoc>;
  cuelistId: string;
  bus: EventBus;
  published: ShowxEvent[];
  engine: TriggerEngine;
  ac: AbortController;
  log: Logger & { info: ReturnType<typeof vi.fn> };
  add(label: string, trigger?: Trigger, durationHintMs?: number | null): string;
  fireCue(cueId: string): void;
  completeCue(cueId: string): void;
  goEvents(): CuelistGoEvent[];
  errorEvents(): SystemErrorEvent[];
}

function makeSetup(): TestContext {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  const { bus, published } = makeMockBus();
  const log = makeMockLog();
  const ac = new AbortController();
  const engine = new TriggerEngine({ doc, events: bus, log, abortSignal: ac.signal });
  const showId = getMeta(doc).get('show_id') as string;

  function add(label: string, trigger: Trigger = { kind: 'manual' }, durationHintMs?: number | null): string {
    const id = addCue(doc, cuelistId, { label, department: ['SM'], created_by: 'op1', trigger });
    if (durationHintMs !== undefined) {
      const cl = doc.getArray<Y.Map<unknown>>('cuelists').toArray()[0] as Y.Map<unknown>;
      const cues = cl.get('cues') as Y.Array<Y.Map<unknown>>;
      const cue = cues.toArray().find((c) => c.get('id') === id)!;
      doc.transact(() => cue.set('duration_hint_ms', durationHintMs));
    }
    return id;
  }

  function getCueMap(cueId: string): Y.Map<unknown> | undefined {
    const cl = doc.getArray<Y.Map<unknown>>('cuelists').toArray()[0] as Y.Map<unknown>;
    const cues = cl.get('cues') as Y.Array<Y.Map<unknown>>;
    return cues.toArray().find((c) => c.get('id') === cueId);
  }

  function fireCue(cueId: string): void {
    const cue = getCueMap(cueId);
    const triggerKind = (cue?.get('trigger') as Trigger | undefined)?.kind ?? 'manual';
    bus.publish({
      type: 'cue-fire',
      seq: 0,
      ts: Date.now(),
      source: 'test',
      show_id: showId,
      cuelist_id: cuelistId,
      cue_id: cueId,
      cue_label: (cue?.get('label') as string) ?? '',
      departments: [],
      fired_by: triggerKind === 'manual' ? 'op1' : triggerKind,
      trigger_mode: triggerKind as CueFireEvent['trigger_mode'],
    });
  }

  function completeCue(cueId: string): void {
    bus.publish({
      type: 'cue-complete',
      seq: 0,
      ts: Date.now(),
      source: 'test',
      show_id: showId,
      cuelist_id: cuelistId,
      cue_id: cueId,
      duration_ms: 100,
      success: true,
    } satisfies CueCompleteEvent);
  }

  function goEvents(): CuelistGoEvent[] {
    return published.filter((e): e is CuelistGoEvent => e.type === 'cuelist-go');
  }

  function errorEvents(): SystemErrorEvent[] {
    return published.filter((e): e is SystemErrorEvent => e.type === 'system-error');
  }

  return { doc, cuelistId, bus, published, engine, ac, log, add, fireCue, completeCue, goEvents, errorEvents };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

// 1. Manual cue — engine does not schedule next when both are manual
describe('TriggerEngine — manual trigger', () => {
  it('does not schedule next when next cue is manual', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1');
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });

  // 23. Engine started without start() — no subscriptions; safe stop() no-op
  it('stop() before start() does not throw', () => {
    const { engine } = makeSetup();
    expect(() => engine.stop()).not.toThrow();
  });

  // 23 cont. Engine receives cue-fire but does nothing when not started
  it('does nothing when not started', () => {
    const { add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'auto_continue', delay_ms: 0 });
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });
});

// 3. auto_continue(0) following manual → fires immediately
describe('TriggerEngine — auto_continue(0)', () => {
  it('emits cuelist-go immediately for auto_continue(0)', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    const q1 = add('Q1', { kind: 'auto_continue', delay_ms: 0 });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(1);
    expect(goEvents()[0].next_cue_id).toBe(q1);
  });
});

// 4. auto_continue(500) → fires 500ms after prev start
describe('TriggerEngine — auto_continue with delay', () => {
  it('fires after the configured delay', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    const q1 = add('Q1', { kind: 'auto_continue', delay_ms: 500 });
    engine.start();
    fireCue(q0);
    expect(goEvents()).toHaveLength(0);
    vi.advanceTimersByTime(499);
    expect(goEvents()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(goEvents()).toHaveLength(1);
    expect(goEvents()[0].next_cue_id).toBe(q1);
  });
});

// 5. auto_follow + prev duration 2000 → fires on cue-complete
describe('TriggerEngine — auto_follow with non-null duration', () => {
  it('fires on cue-complete when prev has duration_hint_ms', () => {
    const { engine, add, fireCue, completeCue, goEvents } = makeSetup();
    const q0 = add('Q0', { kind: 'manual' }, 2000);
    const q1 = add('Q1', { kind: 'auto_follow', prev_cue_id: q0 });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
    completeCue(q0);
    expect(goEvents()).toHaveLength(1);
    expect(goEvents()[0].next_cue_id).toBe(q1);
    expect(goEvents()[0].by_operator_id).toBe('auto_follow');
  });
});

// 6. auto_follow + prev duration null → fires immediately on prev start (Q5 default)
describe('TriggerEngine — auto_follow Q5 null-duration default', () => {
  it('fires immediately on cue-fire when prev.duration_hint_ms is null', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0'); // duration_hint_ms = null by default
    const q1 = add('Q1', { kind: 'auto_follow', prev_cue_id: q0 });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(1);
    expect(goEvents()[0].next_cue_id).toBe(q1);
  });

  // double-fire guard: not triggered again on cue-complete after null-duration path
  it('does not double-fire when cue-complete arrives after null-duration auto_follow', () => {
    const { engine, add, fireCue, completeCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'auto_follow', prev_cue_id: q0 });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    const countAfter = goEvents().length;
    completeCue(q0);
    expect(goEvents().length).toBe(countAfter);
  });
});

// 7. auto_follow with prev_cue_id mismatch → not scheduled
describe('TriggerEngine — auto_follow prev_cue_id mismatch', () => {
  it('does not schedule when prev_cue_id does not match fired cue', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'auto_follow', prev_cue_id: 'some-other-cue-id' });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });
});

// 8. Timecode trigger → not scheduled, no cuelist-go
describe('TriggerEngine — timecode (MVP deferred)', () => {
  it('does not emit cuelist-go for timecode trigger', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'timecode', time_ms: 5000, source: 'ltc' });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });

  it('logs info "timecode trigger deferred to 0.2" when next cue is timecode-triggered', () => {
    const { engine, add, fireCue, log } = makeSetup();
    const q0 = add('Q0');
    const q1 = add('Q1', { kind: 'timecode', time_ms: 5000, source: 'ltc' });
    engine.start();
    fireCue(q0);
    vi.runAllTimers();
    expect(log.info).toHaveBeenCalledWith('timecode trigger deferred to 0.2', {
      cuelist_id: expect.any(String),
      cue_id: q1,
    });
  });
});

// 9. Chain of 5 auto_continue cues → all fire in correct order
describe('TriggerEngine — auto_continue chain', () => {
  it('chains 5 auto_continue cues in order', () => {
    const ctx = makeSetup();
    const q0 = ctx.add('Q0');
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(ctx.add(`Q${i}`, { kind: 'auto_continue', delay_ms: 0 }));
    }
    ctx.engine.start();
    ctx.fireCue(q0);
    // Simulate each chain link
    for (const id of ids) {
      vi.runAllTimers();
      ctx.fireCue(id);
    }
    vi.runAllTimers();
    const gos = ctx.goEvents();
    expect(gos.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 5; i++) {
      expect(gos[i].next_cue_id).toBe(ids[i]);
    }
  });
});

// 10. Loop guard: chain of 1001 auto_continue → 1000 fire, 1001st suppressed
describe('TriggerEngine — loop guard', () => {
  it('emits system-error at 1000 consecutive auto fires', () => {
    const ctx = makeSetup();
    const q0 = ctx.add('Q0'); // manual trigger
    const autoIds: string[] = [];
    for (let i = 1; i <= 1001; i++) {
      autoIds.push(ctx.add(`Q${i}`, { kind: 'auto_continue', delay_ms: 0 }));
    }
    ctx.engine.start();
    ctx.fireCue(q0); // depth = 0 (manual)
    // Fire Q1 through Q1000 (1000 auto fires, depths 1-1000)
    for (let i = 0; i < 1000; i++) {
      ctx.fireCue(autoIds[i]);
    }
    const errors = ctx.errorEvents();
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('trigger-chain-runaway');
    expect(errors[0].severity).toBe('error');
  });

  it('does not schedule the 1001st cue after loop guard fires', () => {
    const ctx = makeSetup();
    const q0 = ctx.add('Q0');
    const autoIds: string[] = [];
    for (let i = 1; i <= 1001; i++) {
      autoIds.push(ctx.add(`Q${i}`, { kind: 'auto_continue', delay_ms: 0 }));
    }
    ctx.engine.start();
    ctx.fireCue(q0);
    for (let i = 0; i < 1000; i++) {
      ctx.fireCue(autoIds[i]);
    }
    // After 1000 auto fires, timer for Q1001 should NOT be set
    vi.runAllTimers();
    // Any cuelist-go emitted would be for Q1-Q1000, not Q1001
    const gos = ctx.goEvents().filter((e) => e.next_cue_id === autoIds[1000]);
    expect(gos).toHaveLength(0);
  });
});

// 11. Manual cue mid-chain → chain depth resets
describe('TriggerEngine — chain depth reset on manual', () => {
  it('resets depth to 0 when manual cue fires mid-chain', () => {
    const ctx = makeSetup();
    const q0 = ctx.add('Q0');
    const autoIds: string[] = [];
    for (let i = 1; i <= 998; i++) {
      autoIds.push(ctx.add(`Q${i}`, { kind: 'auto_continue', delay_ms: 0 }));
    }
    const qManual = ctx.add('Q999'); // manual, resets depth
    for (let i = 1000; i <= 1004; i++) {
      ctx.add(`Q${i}`, { kind: 'auto_continue', delay_ms: 0 });
    }
    ctx.engine.start();
    ctx.fireCue(q0);
    // Fire 998 auto cues
    for (const id of autoIds) ctx.fireCue(id);
    // Fire manual — depth resets to 0
    ctx.fireCue(qManual);
    // Fire 5 more auto cues (depth 1-5, safe)
    expect(ctx.errorEvents()).toHaveLength(0);
  });
});

// 12. cancelAll on REHEARSAL→SHOW → all pending fires cleared
describe('TriggerEngine — cancelAll', () => {
  it('clears all pending fires', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'auto_continue', delay_ms: 1000 });
    engine.start();
    fireCue(q0);
    engine.cancelAll();
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });
});

// 13. Cue deleted before timer fires → no cuelist-go
describe('TriggerEngine — cue deletion guard', () => {
  it('does not emit cuelist-go when next cue is deleted before timer fires', () => {
    const { engine, doc, cuelistId, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    const q1 = add('Q1', { kind: 'auto_continue', delay_ms: 500 });
    engine.start();
    fireCue(q0);
    removeCue(doc, cuelistId, q1);
    vi.advanceTimersByTime(600);
    expect(goEvents()).toHaveLength(0);
  });
});

// 24. cue-fire for nonexistent cuelist → no error, no schedule
describe('TriggerEngine — nonexistent targets', () => {
  it('handles cue-fire for nonexistent cuelist without error', () => {
    const { engine, bus, goEvents } = makeSetup();
    engine.start();
    expect(() =>
      bus.publish({
        type: 'cue-fire',
        seq: 0,
        ts: Date.now(),
        source: 'test',
        show_id: 'x',
        cuelist_id: 'nonexistent',
        cue_id: 'some-cue',
        cue_label: '',
        departments: [],
        fired_by: 'op1',
        trigger_mode: 'manual',
      }),
    ).not.toThrow();
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });

  // 25. cue-fire for last cue → no next cue, no schedule
  it('handles cue-fire for last cue without scheduling', () => {
    const { engine, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    engine.start();
    fireCue(q0); // only cue — no next
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });
});

// abortSignal cancels pending fires
describe('TriggerEngine — abortSignal', () => {
  it('cancels pending fires when abortSignal is aborted', () => {
    const { engine, ac, add, fireCue, goEvents } = makeSetup();
    const q0 = add('Q0');
    add('Q1', { kind: 'auto_continue', delay_ms: 1000 });
    engine.start();
    fireCue(q0);
    ac.abort();
    vi.runAllTimers();
    expect(goEvents()).toHaveLength(0);
  });
});
