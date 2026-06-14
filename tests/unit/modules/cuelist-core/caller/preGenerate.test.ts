import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { setCueCallerLines } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import {
  preGenerateCallerAudio,
  type TtsInterface,
  type CallerManifest,
} from '../../../../../src/modules/cuelist-core/src/caller/preGenerate.js';
import { transitionMode, type TransitionContext } from '../../../../../src/modules/cuelist-core/src/mode/transitions.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
  tmpDirs = [];
  vi.restoreAllMocks();
});

async function makePkg(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-pregen-'));
  tmpDirs.push(d);
  await fs.mkdir(path.join(d, 'media'), { recursive: true });
  await fs.mkdir(path.join(d, 'snapshots'), { recursive: true });
  return d;
}

function makeTts(enabled = true): TtsInterface & { synthesize: ReturnType<typeof vi.fn> } {
  const synthesize = vi.fn().mockImplementation(async (_text: string, _voiceId: string, outPath: string) => {
    await fs.writeFile(outPath, Buffer.from('fake-mp3'));
    return { path: outPath, durationSecs: 1.0 };
  });
  return { isEnabled: vi.fn().mockResolvedValue(enabled), synthesize };
}

function makeDoc() {
  const doc = initShowDoc({ title: 'PreGen Test', venue: null, date: null, created_by: 'sm1' });
  const cuelistId = doc.getMap('meta').get('active_cuelist_id') as string;
  return { doc, cuelistId };
}

async function readManifest(pkgPath: string): Promise<CallerManifest | null> {
  try {
    const raw = await fs.readFile(path.join(pkgPath, 'media', 'caller_manifest.json'), 'utf-8');
    return JSON.parse(raw) as CallerManifest;
  } catch {
    return null;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('preGenerateCallerAudio — no TTS key', () => {
  it('returns skipped_no_tts when TTS is disabled', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    const tts = makeTts(false);

    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_123');
    expect(result.status).toBe('skipped_no_tts');
    expect(result.synthesized).toBe(0);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('returns skipped_no_tts when voiceId is null', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    const tts = makeTts(true);

    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, null);
    expect(result.status).toBe('skipped_no_tts');
    expect(tts.synthesize).not.toHaveBeenCalled();
  });

  it('returns skipped_no_tts when voiceId is undefined', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    const tts = makeTts(true);

    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, undefined);
    expect(result.status).toBe('skipped_no_tts');
  });
});

describe('preGenerateCallerAudio — writes expected files + manifest', () => {
  it('synthesizes standby and go for a cue with caller_lines', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX', 'SX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, {
      standby: { LX: 'LX — standby for Q1', SX: 'SX — standby for Q1' },
      go: 'LX, SX — GO',
    }, 'sm1');

    const tts = makeTts();
    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_abc');

    expect(result.status).toBe('ok');
    expect(result.synthesized).toBe(3); // 2 standby + 1 go
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Files created
    const standbyLX = path.join(pkgPath, `media/${cueId}_LX_standby.mp3`);
    const standbySX = path.join(pkgPath, `media/${cueId}_SX_standby.mp3`);
    const goFile = path.join(pkgPath, `media/${cueId}_go.mp3`);
    await expect(fs.stat(standbyLX)).resolves.toBeTruthy();
    await expect(fs.stat(standbySX)).resolves.toBeTruthy();
    await expect(fs.stat(goFile)).resolves.toBeTruthy();

    // Manifest written
    const manifest = await readManifest(pkgPath);
    expect(manifest).not.toBeNull();
    expect(manifest!.schema_version).toBe(1);
    expect(manifest!.generated_at).toBeTruthy();
    expect(Object.keys(manifest!.entries)).toHaveLength(3);
    const goEntry = manifest!.entries[`${cueId}_go`];
    expect(goEntry?.kind).toBe('go');
    expect(goEntry?.text).toBe('LX, SX — GO');
    expect(goEntry?.dept).toBeNull();
  });

  it('skips cues without caller_lines', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });

    const tts = makeTts();
    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_abc');
    expect(result.synthesized).toBe(0);
    expect(tts.synthesize).not.toHaveBeenCalled();
  });
});

describe('preGenerateCallerAudio — idempotency', () => {
  it('skips already-generated unchanged lines (hash match + file exists)', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, {
      standby: { LX: 'LX — standby for Q1' },
      go: 'LX — GO',
    }, 'sm1');

    const tts = makeTts();
    // First run
    await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_abc');
    expect(tts.synthesize).toHaveBeenCalledTimes(2);

    // Second run — no changes
    const tts2 = makeTts();
    const result2 = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts2, 'voice_abc');
    expect(result2.skipped).toBe(2);
    expect(result2.synthesized).toBe(0);
    expect(tts2.synthesize).not.toHaveBeenCalled();
  });

  it('re-synthesizes when text changes (hash mismatch)', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, { standby: { LX: 'LX — standby for Q1' }, go: 'LX — GO' }, 'sm1');
    const tts1 = makeTts();
    await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts1, 'voice_abc');

    // Change the text
    setCueCallerLines(doc, cuelistId, cueId, { standby: { LX: 'LX — standby for Q1 updated' }, go: 'LX — GO' }, 'sm1');
    const tts2 = makeTts();
    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts2, 'voice_abc');
    expect(result.synthesized).toBe(1); // only standby re-synthesized
    expect(result.skipped).toBe(1);  // go unchanged
  });

  it('re-synthesizes when file is missing despite matching hash', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, { standby: { LX: 'LX — standby' }, go: 'LX — GO' }, 'sm1');
    const tts1 = makeTts();
    await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts1, 'voice_abc');

    // Delete the go file
    await fs.rm(path.join(pkgPath, `media/${cueId}_go.mp3`));

    const tts2 = makeTts();
    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts2, 'voice_abc');
    expect(result.synthesized).toBe(1); // go re-generated
    expect(result.skipped).toBe(1);  // standby unchanged
  });
});

describe('preGenerateCallerAudio — per-cue failure isolation', () => {
  it('logs and counts failed cues without aborting the whole run', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cue1 = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
    const cue2 = addCue(doc, cuelistId, { label: 'Q2', department: ['SX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cue1, { standby: { LX: 'LX standby' }, go: 'LX GO' }, 'sm1');
    setCueCallerLines(doc, cuelistId, cue2, { standby: { SX: 'SX standby' }, go: 'SX GO' }, 'sm1');

    let callCount = 0;
    const synthesize = vi.fn().mockImplementation(async (_text: string, _voiceId: string, outPath: string) => {
      callCount++;
      if (callCount === 1) throw new Error('API quota exceeded');
      await fs.writeFile(outPath, Buffer.from('fake-mp3'));
      return { path: outPath, durationSecs: 1.0 };
    });
    const tts: TtsInterface = { isEnabled: vi.fn().mockResolvedValue(true), synthesize };

    const warnLogs: Array<[string, unknown]> = [];
    const logger = { warn: (msg: string, data?: unknown) => { warnLogs.push([msg, data]); } };

    const result = await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_abc', logger);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.cue_id).toBe(cue1);
    expect(result.status).toBe('partial');
    // Q2 was still processed
    expect(result.synthesized).toBeGreaterThan(0);
    expect(warnLogs.some(([msg]) => msg === 'caller.pregen.cue_failed')).toBe(true);
  });
});

describe('preGenerateCallerAudio — transition hook', () => {
  it('transition hook triggers pre-gen on REHEARSAL→SHOW', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, { standby: { LX: 'LX — standby' }, go: 'LX — GO' }, 'sm1');

    const tts = makeTts();
    const ctx: TransitionContext = {
      doc,
      pkgPath,
      byOperatorId: 'sm1',
      operatorRole: 'stage_manager',
      preGen: { ttsClient: tts, voiceId: 'voice_abc' },
    };

    const result = await transitionMode('show', ctx);
    expect(result.ok).toBe(true);

    // Audio was generated
    expect(tts.synthesize).toHaveBeenCalledTimes(2);
    const manifest = await readManifest(pkgPath);
    expect(manifest).not.toBeNull();
    expect(Object.keys(manifest!.entries)).toHaveLength(2);
  });

  it('transition succeeds even when pre-gen TTS is not enabled', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });

    const tts = makeTts(false); // TTS disabled
    const ctx: TransitionContext = {
      doc,
      pkgPath,
      byOperatorId: 'sm1',
      operatorRole: 'stage_manager',
      preGen: { ttsClient: tts, voiceId: null },
    };

    const result = await transitionMode('show', ctx);
    expect(result.ok).toBe(true);
  });

  it('transition succeeds when no preGen option provided', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();
    addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });

    const ctx: TransitionContext = {
      doc,
      pkgPath,
      byOperatorId: 'sm1',
      operatorRole: 'stage_manager',
    };

    const result = await transitionMode('show', ctx);
    expect(result.ok).toBe(true);
  });
});

describe('preGenerateCallerAudio — manifest correctness', () => {
  it('manifest entries have correct schema_version, kind, text, file path', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDoc();

    const cueId = addCue(doc, cuelistId, { label: 'Test', department: ['PYRO'], created_by: 'sm1' });
    setCueCallerLines(doc, cuelistId, cueId, { standby: { PYRO: 'PYRO — standby' }, go: 'PYRO — GO' }, 'sm1');

    const tts = makeTts();
    await preGenerateCallerAudio(doc, cuelistId, pkgPath, tts, 'voice_abc');

    const manifest = await readManifest(pkgPath);
    expect(manifest!.schema_version).toBe(1);

    const standbyKey = `${cueId}_PYRO_standby`;
    const goKey = `${cueId}_go`;

    expect(manifest!.entries[standbyKey]).toMatchObject({
      cue_id: cueId,
      dept: 'PYRO',
      kind: 'standby',
      file: `media/${cueId}_PYRO_standby.mp3`,
      text: 'PYRO — standby',
    });
    expect(manifest!.entries[goKey]).toMatchObject({
      cue_id: cueId,
      dept: null,
      kind: 'go',
      file: `media/${cueId}_go.mp3`,
      text: 'PYRO — GO',
    });
  });
});
