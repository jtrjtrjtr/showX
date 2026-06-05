import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { rebuildDocFromJson } from '../../../../../src/modules/cuelist-core/src/persistence/recovery.js';
import type { ShowJson, CuelistJson } from '../../../../../src/modules/cuelist-core/src/persistence/projections.js';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'showx-recovery-test-'));
}

function makeMinimalShowJson(showId = 'test-show-001'): ShowJson {
  return {
    $schema: 'https://showx.xlab.cz/schema/show.v1.json',
    format_version: '1.0',
    schema_version: 1,
    show_id: showId,
    meta: {
      schema_version: 1,
      show_id: showId,
      title: 'Recovery Test Show',
      venue: null,
      date: null,
      departments: ['LX', 'SX', 'SM'],
      mode: 'rehearsal',
      active_cuelist_id: 'cl-001',
      created_at: '2026-06-10T14:00:00.000Z',
      last_meta_editor: null,
    },
    cuelist_index: [{ id: 'cl-001', name: 'Main Show', file: 'cuelists/cl_cl-001.json' }],
    snapshot_index: [],
    applied_migrations: [],
  };
}

function makeMinimalCuelist(): CuelistJson {
  return {
    id: 'cl-001',
    name: 'Main Show',
    default_trigger: 'manual',
    go_authority: 'sm_called',
    sm_offline_policy: { kind: 'freeze' },
    playhead: { cue_id: null, armed_cue_id: null },
    show_snapshot_id: null,
    cues: [
      {
        id: 'cue-001',
        label: 'Q 1',
        description: 'Test cue',
        department: ['LX'],
        standby_note: '',
        script_line_ref: null,
        trigger: { kind: 'manual' },
        payloads: [
          {
            id: 'p-001',
            type: 'osc',
            tag: null,
            note: '',
            device_id: 'dev_test',
            address: '/test/go',
            args: [],
          },
        ],
        duration_hint_ms: null,
        notes: '',
        payload_frozen_at: null,
        created_at: '2026-06-10T14:00:00.000Z',
        created_by: 'op1',
        modified_at: '2026-06-10T14:00:00.000Z',
        modified_by: 'op1',
      },
    ],
  };
}

describe('rebuildDocFromJson', () => {
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

  it('returns a Y.Doc with meta.show_id matching the show JSON', async () => {
    const dir = await makeTmp();
    const show = makeMinimalShowJson('unique-show-id-abc');
    const cuelists = [makeMinimalCuelist()];

    const doc = await rebuildDocFromJson(dir, show, cuelists);

    const meta = doc.getMap('meta');
    expect(meta.get('show_id')).toBe('unique-show-id-abc');
  });

  it('restores cuelists and cues from JSON', async () => {
    const dir = await makeTmp();
    const show = makeMinimalShowJson();
    const cuelists = [makeMinimalCuelist()];

    const doc = await rebuildDocFromJson(dir, show, cuelists);

    const cuelistsArr = doc.getArray<Y.Map<unknown>>('cuelists');
    expect(cuelistsArr.length).toBe(1);

    const cl = cuelistsArr.get(0);
    expect(cl.get('id')).toBe('cl-001');

    const cues = (cl.get('cues') as Y.Array<Y.Map<unknown>>).toArray();
    expect(cues).toHaveLength(1);
    expect(cues[0].get('id')).toBe('cue-001');
    expect(cues[0].get('label')).toBe('Q 1');
  });

  it('restores payloads inside cues', async () => {
    const dir = await makeTmp();
    const doc = await rebuildDocFromJson(dir, makeMinimalShowJson(), [makeMinimalCuelist()]);

    const cl = doc.getArray<Y.Map<unknown>>('cuelists').get(0);
    const cue = (cl.get('cues') as Y.Array<Y.Map<unknown>>).get(0);
    const payloads = (cue.get('payloads') as Y.Array<Y.Map<unknown>>).toArray();

    expect(payloads).toHaveLength(1);
    expect(payloads[0].get('type')).toBe('osc');
    expect(payloads[0].get('address')).toBe('/test/go');
  });

  it('logs recovery_from_json event to history.jsonl', async () => {
    const dir = await makeTmp();
    await rebuildDocFromJson(dir, makeMinimalShowJson(), [makeMinimalCuelist()]);

    const hist = await fs.readFile(path.join(dir, 'history.jsonl'), 'utf8');
    const events = hist.trim().split('\n').map((l) => JSON.parse(l));
    const recovery = events.find((e: { kind: string }) => e.kind === 'recovery_from_json');
    expect(recovery).toBeDefined();
  });

  it('is CRDT-encodable (encodeStateAsUpdate does not throw)', async () => {
    const dir = await makeTmp();
    const doc = await rebuildDocFromJson(dir, makeMinimalShowJson(), [makeMinimalCuelist()]);

    expect(() => Y.encodeStateAsUpdate(doc)).not.toThrow();
  });

  it('round-trips: rebuild → encode → apply → same meta', async () => {
    const dir = await makeTmp();
    const doc1 = await rebuildDocFromJson(dir, makeMinimalShowJson('rt-id'), [makeMinimalCuelist()]);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(doc2.getMap('meta').get('show_id')).toBe('rt-id');
    expect(doc2.getArray<Y.Map<unknown>>('cuelists').length).toBe(1);
  });

  it('handles missing history.jsonl directory gracefully', async () => {
    // Pass a non-existent pkgPath — recovery should succeed even if history append fails
    const dir = await makeTmp();
    const nonExistent = path.join(dir, 'does-not-exist');
    // rebuildDocFromJson catches appendHistoryEvent errors internally
    const doc = await rebuildDocFromJson(nonExistent, makeMinimalShowJson(), [makeMinimalCuelist()]);
    expect(doc.getMap('meta').get('title')).toBe('Recovery Test Show');
  });
});
