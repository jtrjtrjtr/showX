import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCuelist, getCuelist } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { writeSnapshot } from '../../../../../src/modules/cuelist-core/src/mode/snapshot.js';

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SNAP_FILE_PATTERN = /^snap_[0-9a-f-]{36}_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/;

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
  tmpDirs = [];
});

async function makeTmpPkg(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-snap-test-'));
  tmpDirs.push(d);
  return d;
}

function makeDocWithCue() {
  const doc = initShowDoc({ title: 'Snap Show', venue: null, date: null, created_by: 'op1' });
  const cuelistId = (doc.getMap('meta').get('active_cuelist_id') as string);
  const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'op1' });
  addPayload(doc, cuelistId, cueId, {
    type: 'osc',
    device_id: 'd1',
    address: '/go',
    args: [],
    tag: null,
    note: '',
  });
  return { doc, cuelistId, cueId };
}

describe('writeSnapshot', () => {
  it('writes file with correct name pattern', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    const { snapshotId, filePath } = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    expect(snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(path.basename(filePath)).toMatch(SNAP_FILE_PATTERN);
    const exists = await fs.stat(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('snapshot JSON contains cuelist with nested cues and payloads', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId, cueId } = makeDocWithCue();
    const { filePath } = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    const raw = await fs.readFile(filePath, 'utf8');
    const snap = JSON.parse(raw) as Record<string, unknown>;

    expect(snap.cuelist_id).toBe(cuelistId);
    expect(snap.by).toBe('op1');

    const cuelist = snap.cuelist as Record<string, unknown>;
    const cues = cuelist.cues as Array<Record<string, unknown>>;
    expect(cues).toHaveLength(1);
    expect(cues[0].id).toBe(cueId);

    const payloads = cues[0].payloads as Array<Record<string, unknown>>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].type).toBe('osc');
  });

  it('taken_at is ISO 8601', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    const { filePath } = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    const snap = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(snap.taken_at as string).toMatch(ISO_PATTERN);
  });

  it('snapshot_id in file matches returned id', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    const { snapshotId, filePath } = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    const snap = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
    expect(snap.snapshot_id).toBe(snapshotId);
  });

  it('produces new file on each call (idempotent structure, unique id+name)', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    const r1 = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');
    const r2 = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    expect(r1.snapshotId).not.toBe(r2.snapshotId);
    expect(r1.filePath).not.toBe(r2.filePath);

    const files = await fs.readdir(path.join(pkgPath, 'snapshots'));
    expect(files).toHaveLength(2);
  });

  it('no .tmp file remains after successful write', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    const { filePath } = await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    const tmpExists = await fs.stat(`${filePath}.tmp`).then(() => true).catch(() => false);
    expect(tmpExists).toBe(false);
  });

  it('creates snapshots/ dir if it does not exist', async () => {
    const pkgPath = await makeTmpPkg();
    const { doc, cuelistId } = makeDocWithCue();
    await writeSnapshot(doc, cuelistId, pkgPath, 'op1');

    const dirExists = await fs.stat(path.join(pkgPath, 'snapshots')).then(() => true).catch(() => false);
    expect(dirExists).toBe(true);
  });

  it('throws if cuelist id is not found', async () => {
    const pkgPath = await makeTmpPkg();
    const doc = initShowDoc({ title: 'Empty', venue: null, date: null, created_by: 'op1' });
    await expect(writeSnapshot(doc, 'nonexistent-id', pkgPath, 'op1')).rejects.toThrow('not found');
  });
});
