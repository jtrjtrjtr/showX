import { describe, it, expect, vi } from 'vitest';
import type { Cue } from 'showx-shared';
import type { OscPayload } from 'showx-shared';
import {
  visibleCues,
  isActionable,
  isContextOnly,
  subscribeFilteredCuelist,
  type FilterContext,
} from '../../../../../src/modules/cuelist-core/src/views/departmentFilter.js';
import {
  initShowDoc,
  getMeta,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { getCuelist, getCues } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOscPayload(id: string, tag: string | null): OscPayload {
  return { id, type: 'osc', tag, note: '', device_id: 'dev1', address: '/test', args: [] };
}

function makeCue(id: string, label: string, department: string[], payloads: OscPayload[] = []): Cue {
  return {
    id,
    label,
    description: '',
    department: department as Cue['department'],
    standby_note: '',
    script_line_ref: null,
    trigger: { kind: 'manual' },
    payloads,
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    created_by: 'test',
    modified_at: '2026-01-01T00:00:00Z',
    modified_by: 'test',
  };
}

function makeCtx(owned: string[], watched: string[]): FilterContext {
  return {
    owned: new Set(owned) as FilterContext['owned'],
    watched: new Set(watched) as FilterContext['watched'],
  };
}

function makeDocWithCuelist() {
  const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

// ── visibleCues ───────────────────────────────────────────────────────────────

describe('visibleCues', () => {
  it('SM profile sees all cues', () => {
    const cues = [
      makeCue('c1', 'LX 1', ['LX']),
      makeCue('c2', 'SX 1', ['SX']),
      makeCue('c3', 'SM 1', ['SM']),
      makeCue('c4', 'Auto 1', ['AUTO']),
    ];
    const ctx = makeCtx(['SM'], ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'OTHER']);
    expect(visibleCues(cues, ctx)).toHaveLength(4);
  });

  it('LX op sees LX and SM cues, not SX', () => {
    const lxCue = makeCue('c1', 'LX 1', ['LX']);
    const sxCue = makeCue('c2', 'SX 1', ['SX']);
    const smCue = makeCue('c3', 'SM 1', ['SM']);
    const cues = [lxCue, sxCue, smCue];
    const ctx = makeCtx(['LX'], ['SM']);
    const result = visibleCues(cues, ctx);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toContain('c1');
    expect(result.map((c) => c.id)).toContain('c3');
    expect(result.map((c) => c.id)).not.toContain('c2');
  });

  it('LX op sees compound LX+SX cue (intersects owned)', () => {
    const cue = makeCue('c1', 'Compound', ['LX', 'SX']);
    const ctx = makeCtx(['LX'], ['SM']);
    expect(visibleCues([cue], ctx)).toHaveLength(1);
  });

  it('solo op (LX+SX+VIDEO owned) sees VIDEO cue, hides AUTO', () => {
    const videoCue = makeCue('c1', 'Video 1', ['VIDEO']);
    const autoCue = makeCue('c2', 'Auto 1', ['AUTO']);
    const ctx = makeCtx(['LX', 'SX', 'VIDEO'], ['SM']);
    const result = visibleCues([videoCue, autoCue], ctx);
    expect(result.map((c) => c.id)).toContain('c1');
    expect(result.map((c) => c.id)).not.toContain('c2');
  });

  it('director (owned=[], watched=all) sees all cues', () => {
    const cues = [
      makeCue('c1', 'LX 1', ['LX']),
      makeCue('c2', 'PYRO 1', ['PYRO']),
    ];
    const ctx = makeCtx([], ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER']);
    expect(visibleCues(cues, ctx)).toHaveLength(2);
  });

  it('empty context (owned=[], watched=[]) sees no cues', () => {
    const cues = [makeCue('c1', 'LX 1', ['LX'])];
    const ctx = makeCtx([], []);
    expect(visibleCues(cues, ctx)).toHaveLength(0);
  });

  it('compound cue dept=[LX,SX,VIDEO] visible in LX, SX, and VIDEO operator views', () => {
    const cue = makeCue('c1', 'Compound', ['LX', 'SX', 'VIDEO']);
    const lxCtx = makeCtx(['LX'], ['SM']);
    const sxCtx = makeCtx(['SX'], ['SM']);
    const videoCtx = makeCtx(['VIDEO'], ['SM']);
    const smCtx = makeCtx(['SM'], ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'OTHER']);
    expect(visibleCues([cue], lxCtx)).toHaveLength(1);
    expect(visibleCues([cue], sxCtx)).toHaveLength(1);
    expect(visibleCues([cue], videoCtx)).toHaveLength(1);
    expect(visibleCues([cue], smCtx)).toHaveLength(1);
  });

  it('custom department string treated opaquely — visible if in lens', () => {
    const cue = makeCue('c1', 'Confetti', ['CONFETTI']);
    const inCtx = makeCtx(['CONFETTI'], []);
    const outCtx = makeCtx(['LX'], ['SM']);
    expect(visibleCues([cue], inCtx)).toHaveLength(1);
    expect(visibleCues([cue], outCtx)).toHaveLength(0);
  });
});

// ── isActionable ──────────────────────────────────────────────────────────────

describe('isActionable', () => {
  it('SM viewing LX-only cue is NOT actionable', () => {
    const cue = makeCue('c1', 'LX 1', ['LX']);
    expect(isActionable(cue, new Set(['SM']))).toBe(false);
  });

  it('SM viewing SM+LX compound cue IS actionable', () => {
    const cue = makeCue('c1', 'SM+LX', ['SM', 'LX']);
    expect(isActionable(cue, new Set(['SM']))).toBe(true);
  });

  it('empty owned makes nothing actionable', () => {
    const cue = makeCue('c1', 'LX 1', ['LX']);
    expect(isActionable(cue, new Set())).toBe(false);
  });
});

// ── isContextOnly ─────────────────────────────────────────────────────────────

describe('isContextOnly', () => {
  it('LX op on LX+SX cue: LX is owned → actionable → NOT context-only', () => {
    const cue = makeCue('c1', 'LX+SX', ['SX', 'LX']);
    const ctx = makeCtx(['LX'], ['SM']);
    expect(isContextOnly(cue, ctx)).toBe(false);
  });

  it('LX op on SM cue: SM is watched → context-only', () => {
    const cue = makeCue('c1', 'SM 1', ['SM']);
    const ctx = makeCtx(['LX'], ['SM']);
    expect(isContextOnly(cue, ctx)).toBe(true);
  });

  it('LX op on AUTO cue (not watched): not visible, not context-only', () => {
    const cue = makeCue('c1', 'Auto 1', ['AUTO']);
    const ctx = makeCtx(['LX'], ['SM']);
    expect(isContextOnly(cue, ctx)).toBe(false);
  });
});

// ── subscribeFilteredCuelist ──────────────────────────────────────────────────

describe('subscribeFilteredCuelist', () => {
  it('fires initial handler with current state', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    addCue(doc, cuelistId, { label: 'LX 1', department: ['LX'], created_by: 'op1' });
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    expect(handler).toHaveBeenCalledOnce();
    const { full } = handler.mock.calls[0][0];
    expect(full).toHaveLength(1);
    sub.unsubscribe();
  });

  it('adding a visible cue → handler receives added array with that cue', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    handler.mockClear();

    addCue(doc, cuelistId, { label: 'LX 1', department: ['LX'], created_by: 'op1' });

    expect(handler).toHaveBeenCalledOnce();
    const { added } = handler.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0].label).toBe('LX 1');
    sub.unsubscribe();
  });

  it('adding a hidden cue (dept outside lens) → added array is empty', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    handler.mockClear();

    addCue(doc, cuelistId, { label: 'Auto 1', department: ['AUTO'], created_by: 'op1' });

    // Handler may or may not fire — if it does, added must be empty
    const calls = handler.mock.calls;
    for (const call of calls) {
      expect(call[0].added).toHaveLength(0);
    }
    sub.unsubscribe();
  });

  it('removing a visible cue → handler receives removed id', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const cueId = addCue(doc, cuelistId, { label: 'LX 1', department: ['LX'], created_by: 'op1' });
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    handler.mockClear();

    // Remove the cue by finding and deleting it
    const cuelist = getCuelist(doc, cuelistId)!;
    const cues = getCues(cuelist);
    const idx = cues.toArray().findIndex((c) => c.get('id') === cueId);
    doc.transact(() => cues.delete(idx, 1));

    expect(handler).toHaveBeenCalled();
    const { removed } = handler.mock.calls[handler.mock.calls.length - 1][0];
    expect(removed).toContain(cueId);
    sub.unsubscribe();
  });

  it('editing cue label → handler receives changed array', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    addCue(doc, cuelistId, { label: 'LX 1', department: ['LX'], created_by: 'op1' });
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    handler.mockClear();

    const cuelist = getCuelist(doc, cuelistId)!;
    const cues = getCues(cuelist);
    const cueMap = cues.toArray()[0];
    doc.transact(() => cueMap.set('label', 'LX 1 edited'));

    expect(handler).toHaveBeenCalled();
    const { changed } = handler.mock.calls[handler.mock.calls.length - 1][0];
    expect(changed).toHaveLength(1);
    expect(changed[0].label).toBe('LX 1 edited');
    sub.unsubscribe();
  });

  it('unsubscribe → no further handler calls', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const ctx = makeCtx(['LX'], ['SM']);
    const handler = vi.fn();
    const sub = subscribeFilteredCuelist(doc, cuelistId, ctx, handler);
    sub.unsubscribe();
    handler.mockClear();

    addCue(doc, cuelistId, { label: 'LX 1', department: ['LX'], created_by: 'op1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('throws when cuelist not found', () => {
    const { doc } = makeDocWithCuelist();
    const ctx = makeCtx(['LX'], ['SM']);
    expect(() => subscribeFilteredCuelist(doc, 'nonexistent-id', ctx, () => {})).toThrow();
  });
});

// ── Memoization ───────────────────────────────────────────────────────────────

describe('visibleCues memoization', () => {
  it('same cues array reference + same ctx → referentially equal result', () => {
    const cues = [makeCue('c1', 'LX 1', ['LX'])];
    const ctx = makeCtx(['LX'], ['SM']);
    const r1 = visibleCues(cues, ctx);
    const r2 = visibleCues(cues, ctx);
    expect(r1).toBe(r2);
  });

  it('same cues array + different ctx → different result arrays', () => {
    const cues = [makeCue('c1', 'LX 1', ['LX'])];
    const ctx1 = makeCtx(['LX'], ['SM']);
    const ctx2 = makeCtx(['SX'], ['SM']);
    const r1 = visibleCues(cues, ctx1);
    const r2 = visibleCues(cues, ctx2);
    expect(r1).not.toBe(r2);
  });

  it('different cues arrays → independent cache entries', () => {
    const cues1 = [makeCue('c1', 'LX 1', ['LX'])];
    const cues2 = [makeCue('c2', 'SX 1', ['SX'])];
    const ctx = makeCtx(['LX'], ['SM']);
    const r1 = visibleCues(cues1, ctx);
    const r2 = visibleCues(cues2, ctx);
    expect(r1).not.toBe(r2);
    expect(r1.map((c) => c.id)).toContain('c1');
    expect(r2).toHaveLength(0);
  });

  it('empty owned+watched context cached correctly → same empty array ref', () => {
    const cues = [makeCue('c1', 'LX 1', ['LX'])];
    const ctx = makeCtx([], []);
    const r1 = visibleCues(cues, ctx);
    const r2 = visibleCues(cues, ctx);
    expect(r1).toBe(r2);
    expect(r1).toHaveLength(0);
  });
});
