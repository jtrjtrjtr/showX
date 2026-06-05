# Show Document Data Model

This is the developer tour of the show document. The canonical contract is `docs/specs/data_model.md` — when these pages disagree, that spec wins.

The data model has **three layers**:

| Layer | Where | Purpose | Lifetime |
|---|---|---|---|
| **L1 — Yjs document** | FOH + every PWA station | Active runtime model. CRDT-merged. Drives UI + dispatcher. | While show open; persisted to IndexedDB per station |
| **L2 — `.showx` package** | FOH Mac filesystem | Authoritative persistence. Diffable, versionable. | Forever |
| **L3 — Postgres** | Supabase (Cloud Sync only) | Opt-in cloud backup + cross-venue access. | Only when Cloud Sync enabled |

**LAN-first rule:** the `.showx` package on the FOH Mac disk is the single source of truth for persistence. Postgres is downstream backup only. No data path requires Postgres for the show to run.

## 1. Atomic vocabulary

| Term | Meaning |
|---|---|
| **Cue** | The atom. One labelled show event with 0..N typed payloads. Carries `department[]`. |
| **Cuelist** | Ordered container of Cues with a single playhead. |
| **Show** | Top-level document. 1..N Cuelists (MVP = 1) + metadata + routing + history. |
| **Showlist** | Post-MVP container for multiple Shows (Act 1, Act 2, Interval). NOT in 0.1. |

## 2. The QLab-inverted design

The single most important data model decision: cues are **untyped at the cue level, typed at the payload level**.

One cue with `department=["LX","SX"]` and two payloads (LX cue reference + OSC to QLab) is **one row** in the cuelist, visible to both operators with role-specific highlighting. This is inverted from QLab where each cue is typed (audio cue, fade cue, network cue, etc.).

```jsonc
// Compound cue with two payloads
{
  "id": "01J8H...",
  "label": "Door slam",
  "department": ["SX", "LX"],
  "standby_note": "On Hamlet's line 'A rat?'",
  "trigger": { "kind": "manual" },
  "payloads": [
    { "type": "osc",    "device_id": "dev_qlab", "address": "/cue/door_slam/start", "args": [], "id": "p_a" },
    { "type": "lx_ref", "device_id": "dev_eos",  "cue_list": 1, "cue_number": 47,  "id": "p_b" }
  ]
}
```

Both SX op and LX op see this row in their filtered view. Each sees their own payload highlighted; the other is greyed-out for context.

## 3. Yjs document schema

The Yjs document is named `show:<show_id>`. Root layout:

```typescript
export interface ShowDocRoots {
  /** Mutable show-level metadata. */
  meta: Y.Map<unknown>;
  /** Operator + station registry, keyed by operator_id. */
  operators: Y.Map<Y.Map<unknown>>;
  /** Logical device endpoints (Eos, QLab, etc.). */
  devices: Y.Map<Y.Map<unknown>>;
  /** Routing table: payload-type + tag → transport descriptor. */
  routing: Y.Map<Y.Map<unknown>>;
  /** Ordered list of Cuelists. MVP holds exactly one. */
  cuelists: Y.Array<Y.Map<unknown>>;
  /** SHOW-mode proposal queue. Empty in REHEARSAL. */
  proposals: Y.Array<Y.Map<unknown>>;
  /** Schema/format versioning + migration breadcrumbs. */
  schema: Y.Map<unknown>;
}
```

### 3.1 `meta` Y.Map

```typescript
interface ShowMeta {
  schema_version: 1;           // bumps on breaking change
  show_id: string;             // UUIDv7, immutable
  title: string;
  venue: string | null;
  date: string | null;
  /** Configurable enum. */
  departments: DepartmentTag[];
  /** Active mode. Drives lock semantics. */
  mode: 'rehearsal' | 'show';
  /** Which Cuelist is currently focused for SM. */
  active_cuelist_id: string;
  created_at: string;
  last_meta_editor: string | null;
}
```

Mode transitions are mediated by §6 — only SM identity may toggle.

### 3.2 `cuelists` Y.Array

Each entry is a Y.Map:

```typescript
interface CuelistMap {
  id: string;
  name: string;
  default_trigger: TriggerKind;
  /** SM call authority model. */
  go_authority: 'sm_called' | 'auto_cascade' | 'per_dept' | 'timecode';
  /** What happens when SM station goes offline. */
  sm_offline_policy:
    | { kind: 'freeze' }
    | { kind: 'delegate'; to_operator_id: string }
    | { kind: 'auto_continue' };
  /** Order is significant — Yjs preserves it. */
  cues: Y.Array<Y.Map<unknown>>;
  /** Volatile runtime state. */
  playhead: { cue_id: string | null; armed_cue_id: string | null };
  /** SHOW-mode snapshot pointer (null in REHEARSAL). */
  show_snapshot_id: string | null;
}
```

`playhead` lives in Yjs so all stations observe the same "we're at Q 11". On doc load, ShowX resets `armed_cue_id` to `null` (avoids replay confusion) but preserves `cue_id`.

### 3.3 Cue shape

```typescript
interface Cue {
  id: string;                       // UUIDv7
  label: string;                    // "Q 11"
  description: string;
  department: DepartmentTag[];      // ≥ 1 element
  standby_note: string;             // what SM says on comms
  script_line_ref: string | null;   // PDF prompt-book anchor (MVP optional)
  trigger: Trigger;
  payloads: Payload[];
  duration_hint_ms: number | null;
  notes: string;
  /** Set by SHOW mode to freeze payload edits. */
  payload_frozen_at: string | null;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
}

type Trigger =
  | { kind: 'manual' }
  | { kind: 'auto_follow'; prev_cue_id: string }     // fires when prev completes
  | { kind: 'auto_continue'; delay_ms: number }      // fires N ms after prev starts
  | { kind: 'timecode'; time_ms: number; source: 'ltc' | 'mtc' | 'internal' };  // post-MVP
```

### 3.4 Payload polymorphism

All payload types share `id` + `type`. The `type` is the discriminator (immutable post-creation).

```typescript
type PayloadType = 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group';

interface PayloadBase {
  id: string;                       // UUIDv7
  type: PayloadType;
  tag: string | null;               // optional sub-selector for routing
  note: string;                     // authored display note
}

interface OscPayload extends PayloadBase {
  type: 'osc';
  device_id: string;                // logical; resolved via routing
  address: string;                  // "/cue/start"
  args: OscArg[];
}

interface MscPayload extends PayloadBase {
  type: 'msc';
  device_id: string;
  command: 'go' | 'stop' | 'resume' | 'load' | 'set' | 'fire' | 'all_off';
  cue_list: string | null;          // null = current
  cue_number: string | null;
  device_id_msc: number;            // MSC device ID byte 0..127, default 127 (all)
}

interface LxRefPayload extends PayloadBase {
  type: 'lx_ref';
  device_id: string;                // "eos" / "ma3" / "chamsys"
  cue_list: number;                 // Eos/MA cue list
  cue_number: number;               // Eos cue number; fractional allowed (1.5)
}

interface MidiPayload extends PayloadBase {
  type: 'midi';
  device_id: string;
  message:
    | { kind: 'note_on'; channel: number; note: number; velocity: number }
    | { kind: 'note_off'; channel: number; note: number; velocity: number }
    | { kind: 'cc'; channel: number; controller: number; value: number }
    | { kind: 'program_change'; channel: number; program: number }
    | { kind: 'raw'; bytes: number[] };
}

interface WebhookPayload extends PayloadBase {
  type: 'webhook';
  url: string;                      // https only outside loopback
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body: string | null;
  timeout_ms: number;               // default 5000
}

interface WaitPayload extends PayloadBase {
  type: 'wait';
  duration_ms: number;              // 0..600000 (10 min)
}

interface GroupPayload extends PayloadBase {
  type: 'group';
  child_cue_ids: string[];          // ≤ 32, no cycles
  fire_mode: 'parallel' | 'series';
}
```

### Validation rules (excerpt)

| Payload | Rule |
|---|---|
| all | `id` unique within parent cue. `type` immutable post-creation. |
| `osc` | `address` MUST start with `/`. `args` MAY be empty. |
| `msc` | `device_id_msc` in 0..127. |
| `lx_ref` | `cue_list` ≥ 1. `cue_number` ≥ 0. |
| `midi` | `channel` 1..16 (1-indexed). `note`/`controller`/`velocity` 0..127. |
| `webhook` | `https://` enforced unless URL is `http://127.0.0.1*` or `http://localhost*`. `body` ≤ 1 MB. |
| `wait` | `duration_ms` 0..600000. |
| `group` | `child_cue_ids` ≤ 32; no circular refs (cycle detected at fire). |

Validation runs at: (1) client side in PWA author UI, (2) Yjs observer in Electron (rejects invalid txns), (3) dispatcher pre-fire safety net.

### 3.5 Awareness (presence)

Yjs awareness is **separate** from the document. Each station broadcasts:

```typescript
interface StationAwareness {
  operator_id: string;
  station_id: string;             // device UUID
  display_name: string;
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  current_view: { cuelist_id: string; focus_cue_id: string | null };
  presence_color: string;         // assigned at pairing
  cursor: { cue_id: string | null; field: string | null };
  last_heartbeat_at: string;
}
```

NOT persisted; evaporates on disconnect by design.

## 4. `.showx` package on disk

`.showx` is a **directory bundle** (like QLab's `.qlab`), NOT a zip. macOS Finder shows as a "package" via Info.plist hint, but it's plain files for diff + git friendliness.

```
my-show.showx/
├── Info.plist                  # macOS bundle hint
├── show.json                   # top-level metadata + cuelist index + routing
├── cuelists/
│   ├── cl_<uuid_a>.json        # per-cuelist file (MVP = 1)
│   └── cl_<uuid_b>.json        # post-MVP
├── snapshots/
│   ├── snap_<uuid>_<iso>.json  # SHOW-mode frozen payload state
│   └── ...
├── media/                      # arbitrary referenced files
│   ├── audio/
│   ├── video/
│   ├── scripts/                # PDF prompt-book + cue→line index
│   └── images/
├── routing.json                # active routing table (denormalized)
├── operators.json              # operator/station registry
├── history.jsonl               # append-only audit log
└── doc.yjs                     # binary Yjs document blob
```

`doc.yjs` is the canonical CRDT state. JSON files are **denormalized projections** of the same data — derived from Yjs on save, easier for humans (diff, grep, git). On load, ShowX prefers `doc.yjs` (faster, lossless); JSON projections are recomputed.

### 4.1 `show.json`

```jsonc
{
  "$schema": "https://showx.xlab.cz/schema/show.v1.json",
  "format_version": "1.0",
  "schema_version": 1,
  "show_id": "01J8H...",
  "meta": {
    "title": "Hamlet",
    "venue": "Stavovské divadlo",
    "date": "2026-06-17",
    "departments": ["LX", "SX", "VIDEO", "AUTO", "SM"],
    "mode": "rehearsal",
    "active_cuelist_id": "cl_main",
    "created_at": "2026-06-10T14:23:00Z",
    "last_meta_editor": "op_jana"
  },
  "cuelist_index": [
    { "id": "cl_main", "name": "Main Show", "file": "cuelists/cl_main.json" }
  ],
  "snapshot_index": [],
  "applied_migrations": ["2026-06-01_initial"]
}
```

### 4.2 `history.jsonl`

Append-only, line-delimited JSON. One event per line. Never rewritten in place; ShowX rolls files at size threshold (`history.jsonl` → `history.<n>.jsonl.gz`) but never edits past entries.

```typescript
type HistoryEvent =
  | { ts: string; kind: 'show_opened'; show_id: string; by: string }
  | { ts: string; kind: 'mode_changed'; from: 'rehearsal'|'show'; to: 'rehearsal'|'show'; by: string }
  | { ts: string; kind: 'cue_fired'; cuelist_id: string; cue_id: string; cue_label: string;
      station_id: string; operator_id: string; payloads_dispatched: number; sequence: number; mode: 'rehearsal'|'show'; snapshot_id: string | null }
  | { ts: string; kind: 'cue_inserted'; cuelist_id: string; cue_id: string; after_cue_id: string|null; by: string }
  | { ts: string; kind: 'cue_deleted'; cuelist_id: string; cue_id: string; by: string }
  | { ts: string; kind: 'cue_edited'; cuelist_id: string; cue_id: string; fields: string[]; by: string }
  | { ts: string; kind: 'payload_edited'; cue_id: string; payload_id: string; by: string }
  | { ts: string; kind: 'proposal_created'; proposal_id: string; by: string }
  | { ts: string; kind: 'proposal_resolved'; proposal_id: string; status: 'approved'|'rejected'; by: string }
  | { ts: string; kind: 'snapshot_taken'; snapshot_id: string; cuelist_id: string; by: string }
  | { ts: string; kind: 'station_paired'; station_id: string; operator_id: string }
  | { ts: string; kind: 'station_disconnected'; station_id: string; reason: string };
```

`sequence` on `cue_fired` is monotonic per show — single source of truth = FOH Electron process. This guarantees idempotency on the GO side-channel.

### 4.3 Save semantics

Triggers:

1. **Autosave** every 30 s during REHEARSAL while changes are pending.
2. **Explicit save** via UI / keystroke.
3. **Mode-transition save** — REHEARSAL → SHOW always writes a full save + snapshot.
4. **Pre-close save** when ShowX is shutting down.

Save procedure:

1. Open Yjs txn; `Y.encodeStateAsUpdate(doc)` → `doc.yjs.tmp`.
2. Derive JSON projections → `.tmp` siblings.
3. `fsync` all `.tmp` files.
4. Atomic rename to final names.
5. Append to `history.jsonl` (atomic on POSIX for < PIPE_BUF).
6. If anything fails before step 4, abort and keep prior files untouched.

## 5. Per-department view filtering

### 5.1 Department enum (frozen for 0.1)

```typescript
const CANONICAL_DEPARTMENTS = [
  'LX',     // Lighting
  'SX',     // Sound / SFX
  'VIDEO',  // Projection / playback / cameras
  'AUTO',   // Automation
  'PYRO',   // Pyrotechnics + special effects
  'FS',     // Followspot
  'SM',     // Stage Manager (calls, never owns payloads)
  'OTHER',  // Escape hatch
] as const;
```

### 5.2 Owned vs watched

Each station has two sets:

- `owned_departments` — departments this station executes payloads for.
- `watched_departments` — departments this station observes but does not execute.

| Station | Owned | Watched |
|---|---|---|
| SM iPad | `[SM]` | all others |
| LX op laptop | `[LX]` | `[SM]` |
| SX op iPad | `[SX]` | `[SM]` |
| Solo op (small venue) | `[LX, SX, VIDEO]` | `[SM]` |
| Director (rehearsal) | `[]` | all (read-only) |

### 5.3 Filter algorithm

```typescript
function visibleCues(cues: Cue[], owned: Set<DepartmentTag>, watched: Set<DepartmentTag>): Cue[] {
  const lens = new Set([...owned, ...watched]);
  return cues.filter(c => c.department.some(d => lens.has(d)));
}

function isActionable(cue: Cue, owned: Set<DepartmentTag>): boolean {
  return cue.department.some(d => owned.has(d));
}
```

A payload within a visible cue is **highlighted** if it matches owned departments (via `payload.tag` heuristic in MVP; first-class `payload.department` in 0.2 per `data_model.md` §6.6). Other payloads on the same cue are shown dimmed for context.

## 6. REHEARSAL vs SHOW mode

`show.meta.mode: 'rehearsal' | 'show'` is the single source of truth.

### 6.1 REHEARSAL behaviour

- Full Yjs collab. All stations editable.
- Last-write-wins on metadata (notes, standby, labels).
- Anyone with edit perm (per role) can mutate cue structure.
- GO events fire from any station with `owned ⊇ {SM}` or per `go_authority`.
- Autosave every 30 s.

### 6.2 SHOW transition

SM clicks "LOCK SHOW" → Yjs txn:

1. Every cue gets `payload_frozen_at = now`.
2. Snapshot file written: `snapshots/snap_<uuid>_<iso>.json` containing cuelist + payloads. The "frozen contract".
3. `cuelist.show_snapshot_id` set.
4. `history.jsonl` gets a `mode_changed` event.

### 6.3 SHOW behaviour

| Edit kind | What happens |
|---|---|
| Payload edits | Blocked. UI shows "🔒 SHOW mode — editing locked. Propose change?" → becomes a Proposal. |
| Metadata edits (notes, standby, labels) | Allowed, last-write-wins (they never fire anything). |
| Structural changes (insert/delete/reorder) | Blocked → routed to proposals. |
| GO events | Fire as normal. Each logged with `cue_fired` + snapshot_id + sequence. |
| Mode exit | Requires SM authentication. |

### 6.4 Proposal queue

```typescript
interface Proposal {
  id: string;
  created_at: string;
  created_by: string;
  change_kind: 'insert' | 'delete' | 'reorder' | 'edit_payload' | 'edit_meta';
  target_cue_id: string | null;
  patch: ProposalPatch;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string;
}
```

SM sees a queue (badge on top bar). Approve → patch applies via Yjs txn + proposal marked `approved` + history event. Reject → marked `rejected` + history + author toast.

### 6.5 GO authority

Per cuelist `go_authority` (set in REHEARSAL):

- `sm_called` — only SM's GO authoritative; others send confirms.
- `auto_cascade` — first qualified GO from any station cascades.
- `per_dept` — every department station has its own GO; no cross-dept cascade.
- `timecode` — only timecode source can fire; SM GO is override only.

## 7. GO events — and why they are NOT in the CRDT

This is the most important architectural invariant in this spec.

A GO press fires a **side-channel WebSocket pub/sub event** (`docs/dev/protocol-reference.md` §4.2). It is **never written to the Yjs document**.

Reasons:

1. **CRDT replication is eventually consistent.** If a GO were in the doc, a reconnecting station would observe it as "new" and could re-fire the cue, possibly during a critical SHOW moment.
2. **The CRDT models what the show looks like, not what just happened.** Fires are events. Events live on a pub/sub topic with idempotency keys.
3. **`history.jsonl` is the audit-log version of fires** (append-only on FOH disk), not the CRDT-replicated version.

This separation is enforced by API: the Yjs document has no public field that accepts a `fired_at` timestamp on a cue. Forge MUST NOT add one.

### Lifecycle states per station (in awareness, NOT CRDT)

- `pending` — ahead of playhead, not armed
- `armed` — playhead at this cue; standby called
- `firing` — GO pressed; dispatcher processing payloads
- `fired` — all payloads dispatched (success or error)
- `skipped` — explicit skip by SM (logged to `history.jsonl`)

State transitions feed UI (red dot on armed, green flash on fire). The state itself is NOT persisted.

## 8. Code snippets — common operations

### 8.1 Open a show

```typescript
import * as Y from 'yjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function openShow(showxPath: string): Promise<Y.Doc> {
  const yjsBlob = await readFile(path.join(showxPath, 'doc.yjs'));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(yjsBlob));
  return doc;
}
```

If `doc.yjs` is missing or CRC-fails, fall back to rebuilding from JSON projections (logged as `recovery_from_json`).

### 8.2 Add a cue to the active cuelist

```typescript
function addCue(doc: Y.Doc, cuelistIndex: number, after: number, cue: Cue): void {
  const cuelists = doc.getArray<Y.Map<unknown>>('cuelists');
  const cuelist = cuelists.get(cuelistIndex);
  const cues = cuelist.get('cues') as Y.Array<Y.Map<unknown>>;
  doc.transact(() => {
    const m = new Y.Map<unknown>();
    Object.entries(cue).forEach(([k, v]) => m.set(k, v));
    cues.insert(after + 1, [m]);
  });
}
```

Always wrap structural changes in `doc.transact(() => {...})` so observers see one atomic update.

### 8.3 Filter a cuelist by department

```typescript
function filteredCues(
  cuelist: Y.Map<unknown>,
  owned: Set<DepartmentTag>,
  watched: Set<DepartmentTag>,
): Cue[] {
  const arr = (cuelist.get('cues') as Y.Array<Y.Map<unknown>>).toArray();
  const lens = new Set([...owned, ...watched]);
  return arr
    .map((m) => Object.fromEntries(m.entries()) as Cue)
    .filter((c) => c.department.some((d) => lens.has(d)));
}
```

### 8.4 Fire a GO (from the SM iPad)

```typescript
// PWA side — sends a WSS envelope on the side-channel
function sendGoRequest(ws: WebSocket, cue: Cue, sessionInfo: SessionInfo) {
  const env = {
    topic: 'go.request',
    request_id: crypto.randomUUID(),         // UUIDv7 in production
    cue_id: cue.id,
    cuelist_id: sessionInfo.cuelist_id,
    station_id: sessionInfo.station_id,
    operator_id: sessionInfo.operator_id,
    client_ts: new Date().toISOString(),
    override: false,
  };
  ws.send(JSON.stringify(env));
}
```

FOH side: the request hits the side-channel server → authorisation check → emits `cue-fire` on the EventBus → dispatcher iterates payloads → side-channel broadcasts `go.dispatched` to all stations.

### 8.5 Append a history event

```typescript
import { appendFile } from 'node:fs/promises';
import path from 'node:path';

async function appendHistory(showxPath: string, event: HistoryEvent): Promise<void> {
  const line = JSON.stringify(event) + '\n';
  await appendFile(path.join(showxPath, 'history.jsonl'), line, 'utf8');
}
```

This is atomic on POSIX for writes < PIPE_BUF. For larger entries (rare), use a sequence-numbered temp file + rename.

### 8.6 Generate the cue catalog

The Cuelist Core module publishes a `CueCatalog` for the routing UI + Custom Router:

```typescript
interface CueCatalog {
  schema_version: 1;
  show_id: string;
  generated_at: string;
  source: string;                   // "cuelist-core@<version>"
  payload_types_used: PayloadType[];
  devices_referenced: Array<{
    id: string;
    referenced_by_payloads: number;
    payload_types: PayloadType[];
  }>;
  cues: Array<{
    id: string; label: string; cuelist_id: string; department: DepartmentTag[];
    payloads: Array<{
      id: string; type: PayloadType; tag: string | null; device_id: string | null;
      summary: string;             // type-specific UI-friendly summary
    }>;
  }>;
}
```

Recomputed on: show open; every Yjs txn touching `cues` or `payloads`; every routing change. Emitted via the EventBus as `cue-catalog-updated`. Also written to `media/.cache/cue-catalog.json` for external tools (e.g. Companion).

## 9. Postgres schema (Cloud Sync module only)

Activated **only** when Cloud Sync module is loaded and user signed into Supabase. See `docs/specs/data_model.md` §9 for full SQL. Highlights:

- Tables: `shows`, `cuelists`, `cues`, `cue_payloads`, `operators`, `routing_entries`, `yjs_document_snapshots`, `yjs_document_updates`, `history_events`.
- RLS: `account_id = auth.uid()` per row; service role (cloud y-websocket node) bypasses for sync.
- Direction: **`.showx` package on FOH disk is master; Postgres trails.** FOH never reads CRDT state from Postgres for runtime decisions.

## 10. Migration + compatibility

### 10.1 Forward compatibility

- **Unknown fields preserved.** Older ShowX opening a 1.5 file MUST round-trip unknown fields on save.
- **Unknown payload types** stored as `{ type: 'unknown_<original>', original: <raw> }`. UI shows "Unsupported payload — saved as-is".
- **Unknown trigger kinds** → cue treated as `manual` with warning toast.

### 10.2 Backward compatibility

- ShowX refuses to open `format_version` major > current major.
- Minor skew allowed: 1.0 opens 1.5 in read-only with warning.

### 10.3 Migration scripts

Location: `src/modules/cuelist-core/migrations/<yyyy-mm-dd>_<slug>.ts`. Each exports `up(json) → json` (and rarely `down(json) → json`).

```typescript
// migrations/2026-09-01_payload_department_field.ts
export const id = '2026-09-01_payload_department_field';
export const description = 'Add explicit Payload.department field.';

export async function up(show: ShowJson): Promise<ShowJson> {
  for (const cl of show.cuelists) {
    for (const cue of cl.cues) {
      for (const p of cue.payloads) {
        if (p.department === undefined) {
          p.department = cue.department.length === 1 ? cue.department[0] : null;
        }
      }
    }
  }
  show.applied_migrations.push(id);
  return show;
}
```

On open:

1. Read `applied_migrations` from `show.json`.
2. Diff vs migrations registry.
3. Run missing `up()` in order.
4. Save back if any ran.

Migrations apply to JSON projections; the `doc.yjs` is rebuilt from JSON post-migration to avoid CRDT drift.

## 11. Further reading

- `docs/specs/data_model.md` — full canonical spec (binding)
- `docs/dev/protocol-reference.md` — how the data model flows to the wire
- `docs/dev/module-sdk.md` — accessing the doc via `ctx.sync.openDocument('show:<id>')`
- `docs/dev/pairing-and-auth.md` — operator and station identity
