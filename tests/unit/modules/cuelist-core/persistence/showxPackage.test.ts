import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import {
  openShowxPackage,
  saveShowxPackage,
  UnsupportedFormatError,
} from '../../../../../src/modules/cuelist-core/src/persistence/showxPackage.js';
import { initShowDoc, getMeta, getCuelists } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { docToProjections } from '../../../../../src/modules/cuelist-core/src/persistence/projections.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-pkg-test-'));
}

// Helper: build a fresh show doc with 3 cues of mixed payloads
function buildTestDoc(): Y.Doc {
  const doc = initShowDoc({
    title: 'Test Show',
    venue: 'Test Venue',
    date: '2026-06-17',
    created_by: 'op_test',
  });
  const meta = getMeta(doc);
  const cuelistId = meta.get('active_cuelist_id') as string;

  const cue1Id = addCue(doc, cuelistId, {
    label: 'Q 1',
    description: 'First cue',
    department: ['LX'],
    created_by: 'op_test',
  });
  addPayload(doc, cuelistId, cue1Id, {
    type: 'lx_ref',
    tag: null,
    note: 'Eos Q 1',
    device_id: 'dev_eos',
    cue_list: 1,
    cue_number: 1,
  });

  const cue2Id = addCue(doc, cuelistId, {
    label: 'Q 2',
    description: 'Second cue',
    department: ['SX'],
    created_by: 'op_test',
  });
  addPayload(doc, cuelistId, cue2Id, {
    type: 'osc',
    tag: null,
    note: 'QLab cue 2',
    device_id: 'dev_qlab',
    address: '/cue/q2/start',
    args: [],
  });

  const cue3Id = addCue(doc, cuelistId, {
    label: 'Q 3',
    description: 'Third cue',
    department: ['LX', 'SX'],
    created_by: 'op_test',
  });
  addPayload(doc, cuelistId, cue3Id, {
    type: 'wait',
    tag: null,
    note: 'pause 2s',
    duration_ms: 2000,
  });

  return doc;
}

describe('Round-trip', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('save then open: meta.show_id is preserved', async () => {
    const dir = await makeTmp();
    const doc1 = buildTestDoc();
    const origShowId = getMeta(doc1).get('show_id') as string;
    await saveShowxPackage(doc1, dir, { reason: 'explicit' });

    const { doc: doc2 } = await openShowxPackage(dir);
    expect(getMeta(doc2).get('show_id')).toBe(origShowId);
  });

  it('save then open: cuelist count matches', async () => {
    const dir = await makeTmp();
    const doc1 = buildTestDoc();
    await saveShowxPackage(doc1, dir, { reason: 'explicit' });

    const { doc: doc2 } = await openShowxPackage(dir);
    expect(getCuelists(doc2).length).toBe(1);
  });

  it('save then open: cue count matches (3 cues)', async () => {
    const dir = await makeTmp();
    const doc1 = buildTestDoc();
    await saveShowxPackage(doc1, dir, { reason: 'explicit' });

    const { doc: doc2 } = await openShowxPackage(dir);
    const cl = getCuelists(doc2).get(0);
    const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray();
    expect(cues).toHaveLength(3);
  });

  it('save then open: payload counts match per cue', async () => {
    const dir = await makeTmp();
    const doc1 = buildTestDoc();
    await saveShowxPackage(doc1, dir, { reason: 'explicit' });

    const { doc: doc2 } = await openShowxPackage(dir);
    const cl = getCuelists(doc2).get(0);
    const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray();

    for (const cue of cues) {
      const payloads = (cue.get('payloads') as Y.Array<Y.Map<unknown>>).toArray();
      expect(payloads.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('save then open: recoveredFromJson is false when doc.yjs is present', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const { recoveredFromJson } = await openShowxPackage(dir);
    expect(recoveredFromJson).toBe(false);
  });

  it('save then open: M001_add_cue_number runs on first open of a pre-migration doc', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const { appliedMigrations } = await openShowxPackage(dir);
    expect(appliedMigrations).toHaveLength(1);
    expect(appliedMigrations).toContain('M001_add_cue_number');
  });

  it('doc.yjs binary is present and non-empty after save', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const stat = await fs.stat(path.join(dir, 'doc.yjs'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('show.json matches expected schema fields', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const raw = await fs.readFile(path.join(dir, 'show.json'), 'utf8');
    const json = JSON.parse(raw);
    expect(json).toHaveProperty('format_version', '1.0');
    expect(json).toHaveProperty('schema_version', 1);
    expect(json).toHaveProperty('show_id');
    expect(json).toHaveProperty('meta');
    expect(json).toHaveProperty('cuelist_index');
    expect(json.cuelist_index).toHaveLength(1);
  });

  it('cuelist JSON file exists and has correct cue count', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const showJson = JSON.parse(await fs.readFile(path.join(dir, 'show.json'), 'utf8'));
    const clFile = path.join(dir, showJson.cuelist_index[0].file);
    const clJson = JSON.parse(await fs.readFile(clFile, 'utf8'));
    expect(clJson.cues).toHaveLength(3);
  });

  it('directory structure is created on first save', async () => {
    const dir = await makeTmp();
    const pkgDir = path.join(dir, 'my-show.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, pkgDir, { reason: 'explicit' });

    const dirs = ['cuelists', 'snapshots', 'media'];
    for (const d of dirs) {
      const stat = await fs.stat(path.join(pkgDir, d));
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it('Info.plist is written with correct UTI', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const plist = await fs.readFile(path.join(dir, 'Info.plist'), 'utf8');
    expect(plist).toContain('cz.xlab.showx.package');
  });

  it('history.jsonl contains a save event after save', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const hist = await fs.readFile(path.join(dir, 'history.jsonl'), 'utf8');
    const events = hist.trim().split('\n').map((l) => JSON.parse(l));
    const saveEvent = events.find((e: { kind: string }) => e.kind === 'save');
    expect(saveEvent).toBeDefined();
    expect(saveEvent.reason).toBe('explicit');
  });
});

describe('Recovery', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('missing doc.yjs → open succeeds with recoveredFromJson=true', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    await fs.unlink(path.join(dir, 'doc.yjs'));

    const { doc: doc2, recoveredFromJson } = await openShowxPackage(dir);
    expect(recoveredFromJson).toBe(true);
    expect(getMeta(doc2).get('show_id')).toBe(getMeta(doc).get('show_id'));
  });

  it('missing doc.yjs → resave produces non-empty doc.yjs', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });
    await fs.unlink(path.join(dir, 'doc.yjs'));

    const { doc: doc2, recoveredFromJson } = await openShowxPackage(dir);
    expect(recoveredFromJson).toBe(true);

    await saveShowxPackage(doc2, dir, { reason: 'explicit' });
    const stat = await fs.stat(path.join(dir, 'doc.yjs'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('truncated doc.yjs (0 bytes) → open falls back to JSON', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    await fs.writeFile(path.join(dir, 'doc.yjs'), Buffer.alloc(0));

    const { recoveredFromJson } = await openShowxPackage(dir);
    expect(recoveredFromJson).toBe(true);
  });

  it('corrupted doc.yjs (last 100 bytes overwritten) → open falls back to JSON', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const yjsPath = path.join(dir, 'doc.yjs');
    const buf = await fs.readFile(yjsPath);
    if (buf.length > 100) {
      buf.fill(0xff, buf.length - 100);
      await fs.writeFile(yjsPath, buf);
    }

    const { recoveredFromJson } = await openShowxPackage(dir);
    expect(recoveredFromJson).toBe(true);
  });

  it('recovery → cue count is preserved from JSON', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });
    await fs.unlink(path.join(dir, 'doc.yjs'));

    const { doc: doc2 } = await openShowxPackage(dir);
    const cl = getCuelists(doc2).get(0);
    const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray();
    expect(cues).toHaveLength(3);
  });
});

describe('JSON projections', () => {
  it('docToProjections produces show.json with required top-level fields', () => {
    const doc = buildTestDoc();
    const { show } = docToProjections(doc);

    expect(show).toHaveProperty('$schema');
    expect(show).toHaveProperty('format_version', '1.0');
    expect(show).toHaveProperty('schema_version', 1);
    expect(show).toHaveProperty('show_id');
    expect(show).toHaveProperty('meta');
    expect(show).toHaveProperty('cuelist_index');
    expect(show).toHaveProperty('snapshot_index');
    expect(show.snapshot_index).toHaveLength(0);
    expect(show).toHaveProperty('applied_migrations');
  });

  it('docToProjections cuelist_index contains one entry per cuelist', () => {
    const doc = buildTestDoc();
    const { show } = docToProjections(doc);
    expect(show.cuelist_index).toHaveLength(1);
    expect(show.cuelist_index[0]).toHaveProperty('file');
    expect(show.cuelist_index[0].file).toMatch(/^cuelists\/cl_/);
  });

  it('docToProjections cuelists record has matching cuelist data', () => {
    const doc = buildTestDoc();
    const { cuelists } = docToProjections(doc);
    const ids = Object.keys(cuelists);
    expect(ids).toHaveLength(1);
    const cl = cuelists[ids[0]];
    expect(cl).toHaveProperty('id');
    expect(cl).toHaveProperty('cues');
    expect(cl.cues).toHaveLength(3);
  });

  it('docToProjections cue payloads are serialized', () => {
    const doc = buildTestDoc();
    const { cuelists } = docToProjections(doc);
    const ids = Object.keys(cuelists);
    const cl = cuelists[ids[0]];

    const q1 = cl.cues.find((c) => c.label === 'Q 1');
    expect(q1?.payloads).toHaveLength(1);
    expect(q1?.payloads[0].type).toBe('lx_ref');
  });
});

describe('History.jsonl', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('appends a line per save', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'autosave' });
    await saveShowxPackage(doc, dir, { reason: 'explicit' });
    await saveShowxPackage(doc, dir, { reason: 'pre_close' });

    const hist = await fs.readFile(path.join(dir, 'history.jsonl'), 'utf8');
    const lines = hist.trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('rotation: exceeds maxBytes → history.1.jsonl.gz created and history.jsonl removed', async () => {
    const dir = await makeTmp();
    // Write a large fake history.jsonl directly
    const bigLine = JSON.stringify({ ts: new Date().toISOString(), kind: 'save', reason: 'test', by: 'system' });
    const content = (bigLine + '\n').repeat(500);
    await fs.writeFile(path.join(dir, 'history.jsonl'), content, 'utf8');

    // Backdate so age check passes (using maxAgeDays:1 won't help here — test size trigger)
    const { rotateHistoryIfNeeded } = await import(
      '../../../../../src/modules/cuelist-core/src/persistence/historyJsonl.js'
    );
    await rotateHistoryIfNeeded(dir, { maxBytes: 1000, maxAgeDays: 365 }); // 1 KB threshold, content is much bigger

    const entries = await fs.readdir(dir);
    expect(entries).toContain('history.1.jsonl.gz');
    expect(entries).not.toContain('history.jsonl');
  });

  it('rotation index increments past existing archives', async () => {
    const dir = await makeTmp();
    // Pre-create history.1.jsonl.gz and history.2.jsonl.gz
    await fs.writeFile(path.join(dir, 'history.1.jsonl.gz'), Buffer.alloc(1));
    await fs.writeFile(path.join(dir, 'history.2.jsonl.gz'), Buffer.alloc(1));

    const content = JSON.stringify({ ts: new Date().toISOString(), kind: 'save', reason: 'test', by: 'system' }) + '\n';
    await fs.writeFile(path.join(dir, 'history.jsonl'), content.repeat(100), 'utf8');

    const { rotateHistoryIfNeeded } = await import(
      '../../../../../src/modules/cuelist-core/src/persistence/historyJsonl.js'
    );
    await rotateHistoryIfNeeded(dir, { maxBytes: 100, maxAgeDays: 365 });

    const entries = await fs.readdir(dir);
    expect(entries).toContain('history.3.jsonl.gz');
  });
});

describe('Format version validation', () => {
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('format_version 2.0 throws UnsupportedFormatError', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    // Overwrite show.json with format_version 2.0
    const showJson = JSON.parse(await fs.readFile(path.join(dir, 'show.json'), 'utf8'));
    showJson.format_version = '2.0';
    await fs.writeFile(path.join(dir, 'show.json'), JSON.stringify(showJson, null, 2));

    await expect(openShowxPackage(dir)).rejects.toThrow(UnsupportedFormatError);
  });

  it('format_version 1.5 is accepted (minor version skew)', async () => {
    const dir = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, dir, { reason: 'explicit' });

    const showJson = JSON.parse(await fs.readFile(path.join(dir, 'show.json'), 'utf8'));
    showJson.format_version = '1.5';
    await fs.writeFile(path.join(dir, 'show.json'), JSON.stringify(showJson, null, 2));

    await expect(openShowxPackage(dir)).resolves.toBeDefined();
  });
});

describe('Sample fixture', () => {
  it('opens the sample-show.showx fixture from JSON projections', async () => {
    // This test file: tests/unit/modules/cuelist-core/persistence/showxPackage.test.ts
    // Fixture:        tests/fixtures/showx/sample-show.showx
    const thisFile = new URL(import.meta.url).pathname;
    const fixturePath = path.resolve(
      path.dirname(thisFile),
      '../../../../fixtures/showx/sample-show.showx',
    );

    // Copy to temp dir — openShowxPackage writes back when migrations run; must not mutate the fixture.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-fixture-sample-'));
    try {
      await fs.cp(fixturePath, tmpDir, { recursive: true });
      // fixture has no doc.yjs — should open via recovery (recoveredFromJson=true)
      const { doc, recoveredFromJson } = await openShowxPackage(tmpDir);
      expect(recoveredFromJson).toBe(true);
      expect(getMeta(doc).get('title')).toBe('Sample Show');
      const cl = getCuelists(doc).get(0);
      expect((cl.get('cues') as Y.Array<Y.Map<unknown>>).length).toBe(3);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
