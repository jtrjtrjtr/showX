/**
 * Generates resources/demo-show/demo.showx/ fixture files.
 * Run with: node scripts/generate-demo-fixture.mjs
 * Fixture content must match createDemoShow() in demoFactory.ts exactly.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'resources', 'demo-show', 'demo.showx');

// ── Stable IDs (must match demoFactory.ts exactly) ───────────────────────────

const SHOW_ID = '01900000-0001-7000-8000-000000000001';
const CUELIST_ID = '01900000-0002-7000-8000-000000000001';
const CREATED_AT = '2026-06-01T10:00:00.000Z';

const CUE_IDS = Array.from({ length: 25 }, (_, i) =>
  `01900000-0003-7000-8000-${String(i + 1).padStart(12, '0')}`
);

const RULE_IDS = Array.from({ length: 4 }, (_, i) =>
  `01900000-0004-7000-8000-${String(i + 1).padStart(12, '0')}`
);

const OP_SM = '01900000-0006-7000-8000-000000000001';
const OP_LX = '01900000-0006-7000-8000-000000000002';

// ── Payload ID factory ────────────────────────────────────────────────────────

function pid(cueSlot, payloadSlot) {
  return `01900000-0005-7000-${String(cueSlot).padStart(4, '0')}-${String(payloadSlot).padStart(12, '0')}`;
}

function lxRef(cueSlot, pSlot, cueList, cueNumber) {
  return { id: pid(cueSlot, pSlot), type: 'lx_ref', tag: 'LX', note: '', cue_list: cueList, cue_number: cueNumber };
}

function oscPayload(cueSlot, pSlot, tag, address, args = []) {
  return { id: pid(cueSlot, pSlot), type: 'osc', tag, note: '', address, args };
}

function groupPayload(cueSlot, pSlot, childIds) {
  return { id: pid(cueSlot, pSlot), type: 'group', tag: null, note: '', child_cue_ids: childIds };
}

function cue(slot, label, department, trigger, payloads, standby_note = '') {
  return {
    id: CUE_IDS[slot - 1],
    label,
    description: '',
    department,
    standby_note,
    script_line_ref: null,
    trigger,
    payloads,
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: CREATED_AT,
    created_by: 'demo',
    modified_at: CREATED_AT,
    modified_by: 'demo',
  };
}

// ── Build cues ────────────────────────────────────────────────────────────────

const cues = [
  cue(1, 'House up', ['LX'], { kind: 'manual' }, [lxRef(1, 1, 1, 0)], 'Open house — bring lights to preset'),
  cue(2, 'Preset: Warm amber', ['LX'], { kind: 'manual' }, [lxRef(2, 1, 1, 10)]),
  cue(3, 'Stage wash', ['LX'], { kind: 'manual' }, [lxRef(3, 1, 1, 20)]),
  cue(4, 'Doors open', ['LX'], { kind: 'manual' }, [lxRef(4, 1, 1, 30)], 'Front of house doors opening — reduce house level'),
  cue(5, 'Announce', ['LX'], { kind: 'manual' }, [lxRef(5, 1, 1, 40)], 'Begin 5-minute announcement from FOH'),
  cue(6, 'Act 1 open', ['LX'], { kind: 'manual' }, [lxRef(6, 1, 2, 0)], 'Fade house; SM calls Go on dialogue start'),
  cue(7, 'Door slam', ['SX'], { kind: 'auto_follow', prev_cue_id: CUE_IDS[5] }, [oscPayload(7, 1, 'SX', '/cue/7/start')]),
  cue(8, 'Scene: Library', ['LX'], { kind: 'manual' }, [lxRef(8, 1, 2, 10)]),
  cue(9, 'Wind rises', ['SX'], { kind: 'auto_follow', prev_cue_id: CUE_IDS[7] }, [oscPayload(9, 1, 'SX', '/cue/9/start')]),
  cue(10, 'Storm builds', ['LX', 'SX'], { kind: 'manual' }, [lxRef(10, 1, 2, 20), oscPayload(10, 2, 'SX', '/cue/10/start')]),
  cue(11, 'Storm starts', ['LX', 'SX'], { kind: 'manual' }, [lxRef(11, 1, 2, 30), oscPayload(11, 2, 'SX', '/cue/11/start')], 'COMPOUND: LX scene 47 + SX music cue fire together'),
  cue(12, 'Rain intensifies', ['SX'], { kind: 'auto_follow', prev_cue_id: CUE_IDS[10] }, [oscPayload(12, 1, 'SX', '/cue/12/start')]),
  cue(13, 'Sunset', ['LX'], { kind: 'manual' }, [lxRef(13, 1, 2, 40)]),
  cue(14, 'Battle climax', ['LX', 'SX', 'VIDEO'], { kind: 'manual' }, [groupPayload(14, 1, [CUE_IDS[9], CUE_IDS[10], CUE_IDS[11]])], 'GROUP: fires Storm builds + Storm starts + Rain intensifies in parallel'),
  cue(15, 'Act 1 out', ['LX', 'SX'], { kind: 'manual' }, [lxRef(15, 1, 2, 50), oscPayload(15, 2, 'SX', '/cue/15/start')]),
  cue(16, 'Intermission lights', ['LX'], { kind: 'manual' }, [lxRef(16, 1, 3, 0)]),
  cue(17, 'Act 2 open', ['LX', 'VIDEO'], { kind: 'manual' }, [lxRef(17, 1, 3, 10), oscPayload(17, 2, 'VIDEO', '/cue/17/start')], 'Full bleed on video wall + LX cross'),
  cue(18, 'Video: Projection 1', ['VIDEO'], { kind: 'auto_continue', delay_ms: 1000 }, [oscPayload(18, 1, 'VIDEO', '/cue/18/start')]),
  cue(19, 'Scene: Courtyard', ['LX'], { kind: 'manual' }, [lxRef(19, 1, 3, 20)]),
  cue(20, 'Video: Timeline B', ['VIDEO'], { kind: 'auto_continue', delay_ms: 500 }, [oscPayload(20, 1, 'VIDEO', '/cue/20/start')]),
  cue(21, 'Climax: Full stage', ['LX', 'VIDEO'], { kind: 'manual' }, [lxRef(21, 1, 3, 30), oscPayload(21, 2, 'VIDEO', '/cue/21/start')], 'Biggest moment — LX full intensity + VIDEO grand reveal'),
  cue(22, 'Video: Grand finale', ['VIDEO'], { kind: 'auto_continue', delay_ms: 2000 }, [oscPayload(22, 1, 'VIDEO', '/cue/22/start')]),
  cue(23, 'Blackout', ['LX'], { kind: 'manual' }, [lxRef(23, 1, 3, 40)], 'Full blackout — all LX to zero'),
  cue(24, 'Curtain call', ['LX'], { kind: 'manual' }, [lxRef(24, 1, 3, 50)]),
  cue(25, 'House up (end)', ['LX'], { kind: 'auto_follow', prev_cue_id: CUE_IDS[23] }, [lxRef(25, 1, 3, 60)]),
];

// ── Build fixture data ────────────────────────────────────────────────────────

const show = {
  $schema: 'https://showx.xlab.cz/schema/show.v1.json',
  format_version: '1.0',
  schema_version: 1,
  show_id: SHOW_ID,
  meta: {
    schema_version: 1,
    show_id: SHOW_ID,
    title: 'Demo Show',
    venue: 'Demo Venue',
    date: '2026-06-01',
    departments: ['LX', 'SX', 'VIDEO'],
    mode: 'rehearsal',
    active_cuelist_id: CUELIST_ID,
    created_at: CREATED_AT,
    last_meta_editor: 'demo',
  },
  cuelist_index: [{ id: CUELIST_ID, name: 'Main Show', file: 'cuelists/cl_main.json' }],
  snapshot_index: [],
  applied_migrations: [],
};

const cuelist = {
  id: CUELIST_ID,
  name: 'Main Show',
  default_trigger: 'manual',
  go_authority: 'sm_called',
  sm_offline_policy: { kind: 'freeze' },
  playhead: { cue_id: null, armed_cue_id: null },
  show_snapshot_id: null,
  cues,
};

const routing = {
  entries: [
    { rule_id: RULE_IDS[0], sort_key: 1000, match: { payload_type: 'lx_ref' }, target_device_id: 'lx_eos', notes: 'LX payloads → ETC Eos', added_by: 'demo', added_at: CREATED_AT },
    { rule_id: RULE_IDS[1], sort_key: 2000, match: { tag_pattern: 'SX' }, target_device_id: 'sx_qlab', notes: 'SX payloads → QLab', added_by: 'demo', added_at: CREATED_AT },
    { rule_id: RULE_IDS[2], sort_key: 3000, match: { tag_pattern: 'VIDEO' }, target_device_id: 'video_disguise', notes: 'VIDEO payloads → disguise', added_by: 'demo', added_at: CREATED_AT },
    { rule_id: RULE_IDS[3], sort_key: 4000, match: {}, target_device_id: 'lx_eos', notes: 'Default fallback → ETC Eos (lowest priority)', added_by: 'demo', added_at: CREATED_AT },
  ],
};

const operators = {
  operators: [
    { id: OP_SM, label: 'Stage Manager', department: 'SM', role: 'sm', added_by: 'demo', added_at: CREATED_AT },
    { id: OP_LX, label: 'LX Operator', department: 'LX', role: 'operator', added_by: 'demo', added_at: CREATED_AT },
  ],
  stations: [],
};

const historyLines = [
  JSON.stringify({ ts: '2026-06-01T10:00:00.000Z', kind: 'show_opened', show_id: SHOW_ID, by: 'demo' }),
  JSON.stringify({ ts: '2026-06-01T10:05:00.000Z', kind: 'mode_transition', from: 'rehearsal', to: 'rehearsal', by: 'demo', reason: 'initial_setup' }),
  JSON.stringify({ ts: '2026-06-01T10:10:00.000Z', kind: 'cue_fired', cuelist_id: CUELIST_ID, cue_id: CUE_IDS[0], cue_label: 'House up', station_id: 'stn_sm', operator_id: OP_SM, payloads_dispatched: 1, sequence: 1 }),
];

// ── Write fixture files ───────────────────────────────────────────────────────

async function main() {
  await fs.mkdir(path.join(PKG, 'cuelists'), { recursive: true });
  await fs.mkdir(path.join(PKG, 'snapshots'), { recursive: true });
  await fs.mkdir(path.join(PKG, 'media'), { recursive: true });

  await fs.writeFile(path.join(PKG, 'show.json'), JSON.stringify(show, null, 2) + '\n');
  await fs.writeFile(path.join(PKG, 'cuelists', 'cl_main.json'), JSON.stringify(cuelist, null, 2) + '\n');
  await fs.writeFile(path.join(PKG, 'routing.json'), JSON.stringify(routing, null, 2) + '\n');
  await fs.writeFile(path.join(PKG, 'operators.json'), JSON.stringify(operators, null, 2) + '\n');
  await fs.writeFile(path.join(PKG, 'history.jsonl'), historyLines.join('\n') + '\n');

  console.log(`Demo fixture written to ${PKG}`);
  console.log(`  25 cues, 3 devices (in routing.json), 4 routing rules`);
  console.log(`  NOTE: doc.yjs not generated by this script (requires compiled TS).`);
  console.log(`  The app falls back to JSON-based recovery when doc.yjs is absent.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
