---
id: "B003-002"
title: "Yjs document model — Show / Cuelist / Cue / Payload factories + accessors"
type: "implementation"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B003-001"]
target_files:
  - "src/modules/cuelist-core/src/document/show.ts"
  - "src/modules/cuelist-core/src/document/cuelist.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/document/payload.ts"
  - "src/modules/cuelist-core/src/document/schema.ts"
  - "src/modules/cuelist-core/src/document/uuid.ts"
  - "src/types/show.ts"
  - "src/types/cue.ts"
  - "src/types/payload.ts"
  - "tests/unit/modules/cuelist-core/document/show.test.ts"
  - "tests/unit/modules/cuelist-core/document/cuelist.test.ts"
  - "tests/unit/modules/cuelist-core/document/cue.test.ts"
  - "tests/unit/modules/cuelist-core/document/payload.test.ts"
  - "tests/unit/modules/cuelist-core/document/crdt-merge.test.ts"
acceptance_criteria:
  - "Y.Doc factory `initShowDoc({title, venue, date, departments, created_by}): Y.Doc` populates root entries per data_model.md §2.2 exactly: `meta`, `operators`, `devices`, `routing`, `cuelists`, `proposals`, `schema`"
  - "Accessor helpers: `getMeta(doc)`, `getCuelists(doc)`, `getCuelist(doc, id)`, `getCues(cuelistMap)`, `getCue(cuelistMap, id)`, `getPayloads(cueMap)`, `getProposals(doc)`, `getRouting(doc)`, `getOperators(doc)`, `getDevices(doc)` — all return typed Y.Map / Y.Array references (NOT plain JS objects)"
  - "Mutators: `addCuelist`, `addCue`, `insertCueAfter`, `removeCue`, `reorderCues`, `setCueLabel`, `setCueDescription`, `setCueDepartments`, `setCueTrigger`, `setCueStandbyNote`, `setCueNotes`, `addPayload`, `removePayload`, `updatePayload`, `setMode`, `setMetaField` — all wrap in `doc.transact(...)`"
  - "Each cue created via `addCue` carries auto-generated UUIDv7 id, ISO timestamps for `created_at`/`modified_at`, plus all fields from `CueMap` interface per data_model.md §2.5"
  - "Payload mutators enforce data_model.md §5.2 validation rules at the Yjs observer layer — invalid transactions revert with warning to logger (e.g. webhook URL not https on non-loopback)"
  - "Compound cue support: `cue.department` stored as Y.Array<string> with ≥ 1 entry; `setCueDepartments([])` rejected with thrown ValidationError"
  - "Type discriminator `payload.type` immutable after creation — `updatePayload` that changes `type` throws ValidationError"
  - "Q4 default: payload department inferred from cue.department[0] if cue has exactly 1 department, else null (helper `inferPayloadDepartment(cue, payload)`); first-class `payload.department` field reserved for 0.2 migration"
  - "Q7 default: `notes` / `standby_note` / `description` are plain strings (NOT Y.Text) in MVP per data_model.md §12.1 — TODO comment marks 0.2 upgrade point"
  - "30+ vitest tests across files: Y.Doc roundtrip via `encodeStateAsUpdate` + `applyUpdate`; concurrent edits on two Doc clones merge deterministically (CRDT merge test with 5+ scenarios); structural ops (insert/delete/reorder) produce correct ordering; validation rejects invalid payloads"
  - "Public types in `src/types/{show,cue,payload}.ts` match data_model.md §2.3, §4.1, §5.1 normatively — these become the binding TypeScript contract for the rest of the codebase"
  - "Document model is module-internal — no import from `src/modules/cuelist-core/src/document/` outside cuelist-core itself except via published types in `src/types/`"
---

## Context

The Yjs document is the heart of the cuelist data layer. Every operator, every UI, every dispatch decision reads from the same Y.Doc that's replicated across FOH + all PWA stations. This task establishes the Y.Doc schema and the typed accessor/mutator API. Forge MUST mirror data_model.md §2-§5 exactly — Critic will diff field-by-field.

The trickiest aspect: cues and payloads live as `Y.Map<unknown>` (not raw objects) so concurrent edits from multiple operators merge via CRDT. Wrapping every read in `toJSON()` defeats this — accessors return Y.Map references that observers can listen to. Mutators wrap structural changes in `doc.transact(...)` so observers see atomic updates.

## Implementation notes

### Y.Doc factory

```ts
// src/modules/cuelist-core/src/document/show.ts
import * as Y from 'yjs';
import { uuidv7 } from './uuid';
import type { DepartmentTag } from '../../../../types/cue';

export interface InitShowOpts {
  title: string;
  venue: string | null;
  date: string | null;            // ISO yyyy-mm-dd
  departments?: DepartmentTag[];  // defaults to CANONICAL_DEPARTMENTS
  created_by: string;             // operator_id
}

const CANONICAL_DEPARTMENTS: DepartmentTag[] = [
  'LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER',
];

export function initShowDoc(opts: InitShowOpts): Y.Doc {
  const doc = new Y.Doc();
  const showId = uuidv7();
  const now = new Date().toISOString();

  doc.transact(() => {
    const meta = doc.getMap('meta');
    meta.set('schema_version', 1);
    meta.set('show_id', showId);
    meta.set('title', opts.title);
    meta.set('venue', opts.venue);
    meta.set('date', opts.date);
    meta.set('departments', opts.departments ?? CANONICAL_DEPARTMENTS);
    meta.set('mode', 'rehearsal');
    meta.set('created_at', now);
    meta.set('last_meta_editor', opts.created_by);

    doc.getMap('operators');
    doc.getMap('devices');
    doc.getMap('routing');

    // Seed an empty default cuelist; meta.active_cuelist_id points at it
    const cuelists = doc.getArray<Y.Map<unknown>>('cuelists');
    const defaultCuelist = makeCuelistMap('Main Show');
    cuelists.push([defaultCuelist]);
    meta.set('active_cuelist_id', defaultCuelist.get('id') as string);

    doc.getArray('proposals');
    const schema = doc.getMap('schema');
    schema.set('format_version', '1.0');
    schema.set('schema_version', 1);
    schema.set('applied_migrations', []);
  });

  return doc;
}
```

### UUIDv7 helper

```ts
// src/modules/cuelist-core/src/document/uuid.ts
// Use uuid@^10 with v7 export (RFC 9562 §5.7)
import { v7 as uuidv7Base } from 'uuid';
export const uuidv7 = (): string => uuidv7Base();
```

### Cuelist factory + accessors

```ts
// src/modules/cuelist-core/src/document/cuelist.ts
import * as Y from 'yjs';
import { uuidv7 } from './uuid';

export function makeCuelistMap(name: string): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', uuidv7());
  m.set('name', name);
  m.set('default_trigger', 'manual');
  m.set('go_authority', 'sm_called');
  m.set('sm_offline_policy', { kind: 'freeze' });
  m.set('cues', new Y.Array<Y.Map<unknown>>());
  m.set('playhead', { cue_id: null, armed_cue_id: null });
  m.set('show_snapshot_id', null);
  return m;
}

export function getCuelists(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('cuelists');
}

export function getCuelist(doc: Y.Doc, id: string): Y.Map<unknown> | undefined {
  return getCuelists(doc).toArray().find(c => c.get('id') === id);
}

export function getCues(cuelist: Y.Map<unknown>): Y.Array<Y.Map<unknown>> {
  return cuelist.get('cues') as Y.Array<Y.Map<unknown>>;
}
```

### Cue factory + mutators

```ts
// src/modules/cuelist-core/src/document/cue.ts
import * as Y from 'yjs';
import { uuidv7 } from './uuid';
import type { Trigger, DepartmentTag } from '../../../../types/cue';

export interface MakeCueOpts {
  label: string;
  description?: string;
  department: DepartmentTag[]; // ≥ 1
  standby_note?: string;
  trigger?: Trigger;
  created_by: string;
}

export function makeCueMap(opts: MakeCueOpts): Y.Map<unknown> {
  if (opts.department.length === 0) {
    throw new ValidationError('cue.department must have ≥ 1 entry');
  }
  const m = new Y.Map<unknown>();
  const now = new Date().toISOString();
  m.set('id', uuidv7());
  m.set('label', opts.label);
  m.set('description', opts.description ?? '');
  m.set('department', opts.department.slice()); // plain array; Yjs handles LWW
  m.set('standby_note', opts.standby_note ?? '');
  m.set('script_line_ref', null);
  m.set('trigger', opts.trigger ?? { kind: 'manual' });
  m.set('payloads', new Y.Array<Y.Map<unknown>>());
  m.set('duration_hint_ms', null);
  m.set('notes', '');
  m.set('payload_frozen_at', null);
  m.set('created_at', now);
  m.set('created_by', opts.created_by);
  m.set('modified_at', now);
  m.set('modified_by', opts.created_by);
  return m;
}

export function addCue(
  doc: Y.Doc, cuelistId: string, opts: MakeCueOpts,
): string {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const cue = makeCueMap(opts);
  doc.transact(() => cues.push([cue]));
  return cue.get('id') as string;
}

export function insertCueAfter(
  doc: Y.Doc, cuelistId: string, afterCueId: string | null, opts: MakeCueOpts,
): string {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cues = getCues(cuelist);
  const arr = cues.toArray();
  const idx = afterCueId == null ? 0 : arr.findIndex(c => c.get('id') === afterCueId) + 1;
  const cue = makeCueMap(opts);
  doc.transact(() => cues.insert(idx, [cue]));
  return cue.get('id') as string;
}

// ... removeCue, reorderCues, setCueLabel, setCueDescription, setCueDepartments,
//     setCueStandbyNote, setCueTrigger, setCueNotes — all wrap in transact + update modified_at/by
```

### Payload factory + validation

```ts
// src/modules/cuelist-core/src/document/payload.ts
import * as Y from 'yjs';
import { uuidv7 } from './uuid';
import type { Payload, PayloadType } from '../../../../types/payload';

export function makePayloadMap(payload: Omit<Payload, 'id'>): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', uuidv7());
  m.set('type', payload.type);
  m.set('tag', payload.tag ?? null);
  m.set('note', payload.note ?? '');
  // copy type-specific fields verbatim
  for (const [k, v] of Object.entries(payload)) {
    if (!['id', 'type', 'tag', 'note'].includes(k)) m.set(k, v);
  }
  validatePayloadMap(m);
  return m;
}

export class ValidationError extends Error {
  constructor(msg: string, public field?: string) { super(msg); }
}

export function validatePayloadMap(m: Y.Map<unknown>): void {
  const type = m.get('type') as PayloadType;
  switch (type) {
    case 'osc': {
      const addr = m.get('address') as string;
      if (!addr?.startsWith('/')) throw new ValidationError('osc address must start with /', 'address');
      break;
    }
    case 'webhook': {
      const url = m.get('url') as string;
      const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost|::1)/.test(url);
      if (!url.startsWith('https://') && !isLoopback) {
        throw new ValidationError('webhook url must be https (loopback http allowed)', 'url');
      }
      break;
    }
    case 'wait': {
      const ms = m.get('duration_ms') as number;
      if (ms < 0 || ms > 600_000) throw new ValidationError('wait duration_ms 0..600000', 'duration_ms');
      break;
    }
    case 'msc': {
      const did = m.get('device_id_msc') as number;
      if (did < 0 || did > 127) throw new ValidationError('msc device_id_msc 0..127', 'device_id_msc');
      break;
    }
    case 'lx_ref': {
      if ((m.get('cue_list') as number) < 1) throw new ValidationError('lx_ref cue_list ≥ 1', 'cue_list');
      if ((m.get('cue_number') as number) < 0) throw new ValidationError('lx_ref cue_number ≥ 0', 'cue_number');
      break;
    }
    case 'midi': {
      const msg = m.get('message') as any;
      if ('channel' in msg && (msg.channel < 1 || msg.channel > 16)) {
        throw new ValidationError('midi channel 1..16', 'message.channel');
      }
      break;
    }
    case 'group': {
      const children = m.get('child_cue_ids') as string[];
      if (children.length > 32) throw new ValidationError('group child_cue_ids ≤ 32', 'child_cue_ids');
      break;
    }
  }
}

export function addPayload(
  doc: Y.Doc, cuelistId: string, cueId: string, payload: Omit<Payload, 'id'>,
): string {
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find(c => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  const payloads = cue.get('payloads') as Y.Array<Y.Map<unknown>>;
  const m = makePayloadMap(payload);
  doc.transact(() => payloads.push([m]));
  return m.get('id') as string;
}

export function inferPayloadDepartment(
  cue: Y.Map<unknown>, payload: Y.Map<unknown>,
): string | null {
  const dept = cue.get('department') as string[];
  if (dept.length === 1) return dept[0];
  // Fall back to tag heuristic (data_model.md §6.3 / Q4)
  const tag = payload.get('tag') as string | null;
  const CANONICAL = ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'];
  if (tag && CANONICAL.includes(tag)) return tag;
  return null;
}
```

### Yjs observer for validation

Install a `doc.on('beforeTransaction', ...)` hook? Yjs doesn't have pre-commit hooks. Use post-transaction observers per Y.Array/Y.Map and **revert** invalid mutations by reapplying previous state. Alternatively: enforce validation at mutator API level only (simpler; trust API; CRDT merge cannot inject malformed data because remote ops were validated when written). MVP: validate at mutator level + a defensive `validatePayloadMap` re-check on critical paths.

### Public types

`src/types/show.ts`, `src/types/cue.ts`, `src/types/payload.ts` — verbatim copy of TypeScript snippets from data_model.md §2.3, §4.1, §5.1 (`ShowMeta`, `Cue`, `Trigger`, `Payload` discriminated union, `OscArg`). These are the canonical types; cuelist-core internals refer to these.

## Test plan

### `tests/unit/modules/cuelist-core/document/show.test.ts`

1. `initShowDoc` creates all 7 root entries (`meta`, `operators`, `devices`, `routing`, `cuelists`, `proposals`, `schema`).
2. `meta.mode === 'rehearsal'` on fresh doc.
3. `meta.show_id` is a valid UUIDv7 string (36 chars with hyphens).
4. `meta.active_cuelist_id` points at the seeded default cuelist.
5. Encode → decode roundtrip: `Y.encodeStateAsUpdate(doc1)` → `Y.applyUpdate(doc2, update)` produces equal `meta` map.

### `tests/unit/modules/cuelist-core/document/cuelist.test.ts`

6. `makeCuelistMap` defaults: `go_authority === 'sm_called'`, `sm_offline_policy.kind === 'freeze'`.
7. `addCue` appends; `insertCueAfter(null)` prepends; `insertCueAfter(id)` inserts at correct position.
8. `removeCue` removes; remaining order preserved.
9. `reorderCues([id3, id1, id2])` reorders correctly via Yjs delete+insert.

### `tests/unit/modules/cuelist-core/document/cue.test.ts`

10. `makeCueMap({department: []})` throws ValidationError.
11. Mutating `setCueLabel` updates `modified_at` + `modified_by`.
12. `setCueDepartments` rejects empty array.
13. `setCueTrigger({kind: 'auto_continue', delay_ms: 500})` accepted.
14. `cue.department` is concurrent-mergeable (two Doc clones add different depts → merge keeps both).

### `tests/unit/modules/cuelist-core/document/payload.test.ts`

15. OSC payload with non-`/`-prefixed address throws.
16. Webhook payload with `http://example.com` throws; `http://127.0.0.1:8080/x` accepted.
17. Webhook `https://...` accepted.
18. Wait payload with `duration_ms: -1` or `600001` throws.
19. MSC payload with `device_id_msc: 128` throws.
20. LX ref payload with `cue_list: 0` throws.
21. MIDI payload with `channel: 0` throws.
22. Group payload with 33 children throws.
23. Updating `payload.type` from 'osc' to 'midi' throws.
24. `inferPayloadDepartment` returns single dept when `cue.department.length === 1`.
25. `inferPayloadDepartment` returns tag-derived dept when cue is compound and `payload.tag === 'LX'`.

### `tests/unit/modules/cuelist-core/document/crdt-merge.test.ts`

26. Two doc clones add different cues concurrently → both appear after sync (Yjs order preserved by timestamp).
27. Two clones edit `cue.label` concurrently → LWW resolves to higher-`modified_at`.
28. Concurrent reorder ops → deterministic final order.
29. Concurrent payload add to same cue → both payloads present.
30. Encoding produces Uint8Array; size scales linearly with cue count.

## Out of scope

- `.showx` package on-disk read/write (B003-003).
- REHEARSAL/SHOW state machine + lock semantics (B003-004).
- Department view filter algorithm (B003-005); only data structure here.
- Compound cue UI helpers (B003-006 extends payload module).
- Trigger scheduler (B003-007).
- GO event channel (B003-008).
- Cue catalog publishing (B003-010).
- Migration scripts (post-MVP).
- Y.Text upgrade for notes (deferred per Q7).
- First-class `payload.department` field (deferred per Q4 to 0.2).

## Notes for Critic

- Confirm root entries match data_model.md §2.2 names exactly: `meta`, `operators`, `devices`, `routing`, `cuelists`, `proposals`, `schema`.
- Confirm `cue.department` is stored as plain `string[]` Y.Array (the spec leaves this — plain array on Y.Map gets LWW; if compound concurrent edits are critical, may need Y.Array<string>). Spec recommends plain array initially; flag if Forge chose Y.Array<string> instead — both are defensible but document the choice.
- Confirm `payloads` is `Y.Array<Y.Map<unknown>>` (NOT Y.Array of raw objects), so individual payload fields are CRDT-mergeable per §2.6.
- Confirm validation runs at mutator API but does NOT install a Yjs post-observer that reverts (would conflict with CRDT semantics across stations).
- Confirm `payload.type` immutability — `updatePayload` rejects type changes.
- Confirm UUIDv7 import path and that `uuid` package version is `^10` (required for v7).
- Confirm public types in `src/types/{show,cue,payload}.ts` are exported from `showx-shared` per workspace pattern.
- Verify CRDT merge tests use TWO `Y.Doc` instances and apply updates back-and-forth — not one doc with timestamps.
