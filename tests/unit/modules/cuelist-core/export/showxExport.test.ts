import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { exportShowxPackage } from '../../../../../src/modules/cuelist-core/src/export/showxExport.js';
import { saveShowxPackage } from '../../../../../src/modules/cuelist-core/src/persistence/showxPackage.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-export-test-'));
}

function buildTestDoc(): Y.Doc {
  const doc = initShowDoc({
    title: 'Export Test Show',
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
    type: 'osc',
    tag: null,
    note: 'test OSC',
    device_id: 'dev_test',
    address: '/cue/1',
    args: [],
  });

  return doc;
}

describe('exportShowxPackage', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('exports to a new path — directory exists with expected files', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'exported.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    const result = await exportShowxPackage(doc, dst, {}, src);

    expect(result.path).toBe(dst);
    const entries = await fs.readdir(dst);
    expect(entries).toContain('show.json');
    expect(entries).toContain('doc.yjs');
    expect(entries).toContain('cuelists');
  });

  it('returns size_bytes > 0', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'exported.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    const result = await exportShowxPackage(doc, dst, {}, src);

    expect(result.size_bytes).toBeGreaterThan(0);
  });

  it('includeHistory=false: history.jsonl absent from target', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'nohist.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    await exportShowxPackage(doc, dst, { includeHistory: false }, src);

    const entries = await fs.readdir(dst);
    expect(entries).not.toContain('history.jsonl');
  });

  it('includeHistory not set: history.jsonl present in target', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'withhist.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    await exportShowxPackage(doc, dst, {}, src);

    const entries = await fs.readdir(dst);
    expect(entries).toContain('history.jsonl');
  });

  it('includeSnapshots=false: snapshots dir exists but is empty', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'nosnap.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    // Add a fake snapshot to source
    await fs.writeFile(path.join(src, 'snapshots', 'snap_001.json'), '{}', 'utf8');

    await exportShowxPackage(doc, dst, { includeSnapshots: false }, src);

    const snapEntries = await fs.readdir(path.join(dst, 'snapshots'));
    expect(snapEntries).toHaveLength(0);
  });

  it('includeMedia=false: media dir exists but is empty', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'nomedia.showx');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    // Add a fake media file to source
    await fs.writeFile(path.join(src, 'media', 'track.mp3'), Buffer.alloc(100));

    await exportShowxPackage(doc, dst, { includeMedia: false }, src);

    const mediaEntries = await fs.readdir(path.join(dst, 'media'));
    expect(mediaEntries).toHaveLength(0);
  });

  it('throws when target path matches current show path', async () => {
    const src = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    await expect(exportShowxPackage(doc, src, {}, src)).rejects.toThrow(
      /collides with current show/,
    );
  });
});
