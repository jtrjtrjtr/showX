import * as Y from 'yjs';
import type { DepartmentTag, ShowMode } from 'showx-shared';
import { uuidv7 } from './uuid.js';
import { makeCuelistMap, getCuelists, getCuelist, getCues, getCue, getCuesSorted } from './cuelist.js';

export interface InitShowOpts {
  title: string;
  venue: string | null;
  date: string | null;  // ISO yyyy-mm-dd
  departments?: DepartmentTag[];
  created_by: string;
}

const CANONICAL_DEPARTMENTS: DepartmentTag[] = [
  'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER',
];

// ── Doc factory ───────────────────────────────────────────────────────────────

export function initShowDoc(opts: InitShowOpts): Y.Doc {
  const doc = new Y.Doc();
  const showId = uuidv7();
  const now = new Date().toISOString();

  doc.transact(() => {
    const meta = doc.getMap('meta');
    meta.set('schema_version', 1);
    meta.set('show_id', showId);
    meta.set('title', opts.title);
    meta.set('venue', opts.venue);
    meta.set('date', opts.date);
    meta.set('departments', opts.departments ?? CANONICAL_DEPARTMENTS);
    meta.set('mode', 'rehearsal');
    meta.set('created_at', now);
    meta.set('last_meta_editor', opts.created_by);

    doc.getMap('operators');
    doc.getMap('devices');
    doc.getMap('routing');

    // Seed one default cuelist; meta.active_cuelist_id points at it
    const cuelists = doc.getArray<Y.Map<unknown>>('cuelists');
    const defaultCuelist = makeCuelistMap('Main Show');
    cuelists.push([defaultCuelist]);
    meta.set('active_cuelist_id', defaultCuelist.get('id') as string);

    doc.getArray('proposals');

    const schema = doc.getMap('schema');
    schema.set('format_version', '1.0');
    schema.set('schema_version', 1);
    schema.set('applied_migrations', []);
  });

  return doc;
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getOperators(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('operators');
}

export function getDevices(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('devices');
}

export function getRouting(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>('routing');
}

export function getProposals(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('proposals');
}

export function getSchema(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('schema');
}

// ── Mutators ──────────────────────────────────────────────────────────────────

/** @internal — for tests and migrations only. Production code must use transitionMode(). */
export function setMode(doc: Y.Doc, mode: ShowMode): void {
  const meta = getMeta(doc);
  doc.transact(() => meta.set('mode', mode));
}

export function setMetaField(doc: Y.Doc, field: string, value: unknown): void {
  const meta = getMeta(doc);
  doc.transact(() => meta.set(field, value));
}

// Re-export cuelist/cue accessors so callers can import from one place
export { getCuelists, getCuelist, getCues, getCue, getCuesSorted };
