import * as Y from 'yjs';
import type { Cue, DepartmentTag, Trigger } from 'showx-shared';
import { uuidv7 } from './uuid.js';
import { getCuelist, getCues } from './cuelist.js';
import { ValidationError } from './payload.js';
import { assertEditAllowed } from '../mode/lockGuards.js';
import { assertCueInvariants } from '../cue/invariants.js';

// ── Cue factory ───────────────────────────────────────────────────────────────

export interface MakeCueOpts {
  label: string;
  description?: string;
  department: DepartmentTag[];  // ≥ 1 entry required
  standby_note?: string;
  trigger?: Trigger;
  created_by: string;
}

export function makeCueMap(opts: MakeCueOpts): Y.Map<unknown> {
  if (opts.department.length === 0) {
    throw new ValidationError('cue.department must have ≥ 1 entry', 'department');
  }
  const m = new Y.Map<unknown>();
  const now = new Date().toISOString();
  m.set('id', uuidv7());
  m.set('label', opts.label);
  m.set('description', opts.description ?? '');
  m.set('department', opts.department.slice());
  m.set('standby_note', opts.standby_note ?? '');
  m.set('script_line_ref', null);
  m.set('trigger', opts.trigger ?? { kind: 'manual' });
  m.set('payloads', new Y.Array<Y.Map<unknown>>());
  m.set('duration_hint_ms', null);
  // TODO(0.2): upgrade notes/standby_note to Y.Text for collab char-level merge
  m.set('notes', '');
  m.set('cue_number', null);
  m.set('payload_frozen_at', null);
  // sort_key determines display order — set by addCue / insertCueAfter / reorderCues
  m.set('sort_key', 0);
  m.set('created_at', now);
  m.set('created_by', opts.created_by);
  m.set('modified_at', now);
  m.set('modified_by', opts.created_by);
  return m;
}

// ── Sort-key helpers ──────────────────────────────────────────────────────────

function getSortKey(cue: Y.Map<unknown>): number {
  return (cue.get('sort_key') as number) ?? 0;
}

function maxSortKeyIn(arr: Y.Map<unknown>[]): number {
  return arr.reduce((max, c) => Math.max(max, getSortKey(c)), 0);
}

function minSortKeyIn(arr: Y.Map<unknown>[]): number {
  return arr.reduce((min, c) => Math.min(min, getSortKey(c)), Infinity);
}

// ── Cue mutators ──────────────────────────────────────────────────────────────

function findCue(doc: Y.Doc, cuelistId: string, cueId: string): Y.Map<unknown> {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  return cue;
}

function touchModified(cue: Y.Map<unknown>, modifiedBy: string): void {
  cue.set('modified_at', new Date().toISOString());
  cue.set('modified_by', modifiedBy);
}

function assertCueMapValid(cueMap: Y.Map<unknown>): void {
  assertCueInvariants(cueMap.toJSON() as Cue);
}

export function addCue(doc: Y.Doc, cuelistId: string, opts: MakeCueOpts): string {
  assertEditAllowed(doc, 'structure');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);

  const arr = cues.toArray();
  const sk = arr.length === 0 ? 1000 : maxSortKeyIn(arr) + 1000;

  const cue = makeCueMap(opts);
  // Set sort_key on prelim map before integration so _integrate writes it to the doc
  cue.set('sort_key', sk);

  doc.transact(() => cues.push([cue]));
  assertCueMapValid(cue);
  return cue.get('id') as string;
}

export function insertCueAfter(
  doc: Y.Doc,
  cuelistId: string,
  afterCueId: string | null,
  opts: MakeCueOpts,
): string {
  assertEditAllowed(doc, 'structure');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();

  let insertIdx: number;
  let sk: number;

  if (afterCueId === null) {
    // Prepend before first cue
    insertIdx = 0;
    const minSk = arr.length === 0 ? Infinity : minSortKeyIn(arr);
    sk = minSk === Infinity ? 1000 : minSk - 1000;
  } else {
    const afterIdx = arr.findIndex((c) => c.get('id') === afterCueId);
    if (afterIdx === -1) throw new Error(`cue ${afterCueId} not found`);
    insertIdx = afterIdx + 1;
    const prevSk = getSortKey(arr[afterIdx]);
    if (insertIdx >= arr.length) {
      sk = prevSk + 1000;
    } else {
      sk = (prevSk + getSortKey(arr[insertIdx])) / 2;
    }
  }

  const cue = makeCueMap(opts);
  cue.set('sort_key', sk);

  doc.transact(() => cues.insert(insertIdx, [cue]));
  assertCueMapValid(cue);
  return cue.get('id') as string;
}

export function removeCue(doc: Y.Doc, cuelistId: string, cueId: string): void {
  assertEditAllowed(doc, 'structure');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();
  const idx = arr.findIndex((c) => c.get('id') === cueId);
  if (idx === -1) throw new Error(`cue ${cueId} not found`);
  doc.transact(() => cues.delete(idx, 1));
}

/**
 * Reorder cues by assigning new sort_keys — does NOT move Y.Map items within the
 * Y.Array (moving integrated Y.Maps is unsupported in Yjs). Display order is
 * determined by getCuesSorted(). Concurrent reorders converge via Y.Map LWW on
 * each cue's sort_key field.
 */
export function reorderCues(
  doc: Y.Doc,
  cuelistId: string,
  newOrder: string[],
): void {
  assertEditAllowed(doc, 'structure');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();

  doc.transact(() => {
    newOrder.forEach((id, idx) => {
      const cue = arr.find((c) => c.get('id') === id);
      if (!cue) throw new Error(`cue ${id} not found in reorder`);
      cue.set('sort_key', (idx + 1) * 1000);
    });
  });
}

export function setCueLabel(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  label: string,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('label', label);
    touchModified(cue, modifiedBy);
  });
}

export function setCueDescription(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  description: string,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('description', description);
    touchModified(cue, modifiedBy);
  });
}

export function setCueDepartments(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  departments: DepartmentTag[],
  modifiedBy: string,
): void {
  if (departments.length === 0) {
    throw new ValidationError('cue.department must have ≥ 1 entry', 'department');
  }
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('department', departments.slice());
    touchModified(cue, modifiedBy);
  });
  assertCueMapValid(cue);
}

export function setCueTrigger(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  trigger: Trigger,
  modifiedBy: string,
): void {
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('trigger', trigger);
    touchModified(cue, modifiedBy);
  });
}

export function setCueStandbyNote(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  standbyNote: string,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('standby_note', standbyNote);
    touchModified(cue, modifiedBy);
  });
}

export function setCueNotes(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  notes: string,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('notes', notes);
    touchModified(cue, modifiedBy);
  });
}

export function setCueDurationHint(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  durationMs: number | null,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    cue.set('duration_hint_ms', durationMs);
    touchModified(cue, modifiedBy);
  });
}

// ── Batch text-field update ────────────────────────────────────────────────────

export interface CueFieldPatch {
  label?: string;
  description?: string;
  standby_note?: string;
  trigger?: Trigger;
  duration_hint_ms?: number | null;
  /** QLab-style display number. Trimmed, max 8 chars. Null clears. No uniqueness constraint. */
  cue_number?: string | null;
}

/**
 * Update one or more fields on a cue in a single Yjs transaction.
 * Library-owned so the write path is unit-testable outside UI components.
 * Validation rules:
 *   label: non-empty if provided
 *   trigger: per-kind constraints enforced; auto_follow.prev_cue_id must exist in cuelist
 *   duration_hint_ms: null or >= 0
 */
export function updateCueFields(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  patch: CueFieldPatch,
  modifiedBy: string,
): void {
  assertEditAllowed(doc, 'meta');
  if (patch.label !== undefined && patch.label.trim() === '') {
    throw new ValidationError('cue.label must be non-empty', 'label');
  }
  if (patch.trigger !== undefined) {
    const t = patch.trigger;
    if (t.kind === 'auto_continue' && t.delay_ms < 0) {
      throw new ValidationError('auto_continue.delay_ms must be >= 0', 'trigger.delay_ms');
    }
    if (t.kind === 'timecode' && t.time_ms < 0) {
      throw new ValidationError('timecode.time_ms must be >= 0', 'trigger.time_ms');
    }
    if (t.kind === 'auto_follow') {
      const cuelistDoc = getCuelist(doc, cuelistId);
      if (!cuelistDoc) throw new ValidationError('cuelist not found for trigger validation', 'trigger.prev_cue_id');
      const existingIds = getCues(cuelistDoc).toArray().map((c) => c.get('id') as string);
      if (!existingIds.includes(t.prev_cue_id)) {
        throw new ValidationError(
          'auto_follow.prev_cue_id must reference an existing cue in the cuelist',
          'trigger.prev_cue_id',
        );
      }
    }
  }
  if (patch.duration_hint_ms !== undefined && patch.duration_hint_ms !== null && patch.duration_hint_ms < 0) {
    throw new ValidationError('duration_hint_ms must be null or >= 0', 'duration_hint_ms');
  }
  if (patch.cue_number !== undefined && patch.cue_number !== null) {
    const trimmed = patch.cue_number.trim();
    if (trimmed.length > 8) {
      throw new ValidationError('cue_number max 8 chars', 'cue_number');
    }
  }
  const cue = findCue(doc, cuelistId, cueId);
  doc.transact(() => {
    if (patch.label !== undefined) cue.set('label', patch.label);
    if (patch.description !== undefined) cue.set('description', patch.description);
    if (patch.standby_note !== undefined) cue.set('standby_note', patch.standby_note);
    if (patch.trigger !== undefined) cue.set('trigger', patch.trigger);
    if (patch.duration_hint_ms !== undefined) cue.set('duration_hint_ms', patch.duration_hint_ms);
    if (patch.cue_number !== undefined) {
      cue.set('cue_number', patch.cue_number !== null ? patch.cue_number.trim() : null);
    }
    touchModified(cue, modifiedBy);
  });
}

// Re-export for convenience
export { getPayloads } from './payload.js';
