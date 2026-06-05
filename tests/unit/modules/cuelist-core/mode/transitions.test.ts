import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addCue } from '../../../../../src/modules/cuelist-core/src/document/cue.js';
import { getCuelists, getCues } from '../../../../../src/modules/cuelist-core/src/document/cuelist.js';
import {
  getMode,
  canTransitionMode,
  transitionMode,
  type TransitionContext,
} from '../../../../../src/modules/cuelist-core/src/mode/transitions.js';
import type { ShowModeChangeEvent } from 'showx-shared';

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
  tmpDirs = [];
});

async function makePkg(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'showx-trans-test-'));
  tmpDirs.push(d);
  return d;
}

function makeDocWithCue() {
  const doc = initShowDoc({ title: 'Trans Test', venue: null, date: null, created_by: 'sm1' });
  const cuelistId = doc.getMap('meta').get('active_cuelist_id') as string;
  addCue(doc, cuelistId, { label: 'Q1', department: ['LX'], created_by: 'sm1' });
  addCue(doc, cuelistId, { label: 'Q2', department: ['SX'], created_by: 'sm1' });
  return { doc, cuelistId };
}

function makeParams(
  doc: Y.Doc,
  pkgPath: string,
  overrides?: Partial<TransitionContext>,
): TransitionContext {
  return {
    doc,
    pkgPath,
    byOperatorId: 'sm1',
    operatorRole: 'stage_manager',
    ...overrides,
  };
}

describe('canTransitionMode', () => {
  it('rejects non-SM operator (operator role)', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'op1', 'show', 'operator');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not_sm');
  });

  it('rejects non-SM operator (director role)', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'dir1', 'show', 'director');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not_sm');
  });

  it('rejects non-SM operator (no role)', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'anon', 'show', undefined);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not_sm');
  });

  it('rejects same-mode transition (rehearsal → rehearsal)', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'sm1', 'rehearsal', 'stage_manager');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('no_op');
  });

  it('rejects unknown target mode', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'sm1', 'invalid' as 'show', 'stage_manager');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('unknown_target');
  });

  it('accepts valid SM transitioning to show', () => {
    const { doc } = makeDocWithCue();
    const result = canTransitionMode(doc, 'sm1', 'show', 'stage_manager');
    expect(result.ok).toBe(true);
  });

  it('accepts SM transitioning SHOW → REHEARSAL', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();
    await transitionMode('show', makeParams(doc, pkgPath));
    const result = canTransitionMode(doc, 'sm1', 'rehearsal', 'stage_manager');
    expect(result.ok).toBe(true);
  });
});

describe('transitionMode', () => {
  it('REHEARSAL → SHOW: returns ok + snapshotId, doc.mode = show, snapshot written, history appended', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();

    const result = await transitionMode('show', makeParams(doc, pkgPath));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.from).toBe('rehearsal');
    expect(result.to).toBe('show');
    expect(result.snapshotId).toBeTruthy();
    expect(getMode(doc)).toBe('show');

    // snapshot file exists
    const snapFiles = await fs.readdir(path.join(pkgPath, 'snapshots'));
    expect(snapFiles).toHaveLength(1);

    // history.jsonl contains mode_changed
    const hist = await fs.readFile(path.join(pkgPath, 'history.jsonl'), 'utf8');
    const events = hist.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const modEv = events.find((e) => e.kind === 'mode_changed');
    expect(modEv).toBeDefined();
    expect(modEv!.from).toBe('rehearsal');
    expect(modEv!.to).toBe('show');
    expect(modEv!.snapshot_id).toBe(result.snapshotId);
  });

  it('after REHEARSAL → SHOW: every cue payload_frozen_at is non-null ISO timestamp', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();

    await transitionMode('show', makeParams(doc, pkgPath));

    getCuelists(doc).forEach((cuelist) => {
      getCues(cuelist).forEach((cue) => {
        const frozenAt = cue.get('payload_frozen_at') as string | null;
        expect(frozenAt).not.toBeNull();
        expect(frozenAt).toMatch(ISO_PATTERN);
      });
    });
  });

  it('after SHOW → REHEARSAL: every cue payload_frozen_at is null, snapshot file retained', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();

    await transitionMode('show', makeParams(doc, pkgPath));
    await transitionMode('rehearsal', makeParams(doc, pkgPath));

    expect(getMode(doc)).toBe('rehearsal');

    getCuelists(doc).forEach((cuelist) => {
      getCues(cuelist).forEach((cue) => {
        expect(cue.get('payload_frozen_at')).toBeNull();
      });
    });

    // snapshot file still exists
    const snapFiles = await fs.readdir(path.join(pkgPath, 'snapshots'));
    expect(snapFiles).toHaveLength(1);
  });

  it('cuelist.show_snapshot_id set on REHEARSAL → SHOW, not set on SHOW → REHEARSAL', async () => {
    const pkgPath = await makePkg();
    const { doc, cuelistId } = makeDocWithCue();

    const r = await transitionMode('show', makeParams(doc, pkgPath));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const cuelist = getCuelists(doc).toArray().find((c) => c.get('id') === cuelistId);
    expect(cuelist!.get('show_snapshot_id')).toBe(r.snapshotId);

    await transitionMode('rehearsal', makeParams(doc, pkgPath));
    // show_snapshot_id is NOT cleared on REHEARSAL (snapshot retained per spec)
    // The field stays for forensics — only payload_frozen_at is cleared
    expect(cuelist!.get('show_snapshot_id')).toBe(r.snapshotId);
  });

  it('EventBus show-mode-change event published with correct fields', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();

    const published: ShowModeChangeEvent[] = [];
    const mockCtx = {
      events: {
        publish: (e: ShowModeChangeEvent) => { published.push(e); },
        subscribe: () => ({ id: '', unsubscribe: () => {} }),
        subscribePattern: () => ({ id: '', unsubscribe: () => {} }),
      },
    } as unknown as TransitionContext['ctx'];

    await transitionMode('show', makeParams(doc, pkgPath, { ctx: mockCtx }));

    expect(published).toHaveLength(1);
    expect(published[0].type).toBe('show-mode-change');
    expect(published[0].from).toBe('rehearsal');
    expect(published[0].to).toBe('show');
    expect(published[0].by_operator_id).toBe('sm1');
    expect(published[0].show_id).toBeTruthy();
  });

  it('no EventBus call when ctx is undefined', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();
    const result = await transitionMode('show', makeParams(doc, pkgPath, { ctx: undefined }));
    expect(result.ok).toBe(true);
  });

  it('returns not_sm when operatorRole is not stage_manager', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();
    const result = await transitionMode('show', makeParams(doc, pkgPath, { operatorRole: 'operator' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not_sm');
    expect(getMode(doc)).toBe('rehearsal');
  });

  it('returns no_op when already in target mode', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();
    const result = await transitionMode('rehearsal', makeParams(doc, pkgPath));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('no_op');
  });

  it('SHOW→REHEARSAL: history.jsonl snapshot_id is null', async () => {
    const pkgPath = await makePkg();
    const { doc } = makeDocWithCue();

    await transitionMode('show', makeParams(doc, pkgPath));
    await transitionMode('rehearsal', makeParams(doc, pkgPath));

    const hist = await fs.readFile(path.join(pkgPath, 'history.jsonl'), 'utf8');
    const events = hist.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const rehEv = events.find((e) => e.kind === 'mode_changed' && e.to === 'rehearsal');
    expect(rehEv).toBeDefined();
    expect(rehEv!.snapshot_id).toBeNull();
  });

  it('concurrent Y.Doc LWW: both clients try to transition; only one state survives', async () => {
    const pkgPath1 = await makePkg();
    const pkgPath2 = await makePkg();

    const { doc: docA, cuelistId } = makeDocWithCue();
    const docB = new Y.Doc();
    const updateA = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, updateA);

    // Both try to go to show independently
    const rA = await transitionMode('show', makeParams(docA, pkgPath1));
    const rB = await transitionMode('show', makeParams(docB, pkgPath2));
    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);

    // Merge B's update into A
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);

    // After merge, docA should still be in show mode (LWW wins)
    expect(getMode(docA)).toBe('show');

    // Second transition attempt from docA to show is now a no-op
    const rA2 = await transitionMode('show', makeParams(docA, pkgPath1));
    expect(rA2.ok).toBe(false);
    expect(rA2.ok === false && rA2.reason).toBe('no_op');
  });
});
