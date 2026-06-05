import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  initShowDoc,
  getMeta,
  getOperators,
  getDevices,
  getRouting,
  getProposals,
  getSchema,
  getCuelists,
  setMode,
  setMetaField,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';

const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeDoc() {
  return initShowDoc({ title: 'Test Show', venue: 'Venue A', date: '2026-06-17', created_by: 'op1' });
}

describe('initShowDoc', () => {
  it('creates all 7 root entries (meta, operators, devices, routing, cuelists, proposals, schema)', () => {
    const doc = makeDoc();
    expect(getMeta(doc)).toBeInstanceOf(Y.Map);
    expect(getOperators(doc)).toBeInstanceOf(Y.Map);
    expect(getDevices(doc)).toBeInstanceOf(Y.Map);
    expect(getRouting(doc)).toBeInstanceOf(Y.Map);
    expect(getCuelists(doc)).toBeInstanceOf(Y.Array);
    expect(getProposals(doc)).toBeInstanceOf(Y.Array);
    expect(getSchema(doc)).toBeInstanceOf(Y.Map);
  });

  it('meta.mode is rehearsal on fresh doc', () => {
    const doc = makeDoc();
    expect(getMeta(doc).get('mode')).toBe('rehearsal');
  });

  it('meta.show_id is a valid UUIDv7 (36 chars)', () => {
    const doc = makeDoc();
    const showId = getMeta(doc).get('show_id') as string;
    expect(showId).toMatch(uuidv7Pattern);
  });

  it('meta.active_cuelist_id points at the seeded default cuelist', () => {
    const doc = makeDoc();
    const meta = getMeta(doc);
    const activeCuelistId = meta.get('active_cuelist_id') as string;
    const cuelists = getCuelists(doc).toArray();
    expect(cuelists).toHaveLength(1);
    expect(cuelists[0].get('id')).toBe(activeCuelistId);
    expect(cuelists[0].get('name')).toBe('Main Show');
  });

  it('encodes + decodes round-trip: meta is identical after apply', () => {
    const doc1 = makeDoc();
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
    const m1 = getMeta(doc1).toJSON();
    const m2 = getMeta(doc2).toJSON();
    expect(m1).toEqual(m2);
  });

  it('schema root has format_version and schema_version', () => {
    const doc = makeDoc();
    const schema = getSchema(doc);
    expect(schema.get('format_version')).toBe('1.0');
    expect(schema.get('schema_version')).toBe(1);
  });

  it('proposals array starts empty', () => {
    const doc = makeDoc();
    expect(getProposals(doc).length).toBe(0);
  });

  it('setMode transitions meta.mode', () => {
    const doc = makeDoc();
    setMode(doc, 'show');
    expect(getMeta(doc).get('mode')).toBe('show');
    setMode(doc, 'rehearsal');
    expect(getMeta(doc).get('mode')).toBe('rehearsal');
  });

  it('setMetaField updates arbitrary meta field', () => {
    const doc = makeDoc();
    setMetaField(doc, 'title', 'New Title');
    expect(getMeta(doc).get('title')).toBe('New Title');
  });
});
