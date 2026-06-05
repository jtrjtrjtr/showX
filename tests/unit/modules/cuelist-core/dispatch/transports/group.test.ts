import { describe, it, expect, vi } from 'vitest';
import type { GroupPayload, Cue } from 'showx-shared';
import { dispatchGroup } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/group.js';
import { CycleDetector } from '../../../../../../src/modules/cuelist-core/src/dispatch/cycleDetect.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist } from '../../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue } from '../../../../../../src/modules/cuelist-core/src/document/cue.js';
import { setMode } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDoc() {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  setMode(doc, 'rehearsal');
  return doc;
}

function makeDeps(doc: ReturnType<typeof makeDoc>, cuelistId: string): DispatchDeps {
  return {
    doc, show_id: 'show-1', cuelist_id: cuelistId,
    output: { send: vi.fn(), claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makeGroupPayload(child_cue_ids: string[], fire_mode: 'parallel' | 'series' = 'series'): GroupPayload {
  return { id: 'gp1', type: 'group', tag: null, note: '', child_cue_ids, fire_mode };
}

function makeCue(id: string): Cue {
  return {
    id, label: `Cue ${id}`, description: '', department: ['LX'], standby_note: '',
    script_line_ref: null, trigger: { kind: 'manual' }, payloads: [],
    duration_hint_ms: null, notes: '', payload_frozen_at: null,
    created_at: new Date().toISOString(), created_by: 'test',
    modified_at: new Date().toISOString(), modified_by: 'test',
  };
}

describe('dispatchGroup', () => {
  it('parallel: dispatches all children concurrently (all ok)', async () => {
    const calls: string[] = [];
    const fireChild = vi.fn().mockImplementation(async (cue: Cue) => {
      calls.push(cue.id);
      return { ok: true };
    });

    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cueA = addCue(doc, clId, { label: 'A', department: ['LX'], created_by: 'test' });
    const cueB = addCue(doc, clId, { label: 'B', department: ['LX'], created_by: 'test' });

    const deps = makeDeps(doc, clId);
    const cycleCtx = new CycleDetector();
    const payload = makeGroupPayload([cueA, cueB], 'parallel');

    const r = await dispatchGroup(payload, deps, cycleCtx, fireChild);
    expect(r.ok).toBe(true);
    expect(calls).toContain(cueA);
    expect(calls).toContain(cueB);
    expect(fireChild).toHaveBeenCalledTimes(2);
  });

  it('parallel: returns error when one child fails', async () => {
    const fireChild = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'child failed' });

    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cueA = addCue(doc, clId, { label: 'A', department: ['LX'], created_by: 'test' });
    const cueB = addCue(doc, clId, { label: 'B', department: ['LX'], created_by: 'test' });

    const deps = makeDeps(doc, clId);
    const r = await dispatchGroup(makeGroupPayload([cueA, cueB], 'parallel'), deps, new CycleDetector(), fireChild);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parallel child cues failed/);
  });

  it('series: dispatches children in order', async () => {
    const order: string[] = [];
    const fireChild = vi.fn().mockImplementation(async (cue: Cue) => {
      order.push(cue.id);
      return { ok: true };
    });

    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cueA = addCue(doc, clId, { label: 'A', department: ['LX'], created_by: 'test' });
    const cueB = addCue(doc, clId, { label: 'B', department: ['LX'], created_by: 'test' });

    const deps = makeDeps(doc, clId);
    await dispatchGroup(makeGroupPayload([cueA, cueB], 'series'), deps, new CycleDetector(), fireChild);
    expect(order).toEqual([cueA, cueB]);
  });

  it('series: stops on first child failure', async () => {
    const fireChild = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'first failed' })
      .mockResolvedValueOnce({ ok: true });

    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');
    const cueA = addCue(doc, clId, { label: 'A', department: ['LX'], created_by: 'test' });
    const cueB = addCue(doc, clId, { label: 'B', department: ['LX'], created_by: 'test' });

    const deps = makeDeps(doc, clId);
    const r = await dispatchGroup(makeGroupPayload([cueA, cueB], 'series'), deps, new CycleDetector(), fireChild);
    expect(r.ok).toBe(false);
    expect(fireChild).toHaveBeenCalledTimes(1);
  });

  it('skips children not found in doc', async () => {
    const fireChild = vi.fn().mockResolvedValue({ ok: true });
    const doc = makeDoc();
    const clId = addCuelist(doc, 'Main');

    const deps = makeDeps(doc, clId);
    // 'missing-cue' doesn't exist → filtered out
    const r = await dispatchGroup(makeGroupPayload(['missing-cue'], 'series'), deps, new CycleDetector(), fireChild);
    expect(r.ok).toBe(true);
    expect(fireChild).not.toHaveBeenCalled();
  });
});
