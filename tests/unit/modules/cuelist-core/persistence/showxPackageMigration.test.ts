import { describe, it, expect, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';

// ── Dummy migration injection seam ────────────────────────────────────────────
// Controls which dummy migrations are active per-test via a mutable array.
// vi.mock is hoisted so the factory runs before imports resolve; we access
// the shared `activeMigrations` ref through module closure.

const DUMMY_ID = 'test-2099-01-01-dummy-migration';

interface TestMigration {
  id: string;
  up: (input: { show: Record<string, unknown>; cuelists: unknown[] }) => Promise<{
    show: Record<string, unknown>;
    cuelists: unknown[];
  }>;
}

const activeMigrations: TestMigration[] = [];

vi.mock('../../../../../src/modules/cuelist-core/src/migrations/index.js', () => ({
  runMigrations: async (input: { show: Record<string, unknown>; cuelists: unknown[] }) => {
    const alreadyApplied = new Set(
      (input.show['applied_migrations'] as string[] | undefined) ?? [],
    );
    let current = input;
    const applied: string[] = [];

    for (const m of activeMigrations) {
      if (alreadyApplied.has(m.id)) continue;
      current = await m.up(current);
      applied.push(m.id);
    }

    return { migrated: current, applied };
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-migration-test-'));
}

// ── Imports that depend on the mock being active ──────────────────────────────

const { openShowxPackage, saveShowxPackage } = await import(
  '../../../../../src/modules/cuelist-core/src/persistence/showxPackage.js'
);
const { initShowDoc, getMeta } = await import(
  '../../../../../src/modules/cuelist-core/src/document/show.js'
);
const { addCue } = await import(
  '../../../../../src/modules/cuelist-core/src/document/cue.js'
);

function buildSimpleDoc(): Y.Doc {
  const doc = initShowDoc({
    title: 'Migration Test Show',
    venue: 'Test Venue',
    date: '2026-06-17',
    created_by: 'op_test',
  });
  const cuelistId = getMeta(doc).get('active_cuelist_id') as string;
  addCue(doc, cuelistId, { label: 'Q 1', description: '', department: ['LX'], created_by: 'op_test' });
  return doc;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Migration — Y.Doc rebuild when applied.length > 0', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    activeMigrations.length = 0; // clear between tests
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('migration mutates Y.Doc — change is visible on the live doc, not just on disk', async () => {
    const dir = await makeTmp();

    // 1. Save a fresh doc (no migrations applied yet)
    const doc0 = buildSimpleDoc();
    await saveShowxPackage(doc0, dir, { reason: 'explicit' });

    // 2. Register the dummy migration and reopen
    activeMigrations.push({
      id: DUMMY_ID,
      up: async (input) => ({
        show: {
          ...input.show,
          applied_migrations: [
            ...((input.show['applied_migrations'] as string[]) ?? []),
            DUMMY_ID,
          ],
          meta: {
            ...(input.show['meta'] as Record<string, unknown>),
            title: ((input.show['meta'] as Record<string, unknown>)['title'] as string) + ' [migrated]',
          },
        },
        cuelists: input.cuelists,
      }),
    });

    const { doc: doc1, appliedMigrations } = await openShowxPackage(dir);

    // The return value reports the migration as applied
    expect(appliedMigrations).toContain(DUMMY_ID);

    // The live Y.Doc reflects the migrated state — title mutation is present
    const title = getMeta(doc1).get('title') as string;
    expect(title).toBe('Migration Test Show [migrated]');

    // applied_migrations in the Y.Doc schema map is also updated
    const schemaApplied = doc1.getMap('schema').get('applied_migrations') as string[];
    expect(schemaApplied).toContain(DUMMY_ID);
  });

  it('migration is idempotent — second open does not re-apply (no applied migrations returned)', async () => {
    const dir = await makeTmp();

    // 1. Save fresh doc
    const doc0 = buildSimpleDoc();
    await saveShowxPackage(doc0, dir, { reason: 'explicit' });

    // 2. First open — migration runs
    activeMigrations.push({
      id: DUMMY_ID,
      up: async (input) => ({
        show: {
          ...input.show,
          applied_migrations: [
            ...((input.show['applied_migrations'] as string[]) ?? []),
            DUMMY_ID,
          ],
          meta: {
            ...(input.show['meta'] as Record<string, unknown>),
            title: ((input.show['meta'] as Record<string, unknown>)['title'] as string) + ' [migrated]',
          },
        },
        cuelists: input.cuelists,
      }),
    });

    const { appliedMigrations: first } = await openShowxPackage(dir);
    expect(first).toContain(DUMMY_ID);

    // 3. Second open — same migration still in activeMigrations, but already recorded on disk
    const { appliedMigrations: second } = await openShowxPackage(dir);
    expect(second).toHaveLength(0); // migration is a no-op this time
  });

  it('when no migrations apply, doc.yjs is preferred and recoveredFromJson is false', async () => {
    const dir = await makeTmp();
    const doc0 = buildSimpleDoc();
    await saveShowxPackage(doc0, dir, { reason: 'explicit' });

    // No migrations registered — activeMigrations is empty
    const { recoveredFromJson, appliedMigrations } = await openShowxPackage(dir);
    expect(appliedMigrations).toHaveLength(0);
    expect(recoveredFromJson).toBe(false);
  });
});
