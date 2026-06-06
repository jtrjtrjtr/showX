import * as Y from 'yjs';
import type { ShowJson, CuelistJson, CueJson, PayloadJson, RoutingJson, OperatorsJson } from '../persistence/projections.js';
import { projectionsToDoc } from '../persistence/projections.js';
import type { Device } from './devices.js';

// ── Stable IDs (never change; byte-stability depends on these) ────────────────

const SHOW_ID = '01900000-0001-7000-8000-000000000001';
const CUELIST_ID = '01900000-0002-7000-8000-000000000001';

const CUE_IDS = [
  '01900000-0003-7000-8000-000000000001', // Q01 House up
  '01900000-0003-7000-8000-000000000002', // Q02 Preset: Warm amber
  '01900000-0003-7000-8000-000000000003', // Q03 Stage wash
  '01900000-0003-7000-8000-000000000004', // Q04 Doors open
  '01900000-0003-7000-8000-000000000005', // Q05 Announce
  '01900000-0003-7000-8000-000000000006', // Q06 Act 1 open
  '01900000-0003-7000-8000-000000000007', // Q07 Door slam (auto_follow Q06)
  '01900000-0003-7000-8000-000000000008', // Q08 Scene: Library
  '01900000-0003-7000-8000-000000000009', // Q09 Wind rises (auto_follow Q08)
  '01900000-0003-7000-8000-000000000010', // Q10 Storm builds
  '01900000-0003-7000-8000-000000000011', // Q11 Storm starts [COMPOUND]
  '01900000-0003-7000-8000-000000000012', // Q12 Rain intensifies (auto_follow Q11)
  '01900000-0003-7000-8000-000000000013', // Q13 Sunset
  '01900000-0003-7000-8000-000000000014', // Q14 Battle climax [GROUP]
  '01900000-0003-7000-8000-000000000015', // Q15 Act 1 out
  '01900000-0003-7000-8000-000000000016', // Q16 Intermission lights
  '01900000-0003-7000-8000-000000000017', // Q17 Act 2 open
  '01900000-0003-7000-8000-000000000018', // Q18 Video: Projection 1 (auto_continue 1000ms)
  '01900000-0003-7000-8000-000000000019', // Q19 Scene: Courtyard
  '01900000-0003-7000-8000-000000000020', // Q20 Video: Timeline B (auto_continue 500ms)
  '01900000-0003-7000-8000-000000000021', // Q21 Climax: Full stage
  '01900000-0003-7000-8000-000000000022', // Q22 Video: Grand finale (auto_continue 2000ms)
  '01900000-0003-7000-8000-000000000023', // Q23 Blackout
  '01900000-0003-7000-8000-000000000024', // Q24 Curtain call
  '01900000-0003-7000-8000-000000000025', // Q25 House up (end) (auto_follow Q24)
] as const;

const RULE_IDS = [
  '01900000-0004-7000-8000-000000000001', // lx_ref → lx_eos
  '01900000-0004-7000-8000-000000000002', // SX tag → sx_qlab
  '01900000-0004-7000-8000-000000000003', // VIDEO tag → video_disguise
  '01900000-0004-7000-8000-000000000004', // fallback → lx_eos
] as const;

const OPERATOR_IDS = {
  sm: '01900000-0006-7000-8000-000000000001',
  lx: '01900000-0006-7000-8000-000000000002',
} as const;

// Stable timestamp; do not use new Date()
const CREATED_AT = '2026-06-01T10:00:00.000Z';

// ── Payload ID factory (deterministic) ───────────────────────────────────────

function pid(cueSlot: number, payloadSlot: number): string {
  return `01900000-0005-7000-${String(cueSlot).padStart(4, '0')}-${String(payloadSlot).padStart(12, '0')}`;
}

// ── Payload builders ─────────────────────────────────────────────────────────

function lxRef(cueSlot: number, pSlot: number, cueList: number, cueNumber: number): PayloadJson {
  return { id: pid(cueSlot, pSlot), type: 'lx_ref', tag: 'LX', note: '', cue_list: cueList, cue_number: cueNumber };
}

function oscPayload(cueSlot: number, pSlot: number, tag: 'SX' | 'VIDEO', address: string, args: unknown[] = []): PayloadJson {
  return { id: pid(cueSlot, pSlot), type: 'osc', tag, note: '', address, args };
}

function groupPayload(cueSlot: number, pSlot: number, childIds: string[]): PayloadJson {
  return { id: pid(cueSlot, pSlot), type: 'group', tag: null, note: '', child_cue_ids: childIds };
}

// ── Cue builder ───────────────────────────────────────────────────────────────

type Trigger =
  | { kind: 'manual' }
  | { kind: 'auto_follow'; prev_cue_id: string }
  | { kind: 'auto_continue'; delay_ms: number };

interface CueDef {
  label: string;
  department: string[];
  standby_note?: string;
  trigger: Trigger;
  payloads: PayloadJson[];
}

function buildCue(slot: number, def: CueDef): CueJson {
  return {
    id: CUE_IDS[slot - 1],
    label: def.label,
    description: '',
    department: def.department,
    standby_note: def.standby_note ?? '',
    script_line_ref: null,
    trigger: def.trigger,
    payloads: def.payloads,
    duration_hint_ms: null,
    notes: '',
    payload_frozen_at: null,
    created_at: CREATED_AT,
    created_by: 'demo',
    modified_at: CREATED_AT,
    modified_by: 'demo',
  };
}

// ── Demo cue list definition ──────────────────────────────────────────────────

function buildCues(): CueJson[] {
  return [
    // ── Pre-show (Q1-Q5): LX only, manual ─────────────────────────────────
    buildCue(1, {
      label: 'House up',
      department: ['LX'],
      standby_note: 'Open house — bring lights to preset',
      trigger: { kind: 'manual' },
      payloads: [lxRef(1, 1, 1, 0)],
    }),
    buildCue(2, {
      label: 'Preset: Warm amber',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(2, 1, 1, 10)],
    }),
    buildCue(3, {
      label: 'Stage wash',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(3, 1, 1, 20)],
    }),
    buildCue(4, {
      label: 'Doors open',
      department: ['LX'],
      standby_note: 'Front of house doors opening — reduce house level',
      trigger: { kind: 'manual' },
      payloads: [lxRef(4, 1, 1, 30)],
    }),
    buildCue(5, {
      label: 'Announce',
      department: ['LX'],
      standby_note: 'Begin 5-minute announcement from FOH',
      trigger: { kind: 'manual' },
      payloads: [lxRef(5, 1, 1, 40)],
    }),

    // ── Act 1 (Q6-Q15): LX + SX mix ──────────────────────────────────────
    buildCue(6, {
      label: 'Act 1 open',
      department: ['LX'],
      standby_note: 'Fade house; SM calls Go on dialogue start',
      trigger: { kind: 'manual' },
      payloads: [lxRef(6, 1, 2, 0)],
    }),
    buildCue(7, {
      label: 'Door slam',
      department: ['SX'],
      trigger: { kind: 'auto_follow', prev_cue_id: CUE_IDS[5] },
      payloads: [oscPayload(7, 1, 'SX', '/cue/7/start')],
    }),
    buildCue(8, {
      label: 'Scene: Library',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(8, 1, 2, 10)],
    }),
    buildCue(9, {
      label: 'Wind rises',
      department: ['SX'],
      trigger: { kind: 'auto_follow', prev_cue_id: CUE_IDS[7] },
      payloads: [oscPayload(9, 1, 'SX', '/cue/9/start')],
    }),
    buildCue(10, {
      label: 'Storm builds',
      department: ['LX', 'SX'],
      trigger: { kind: 'manual' },
      payloads: [
        lxRef(10, 1, 2, 20),
        oscPayload(10, 2, 'SX', '/cue/10/start'),
      ],
    }),
    buildCue(11, {
      label: 'Storm starts',
      department: ['LX', 'SX'],
      standby_note: 'COMPOUND: LX scene 47 + SX music cue fire together',
      trigger: { kind: 'manual' },
      payloads: [
        lxRef(11, 1, 2, 30),
        oscPayload(11, 2, 'SX', '/cue/11/start'),
      ],
    }),
    buildCue(12, {
      label: 'Rain intensifies',
      department: ['SX'],
      trigger: { kind: 'auto_follow', prev_cue_id: CUE_IDS[10] },
      payloads: [oscPayload(12, 1, 'SX', '/cue/12/start')],
    }),
    buildCue(13, {
      label: 'Sunset',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(13, 1, 2, 40)],
    }),
    buildCue(14, {
      label: 'Battle climax',
      department: ['LX', 'SX', 'VIDEO'],
      standby_note: 'GROUP: fires Storm builds + Storm starts + Rain intensifies in parallel',
      trigger: { kind: 'manual' },
      payloads: [groupPayload(14, 1, [CUE_IDS[9], CUE_IDS[10], CUE_IDS[11]])],
    }),
    buildCue(15, {
      label: 'Act 1 out',
      department: ['LX', 'SX'],
      trigger: { kind: 'manual' },
      payloads: [
        lxRef(15, 1, 2, 50),
        oscPayload(15, 2, 'SX', '/cue/15/start'),
      ],
    }),

    // ── Act 2 (Q16-Q25): LX + VIDEO heavy, auto_continue ─────────────────
    buildCue(16, {
      label: 'Intermission lights',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(16, 1, 3, 0)],
    }),
    buildCue(17, {
      label: 'Act 2 open',
      department: ['LX', 'VIDEO'],
      standby_note: 'Full bleed on video wall + LX cross',
      trigger: { kind: 'manual' },
      payloads: [
        lxRef(17, 1, 3, 10),
        oscPayload(17, 2, 'VIDEO', '/cue/17/start'),
      ],
    }),
    buildCue(18, {
      label: 'Video: Projection 1',
      department: ['VIDEO'],
      trigger: { kind: 'auto_continue', delay_ms: 1000 },
      payloads: [oscPayload(18, 1, 'VIDEO', '/cue/18/start')],
    }),
    buildCue(19, {
      label: 'Scene: Courtyard',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(19, 1, 3, 20)],
    }),
    buildCue(20, {
      label: 'Video: Timeline B',
      department: ['VIDEO'],
      trigger: { kind: 'auto_continue', delay_ms: 500 },
      payloads: [oscPayload(20, 1, 'VIDEO', '/cue/20/start')],
    }),
    buildCue(21, {
      label: 'Climax: Full stage',
      department: ['LX', 'VIDEO'],
      standby_note: 'Biggest moment — LX full intensity + VIDEO grand reveal',
      trigger: { kind: 'manual' },
      payloads: [
        lxRef(21, 1, 3, 30),
        oscPayload(21, 2, 'VIDEO', '/cue/21/start'),
      ],
    }),
    buildCue(22, {
      label: 'Video: Grand finale',
      department: ['VIDEO'],
      trigger: { kind: 'auto_continue', delay_ms: 2000 },
      payloads: [oscPayload(22, 1, 'VIDEO', '/cue/22/start')],
    }),
    buildCue(23, {
      label: 'Blackout',
      department: ['LX'],
      standby_note: 'Full blackout — all LX to zero',
      trigger: { kind: 'manual' },
      payloads: [lxRef(23, 1, 3, 40)],
    }),
    buildCue(24, {
      label: 'Curtain call',
      department: ['LX'],
      trigger: { kind: 'manual' },
      payloads: [lxRef(24, 1, 3, 50)],
    }),
    buildCue(25, {
      label: 'House up (end)',
      department: ['LX'],
      trigger: { kind: 'auto_follow', prev_cue_id: CUE_IDS[23] },
      payloads: [lxRef(25, 1, 3, 60)],
    }),
  ];
}

// ── Device definitions ────────────────────────────────────────────────────────

export const DEMO_DEVICES: Device[] = [
  { device_id: 'lx_eos', label: 'ETC Eos (LX console)', transport: 'osc', host: '127.0.0.1', port: 8000, driver: 'eos' },
  { device_id: 'sx_qlab', label: 'QLab (SX playback)', transport: 'osc', host: '127.0.0.1', port: 53000, driver: 'qlab' },
  { device_id: 'video_disguise', label: 'disguise (video server)', transport: 'osc', host: '127.0.0.1', port: 9000, driver: 'generic' },
];

// ── DemoPackage ───────────────────────────────────────────────────────────────

export interface DemoPackage {
  show: ShowJson;
  cuelist: CuelistJson;
  routing: RoutingJson;
  operators: OperatorsJson;
  devices: Device[];
  historyLines: string[];
}

// ── createDemoShow ────────────────────────────────────────────────────────────

export function createDemoShow(): DemoPackage {
  const cues = buildCues();

  const cuelist: CuelistJson = {
    id: CUELIST_ID,
    name: 'Main Show',
    default_trigger: 'manual',
    go_authority: 'sm_called',
    sm_offline_policy: { kind: 'freeze' },
    playhead: { cue_id: null, armed_cue_id: null },
    show_snapshot_id: null,
    cues,
  };

  const show: ShowJson = {
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

  const routing: RoutingJson = {
    entries: [
      {
        rule_id: RULE_IDS[0], sort_key: 1000,
        match: { payload_type: 'lx_ref' },
        target_device_id: 'lx_eos',
        notes: 'LX payloads → ETC Eos',
        added_by: 'demo', added_at: CREATED_AT,
      },
      {
        rule_id: RULE_IDS[1], sort_key: 2000,
        match: { tag_pattern: 'SX' },
        target_device_id: 'sx_qlab',
        notes: 'SX payloads → QLab',
        added_by: 'demo', added_at: CREATED_AT,
      },
      {
        rule_id: RULE_IDS[2], sort_key: 3000,
        match: { tag_pattern: 'VIDEO' },
        target_device_id: 'video_disguise',
        notes: 'VIDEO payloads → disguise',
        added_by: 'demo', added_at: CREATED_AT,
      },
      {
        rule_id: RULE_IDS[3], sort_key: 4000,
        match: {},
        target_device_id: 'lx_eos',
        notes: 'Default fallback → ETC Eos (lowest priority)',
        added_by: 'demo', added_at: CREATED_AT,
      },
    ],
  };

  const operators: OperatorsJson = {
    operators: [
      {
        id: OPERATOR_IDS.sm,
        label: 'Stage Manager',
        department: 'SM',
        role: 'sm',
        added_by: 'demo',
        added_at: CREATED_AT,
      },
      {
        id: OPERATOR_IDS.lx,
        label: 'LX Operator',
        department: 'LX',
        role: 'operator',
        added_by: 'demo',
        added_at: CREATED_AT,
      },
    ],
    stations: [],
  };

  const historyLines = [
    JSON.stringify({ ts: '2026-06-01T10:00:00.000Z', kind: 'show_opened', show_id: SHOW_ID, by: 'demo' }),
    JSON.stringify({ ts: '2026-06-01T10:05:00.000Z', kind: 'mode_transition', from: 'rehearsal', to: 'rehearsal', by: 'demo', reason: 'initial_setup' }),
    JSON.stringify({ ts: '2026-06-01T10:10:00.000Z', kind: 'cue_fired', cuelist_id: CUELIST_ID, cue_id: CUE_IDS[0], cue_label: 'House up', station_id: 'stn_sm', operator_id: OPERATOR_IDS.sm, payloads_dispatched: 1, sequence: 1 }),
  ];

  return { show, cuelist, routing, operators, devices: DEMO_DEVICES, historyLines };
}

// ── buildDemoDoc ──────────────────────────────────────────────────────────────
// Creates a Y.Doc from the demo package. Used to generate doc.yjs for the fixture.

export function buildDemoDoc(): Y.Doc {
  const pkg = createDemoShow();

  const doc = new Y.Doc();

  // Populate show meta, cuelist, and minimal routing/operators via projectionsToDoc.
  // Note: projectionsToDoc routing uses 'id' key which doesn't match our format;
  // we populate routing and devices directly below.
  projectionsToDoc(doc, pkg.show, [pkg.cuelist]);

  // Populate devices directly into Y.Doc
  const devicesMap = doc.getMap<Y.Map<unknown>>('devices');
  doc.transact(() => {
    for (const d of pkg.devices) {
      const m = new Y.Map<unknown>();
      m.set('device_id', d.device_id);
      m.set('label', d.label);
      m.set('transport', d.transport);
      if (d.host !== undefined) m.set('host', d.host);
      if (d.port !== undefined) m.set('port', d.port);
      if (d.driver !== undefined) m.set('driver', d.driver);
      m.set('added_by', 'demo');
      m.set('added_at', CREATED_AT);
      devicesMap.set(d.device_id, m);
    }
  });

  // Populate routing rules directly into Y.Doc
  const routingMap = doc.getMap<Y.Map<unknown>>('routing');
  doc.transact(() => {
    for (const entry of pkg.routing.entries) {
      const e = entry as Record<string, unknown>;
      const ruleId = e['rule_id'] as string;
      const m = new Y.Map<unknown>();
      m.set('rule_id', ruleId);
      m.set('sort_key', e['sort_key']);
      m.set('match', e['match']);
      m.set('target_device_id', e['target_device_id']);
      m.set('notes', e['notes'] ?? '');
      m.set('added_by', 'demo');
      m.set('added_at', CREATED_AT);
      routingMap.set(ruleId, m);
    }
  });

  return doc;
}
