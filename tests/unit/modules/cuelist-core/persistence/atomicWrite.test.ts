import { describe, it, expect, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile, cleanOrphanTmps } from '../../../../../src/modules/cuelist-core/src/persistence/atomicWrite.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-atomic-test-'));
}

describe('atomicWriteFile', () => {
  let tmpDirs: string[] = [];
  afterEach(async () => {
    for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    tmpDirs = [];
    vi.restoreAllMocks();
  });

  async function makeTmp(): Promise<string> {
    const d = await makeTmpDir();
    tmpDirs.push(d);
    return d;
  }

  it('writes content to target path', async () => {
    const dir = await makeTmp();
    const target = path.join(dir, 'file.txt');
    await atomicWriteFile(target, 'hello world');
    expect(await fs.readFile(target, 'utf8')).toBe('hello world');
  });

  it('writes Buffer content correctly', async () => {
    const dir = await makeTmp();
    const target = path.join(dir, 'buf.bin');
    const data = Buffer.from([0x01, 0x02, 0x03]);
    await atomicWriteFile(target, data);
    const read = await fs.readFile(target);
    expect(read).toEqual(data);
  });

  it('no .tmp file remains after successful write', async () => {
    const dir = await makeTmp();
    const target = path.join(dir, 'file.txt');
    await atomicWriteFile(target, 'data');
    const entries = await fs.readdir(dir);
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });

  it('overwrites existing target atomically', async () => {
    const dir = await makeTmp();
    const target = path.join(dir, 'file.txt');
    await atomicWriteFile(target, 'original');
    await atomicWriteFile(target, 'updated');
    expect(await fs.readFile(target, 'utf8')).toBe('updated');
  });

  it('preserves original when write fails mid-way (simulated)', async () => {
    const dir = await makeTmp();
    const target = path.join(dir, 'file.txt');
    await atomicWriteFile(target, 'original');

    // Simulate writeFile failure by mocking fs.open to fail on tmp path write
    const origOpen = fs.open;
    let callCount = 0;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      callCount++;
      if (callCount === 1) {
        // Return a handle whose writeFile throws
        const fd = await (origOpen as typeof fs.open)(...(args as Parameters<typeof fs.open>));
        return {
          ...fd,
          writeFile: async () => { throw new Error('simulated write failure'); },
          close: async () => fd.close(),
          sync: async () => fd.sync(),
        } as unknown as Awaited<ReturnType<typeof fs.open>>;
      }
      return (origOpen as typeof fs.open)(...(args as Parameters<typeof fs.open>));
    });

    await expect(atomicWriteFile(target, 'new data')).rejects.toThrow('simulated write failure');

    // Original file should still be intact
    const content = await fs.readFile(target, 'utf8');
    expect(content).toBe('original');
  });
});

describe('cleanOrphanTmps', () => {
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

  it('removes .tmp files older than 5 minutes', async () => {
    const dir = await makeTmp();
    const tmp = path.join(dir, 'old.tmp');
    await fs.writeFile(tmp, 'stale');

    // Back-date the file's mtime by 6 minutes
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    await fs.utimes(tmp, sixMinAgo, sixMinAgo);

    await cleanOrphanTmps(dir);
    await expect(fs.stat(tmp)).rejects.toThrow();
  });

  it('leaves .tmp files younger than 5 minutes alone', async () => {
    const dir = await makeTmp();
    const tmp = path.join(dir, 'recent.tmp');
    await fs.writeFile(tmp, 'in-progress');
    // mtime is now — well within 5-minute window
    await cleanOrphanTmps(dir);
    expect(await fs.readFile(tmp, 'utf8')).toBe('in-progress');
  });

  it('does not touch non-.tmp files', async () => {
    const dir = await makeTmp();
    const file = path.join(dir, 'data.json');
    await fs.writeFile(file, '{}');
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    await fs.utimes(file, sixMinAgo, sixMinAgo);

    await cleanOrphanTmps(dir);
    expect(await fs.readFile(file, 'utf8')).toBe('{}');
  });

  it('handles non-existent directory gracefully', async () => {
    await expect(cleanOrphanTmps('/tmp/showx-nonexistent-999')).resolves.toBeUndefined();
  });
});
