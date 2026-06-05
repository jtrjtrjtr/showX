import * as Y from 'yjs';

// ── JSON schema types (per data_model.md §3.2-§3.5) ──────────────────────────

export interface ShowMetaJson {
  schema_version: number;
  show_id: string;
  title: string;
  venue: string | null;
  date: string | null;
  departments: string[];
  mode: string;
  active_cuelist_id: string;
  created_at: string;
  last_meta_editor: string | null;
}

export interface ShowJson {
  $schema: string;
  format_version: string;
  schema_version: number;
  show_id: string;
  meta: ShowMetaJson;
  cuelist_index: Array<{ id: string; name: string; file: string }>;
  snapshot_index: Array<{ id: string; cuelist_id: string; taken_at: string; file: string }>;
  applied_migrations: string[];
}

export interface PayloadJson {
  id: string;
  type: string;
  tag: string | null;
  note: string;
  [key: string]: unknown;
}

export interface CueJson {
  id: string;
  label: string;
  description: string;
  department: string[];
  standby_note: string;
  script_line_ref: string | null;
  trigger: unknown;
  payloads: PayloadJson[];
  duration_hint_ms: number | null;
  notes: string;
  payload_frozen_at: string | null;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
}

export interface CuelistJson {
  id: string;
  name: string;
  default_trigger: string;
  go_authority: string;
  sm_offline_policy: unknown;
  playhead: { cue_id: string | null; armed_cue_id: string | null };
  show_snapshot_id: string | null;
  cues: CueJson[];
}

export interface RoutingJson {
  entries: unknown[];
}

export interface OperatorsJson {
  operators: unknown[];
  stations: unknown[];
}

// ── Y.Doc → JSON projections ──────────────────────────────────────────────────

export function docToProjections(doc: Y.Doc): {
  show: ShowJson;
  cuelists: Record<string, CuelistJson>;
  routing: RoutingJson;
  operators: OperatorsJson;
} {
  const meta = doc.getMap('meta').toJSON() as Record<string, unknown>;
  const schema = doc.getMap('schema').toJSON() as Record<string, unknown>;
  const cuelistsArr = doc.getArray<Y.Map<unknown>>('cuelists');
  const routingMap = doc.getMap<Y.Map<unknown>>('routing');
  const operatorsMap = doc.getMap<Y.Map<unknown>>('operators');

  const cuelists: Record<string, CuelistJson> = {};
  const cuelist_index: Array<{ id: string; name: string; file: string }> = [];

  for (const clMap of cuelistsArr.toArray()) {
    const cl = cuelistMapToJson(clMap);
    cuelists[cl.id] = cl;
    cuelist_index.push({ id: cl.id, name: cl.name, file: `cuelists/cl_${cl.id}.json` });
  }

  const show: ShowJson = {
    $schema: 'https://showx.xlab.cz/schema/show.v1.json',
    format_version: (schema['format_version'] as string) ?? '1.0',
    schema_version: (schema['schema_version'] as number) ?? 1,
    show_id: meta['show_id'] as string,
    meta: {
      schema_version: (meta['schema_version'] as number) ?? 1,
      show_id: meta['show_id'] as string,
      title: (meta['title'] as string) ?? '',
      venue: (meta['venue'] as string | null) ?? null,
      date: (meta['date'] as string | null) ?? null,
      departments: (meta['departments'] as string[]) ?? [],
      mode: (meta['mode'] as string) ?? 'rehearsal',
      active_cuelist_id: (meta['active_cuelist_id'] as string) ?? '',
      created_at: (meta['created_at'] as string) ?? '',
      last_meta_editor: (meta['last_meta_editor'] as string | null) ?? null,
    },
    cuelist_index,
    snapshot_index: [],
    applied_migrations: (schema['applied_migrations'] as string[]) ?? [],
  };

  const routing: RoutingJson = {
    entries: Array.from(routingMap.values()).map((v) => (v instanceof Y.Map ? v.toJSON() : v)),
  };

  const operators: OperatorsJson = {
    operators: Array.from(operatorsMap.values()).map((v) => (v instanceof Y.Map ? v.toJSON() : v)),
    stations: [],
  };

  return { show, cuelists, routing, operators };
}

function cuelistMapToJson(clMap: Y.Map<unknown>): CuelistJson {
  const cuesArr = clMap.get('cues') as Y.Array<Y.Map<unknown>>;
  const cues: CueJson[] = [];

  if (cuesArr) {
    for (const cueMap of cuesArr.toArray()) {
      cues.push(cueMapToJson(cueMap));
    }
    // Sort by sort_key for consistent JSON output
    cues.sort((_a, _b) => {
      // sort_key is not in CueJson but is on the Y.Map — retrieve it inline
      return 0; // sort handled by getCuesSorted in display; JSON export preserves insertion order
    });
  }

  return {
    id: clMap.get('id') as string,
    name: clMap.get('name') as string,
    default_trigger: (clMap.get('default_trigger') as string) ?? 'manual',
    go_authority: (clMap.get('go_authority') as string) ?? 'sm_called',
    sm_offline_policy: clMap.get('sm_offline_policy') ?? { kind: 'freeze' },
    playhead: (clMap.get('playhead') as { cue_id: string | null; armed_cue_id: string | null }) ?? {
      cue_id: null,
      armed_cue_id: null,
    },
    show_snapshot_id: (clMap.get('show_snapshot_id') as string | null) ?? null,
    cues,
  };
}

function cueMapToJson(cueMap: Y.Map<unknown>): CueJson {
  const payloadsArr = cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
  const payloads: PayloadJson[] = [];

  if (payloadsArr) {
    for (const pMap of payloadsArr.toArray()) {
      payloads.push(payloadMapToJson(pMap));
    }
  }

  return {
    id: cueMap.get('id') as string,
    label: (cueMap.get('label') as string) ?? '',
    description: (cueMap.get('description') as string) ?? '',
    department: (cueMap.get('department') as string[]) ?? [],
    standby_note: (cueMap.get('standby_note') as string) ?? '',
    script_line_ref: (cueMap.get('script_line_ref') as string | null) ?? null,
    trigger: cueMap.get('trigger') ?? { kind: 'manual' },
    payloads,
    duration_hint_ms: (cueMap.get('duration_hint_ms') as number | null) ?? null,
    notes: (cueMap.get('notes') as string) ?? '',
    payload_frozen_at: (cueMap.get('payload_frozen_at') as string | null) ?? null,
    created_at: (cueMap.get('created_at') as string) ?? '',
    created_by: (cueMap.get('created_by') as string) ?? '',
    modified_at: (cueMap.get('modified_at') as string) ?? '',
    modified_by: (cueMap.get('modified_by') as string) ?? '',
  };
}

function payloadMapToJson(pMap: Y.Map<unknown>): PayloadJson {
  const obj: Record<string, unknown> = {};
  pMap.forEach((v, k) => {
    obj[k] = v;
  });
  return obj as PayloadJson;
}

// ── JSON projections → Y.Doc ──────────────────────────────────────────────────

export function projectionsToDoc(
  doc: Y.Doc,
  show: ShowJson,
  cuelists: CuelistJson[],
  routing?: RoutingJson,
  operators?: OperatorsJson,
): void {
  doc.transact(() => {
    // meta
    const meta = doc.getMap('meta');
    const m = show.meta;
    meta.set('schema_version', m.schema_version);
    meta.set('show_id', m.show_id);
    meta.set('title', m.title);
    meta.set('venue', m.venue);
    meta.set('date', m.date);
    meta.set('departments', m.departments);
    meta.set('mode', m.mode);
    meta.set('active_cuelist_id', m.active_cuelist_id);
    meta.set('created_at', m.created_at);
    meta.set('last_meta_editor', m.last_meta_editor);

    // schema
    const schema = doc.getMap('schema');
    schema.set('format_version', show.format_version);
    schema.set('schema_version', show.schema_version);
    schema.set('applied_migrations', show.applied_migrations.slice());

    // cuelists
    const cuelistsArr = doc.getArray<Y.Map<unknown>>('cuelists');
    for (const cl of cuelists) {
      const clMap = rebuildCuelistMap(cl);
      cuelistsArr.push([clMap]);
    }

    // routing
    const routingMap = doc.getMap('routing');
    if (routing) {
      for (const entry of routing.entries) {
        const e = entry as Record<string, unknown>;
        if (e['id']) {
          const em = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(e)) em.set(k, v);
          routingMap.set(e['id'] as string, em);
        }
      }
    }

    // operators
    const operatorsMap = doc.getMap('operators');
    if (operators) {
      for (const op of operators.operators) {
        const o = op as Record<string, unknown>;
        if (o['id']) {
          const om = new Y.Map<unknown>();
          for (const [k, v] of Object.entries(o)) om.set(k, v);
          operatorsMap.set(o['id'] as string, om);
        }
      }
    }

    // ensure proposals + devices exist
    doc.getArray('proposals');
    doc.getMap('devices');
  });
}

function rebuildCuelistMap(cl: CuelistJson): Y.Map<unknown> {
  const clMap = new Y.Map<unknown>();
  clMap.set('id', cl.id);
  clMap.set('name', cl.name);
  clMap.set('default_trigger', cl.default_trigger);
  clMap.set('go_authority', cl.go_authority);
  clMap.set('sm_offline_policy', cl.sm_offline_policy);
  // Reset armed_cue_id to null on load; preserve cue_id so cuelist reopens at same position
  clMap.set('playhead', { cue_id: cl.playhead.cue_id, armed_cue_id: null });
  clMap.set('show_snapshot_id', cl.show_snapshot_id);

  const cuesArr = new Y.Array<Y.Map<unknown>>();
  for (let i = 0; i < cl.cues.length; i++) {
    cuesArr.push([rebuildCueMap(cl.cues[i], (i + 1) * 1000)]);
  }
  clMap.set('cues', cuesArr);

  return clMap;
}

function rebuildCueMap(cue: CueJson, sortKey: number): Y.Map<unknown> {
  const cueMap = new Y.Map<unknown>();
  cueMap.set('id', cue.id);
  cueMap.set('label', cue.label);
  cueMap.set('description', cue.description);
  cueMap.set('department', cue.department.slice());
  cueMap.set('standby_note', cue.standby_note);
  cueMap.set('script_line_ref', cue.script_line_ref);
  cueMap.set('trigger', cue.trigger);
  cueMap.set('duration_hint_ms', cue.duration_hint_ms);
  cueMap.set('notes', cue.notes);
  cueMap.set('payload_frozen_at', cue.payload_frozen_at);
  cueMap.set('created_at', cue.created_at);
  cueMap.set('created_by', cue.created_by);
  cueMap.set('modified_at', cue.modified_at);
  cueMap.set('modified_by', cue.modified_by);
  cueMap.set('sort_key', sortKey);

  const payloadsArr = new Y.Array<Y.Map<unknown>>();
  for (const p of cue.payloads) {
    payloadsArr.push([rebuildPayloadMap(p)]);
  }
  cueMap.set('payloads', payloadsArr);

  return cueMap;
}

function rebuildPayloadMap(payload: PayloadJson): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(payload)) {
    m.set(k, v);
  }
  return m;
}
