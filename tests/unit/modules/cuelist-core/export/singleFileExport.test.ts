import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { exportSingleFile, importSingleFile } from '../../../../../src/modules/cuelist-core/src/export/singleFileExport.js';
import { saveShowxPackage } from '../../../../../src/modules/cuelist-core/src/persistence/showxPackage.js';
import { initShowDoc, getMeta } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { addPayload } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import type { SingleFileEnvelope } from '../../../../../src/modules/cuelist-core/src/export/singleFileExport.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-sfe-test-'));
}

function buildTestDoc(title = 'Single File Test Show'): Y.Doc {
  const doc = initShowDoc({
    title,
    venue: 'Test Venue',
    date: '2026-06-17',
    created_by: 'op_test',
  });
  const meta = getMeta(doc);
  const cuelistId = meta.get('active_cuelist_id') as string;

  const cueId = addCue(doc, cuelistId, {
    label: 'Q 1',
    description: 'Opening cue',
    department: ['LX'],
    created_by: 'op_test',
  });
  addPayload(doc, cuelistId, cueId, {
    type: 'osc',
    tag: null,
    note: 'OSC fire',
    device_id: 'dev_test',
    address: '/cue/1',
    args: [],
  });

  return doc;
}

describe('exportSingleFile', () => {
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

  it('produces valid JSON with correct envelope fields', async () => {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    const doc = buildTestDoc();

    await exportSingleFile(doc, target);

    const text = await fs.readFile(target, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    expect(envelope.format).toBe('showx-single-file');
    expect(envelope.version).toBe('1.0');
    expect(typeof envelope.exported_at).toBe('string');
    expect(typeof envelope.source).toBe('string');
    expect(envelope).toHaveProperty('show');
    expect(envelope).toHaveProperty('cuelists');
    expect(envelope).toHaveProperty('doc_yjs_base64');
  });

  it('doc_yjs_base64 decodes to valid Yjs state update', async () => {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    const doc = buildTestDoc();
    const originalUpdate = Y.encodeStateAsUpdate(doc);

    await exportSingleFile(doc, target);

    const text = await fs.readFile(target, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    const decoded = Buffer.from(envelope.doc_yjs_base64, 'base64');
    // Must be same bytes as the original encoded state
    expect(Buffer.compare(Buffer.from(originalUpdate), decoded)).toBe(0);
  });

  it('show.meta.title in envelope matches Y.Doc meta', async () => {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    const doc = buildTestDoc('My Test Show');

    await exportSingleFile(doc, target);

    const text = await fs.readFile(target, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    const showMeta = (envelope.show as { meta: { title: string } }).meta;
    expect(showMeta.title).toBe('My Test Show');
  });

  it('returns ExportResult with correct path and positive size_bytes', async () => {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    const doc = buildTestDoc();

    const result = await exportSingleFile(doc, target);

    expect(result.path).toBe(target);
    expect(result.size_bytes).toBeGreaterThan(0);
  });

  it('size_bytes matches actual file size', async () => {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    const doc = buildTestDoc();

    const result = await exportSingleFile(doc, target);
    const stat = await fs.stat(target);

    expect(result.size_bytes).toBe(stat.size);
  });

  it('includeHistory=true + currentPkgPath: history embedded in envelope', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'show.showx.json');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    await exportSingleFile(doc, dst, { includeHistory: true }, src);

    const text = await fs.readFile(dst, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    expect(Array.isArray(envelope.history)).toBe(true);
    expect(envelope.history!.length).toBeGreaterThan(0);
  });

  it('includeHistory not set: history absent from envelope', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'show.showx.json');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    await exportSingleFile(doc, dst, {}, src);

    const text = await fs.readFile(dst, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    expect(envelope.history).toBeUndefined();
  });

  it('includeSnapshots=true + currentPkgPath with snap file: snapshots embedded', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'show.showx.json');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    await fs.writeFile(path.join(src, 'snapshots', 'snap_001.json'), '{"snap":1}', 'utf8');

    await exportSingleFile(doc, dst, { includeSnapshots: true }, src);

    const text = await fs.readFile(dst, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    expect(Array.isArray(envelope.snapshots)).toBe(true);
    expect(envelope.snapshots!.find((s) => s.name === 'snap_001.json')).toBeDefined();
  });

  it('includeMedia=true + currentPkgPath with media file: media embedded as base64', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'show.showx.json');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    const mediaContent = Buffer.from('fake-mp3-bytes-for-testing');
    await fs.writeFile(path.join(src, 'media', 'fx.mp3'), mediaContent);

    await exportSingleFile(doc, dst, { includeMedia: true }, src);

    const text = await fs.readFile(dst, 'utf8');
    const envelope = JSON.parse(text) as SingleFileEnvelope;
    expect(Array.isArray(envelope.media)).toBe(true);
    const mediaEntry = envelope.media!.find((m) => m.name === 'fx.mp3');
    expect(mediaEntry).toBeDefined();
    const decoded = Buffer.from(mediaEntry!.content_base64, 'base64');
    expect(Buffer.compare(decoded, mediaContent)).toBe(0);
  });

  it('media >10MB logs a console.warn', async () => {
    const src = await makeTmp();
    const dst = path.join(await makeTmp(), 'show.showx.json');
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    // Write a 12MB file (base64 of 12MB binary ~16MB — above threshold)
    await fs.writeFile(path.join(src, 'media', 'big.bin'), Buffer.alloc(12 * 1024 * 1024, 0xab));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await exportSingleFile(doc, dst, { includeMedia: true }, src);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('media payload >10MB'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('importSingleFile', () => {
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

  async function exportAndRead(doc: Y.Doc, opts = {}): Promise<string> {
    const tmp = await makeTmp();
    const target = path.join(tmp, 'show.showx.json');
    await exportSingleFile(doc, target, opts);
    return fs.readFile(target, 'utf8');
  }

  it('reconstructs Y.Doc with same show_id as source', async () => {
    const doc = buildTestDoc();
    const sourceShowId = getMeta(doc).get('show_id') as string;

    const jsonText = await exportAndRead(doc);
    const { doc: imported } = await importSingleFile(jsonText);

    expect(getMeta(imported).get('show_id')).toBe(sourceShowId);
  });

  it('reconstructed doc has same title as source', async () => {
    const doc = buildTestDoc('Import Round-Trip Test');

    const jsonText = await exportAndRead(doc);
    const { doc: imported } = await importSingleFile(jsonText);

    expect(getMeta(imported).get('title')).toBe('Import Round-Trip Test');
  });

  it('import + write to .showx: directory created with required files', async () => {
    const doc = buildTestDoc();
    const jsonText = await exportAndRead(doc);
    const pkgDir = path.join(await makeTmp(), 'imported.showx');

    await importSingleFile(jsonText, pkgDir);

    const entries = await fs.readdir(pkgDir);
    expect(entries).toContain('show.json');
    expect(entries).toContain('doc.yjs');
    expect(entries).toContain('cuelists');
  });

  it('import with embedded history: history.jsonl written to package', async () => {
    const src = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });

    const tmp = await makeTmp();
    const exportTarget = path.join(tmp, 'show.showx.json');
    await exportSingleFile(doc, exportTarget, { includeHistory: true }, src);
    const jsonText = await fs.readFile(exportTarget, 'utf8');

    const pkgDir = path.join(await makeTmp(), 'imported-hist.showx');
    await importSingleFile(jsonText, pkgDir);

    const histPath = path.join(pkgDir, 'history.jsonl');
    const histText = await fs.readFile(histPath, 'utf8');
    expect(histText.trim().length).toBeGreaterThan(0);
    // Verify lines are valid JSON
    for (const line of histText.trim().split('\n').filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('import with embedded snapshots: snapshots dir populated', async () => {
    const src = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    await fs.writeFile(path.join(src, 'snapshots', 'snap_001.json'), '{"snap":1}', 'utf8');

    const tmp = await makeTmp();
    const exportTarget = path.join(tmp, 'show.showx.json');
    await exportSingleFile(doc, exportTarget, { includeSnapshots: true }, src);
    const jsonText = await fs.readFile(exportTarget, 'utf8');

    const pkgDir = path.join(await makeTmp(), 'imported-snap.showx');
    await importSingleFile(jsonText, pkgDir);

    const snapEntries = await fs.readdir(path.join(pkgDir, 'snapshots'));
    expect(snapEntries).toContain('snap_001.json');
  });

  it('import with embedded media: media files restored byte-identical', async () => {
    const src = await makeTmp();
    const doc = buildTestDoc();
    await saveShowxPackage(doc, src, { reason: 'explicit' });
    const originalMedia = Buffer.from('original-media-content-bytes');
    await fs.writeFile(path.join(src, 'media', 'sound.wav'), originalMedia);

    const tmp = await makeTmp();
    const exportTarget = path.join(tmp, 'show.showx.json');
    await exportSingleFile(doc, exportTarget, { includeMedia: true }, src);
    const jsonText = await fs.readFile(exportTarget, 'utf8');

    const pkgDir = path.join(await makeTmp(), 'imported-media.showx');
    await importSingleFile(jsonText, pkgDir);

    const restored = await fs.readFile(path.join(pkgDir, 'media', 'sound.wav'));
    expect(Buffer.compare(restored, originalMedia)).toBe(0);
  });

  it('roundtrip: exported doc Yjs state matches re-encoded imported doc', async () => {
    const doc = buildTestDoc('Roundtrip Show');
    const originalState = Y.encodeStateAsUpdate(doc);

    const jsonText = await exportAndRead(doc);
    const { doc: imported } = await importSingleFile(jsonText);
    const importedState = Y.encodeStateAsUpdate(imported);

    // States should match — same CRDT updates applied
    expect(Buffer.compare(Buffer.from(originalState), Buffer.from(importedState))).toBe(0);
  });

  it('roundtrip: import + resave → doc metadata identical to original', async () => {
    const doc = buildTestDoc('Full Roundtrip');
    const sourceShowId = getMeta(doc).get('show_id') as string;

    const jsonText = await exportAndRead(doc);
    const pkgDir = path.join(await makeTmp(), 'rt.showx');
    const { doc: imported } = await importSingleFile(jsonText, pkgDir);

    // Verify pkg was written and doc matches
    const { openShowxPackage } = await import(
      '../../../../../src/modules/cuelist-core/src/persistence/showxPackage.js'
    );
    const { doc: reopened } = await openShowxPackage(pkgDir);
    expect(getMeta(reopened).get('show_id')).toBe(sourceShowId);
    expect(getMeta(imported).get('show_id')).toBe(sourceShowId);
  });

  it('wrong format field → throws "not a ShowX single-file export"', async () => {
    const badJson = JSON.stringify({ format: 'unknown-format', version: '1.0', doc_yjs_base64: '' });
    await expect(importSingleFile(badJson)).rejects.toThrow('not a ShowX single-file export');
  });

  it('wrong version field → throws "unsupported single-file version"', async () => {
    const badJson = JSON.stringify({ format: 'showx-single-file', version: '9.9', doc_yjs_base64: '' });
    await expect(importSingleFile(badJson)).rejects.toThrow('unsupported single-file version 9.9');
  });
});
