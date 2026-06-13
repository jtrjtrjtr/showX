// Tests for hotkey trigger behaviour in the scheduler (acceptance criteria: schedule() returns null)
// Placed in tests/unit/pwa/ per B004-009 target_files spec.
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { Cue } from 'showx-shared';
import {
  schedule,
  isAutoTriggered,
  normalizeHotkeyKey,
} from '../../../src/modules/cuelist-core/src/trigger/scheduler.js';
import type { FireEvent } from '../../../src/modules/cuelist-core/src/trigger/types.js';
import { initShowDoc, getMeta } from '../../../src/modules/cuelist-core/src/document/show.js';
import { addCue as addDocCue } from '../../../src/modules/cuelist-core/src/document/cue.js';

function makeDoc() {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'op1' });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

function makeCue(trigger: Cue['trigger']): Cue {
  return {
    id: 'cue-hotkey',
    label: 'HK',
    description: '',
    department: ['SM'],
    standby_note: '',
    script_line_ref: null,
    trigger,
    payloads: [],
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: '2026-06-13T00:00:00Z',
    created_by: 'op1',
    modified_at: '2026-06-13T00:00:00Z',
    modified_by: 'op1',
  };
}

function makeFireEvent(doc: Y.Doc, cuelistId: string, cueId: string, ts = 1000): FireEvent {
  return { cuelist_id: cuelistId, cue_id: cueId, ts };
}

describe('schedule — hotkey', () => {
  it('returns null for hotkey trigger (not part of auto-chain)', () => {
    const { doc, cuelistId } = makeDoc();
    const prevId = addDocCue(doc, cuelistId, { label: 'Q0', department: ['SM'], created_by: 'op1' });
    const next = makeCue({ kind: 'hotkey', key: 'F5' });
    const fire = makeFireEvent(doc, cuelistId, prevId);
    expect(schedule(next, fire, doc)).toBeNull();
  });
});

describe('isAutoTriggered — hotkey', () => {
  it('returns false for hotkey trigger', () => {
    expect(isAutoTriggered(makeCue({ kind: 'hotkey', key: 'g' }))).toBe(false);
  });
});

describe('normalizeHotkeyKey', () => {
  it('normalizes space to "Space"', () => {
    expect(normalizeHotkeyKey(' ')).toBe('Space');
  });

  it('passes through other keys unchanged', () => {
    expect(normalizeHotkeyKey('F5')).toBe('F5');
    expect(normalizeHotkeyKey('g')).toBe('g');
    expect(normalizeHotkeyKey('ArrowUp')).toBe('ArrowUp');
  });
});
