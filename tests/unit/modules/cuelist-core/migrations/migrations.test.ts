import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as Y from 'yjs';
import { runMigrations } from '../../../../../src/modules/cuelist-core/src/migrations/index.js';
import type { MigrationInput } from '../../../../../src/modules/cuelist-core/src/migrations/index.js';
import type { ShowJson, CuelistJson } from '../../../../../src/modules/cuelist-core/src/persistence/projections.js';
import {
  updateCueFields,
  addCue,
  makeCueMap,
} from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { ValidationError } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import {
  initShowDoc,
  getMeta,
  getCuelist,
  getCues,
} from '../../../../../src/modules/cuelist-core/src/document/show.js';

const FIXTURE_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../../fixtures/showx/sample-show.showx',
);

async function loadFixture(): Promise<MigrationInput> {
  const showJson = JSON.parse(
    await fs.readFile(path.join(FIXTURE_DIR, 'show.json'), 'utf8'),
  ) as ShowJson;

  const cuelists: CuelistJson[] = [];
  for (const entry of showJson.cuelist_index) {
    const raw = await fs.readFile(path.join(FIXTURE_DIR, entry.file), 'utf8');
    cuelists.push(JSON.parse(raw) as CuelistJson);
  }

  return { show: showJson, cuelists };
}

describe('runMigrations', () => {
  it('M001 adds cue_number=null to all cues in fixture show', async () => {
    const input = await loadFixture();
    const { migrated, applied } = await runMigrations(input);

    expect(applied).toContain('M001_add_cue_number');

    for (const cl of migrated.cuelists) {
      for (const cue of cl.cues) {
        expect(cue.cue_number).toBe(null);
      }
    }
  });

  it('M001 bumps applied_migrations in migrated show', async () => {
    const input = await loadFixture();
    const { migrated } = await runMigrations(input);

    expect(migrated.show.applied_migrations).toContain('M001_add_cue_number');
  });

  it('M001 does not re-run when already applied', async () => {
    const input = await loadFixture();
    const { migrated: first } = await runMigrations(input);
    const { applied: secondApplied } = await runMigrations(first);

    expect(secondApplied).toHaveLength(0);
  });

  it('M001 preserves existing cue_number values', async () => {
    const input = await loadFixture();
    const modified: MigrationInput = {
      ...input,
      cuelists: input.cuelists.map((cl, i) =>
        i === 0
          ? {
              ...cl,
              cues: cl.cues.map((c, j) =>
                j === 0 ? { ...c, cue_number: '1' } : c,
              ),
            }
          : cl,
      ),
    };

    const { migrated } = await runMigrations(modified);
    expect(migrated.cuelists[0].cues[0].cue_number).toBe('1');
  });
});

describe('cue_number updateCueFields', () => {
  function makeDocWithCuelist() {
    const doc = initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op' });
    const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
    return { doc, cuelistId };
  }

  it('rejects cue_number longer than 8 chars', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op' });
    expect(() => updateCueFields(doc, cuelistId, id, { cue_number: '123456789' }, 'op')).toThrow(ValidationError);
  });

  it('accepts cue_number of exactly 8 chars', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op' });
    expect(() => updateCueFields(doc, cuelistId, id, { cue_number: '12345678' }, 'op')).not.toThrow();
  });

  it('accepts null to clear cue_number', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op' });
    updateCueFields(doc, cuelistId, id, { cue_number: '5' }, 'op');
    expect(() => updateCueFields(doc, cuelistId, id, { cue_number: null }, 'op')).not.toThrow();
    const cl = getCuelist(doc, cuelistId)!;
    const cue = getCues(cl).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('cue_number')).toBe(null);
  });

  it('trims cue_number on write', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op' });
    updateCueFields(doc, cuelistId, id, { cue_number: '  1A  ' }, 'op');
    const cl = getCuelist(doc, cuelistId)!;
    const cue = getCues(cl).toArray().find((c) => c.get('id') === id)!;
    expect(cue.get('cue_number')).toBe('1A');
  });

  it('allows duplicate cue_number across cues (no uniqueness constraint)', () => {
    const { doc, cuelistId } = makeDocWithCuelist();
    const id1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op' });
    const id2 = addCue(doc, cuelistId, { label: 'Q2', department: ['LX'], created_by: 'op' });
    expect(() => updateCueFields(doc, cuelistId, id1, { cue_number: '1' }, 'op')).not.toThrow();
    expect(() => updateCueFields(doc, cuelistId, id2, { cue_number: '1' }, 'op')).not.toThrow();
  });
});

describe('makeCueMap cue_number', () => {
  it('initializes cue_number to null', () => {
    const doc = new Y.Doc();
    const m = makeCueMap({ label: 'Q1', department: ['LX'], created_by: 'op' });
    doc.transact(() => doc.getArray('_t').push([m]));
    expect(m.get('cue_number')).toBe(null);
  });
});
