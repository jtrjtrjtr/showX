import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Cue, OscPayload, WaitPayload, WebhookPayload, GroupPayload, MidiPayload, ShowxEvent, CueCompleteEvent, SystemErrorEvent } from 'showx-shared';
import * as Y from 'yjs';
import { dispatchCue } from '../../../../../src/modules/cuelist-core/src/dispatch/payloadDispatch.js';
import { CycleDetector } from '../../../../../src/modules/cuelist-core/src/dispatch/cycleDetect.js';
import { initShowDoc, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import type { DispatchDeps } from '../../../../../src/modules/cuelist-core/src/dispatch/types.js';
import type { RoutingEntry } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockBus() {
  const published: ShowxEvent[] = [];
  const handlers = new Map<string, Array<(e: ShowxEvent) => void>>();
  return {
    bus: {
      publish: vi.fn((e: ShowxEvent) => {
        published.push(e);
        (handlers.get(e.type) ?? []).forEach((h) => h(e));
      }),
      subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }),
    },
    published,
  };
}

function makeDoc() {
  const doc = initShowDoc({ title: 'Test Show', venue: null, date: null, created_by: 'test' });
  setMode(doc, 'rehearsal');
  return doc;
}

function makeOscRouting(host = '10.0.0.1', port = 53000): Record<string, RoutingEntry> {
  return {
    r1: { id: 'r1', match: { device_id: 'dev1' }, transport: { kind: 'osc', host, port }, enabled: true, notes: '' },
  };
}

function setRouting(doc: Y.Doc, routing: Record<string, RoutingEntry>): void {
  const r = doc.getMap('routing');
  doc.transact(() => {
    for (const [k, v] of Object.entries(routing)) r.set(k, v);
  });
}

function makeDeps(
  doc: ReturnType<typeof makeDoc>,
  cuelistId: string,
  sendFn = vi.fn().mockResolvedValue({ ok: true }),
  bus = makeMockBus(),
): DispatchDeps & { published: ShowxEvent[] } {
  return {
    doc, show_id: 'show-1', cuelist_id: cuelistId,
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: bus.bus,
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
    published: bus.published,
  };
}

function makeCue(id: string, payloads: Cue['payloads'] = []): Cue {
  return {
    id, label: `Cue ${id}`, description: '', department: ['LX'], standby_note: '',
    script_line_ref: null, trigger: { kind: 'manual' }, payloads,
    duration_hint_ms: null, notes: '', payload_frozen_at: null,
    created_at: new Date().toISOString(), created_by: 'test',
    modified_at: new Date().toISOString(), modified_by: 'test',
  };
}

function makeOscPayload(id = 'p1', device_id = 'dev1'): OscPayload {
  return { id, type: 'osc', tag: null, note: '', device_id, address: '/test/go', args: [] };
}

function makeWaitPayload(id = 'pw', duration_ms = 0): WaitPayload {
  return { id, type: 'wait', tag: null, note: '', duration_ms };
}

function makeWebhookPayload(id = 'pwh'): WebhookPayload {
  return { id, type: 'webhook', tag: null, note: '', url: 'https://example.com', method: 'POST', headers: {}, body: null, timeout_ms: 5000 };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dispatchCue', () => {
  it('cue with 3 payloads: all dispatched in order; payloads_dispatched === 3', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());
    const deps = makeDeps(doc, clId, sendFn);

    const cue = makeCue('c1', [
      makeOscPayload('p1'),
      makeOscPayload('p2'),
      makeOscPayload('p3'),
    ]);

    const r = await dispatchCue(cue, deps);
    expect(r.ok).toBe(true);
    expect(r.payloads_dispatched).toBe(3);
    expect(r.payloads_failed).toHaveLength(0);
    expect(sendFn).toHaveBeenCalledTimes(3);
    // Verify dispatch order via details
    expect(r.details.map((d) => d.payload_id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('1 failing + 2 succeeding: ok=false, payloads_failed has 1 entry, dispatched===2', async () => {
    const sendFn = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'first-fail' })
      .mockResolvedValue({ ok: true });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());
    const deps = makeDeps(doc, clId, sendFn);

    const cue = makeCue('c1', [
      makeOscPayload('p1'),
      makeOscPayload('p2'),
      makeOscPayload('p3'),
    ]);

    const r = await dispatchCue(cue, deps);
    expect(r.ok).toBe(false);
    expect(r.payloads_dispatched).toBe(2);
    expect(r.payloads_failed).toHaveLength(1);
    expect(r.payloads_failed[0].payload_id).toBe('p1');
  });

  it('abortSignal mid-dispatch: remaining payloads marked skipped', async () => {
    const ac = new AbortController();
    const sendFn = vi.fn().mockImplementation(async () => {
      ac.abort();
      return { ok: true };
    });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());
    const { bus, published } = makeMockBus();
    const deps = {
      doc, show_id: 'show-1', cuelist_id: clId,
      output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: bus,
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: ac.signal,
    };

    const cue = makeCue('c1', [makeOscPayload('p1'), makeOscPayload('p2'), makeOscPayload('p3')]);
    const r = await dispatchCue(cue, deps);

    const skipped = r.details.filter((d) => d.result === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((d) => d.error === 'aborted')).toBe(true);
  });

  it('emits cue-complete event with correct fields', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const { bus, published } = makeMockBus();
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());
    const deps = {
      doc, show_id: 'show-1', cuelist_id: clId,
      output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: bus,
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: new AbortController().signal,
    };

    const cue = makeCue('c1', [makeOscPayload('p1')]);
    await dispatchCue(cue, deps);

    const completeEvents = published.filter((e) => e.type === 'cue-complete');
    expect(completeEvents).toHaveLength(1);
    const ev = completeEvents[0] as CueCompleteEvent;
    expect(ev.cue_id).toBe('c1');
    expect(ev.show_id).toBe('show-1');
    expect(ev.cuelist_id).toBe(clId);
    expect(ev.success).toBe(true);
    expect(ev.payloads_dispatched).toBe(1);
  });

  it('webhook payload: not_implemented, does not crash', async () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const deps = makeDeps(doc, clId);

    const cue = makeCue('c1', [makeWebhookPayload()]);
    const r = await dispatchCue(cue, deps);

    expect(r.payloads_failed).toHaveLength(1);
    expect(r.payloads_failed[0].error).toBe('webhook_not_implemented');
  });

  it('no routing for osc device: payload fails, result accumulates error', async () => {
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const deps = makeDeps(doc, clId);
    // no routing set in doc

    const cue = makeCue('c1', [makeOscPayload('p1', 'dev-with-no-routing')]);
    const r = await dispatchCue(cue, deps);
    expect(r.ok).toBe(false);
    expect(r.payloads_failed[0].error).toMatch(/no routing/);
  });

  it('cycle detection: cue referencing itself emits system-error', async () => {
    const { bus, published } = makeMockBus();
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const deps = {
      doc, show_id: 'show-1', cuelist_id: clId,
      output: { send: vi.fn(), claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: bus,
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: new AbortController().signal,
    };

    const cycleCtx = new CycleDetector();
    cycleCtx.enter('c1'); // simulate c1 already in stack

    const cue = makeCue('c1', [makeOscPayload('p1')]);
    const r = await dispatchCue(cue, deps, cycleCtx);

    expect(r.ok).toBe(false);
    const sysErrors = published.filter((e) => e.type === 'system-error') as SystemErrorEvent[];
    expect(sysErrors.some((e) => e.code === 'group-cycle-detected')).toBe(true);
  });

  it('group depth > 4 levels: nesting-too-deep system-error emitted', async () => {
    const { bus, published } = makeMockBus();
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const deps = {
      doc, show_id: 'show-1', cuelist_id: clId,
      output: { send: vi.fn(), claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: bus,
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: new AbortController().signal,
    };

    // Simulate depth=4 already
    const cycleCtx = new CycleDetector();
    cycleCtx.enter('a'); cycleCtx.enter('b'); cycleCtx.enter('c'); cycleCtx.enter('d');

    const cue = makeCue('e', [makeOscPayload('p1')]);
    const r = await dispatchCue(cue, deps, cycleCtx);

    expect(r.ok).toBe(false);
    const sysErrors = published.filter((e) => e.type === 'system-error') as SystemErrorEvent[];
    expect(sysErrors.some((e) => e.code === 'group-nesting-too-deep')).toBe(true);
  });

  it('group with 2 parallel children via real group payload', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());

    const childA = addCue(doc, clId, { label: 'A', department: ['LX'], created_by: 'test' });
    const childB = addCue(doc, clId, { label: 'B', department: ['LX'], created_by: 'test' });

    const groupPayload: GroupPayload = {
      id: 'gp1', type: 'group', tag: null, note: '',
      child_cue_ids: [childA, childB], fire_mode: 'parallel',
    };

    const deps = makeDeps(doc, clId, sendFn);
    const cue = makeCue('parent', [groupPayload]);
    const r = await dispatchCue(cue, deps);
    // Both children have no payloads → ok
    expect(r.ok).toBe(true);
    expect(r.payloads_dispatched).toBe(1); // group payload = 1 dispatched
  });

  it('cue-complete not emitted for internal (group sub-dispatch) calls', async () => {
    const { bus, published } = makeMockBus();
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    setRouting(doc, makeOscRouting());
    const deps = {
      doc, show_id: 'show-1', cuelist_id: clId,
      output: { send: vi.fn().mockResolvedValue({ ok: true }), claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
      events: bus,
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
      abortSignal: new AbortController().signal,
    };
    const cue = makeCue('c1', [makeOscPayload('p1')]);
    await dispatchCue(cue, deps, new CycleDetector(), true); // _internal = true
    const completeEvents = published.filter((e) => e.type === 'cue-complete');
    expect(completeEvents).toHaveLength(0);
  });
});
