import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import {
  schedule,
  isAutoTriggered,
  getFollowSource,
} from '../../../../../src/modules/cuelist-core/src/trigger/scheduler.js';
import type { FireEvent } from '../../../../../src/modules/cuelist-core/src/trigger/types.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';

function makeDoc() {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function makeCue(trigger: Cue['trigger'], durationHintMs: number | null = null): Cue {
  return {
    id: 'cue-1',
    label: 'Q1',
    description: '',
    department: ['SM'],
    standby_note: '',
    script_line_ref: null,
    trigger,
    payloads: [],
    duration_hint_ms: durationHintMs,
    notes: '',
    payload_frozen_at: null,
    created_at: new Date().toISOString(),
    created_by: 'op1',
    modified_at: new Date().toISOString(),
    modified_by: 'op1',
  };
}

function makeFireEvent(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  ts = 1000,
): FireEvent {
  return { cuelist_id: cuelistId, cue_id: cueId, ts };
}

// ── schedule() ────────────────────────────────────────────────────────────────

describe('schedule — manual', () => {
  it('returns null for manual trigger', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'manual' });
    const fire = makeFireEvent(doc, cuelistId, prevId);
    expect(schedule(next, fire, doc)).toBeNull();
  });
});

describe('schedule — auto_continue', () => {
  it('returns ScheduledFire with fire_at = ts + delay_ms', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'auto_continue', delay_ms: 500 });
    const fire = makeFireEvent(doc, cuelistId, prevId, 1000);
    const result = schedule(next, fire, doc);
    expect(result).not.toBeNull();
    expect(result!.fire_at).toBe(1500);
    expect(result!.trigger_mode).toBe('auto_continue');
    expect(result!.cue_id).toBe('cue-1');
    expect(result!.source_cue_id).toBe(prevId);
  });

  it('clamps negative delay_ms to 0', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'auto_continue', delay_ms: -100 });
    const fire = makeFireEvent(doc, cuelistId, prevId, 1000);
    const result = schedule(next, fire, doc);
    expect(result!.fire_at).toBe(1000);
  });

  it('returns ScheduledFire with delay_ms = 0 for immediate auto_continue', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'auto_continue', delay_ms: 0 });
    const fire = makeFireEvent(doc, cuelistId, prevId, 2000);
    const result = schedule(next, fire, doc);
    expect(result!.fire_at).toBe(2000);
  });
});

describe('schedule — auto_follow', () => {
  it('returns null when prev_cue_id does not match fire event', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'auto_follow', prev_cue_id: 'other-cue' });
    const fire = makeFireEvent(doc, cuelistId, prevId);
    expect(schedule(next, fire, doc)).toBeNull();
  });

  it('returns null for auto_follow when prev has non-null duration_hint_ms', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, {
      label: 'Q0', department: ['SM'], created_by: 'op1',
    });
    // Set duration_hint_ms on the prev cue (non-null means we wait for cue-complete)
    const cl = doc.getArray('cuelists').toArray()[0] as Y.Map<unknown>;
    const cues = cl.get('cues') as Y.Array<Y.Map<unknown>>;
    doc.transact(() => cues.toArray()[0].set('duration_hint_ms', 2000));

    const next = makeCue({ kind: 'auto_follow', prev_cue_id: prevId });
    const fire = makeFireEvent(doc, cuelistId, prevId);
    expect(schedule(next, fire, doc)).toBeNull();
  });

  it('returns immediate ScheduledFire when prev.duration_hint_ms is null (Q5 default)', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, {
      label: 'Q0', department: ['SM'], created_by: 'op1',
    });
    // Prev cue has duration_hint_ms = null (the default from makeCueMap)
    const next = makeCue({ kind: 'auto_follow', prev_cue_id: prevId });
    const fire = makeFireEvent(doc, cuelistId, prevId, 3000);
    const result = schedule(next, fire, doc);
    expect(result).not.toBeNull();
    expect(result!.fire_at).toBe(3000);
    expect(result!.trigger_mode).toBe('auto_follow');
  });
});

describe('schedule — timecode', () => {
  it('returns null for timecode trigger (deferred to 0.2)', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'timecode', time_ms: 60000, source: 'ltc' });
    const fire = makeFireEvent(doc, cuelistId, prevId);
    expect(schedule(next, fire, doc)).toBeNull();
  });
});

// ── isAutoTriggered() ─────────────────────────────────────────────────────────

describe('isAutoTriggered', () => {
  it('returns true for auto_follow', () => {
    expect(isAutoTriggered(makeCue({ kind: 'auto_follow', prev_cue_id: 'x' }))).toBe(true);
  });

  it('returns true for auto_continue', () => {
    expect(isAutoTriggered(makeCue({ kind: 'auto_continue', delay_ms: 0 }))).toBe(true);
  });

  it('returns false for manual', () => {
    expect(isAutoTriggered(makeCue({ kind: 'manual' }))).toBe(false);
  });

  it('returns false for timecode', () => {
    expect(isAutoTriggered(makeCue({ kind: 'timecode', time_ms: 0, source: 'ltc' }))).toBe(false);
  });
});

// ── getFollowSource() ─────────────────────────────────────────────────────────

describe('getFollowSource', () => {
  it('returns prev_cue_id for auto_follow', () => {
    expect(getFollowSource(makeCue({ kind: 'auto_follow', prev_cue_id: 'prev-cue' }))).toBe(
      'prev-cue',
    );
  });

  it('returns null for manual', () => {
    expect(getFollowSource(makeCue({ kind: 'manual' }))).toBeNull();
  });

  it('returns null for auto_continue', () => {
    expect(getFollowSource(makeCue({ kind: 'auto_continue', delay_ms: 0 }))).toBeNull();
  });

  it('returns null for timecode', () => {
    expect(getFollowSource(makeCue({ kind: 'timecode', time_ms: 0, source: 'ltc' }))).toBeNull();
  });
});
