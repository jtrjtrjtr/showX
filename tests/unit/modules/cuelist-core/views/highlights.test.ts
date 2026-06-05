import { describe, it, expect } from 'vitest';
import type { Cue, OscPayload } from 'showx-shared';
import {
  highlightedPayloads,
  dimmedPayloads,
} from '../../../../../src/modules/cuelist-core/src/views/highlights.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOscPayload(id: string, tag: string | null): OscPayload {
  return { id, type: 'osc', tag, note: '', device_id: 'dev1', address: '/test', args: [] };
}

function makeCue(id: string, department: string[], payloads: OscPayload[]): Cue {
  return {
    id,
    label: id,
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

// ── highlightedPayloads ────────────────────────────────────────────────────────

describe('highlightedPayloads', () => {
  it('single-dept cue (LX) with 2 payloads, LX op: both highlighted', () => {
    const cue = makeCue('c1', ['LX'], [
      makeOscPayload('p1', null),
      makeOscPayload('p2', null),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['LX']));
    expect(highlighted.has('p1')).toBe(true);
    expect(highlighted.has('p2')).toBe(true);
  });

  it('compound cue (LX+SX) with tagged payloads: LX op highlights LX, dims SX', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', 'LX'),
      makeOscPayload('p2', 'SX'),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['LX']));
    const dimmed = dimmedPayloads(cue, new Set(['LX']));
    expect(highlighted.has('p1')).toBe(true);
    expect(highlighted.has('p2')).toBe(false);
    expect(dimmed.has('p2')).toBe(true);
  });

  it('compound cue with payload.tag=null, LX op: highlighted (rule-of-least-surprise)', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', null),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['LX']));
    expect(highlighted.has('p1')).toBe(true);
  });

  it('compound cue, watcher (owned=[]): all dimmed, none highlighted', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', 'LX'),
      makeOscPayload('p2', 'SX'),
    ]);
    const highlighted = highlightedPayloads(cue, new Set([]));
    const dimmed = dimmedPayloads(cue, new Set([]));
    expect(highlighted.size).toBe(0);
    expect(dimmed.has('p1')).toBe(true);
    expect(dimmed.has('p2')).toBe(true);
  });

  it('compound cue with non-canonical payload.tag: highlighted (not used for dept filtering)', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', 'UNKNOWN_DEPT'),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['LX']));
    expect(highlighted.has('p1')).toBe(true);
  });

  it('single-dept cue not actionable (SM viewing LX-only cue): all payloads dimmed', () => {
    const cue = makeCue('c1', ['LX'], [
      makeOscPayload('p1', null),
      makeOscPayload('p2', null),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['SM']));
    const dimmed = dimmedPayloads(cue, new Set(['SM']));
    expect(highlighted.size).toBe(0);
    expect(dimmed.has('p1')).toBe(true);
    expect(dimmed.has('p2')).toBe(true);
  });

  it('solo op (LX+SX+VIDEO) on compound cue (LX+SX): LX and SX payloads highlighted', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', 'LX'),
      makeOscPayload('p2', 'SX'),
      makeOscPayload('p3', null),
    ]);
    const highlighted = highlightedPayloads(cue, new Set(['LX', 'SX', 'VIDEO']));
    expect(highlighted.has('p1')).toBe(true);
    expect(highlighted.has('p2')).toBe(true);
    // null-tagged in compound: highlighted (rule-of-least-surprise)
    expect(highlighted.has('p3')).toBe(true);
  });

  it('cue with no payloads: empty highlighted and dimmed', () => {
    const cue = makeCue('c1', ['LX'], []);
    expect(highlightedPayloads(cue, new Set(['LX'])).size).toBe(0);
    expect(dimmedPayloads(cue, new Set(['LX'])).size).toBe(0);
  });
});

// ── dimmedPayloads ─────────────────────────────────────────────────────────────

describe('dimmedPayloads', () => {
  it('highlighted + dimmed is a complete partition of all payloads', () => {
    const cue = makeCue('c1', ['LX', 'SX'], [
      makeOscPayload('p1', 'LX'),
      makeOscPayload('p2', 'SX'),
      makeOscPayload('p3', null),
    ]);
    const owned = new Set<string>(['LX']);
    const hi = highlightedPayloads(cue, owned as ReadonlySet<string>);
    const di = dimmedPayloads(cue, owned as ReadonlySet<string>);
    const all = new Set([...hi, ...di]);
    expect(all.has('p1')).toBe(true);
    expect(all.has('p2')).toBe(true);
    expect(all.has('p3')).toBe(true);
    // They should not overlap
    for (const id of hi) expect(di.has(id)).toBe(false);
  });
});
