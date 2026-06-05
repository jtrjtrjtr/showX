# ShowX Data Model Specification

> **Status:** Draft v1 — Phase 0 (scope/spec) deliverable for ShowX repo bootstrap
> **Date:** 2026-06-05
> **Author:** Architect (research session, hub-level)
> **Phase context:** Pre-Kongres scoping. No production code yet. Implementation begins post-Kongres 2026-06-17 inside `showX/src/modules/cuelist-core/` and `showX/src/types/`.
> **Companion specs:** `module_loader.md`, `protocol_dictionary.md`, `pairing_auth.md`, `bridgex_absorption.md` (siblings in this folder).
> **Strategy inputs:** `xlab-strategy/docs/showx_mvp_scope.md`, `xlab-strategy/docs/showx_module_architecture.md`, `xlab-strategy/docs/research_foh_cuelist_ux_conventions.md`.
> **Binding decision:** `xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`.
> **Audience:** Forge (implementer), Critic (reviewer), Architect (future revision).

---

## 0. Document conventions

- **MUST / SHOULD / MAY** follow RFC 2119 semantics.
- TypeScript snippets are normative — they are the basis of `src/types/show.ts`, `src/types/cue.ts`, `src/types/payload.ts`. Where types reference Yjs (`Y.Map`, `Y.Array`), they describe the in-memory document; the equivalent on-disk JSON forms are given separately in §3.
- JSON Schema fragments are abbreviated; the full machine-readable schema lives under `showX/src/schemas/` once implementation starts.
- "OPEN QUESTION" headings indicate items requiring Architect ratification before Forge implements.
- "MVP" = ShowX 0.1 public (target Q1 2027). "Post-MVP" = 0.2 and later.

---

## 1. Overview

ShowX persists and replicates a single coherent data model across **three layers**, each with a distinct responsibility:

| Layer | Where | Purpose | Lifetime |
|---|---|---|---|
| **L1 — Yjs document (in-memory + IndexedDB)** | FOH Electron + every PWA station | Active runtime model. CRDT-merged across stations. Drives the UI and dispatcher. | While show is open; persisted to IndexedDB per station |
| **L2 — `.showx` package (on-disk)** | FOH Mac filesystem | Authoritative persistence. Survives crash, reboot, machine swap. Diffable, versionable, hand-portable. | Forever |
| **L3 — Postgres (Cloud Sync module only)** | Supabase | Opt-in cloud backup + cross-venue access. Never required for venue runtime. | Only when Cloud Sync enabled |

**Atomic vocabulary** (locked, per Phase 2 research §2):

- **Cue** — the atom. One labelled show event with zero or more typed payloads. Carries `department[]`.
- **Cuelist** — ordered container of Cues with a single playhead.
- **Show** — top-level document. Contains 1..N Cuelists (MVP = 1) plus metadata, routing, history.
- **Showlist** — post-MVP container for multiple Shows (Act 1, Act 2, Interval). Not modelled in 0.1.

**LAN-first rule:** the `.showx` package on the FOH Mac disk is the single source of truth for persistence. Postgres is downstream backup only. No data path requires Postgres for the show to run.

**Inversion from QLab:** cues are **untyped at the cue level, typed at the payload level**. One cue with `department=["LX","SX"]` and two payloads (LXRef + OSC to QLab) is one row in the cuelist, visible to two operators with role-specific highlighting. This is the central design decision; everything in §4-§6 follows from it.

---

## 2. Yjs document schema

### 2.1 Why Yjs (recap)

Yjs gives us:

- **Multi-station collab without a central server during edits.** Stations merge optimistically; the embedded broker is just a relay.
- **IndexedDB persistence per station** via `y-indexeddb`. If FOH Mac crashes, an SM iPad still holds the full document.
- **Multi-provider stack** for Cloud Sync later — LAN broker + cloud broker concurrently without rewriting the document.
- **Awareness protocol** for presence (operator cursor positions, selection, "calling now").

### 2.2 Document root

The Yjs document is named `show:<show_id>`. Its root contains the following top-level entries (all created during `initShowDoc()`):

```ts
// src/types/show.ts (excerpt, normative)

import * as Y from 'yjs';

/** The canonical Yjs document layout for an open Show. */
export interface ShowDocRoots {
  /** Mutable show-level metadata (title, venue, mode, departments enum, etc.). */
  meta: Y.Map<unknown>;
  /** Operator + station registry. Keyed by operator_id. */
  operators: Y.Map<Y.Map<unknown>>;
  /** Logical device endpoints (FOH BridgeX dispatcher addresses, Eos, QLab, etc.). */
  devices: Y.Map<Y.Map<unknown>>;
  /** Routing table: payload-type + tag → transport descriptor. */
  routing: Y.Map<Y.Map<unknown>>;
  /** Ordered list of Cuelists. MVP holds exactly one entry. */
  cuelists: Y.Array<Y.Map<unknown>>;
  /** SHOW-mode proposal queue. Empty in REHEARSAL mode. */
  proposals: Y.Array<Y.Map<unknown>>;
  /** Schema/format versioning + migration breadcrumbs. */
  schema: Y.Map<unknown>;
}
```

### 2.3 `meta` Y.Map

```ts
export interface ShowMeta {
  schema_version: 1;            // bumps on breaking change
  show_id: string;              // UUIDv7, set at creation, immutable
  title: string;
  venue: string | null;
  date: string | null;          // ISO yyyy-mm-dd
  /** Configurable enum. Defaults to the canonical set in §6. */
  departments: DepartmentTag[];
  /** Active mode. Drives lock semantics in §7. */
  mode: 'rehearsal' | 'show';
  /** Which Cuelist is currently focused for SM (MVP = the only one). */
  active_cuelist_id: string;
  /** Wall-clock when the doc was created (string in ISO 8601). */
  created_at: string;
  /** Last person to write meta. */
  last_meta_editor: string | null;
}
```

`mode` transitions are mediated by §7 — only the SM identity may toggle, and the toggle itself appears in `history.jsonl` as a `mode_changed` event.

### 2.4 `cuelists` Y.Array

Each entry is a `Y.Map` representing one cuelist:

```ts
export interface CuelistMap {
  id: string;                              // UUIDv7
  name: string;                            // "Main Show"
  default_trigger: TriggerKind;            // see §4
  /** SM call authority model. See §4 + Phase 2 research §4. */
  go_authority: 'sm_called' | 'auto_cascade' | 'per_dept' | 'timecode';
  /** What happens when SM station goes offline. */
  sm_offline_policy:
    | { kind: 'freeze' }
    | { kind: 'delegate'; to_operator_id: string }
    | { kind: 'auto_continue' };
  /** Y.Array of Cue Y.Maps. Order is significant — Yjs preserves it. */
  cues: Y.Array<Y.Map<unknown>>;
  /** Volatile runtime state. NOT persisted to `.showx` on save; rehydrated to defaults on load. */
  playhead: { cue_id: string | null; armed_cue_id: string | null };
  /** SHOW-mode snapshot pointer (null in REHEARSAL). */
  show_snapshot_id: string | null;
}
```

`playhead` lives in Yjs so that all stations observe the same "we're at Q 11" state. It is volatile in the sense that on doc load, ShowX resets `armed_cue_id` to `null` (avoids replay confusion) but preserves `cue_id` (so the cuelist re-opens at the same position).

### 2.5 `cues` Y.Array (per cuelist)

Each cue is a `Y.Map`:

```ts
export interface CueMap {
  id: string;                       // UUIDv7
  label: string;                    // "Q 11"
  description: string;
  department: DepartmentTag[];      // 1..N entries
  standby_note: string;
  script_line_ref: string | null;   // PDF prompt-book anchor (MVP optional)
  trigger: Trigger;                 // §4
  /** Polymorphic payloads. Y.Array so payload reorder is CRDT-safe. */
  payloads: Y.Array<Y.Map<unknown>>;
  duration_hint_ms: number | null;
  notes: string;
  /** Y.Text or plain string — see OPEN QUESTION below. */
  // history is NOT here; it lives in history.jsonl outside the CRDT.
  /** Set by SHOW mode to freeze payload edits (per §7). */
  payload_frozen_at: string | null; // ISO timestamp or null
  /** Bookkeeping (CRDT-safe last-write-wins). */
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
}
```

**OPEN QUESTION 2.5.a — Y.Text for notes?**
Should `notes` and `standby_note` be `Y.Text` (collab-aware character-level merging) or plain strings (last-write-wins)? Phase 2 research shows QLab tolerates LWW for notes well. Recommendation: **plain strings in MVP** (simpler, fewer Yjs gotchas), upgrade to Y.Text in 0.2 if user feedback demands. Forge implements as plain string with TODO comment.

### 2.6 `payloads` Y.Array (per cue)

Each payload is a `Y.Map`. Schema details in §5. Y.Map (not raw JSON) because:

1. Individual payload fields are editable in REHEARSAL by different operators (LX op edits LXRef, SX op edits OSC-to-QLab) — Yjs lets these merge without overwrite.
2. The `type` discriminator is immutable once set; mutation is rejected by validation hook.

### 2.7 `routing` Y.Map

Routes payload-type + tag (or device-id) to a concrete transport descriptor (host/port/path). Per §10.

```ts
export interface RoutingEntryMap {
  id: string;                       // UUIDv7
  match: {
    payload_type: PayloadType;      // 'osc' | 'msc' | 'lx_ref' | …
    tag: string | null;             // optional sub-selector (e.g. console="eos")
  };
  transport: TransportDescriptor;   // resolved at dispatch time, see §10
  enabled: boolean;
  notes: string;
}
```

### 2.8 `proposals` Y.Array (SHOW-mode only)

In SHOW mode, structural edits (insert / delete / reorder cue, change payload) become Proposal entries:

```ts
export interface ProposalMap {
  id: string;
  created_at: string;
  created_by: string;             // operator_id
  change_kind: 'insert' | 'delete' | 'reorder' | 'edit_payload' | 'edit_meta';
  target_cue_id: string | null;
  patch: unknown;                 // JSON-Patch-like or whole-object replacement
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string;
}
```

Approval applies the patch to the live cuelist atomically (the Yjs transaction wrapping the mutation also marks the proposal `approved` and writes a `proposal_approved` event to `history.jsonl`).

### 2.9 `schema` Y.Map

Carries `format_version` and a list of applied migrations for traceability. Mirrors §11.

### 2.10 Awareness (presence)

Yjs awareness is **separate** from the document. Each station broadcasts:

```ts
export interface StationAwareness {
  operator_id: string;
  station_id: string;             // device UUID assigned during pairing
  display_name: string;
  owned_departments: DepartmentTag[];
  watched_departments: DepartmentTag[];
  current_view: { cuelist_id: string; focus_cue_id: string | null };
  presence_color: string;         // assigned by ShowX at pairing (palette of 12)
  cursor: { cue_id: string | null; field: string | null }; // optional fine-grained
  last_heartbeat_at: string;      // ISO
}
```

This is NOT persisted; awareness state evaporates on disconnect by design.

### 2.11 GO events are NOT in the CRDT

This is the most important architectural invariant in this spec.

A GO press fires a side-channel WebSocket pub/sub event (see §8). It is **never written to the Yjs document**. Reason:

- CRDT replication is eventually consistent. If a GO were in the doc, a reconnecting station would observe it as "new" and could re-fire the cue, possibly during a critical SHOW moment.
- The CRDT models *what the show looks like*, not *what just happened*. Fires are events. Events live on a pub/sub topic with idempotency keys.
- `history.jsonl` is the audit-log version of fires (append-only on FOH disk), not the CRDT-replicated version.

This separation is enforced by API: the Yjs document has no public field that accepts a "fired_at" timestamp on a cue. Forge MUST NOT add one.

---

## 3. `.showx` package format (on-disk)

### 3.1 Directory layout

`.showx` is a **directory bundle** (like QLab's `.qlab`), not a zip. macOS Finder shows it as a "package" via `Info.plist` extension hint, but on disk it is plain files for easy diff + git friendliness.

```
my-show.showx/
├── Info.plist                  # macOS bundle hint (optional; ShowX writes it)
├── show.json                   # top-level metadata + cuelist index + routing
├── cuelists/
│   ├── cl_<uuid_a>.json        # per-cuelist file (MVP = 1)
│   └── cl_<uuid_b>.json        # post-MVP
├── snapshots/
│   ├── snap_<uuid>_2026-06-17T19-00-00Z.json   # SHOW-mode frozen payload state
│   └── …
├── media/                      # arbitrary referenced files (PDFs, audio cues if shipped inline)
│   ├── audio/
│   ├── video/
│   ├── scripts/                # PDF prompt-book + cue→line index
│   └── images/
├── routing.json                # active routing table (denormalized copy from Yjs `routing`)
├── operators.json              # operator/station registry (denormalized copy)
├── history.jsonl               # append-only audit log; never rewritten
└── doc.yjs                     # binary Yjs document blob (Y.encodeStateAsUpdate)
```

`doc.yjs` is the canonical CRDT state. `show.json`, `cuelists/*.json`, `routing.json`, `operators.json` are **denormalized JSON projections** of the same data — derived from the Yjs doc on save, easier for humans (diff, git, hand-edit-in-emergency, CSV-import pipelines). On load, ShowX prefers `doc.yjs` (faster, lossless); the JSON projections are recomputed.

**Reasoning for both:** Yjs binary is the source of truth for CRDT replay/merge, but you cannot diff or grep it. The JSON projections satisfy "show file is human-readable" cultural requirement (per Phase 2 research §5).

### 3.2 `show.json`

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
  "snapshot_index": [
    { "id": "snap_…", "cuelist_id": "cl_main", "taken_at": "2026-06-17T19:00:00Z", "file": "snapshots/snap_….json" }
  ],
  "applied_migrations": ["2026-06-01_initial"]
}
```

### 3.3 `cuelists/<id>.json`

```jsonc
{
  "id": "cl_main",
  "name": "Main Show",
  "default_trigger": "manual",
  "go_authority": "sm_called",
  "sm_offline_policy": { "kind": "delegate", "to_operator_id": "op_assistant_sm" },
  "playhead": { "cue_id": "01J8H...Q1", "armed_cue_id": null },
  "show_snapshot_id": null,
  "cues": [
    {
      "id": "01J8H...Q1",
      "label": "Q 1",
      "description": "House to half, pre-show music fades",
      "department": ["LX", "SX"],
      "standby_note": "House lights up at door open",
      "script_line_ref": null,
      "trigger": { "kind": "manual" },
      "payloads": [
        { "type": "lx_ref", "device_id": "dev_eos", "cue_list": 1, "cue_number": 1, "id": "p_…" },
        { "type": "osc",    "device_id": "dev_qlab", "address": "/cue/preshow/start", "args": [], "id": "p_…" }
      ],
      "duration_hint_ms": null,
      "notes": "",
      "payload_frozen_at": null,
      "created_at": "...", "created_by": "op_jana",
      "modified_at": "...", "modified_by": "op_lx"
    }
  ]
}
```

### 3.4 `routing.json`

Mirror of Yjs `routing` Y.Map (denormalized). See §10 for schema.

### 3.5 `operators.json`

```jsonc
{
  "operators": [
    { "id": "op_jana", "name": "Jana", "role": "stage_manager",
      "owned_departments": ["SM"], "watched_departments": ["LX","SX","VIDEO","AUTO"],
      "default_view": "global" },
    { "id": "op_lx",   "name": "Petr", "role": "operator",
      "owned_departments": ["LX"], "watched_departments": ["SM"],
      "default_view": "lx" }
  ],
  "stations": [
    { "id": "stn_ipad_sm", "operator_id": "op_jana", "device_label": "SM iPad 12.9",
      "paired_at": "2026-06-15T09:12:00Z", "presence_color": "#FFD23F" }
  ]
}
```

### 3.6 `history.jsonl`

Append-only line-delimited JSON. One event per line. Never rewritten in place; ShowX rolls files at size threshold (`history.jsonl` → `history.<n>.jsonl.gz`) but never edits past entries.

```ts
export type HistoryEvent =
  | { ts: string; kind: 'show_opened'; show_id: string; by: string }
  | { ts: string; kind: 'mode_changed'; from: 'rehearsal'|'show'; to: 'rehearsal'|'show'; by: string }
  | { ts: string; kind: 'cue_fired'; cuelist_id: string; cue_id: string; cue_label: string;
      station_id: string; operator_id: string; payloads_dispatched: number; sequence: number }
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

`ts` is ISO 8601 with millisecond precision. `sequence` on `cue_fired` is monotonic per show; see §8 for idempotency.

### 3.7 Versioning + migration

- `format_version` at the file level (`show.json`) tracks the package format itself ("are files laid out the same way?"). Major bumps on layout change.
- `schema_version` at the data level (per top-level object) tracks field schema ("are field names the same?"). Minor bumps on additive field changes.
- `applied_migrations` array records which migration scripts have been run, so a 0.5 doc opened in 0.7 knows what to apply.

Migration files live in `showX/src/modules/cuelist-core/migrations/<yyyy-mm-dd>_<slug>.ts`. Each exports `up(json) → json` and `down(json) → json` (rarely used; we keep `down` for safety nets). See §11.

### 3.8 Save semantics

A save is one of:

1. **Autosave** every 30 seconds during REHEARSAL while changes are pending.
2. **Explicit save** triggered by SM or any operator via UI / keystroke.
3. **Mode-transition save** — REHEARSAL → SHOW always writes a full save + a `snapshots/snap_<uuid>_<ts>.json` snapshot of all cue payloads.
4. **Pre-close save** when ShowX is being shut down.

Save procedure:

1. Open Yjs transaction; obtain `Y.encodeStateAsUpdate(doc)` → write to `doc.yjs.tmp`.
2. Derive JSON projections (`show.json`, `cuelists/*.json`, `routing.json`, `operators.json`) → write to `.tmp` siblings.
3. `fsync` all `.tmp` files.
4. Atomic rename to final names.
5. Append to `history.jsonl` (no rename needed; append is atomic on POSIX for <PIPE_BUF).
6. If anything fails before step 4, abort and keep prior files untouched.

### 3.9 Load semantics

On `File > Open`:

1. Validate `show.json` matches `format_version` we support; if older, run migrations (§11) on JSON projections + doc.yjs.
2. Read `doc.yjs` → reconstruct Yjs document via `Y.applyUpdate`.
3. If `doc.yjs` missing or corrupt (CRC fail), fall back to JSON projections: re-build Yjs document from `show.json` + `cuelists/*.json` + `routing.json` + `operators.json`. Log `recovery_from_json`.
4. Replay history check — count `cue_fired` events; expose to UI ("Loaded show with 142 historical fires").
5. Open broker on assigned port (default 5300); advertise mDNS.

---

## 4. Cue model

### 4.1 Cue is untyped; payloads carry the type

The cue is a generic shell with:

- `id` (UUIDv7) — monotonic, sortable, generated client-side, safe for offline-edit-then-merge.
- `label` — operator-facing short name ("Q 11", "Door slam", "BLK").
- `description` — one-paragraph human description.
- `department[]` — required, ≥1 element from `DepartmentTag` enum (§6).
- `standby_note` — what the SM says on comms before this cue ("Standby LX 11 and SX 5").
- `script_line_ref` — optional reference to a script anchor (see §4.5).
- `trigger` — discriminated union, exactly one trigger semantic (§4.2).
- `payloads[]` — 0..N typed payloads (§5).
- `duration_hint_ms` — display-only hint for timeline view.
- `notes` — free-form long text.
- `payload_frozen_at` — set by SHOW mode (§7); null in REHEARSAL.
- `created_at` / `created_by` / `modified_at` / `modified_by` — bookkeeping.

```ts
// src/types/cue.ts (excerpt, normative)

import type { Payload } from './payload';

export type DepartmentTag =
  | 'LX' | 'SX' | 'VIDEO' | 'AUTO' | 'PYRO' | 'FS' | 'SM' | 'OTHER';

export type Trigger =
  | { kind: 'manual' }
  | { kind: 'auto_follow'; prev_cue_id: string }
  | { kind: 'auto_continue'; delay_ms: number }
  | { kind: 'timecode'; time_ms: number; source: 'ltc' | 'mtc' | 'internal' };

export interface Cue {
  id: string;                       // UUIDv7
  label: string;
  description: string;
  department: DepartmentTag[];      // 1..N
  standby_note: string;
  script_line_ref: string | null;
  trigger: Trigger;
  payloads: Payload[];
  duration_hint_ms: number | null;
  notes: string;
  payload_frozen_at: string | null;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
}
```

### 4.2 Trigger taxonomy

Per Phase 2 research §4, four trigger kinds. Only the first three are MVP.

| `trigger.kind` | Semantics | MVP? |
|---|---|---|
| `manual` | Fires when SM/operator presses GO at cue position. Default. | yes |
| `auto_follow` | Fires when `prev_cue_id` *completes* (after its `duration_hint_ms` or its own auto-continue). Used for chained crossfades. | yes |
| `auto_continue` | Fires `delay_ms` after the previous cue *starts*. Used for parallel chains. | yes |
| `timecode` | Fires when external clock crosses `time_ms`. Source is LTC/MTC/internal. | no (0.2) |

`auto_follow` and `auto_continue` are computed in the Cuelist Core scheduler — they have no special CRDT representation beyond the discriminator. The scheduler observes a `cue_fired` event on the GO side-channel (§8) and consults the cuelist for any follow chain.

**OPEN QUESTION 4.2.a — completion semantics for `auto_follow`.**
"Completion" for a cue with no `duration_hint_ms` is ambiguous (instant? wait forever?). Recommendation: if `duration_hint_ms` is null, `auto_follow` fires immediately after the previous cue's GO is dispatched (effectively identical to `auto_continue(0)`). Forge implements with this rule; Architect may override.

### 4.3 Compound (multi-department) cues

A single cue can carry multiple payloads targeting different departments. Example: "Door slam" with `department=["SX","LX"]`:

```jsonc
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

Both SX op and LX op see this row in their filtered view (§6). Each sees the cue label + standby; the SX op sees `payload[0]` highlighted, the LX op sees `payload[1]` highlighted, the other payload greyed-out.

### 4.4 GO and the cue lifecycle

A cue has the following lifecycle states tracked **per station** in awareness (not in CRDT):

- `pending` — ahead of playhead, not yet armed
- `armed` — playhead at this cue; standby has been called (SM keyboard `Q` or auto on prev-cue-fire)
- `firing` — GO pressed; dispatcher processing payloads
- `fired` — all payloads dispatched (success or transport error)
- `skipped` — explicit skip by SM (logged to history.jsonl)

State transitions feed UI (red dot on armed cue, green flash on fire). The state itself is NOT persisted.

### 4.5 `script_line_ref` shape (MVP optional)

When present, `script_line_ref` points into a script asset under `media/scripts/`:

```ts
// e.g. "scripts/hamlet_prompt.pdf#page=42&anchor=line-1217"
type ScriptLineRef = string;  // opaque URI; rendered by PDF viewer module post-MVP
```

MVP: stored as string, displayed but not auto-navigated. Click-to-jump is post-MVP.

### 4.6 Cue history

Per-cue history is **NOT** stored inline on the cue. All edit/fire events go to `history.jsonl`. UI reconstructs per-cue history by scanning `history.jsonl` for entries with `cue_id == X` when the operator opens the cue's history panel.

Rationale: keeps the CRDT model small; offloads audit growth to a flat log file that scales.

---

## 5. Payload polymorphism

### 5.1 Discriminated union

All payload types share `id` + `type`. The `type` field is the discriminator.

```ts
// src/types/payload.ts (normative)

export type PayloadType =
  | 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group';

export interface PayloadBase {
  id: string;                       // UUIDv7
  type: PayloadType;
  /** Optional sub-selector for routing (§10). Free string set by author. */
  tag: string | null;
  /** Authored display note ("Eos cue 47 — Q1 blackout"). UI helper. */
  note: string;
}

export interface OscPayload extends PayloadBase {
  type: 'osc';
  /** Logical device id from devices map; resolved via routing to host:port. */
  device_id: string;
  address: string;                  // e.g. "/cue/start"
  args: OscArg[];
}

export interface MscPayload extends PayloadBase {
  type: 'msc';
  device_id: string;
  command: 'go' | 'stop' | 'resume' | 'load' | 'set' | 'fire' | 'all_off';
  cue_list: string | null;          // null = current
  cue_number: string | null;
  device_id_msc: number;            // MSC 'device ID' byte 0..127, default 127 (all)
}

export interface LxRefPayload extends PayloadBase {
  type: 'lx_ref';
  /** Logical console ("eos" / "ma3" / "chamsys"). Maps via routing to dispatcher driver. */
  device_id: string;
  cue_list: number;                 // Eos/MA cue list
  cue_number: number;               // Eos cue number; allows fractional (1.5) via float
}

export interface MidiPayload extends PayloadBase {
  type: 'midi';
  device_id: string;
  message:
    | { kind: 'note_on'; channel: number; note: number; velocity: number }
    | { kind: 'note_off'; channel: number; note: number; velocity: number }
    | { kind: 'cc'; channel: number; controller: number; value: number }
    | { kind: 'program_change'; channel: number; program: number }
    | { kind: 'raw'; bytes: number[] };
}

export interface WebhookPayload extends PayloadBase {
  type: 'webhook';
  url: string;                      // https only outside loopback (validated)
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body: string | null;              // string; if JSON, author serializes
  timeout_ms: number;               // default 5000
}

export interface WaitPayload extends PayloadBase {
  type: 'wait';
  duration_ms: number;
}

export interface GroupPayload extends PayloadBase {
  type: 'group';
  /** Ordered references to other Cue ids (typically other cuelists or the same cuelist). */
  child_cue_ids: string[];
  /** When children fire — parallel or in series. */
  fire_mode: 'parallel' | 'series';
}

export type Payload =
  | OscPayload | MscPayload | LxRefPayload | MidiPayload
  | WebhookPayload | WaitPayload | GroupPayload;

export type OscArg =
  | { type: 'int'; value: number }
  | { type: 'float'; value: number }
  | { type: 'string'; value: string }
  | { type: 'blob'; value: string }       // base64 string in JSON; Buffer in runtime
  | { type: 'bool'; value: boolean }
  | { type: 'nil' };
```

### 5.2 Validation rules

| Payload type | Rule |
|---|---|
| all | `id` unique within parent cue. `type` immutable post-creation. |
| `osc` | `address` MUST start with `/`. `args` MAY be empty. |
| `msc` | `device_id_msc` in 0..127 (where 127 = all devices). `command` from enum. |
| `lx_ref` | `cue_list` ≥ 1. `cue_number` ≥ 0 (Eos allows 0.x). |
| `midi` | `channel` 1..16 (1-indexed). `note` / `controller` 0..127. `velocity` 0..127. |
| `webhook` | `url` must parse; `https://` enforced unless `url` is `http://127.0.0.1*` or `http://localhost*` (loopback exception for local integrations). `body` ≤ 1 MB. |
| `wait` | `duration_ms` ≥ 0; ≤ 600000 (10 minutes; longer = author error). |
| `group` | `child_cue_ids` ≤ 32 (loop guard). No circular references (validated at fire time). |

Validation runs:

1. Client-side in PWA when author edits — UI shows red border on invalid field.
2. Yjs observer in Electron — rejects/reverts invalid transactions (warning toast to author).
3. Dispatcher pre-fire — final safety net.

### 5.3 Routing: payload → transport

The cue payload carries **logical** identifiers (`device_id`, `cue_list`, `cue_number`). The routing table (§10) resolves logical → physical transport. This preserves the architectural rule (`feedback_aggregation_vs_parameters_split.md`): **module declares semantic events; dispatcher maps to hardware.**

Example resolution for `{ type: 'lx_ref', device_id: 'dev_eos', cue_list: 1, cue_number: 47 }`:

1. Look up `dev_eos` in routing table → returns `{ transport: 'osc', host: '10.0.1.10', port: 8000, encoding: 'eos' }`.
2. Driver `eos_osc` (registered in dispatcher) formats: send OSC `/eos/cue/1/47/fire` (no args) to host:port.

Drivers MUST be pure (input: payload + transport descriptor → outbound bytes; no hidden state). Routing changes don't invalidate cues; only transport binding changes.

### 5.4 Future payload types (not MVP)

Reserved type names for forward-compat:

- `audio_play` / `audio_stop` (post-MVP if ShowX ever ships native audio — currently fired via OSC to QLab).
- `video_play` / `video_stop` (same — currently OSC to disguise/Resolume).
- `dmx_scene` (direct DMX scene fire — likely lives in BridgeX scope, not ShowX).
- `serial` (RS-232 / RS-485 for legacy show control).
- `ndi_route` (NDI video routing).

Forward compat rule (§11): payload types ShowX doesn't recognise are stored as `{ type: 'unknown_<original_type>', original: <raw JSON> }` and shown in UI as "Unsupported payload — saved as-is" so the file round-trips intact.

---

## 6. Per-department view model

### 6.1 Department enum

```ts
export const CANONICAL_DEPARTMENTS = [
  'LX',     // Lighting
  'SX',     // Sound / SFX
  'VIDEO',  // Projection / playback / cameras
  'AUTO',   // Automation (flying, traps, scenery moves)
  'PYRO',   // Pyrotechnics + special effects
  'FS',     // Followspot
  'SM',     // Stage Manager (calls, never owns payloads)
  'OTHER',  // Escape hatch — operator can rename in show meta
] as const;

export type DepartmentTag = typeof CANONICAL_DEPARTMENTS[number];
```

Departments are stored in `show.meta.departments`. The default is the canonical set. Operators MAY add custom strings later (post-MVP); MVP locks to canonical enum to keep filter UI simple.

### 6.2 Owned vs watched

Each station has two sets:

- `owned_departments` — departments this station executes payloads for. The operator at this station is responsible.
- `watched_departments` — departments this station observes but does not execute.

Typical configurations:

| Station | Owned | Watched |
|---|---|---|
| SM iPad | `[SM]` | `[LX, SX, VIDEO, AUTO, PYRO, FS, OTHER]` (= all) |
| LX op laptop | `[LX]` | `[SM]` |
| SX op iPad | `[SX]` | `[SM]` |
| Solo op (small venue) | `[LX, SX, VIDEO]` | `[SM]` |
| Director (rehearsal) | `[]` | all (read-only) |

### 6.3 View filter algorithm

A cue is **visible** in a station's default view iff:

```
cue.department ∩ (owned ∪ watched) ≠ ∅
```

A cue is **actionable** (operator can press GO for it locally) iff:

```
cue.department ∩ owned ≠ ∅
```

A payload within a cue is **highlighted** iff its routing tag/department matches owned. Other payloads on the same cue are shown dimmed (so the operator knows what else fires alongside their work).

Pseudocode (UI selector, per cuelist):

```ts
function visibleCues(cues: Cue[], owned: Set<DepartmentTag>, watched: Set<DepartmentTag>): Cue[] {
  const lens = new Set([...owned, ...watched]);
  return cues.filter(c => c.department.some(d => lens.has(d)));
}

function isActionable(cue: Cue, owned: Set<DepartmentTag>): boolean {
  return cue.department.some(d => owned.has(d));
}

function highlightedPayloads(cue: Cue, owned: Set<DepartmentTag>): Set<string> {
  // MVP rule: payload.tag is treated as a department hint when it's a canonical tag;
  // otherwise all payloads are highlighted if the cue is actionable.
  const ownedHasAny = cue.department.some(d => owned.has(d));
  if (!ownedHasAny) return new Set();
  const ids = new Set<string>();
  for (const p of cue.payloads) {
    const ptag = p.tag ?? '';
    if (CANONICAL_DEPARTMENTS.includes(ptag as DepartmentTag)) {
      if (owned.has(ptag as DepartmentTag)) ids.add(p.id);
    } else {
      ids.add(p.id);
    }
  }
  return ids;
}
```

### 6.4 SM view

The SM view is a special configuration:

- `owned = [SM]`
- `watched = [all other departments]`

SM sees every cue, all payloads, plus the standby note and called-text. SM's GO presses dispatch authoritative GO events (§8) that other stations consume.

### 6.5 Compound cues from operator perspective

A compound cue (e.g. door slam with SX + LX payloads) shows up in both SX op view and LX op view. Each operator sees their own payload highlighted; the other is greyed-out for context. This satisfies "operators know what fires alongside them" without forcing multi-cue mirror state.

### 6.6 OPEN QUESTION 6.6.a — payload.tag and department assignment

Should each payload carry an explicit `department: DepartmentTag` field instead of inferring from `tag`? Recommendation: **yes, add `payload.department: DepartmentTag | null` in 0.2**, MVP infers from cue.department[0] if cue has exactly one department, else falls back to `tag` heuristic. Forge implements MVP heuristic with TODO; Architect promotes to first-class field at 0.2.

---

## 7. REHEARSAL vs SHOW mode state

### 7.1 Mode field

`show.meta.mode: 'rehearsal' | 'show'` is the single source of truth.

### 7.2 REHEARSAL mode behavior

- Full Yjs collab. All stations editable.
- Last-write-wins on metadata (notes, standby, labels). Yjs handles concurrent merges deterministically.
- Anyone with edit perm (per operator role) can mutate cue structure (add/delete/reorder).
- GO events fire from any station with `owned ⊇ {SM}` or per `go_authority` config.
- Autosave every 30 s; `history.jsonl` captures structural events but **not** GO fires (those are also logged, but distinguished by `kind == 'cue_fired'` so reports can filter rehearsal fires out).

### 7.3 SHOW mode behavior

Entered by SM via explicit single-click "LOCK SHOW" UI action. On transition:

1. Yjs transaction taps every cue and sets `payload_frozen_at = now` on each. (This is a copy-on-write marker; the payload objects themselves are not duplicated in CRDT.)
2. A snapshot file is written: `snapshots/snap_<uuid>_<ISO>.json` containing the cuelist + payloads as JSON. This is the "frozen contract".
3. `cuelist.show_snapshot_id` set to the new snapshot id.
4. `history.jsonl` gets a `mode_changed` event.

In SHOW mode:

- **Payload edits** → blocked at API level. Authoring UI shows "🔒 SHOW mode — editing locked. Propose change?" inline. If author confirms, the edit becomes a Proposal (§2.8).
- **Metadata edits** (notes, standby, labels) → still live, last-write-wins. These never fire anything, so safe to keep editable.
- **Structural changes** (insert/delete/reorder) → blocked at API level; routed to proposals.
- **GO events** → fire as normal. Each fire is `history.jsonl`-logged with `cue_fired` + snapshot_id + sequence.
- **Mode exit** → requires SM authentication (in MVP: SM identity match via pairing token; 0.2: 2FA via QR code on SM iPad).

### 7.4 Proposal queue

Proposal entries live in Yjs `proposals` Y.Array. UI shows SM a queue of pending proposals (badge on top bar). SM clicks Approve → patch applies via Yjs transaction + proposal marked `approved` + `history.jsonl` event. SM clicks Reject → proposal marked `rejected` + history event + author gets toast.

```ts
export interface Proposal {
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

export type ProposalPatch =
  | { kind: 'insert_cue'; after_cue_id: string | null; cue: Cue }
  | { kind: 'delete_cue'; cue_id: string }
  | { kind: 'reorder_cues'; cuelist_id: string; new_order: string[] }
  | { kind: 'edit_payload'; cue_id: string; payload_id: string; new_payload: Payload }
  | { kind: 'edit_meta'; field: string; new_value: unknown };
```

### 7.5 Mode transitions

| Transition | Requires | Side effects |
|---|---|---|
| REHEARSAL → SHOW | SM identity | freeze payloads, take snapshot, log mode_changed |
| SHOW → REHEARSAL | SM identity | unfreeze payloads (clear `payload_frozen_at`), log mode_changed. Snapshot retained for forensics. |

### 7.6 GO authority in SHOW mode

Per cuelist `go_authority` (§2.4). In SHOW mode the authority model is *strictly enforced* — the dispatcher refuses GO events from stations that don't match `go_authority`:

- `sm_called` — only SM station's GO is authoritative; other stations send "confirm" events which the dispatcher waits for (or auto-confirms per-cuelist setting).
- `auto_cascade` — first qualified GO from any station cascades to all departments.
- `per_dept` — every department station has its own GO; no cross-dept cascade.
- `timecode` — only timecode source can fire; SM GO acts as override only (logged as `override`).

### 7.7 history.jsonl fire entry

Each fire (REHEARSAL or SHOW) appends one event:

```jsonc
{
  "ts": "2026-06-17T19:42:01.247Z",
  "kind": "cue_fired",
  "cuelist_id": "cl_main",
  "cue_id": "01J8H...Q11",
  "cue_label": "LX Q 11",
  "station_id": "stn_ipad_sm",
  "operator_id": "op_jana",
  "payloads_dispatched": 2,
  "sequence": 142,
  "mode": "show",
  "snapshot_id": "snap_…"   // null in REHEARSAL
}
```

`sequence` is monotonic per show, assigned by the dispatcher (single source of truth = FOH Electron process). This guarantees idempotency on the GO side-channel (§8).

---

## 8. GO events (side-channel)

### 8.1 Why GO is not in the CRDT

(Reiterated for emphasis — see §2.11.)

GO is an **event**, not a piece of state. CRDT replication is for state. Modelling GO in CRDT risks:

- A station that was offline for 5 minutes reconnects and observes a "Q 47 GO" tombstone, then re-fires it.
- Two concurrent GO presses on the same cue produce a merge that's neither press "winning" clearly.
- Adding GO timestamps to the cue requires every fire to mutate the CRDT — wasteful, race-prone.

The CRDT carries cuelist *structure*. GO presses ride on a parallel WebSocket pub/sub channel with explicit idempotency keys.

### 8.2 WSS topic structure

The Electron-embedded broker exposes (on the same port as Yjs sync, distinguished by path):

- `wss://showx.local:5300/yjs/<show_id>` — Yjs sync (handled by `y-websocket`)
- `wss://showx.local:5300/events/<show_id>` — pub/sub event bus for GO + control

Topic names within the events socket:

| Topic | Direction | Payload shape | Purpose |
|---|---|---|---|
| `go.request` | station → FOH | `GoRequest` | Operator presses GO; FOH evaluates authority |
| `go.confirm` | station → FOH | `GoConfirm` | Department op confirms in `sm_called` mode |
| `go.dispatched` | FOH → all | `GoDispatched` | FOH announces "we fired Q X at T" — UI updates |
| `arm.request` | station → FOH | `ArmRequest` | Standby called — SM iPad `Q` key |
| `arm.broadcast` | FOH → all | `ArmBroadcast` | FOH tells all stations "cue X is armed" |
| `presence.heartbeat` | station → FOH | `Heartbeat` | 1 Hz; keeps connection alive + drives status colors |
| `mode.transition` | SM → all | `ModeTransition` | REHEARSAL ↔ SHOW broadcast |

### 8.3 Event shapes

```ts
export interface GoRequest {
  topic: 'go.request';
  request_id: string;             // UUIDv7 — idempotency key
  cue_id: string;
  cuelist_id: string;
  station_id: string;
  operator_id: string;
  client_ts: string;              // ISO; FOH uses its own ts as authoritative
  /** Set if SM uses "fire NOW" override regardless of cue armed state. */
  override: boolean;
}

export interface GoDispatched {
  topic: 'go.dispatched';
  request_id: string;             // echoes GoRequest
  cue_id: string;
  cuelist_id: string;
  sequence: number;               // monotonic per show, assigned by FOH
  dispatched_at: string;          // FOH wall clock
  payloads_dispatched: number;    // count actually sent to transports
  payloads_failed: string[];      // payload ids that failed validation/transport
  fired_by: { station_id: string; operator_id: string };
}
```

### 8.4 Idempotency model

The dispatcher de-duplicates GO requests using `(show_id, request_id)`. Re-sends from a station that lost ACK get the same `GoDispatched` reply and do not re-fire. The dispatcher keeps a rolling LRU of 1000 request_ids (sufficient for a 3-hour show at 5 cues/min).

If a station crashes mid-press and the FOH never gets the request, no fire happens — the SM notices and re-presses. This is the safer failure mode than double-fire.

### 8.5 SM authority check

`sm_authority_check` is a server-side guard, not a payload field. Logic:

```ts
function authorise(req: GoRequest, cuelist: Cuelist): AuthorityResult {
  switch (cuelist.go_authority) {
    case 'sm_called':
      if (operatorOwns(req.operator_id, 'SM')) return { ok: true, mode: 'sm' };
      return { ok: false, reason: 'not_sm' };
    case 'auto_cascade':
      return { ok: true, mode: 'cascade' };
    case 'per_dept':
      if (cueDeptIntersects(req.cue_id, operatorOwned(req.operator_id))) return { ok: true, mode: 'dept' };
      return { ok: false, reason: 'not_owner' };
    case 'timecode':
      if (req.override && operatorOwns(req.operator_id, 'SM')) return { ok: true, mode: 'sm_override' };
      return { ok: false, reason: 'timecode_only' };
  }
}
```

Rejected requests get a `go.rejected` reply with reason; station shows toast "Not authorised — SM only" etc.

---

## 9. Postgres schema (Cloud Sync module only)

### 9.1 Scope

Cloud Sync is an **opt-in Pro+ module**. When disabled (Free tier, or Pro user who hasn't enabled it), Postgres has nothing about this show. The data model below applies only when the module is loaded and the user has signed into Supabase.

Cloud Sync does **two** things:

1. Backup — push `.showx` package contents to Postgres so the user can recover from FOH Mac failure or move venue.
2. Cross-venue Yjs sync — run a second Yjs provider pointing at a cloud `y-websocket` node so a remote station (e.g. director at home) can join the document live.

### 9.2 Tables (MVP cloud sync subset)

```sql
-- supabase/migrations/<ts>_showx_cloud_sync.sql

CREATE TABLE shows (
  id              UUID PRIMARY KEY,           -- = show_id from .showx
  account_id      UUID NOT NULL,              -- Supabase Auth user / org
  title           TEXT NOT NULL,
  venue           TEXT,
  date            DATE,
  schema_version  INT  NOT NULL DEFAULT 1,
  format_version  TEXT NOT NULL DEFAULT '1.0',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE cuelists (
  id            UUID PRIMARY KEY,
  show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  default_trigger TEXT NOT NULL,
  go_authority  TEXT NOT NULL,
  sm_offline_policy JSONB NOT NULL,
  position      INT  NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cues (
  id            UUID PRIMARY KEY,
  cuelist_id    UUID NOT NULL REFERENCES cuelists(id) ON DELETE CASCADE,
  position      INT  NOT NULL,        -- order within cuelist
  label         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  department    TEXT[] NOT NULL,
  standby_note  TEXT NOT NULL DEFAULT '',
  script_line_ref TEXT,
  trigger       JSONB NOT NULL,
  duration_hint_ms INT,
  notes         TEXT NOT NULL DEFAULT '',
  payload_frozen_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT NOT NULL,
  modified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_by   TEXT NOT NULL
);

CREATE TABLE cue_payloads (
  id            UUID PRIMARY KEY,
  cue_id        UUID NOT NULL REFERENCES cues(id) ON DELETE CASCADE,
  position      INT  NOT NULL,
  type          TEXT NOT NULL,
  tag           TEXT,
  note          TEXT NOT NULL DEFAULT '',
  payload       JSONB NOT NULL              -- full discriminated-union body
);

CREATE TABLE operators (
  id            TEXT PRIMARY KEY,           -- "op_jana"
  show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  owned_departments  TEXT[] NOT NULL,
  watched_departments TEXT[] NOT NULL,
  default_view  TEXT NOT NULL
);

CREATE TABLE routing_entries (
  id            UUID PRIMARY KEY,
  show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  match         JSONB NOT NULL,
  transport     JSONB NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT NOT NULL DEFAULT ''
);

-- Yjs binary persistence for cloud y-websocket node
CREATE TABLE yjs_document_snapshots (
  show_id       UUID PRIMARY KEY REFERENCES shows(id) ON DELETE CASCADE,
  doc_blob      BYTEA NOT NULL,             -- Y.encodeStateAsUpdate(doc)
  doc_size      INT NOT NULL,
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE yjs_document_updates (
  id            BIGSERIAL PRIMARY KEY,
  show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  update_blob   BYTEA NOT NULL,
  client_id     TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only history mirror (subset of history.jsonl)
CREATE TABLE history_events (
  id            BIGSERIAL PRIMARY KEY,
  show_id       UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL,
  kind          TEXT NOT NULL,
  payload       JSONB NOT NULL
);

CREATE INDEX history_events_show_ts ON history_events(show_id, ts);
CREATE INDEX yjs_document_updates_show_received ON yjs_document_updates(show_id, received_at);
```

### 9.3 RLS policies

All tables enable Row-Level Security. Policies:

```sql
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_read_their_shows" ON shows
  FOR SELECT USING (account_id = auth.uid());
CREATE POLICY "owners_write_their_shows" ON shows
  FOR INSERT WITH CHECK (account_id = auth.uid());
CREATE POLICY "owners_update_their_shows" ON shows
  FOR UPDATE USING (account_id = auth.uid());
-- repeat per descendant table joining shows on show_id

-- Service role (cloud y-websocket node) bypasses RLS for sync.
```

Org-level access (team accounts) post-MVP: `account_id` → `org_id` migration with a `members` join table.

### 9.4 Sync semantics

Direction: **`.showx` package on FOH disk is master; Postgres trails.**

- On Cloud Sync enable: FOH uploads current `.showx` → JSON projections → Postgres rows + `doc.yjs` → `yjs_document_snapshots`.
- Ongoing: FOH dispatches every Yjs transaction's update → `yjs_document_updates` (append-only stream). Cloud y-websocket node reads + applies → distributes to other cloud subscribers.
- Periodic compaction (cron job in cloud node): consolidate updates into a new snapshot, mark older updates inactive (retain for 30 days for forensics).
- On user "Restore from cloud": FOH downloads latest snapshot + updates, applies to fresh Yjs doc, writes new `.showx` directory.

The FOH never reads CRDT state from Postgres for runtime decisions — Postgres is a downstream replica. This guarantees no cloud round-trip in the GO path.

### 9.5 Migration strategy (Postgres)

Migrations live in `showX/src/modules/cloud-sync/supabase/migrations/`. Each new migration file is timestamped (`YYYYMMDD_HHMM_name.sql`) and applied via Supabase CLI (`supabase db push`). The `cloud-sync` module checks `applied_migrations` at startup and refuses to enable if FOH's expected schema is newer than cloud's.

---

## 10. Cue catalog export (for routing module)

### 10.1 Purpose

The Cuelist Core module publishes a **cue catalog** so the routing UI (in protocol dispatcher subsystem) can show "what could fire" and let the operator map payload-types to transports.

Analogous to EventX's `channel-catalog.json` for the engine-channels contract. Same pattern, different content.

### 10.2 Export shape

```ts
// src/modules/cuelist-core/catalog.ts

export interface CueCatalog {
  schema_version: 1;
  show_id: string;
  generated_at: string;             // ISO
  source: string;                   // "cuelist-core@<version>"
  payload_types_used: PayloadType[];
  devices_referenced: Array<{
    id: string;
    referenced_by_payloads: number;
    payload_types: PayloadType[];   // which types reference this device
  }>;
  cues: CueCatalogEntry[];
}

export interface CueCatalogEntry {
  id: string;
  label: string;
  cuelist_id: string;
  department: DepartmentTag[];
  payloads: Array<{
    id: string;
    type: PayloadType;
    tag: string | null;
    device_id: string | null;
    /** Type-specific summary string. UI-friendly. */
    summary: string;
  }>;
}
```

Example:

```json
{
  "schema_version": 1,
  "show_id": "01J8H...",
  "generated_at": "2026-06-17T18:50:00Z",
  "source": "cuelist-core@0.1.0",
  "payload_types_used": ["osc", "lx_ref", "msc", "wait"],
  "devices_referenced": [
    { "id": "dev_eos", "referenced_by_payloads": 47, "payload_types": ["lx_ref", "osc"] },
    { "id": "dev_qlab", "referenced_by_payloads": 31, "payload_types": ["osc"] }
  ],
  "cues": [
    {
      "id": "01J8H...Q1", "label": "Q 1", "cuelist_id": "cl_main",
      "department": ["LX","SX"],
      "payloads": [
        { "id": "p_a", "type": "lx_ref", "tag": null, "device_id": "dev_eos",
          "summary": "Eos cue list 1, cue 1" },
        { "id": "p_b", "type": "osc", "tag": null, "device_id": "dev_qlab",
          "summary": "OSC /cue/preshow/start to dev_qlab" }
      ]
    }
  ]
}
```

### 10.3 Routing table schema

The routing table (Yjs `routing` Y.Map; persisted in `routing.json`) maps logical devices to concrete transports:

```ts
export interface RoutingEntry {
  id: string;
  match: {
    /** Most specific first. */
    device_id?: string;             // "dev_eos"
    payload_type?: PayloadType;     // "lx_ref"
    tag?: string;                   // optional sub-selector
  };
  transport: TransportDescriptor;
  enabled: boolean;
  notes: string;
}

export type TransportDescriptor =
  | { kind: 'osc';     host: string; port: number; encoding: 'plain' | 'eos' | 'ma3' | 'chamsys' | 'qlab' }
  | { kind: 'midi';    port_name: string }
  | { kind: 'msc';     port_name: string; device_id_msc?: number }
  | { kind: 'http';    base_url: string; default_headers?: Record<string, string> }
  | { kind: 'dmx';     universe: number; subnet?: string }   // via BridgeX-era driver
  | { kind: 'inproc';  module_slug: string };                // route to another loaded module (e.g. EventX Bridge)
```

Match precedence (most specific wins):

1. `device_id` + `payload_type` + `tag`
2. `device_id` + `payload_type`
3. `device_id`
4. `payload_type` + `tag`
5. `payload_type`
6. (no match → drop with log warning)

### 10.4 Catalog refresh semantics

The catalog is recomputed:

- On show open.
- On every Yjs transaction that touches `cues` or `payloads` Y.Arrays.
- On routing change (so the routing UI gets accurate device coverage numbers).

The Cuelist Core module emits an `onCueCatalog(catalog: CueCatalog)` event via `ModuleContext` (see `module_loader.md`). Routing UI subscribes; dispatcher consumes routing changes.

Catalog is NOT persisted to `.showx`; it's a derived artifact. It is, however, written to `media/.cache/cue-catalog.json` for debugging and external tool consumption (e.g. a third-party Companion module pulling cue labels).

---

## 11. Migration & compatibility

### 11.1 Forward compatibility rules

- **Unknown fields are preserved.** Older ShowX opening a 1.5 file with an unknown field on Cue MUST round-trip the field on save. JSON projections use `additionalProperties: true`. Yjs Y.Maps tolerate extra keys natively.
- **Unknown payload types** stored as `{ type: 'unknown_<original>', original: <raw> }`. UI shows "Unsupported payload — saved as-is".
- **Unknown trigger kinds** → cue treated as `manual` with warning toast on load. Original trigger preserved in an `_unknown_trigger` field.

### 11.2 Backward compatibility rules

- ShowX refuses to open a file with `format_version` major > current major. Shows clear upgrade prompt.
- Minor version skew allowed (ShowX 1.0 opens 1.5 file with read-only mode + warning). Operator may force write but risk losing fields.

### 11.3 Migration scripts

Location: `showX/src/modules/cuelist-core/migrations/`.

Each migration file:

```ts
// migrations/2026-09-01_payload_department_field.ts
export const id = '2026-09-01_payload_department_field';
export const description = 'Add explicit Payload.department field (was inferred via tag).';

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

export async function down(show: ShowJson): Promise<ShowJson> {
  for (const cl of show.cuelists) {
    for (const cue of cl.cues) {
      for (const p of cue.payloads) delete p.department;
    }
  }
  show.applied_migrations = show.applied_migrations.filter(x => x !== id);
  return show;
}
```

On `.showx` open:

1. Read `applied_migrations` from `show.json`.
2. Diff vs migrations registry.
3. Run missing `up()` in order.
4. Save back to disk if any ran.

Migrations apply to JSON projections; the doc.yjs is rebuilt from JSON post-migration to avoid CRDT drift.

### 11.4 Schema version field placement

| Field | Where | Bumps when |
|---|---|---|
| `format_version` | `show.json` top level | Package layout changes (new files, renamed dirs) |
| `schema_version` | `show.json` + each top-level Yjs entry | Field schema changes within an object |
| `applied_migrations[]` | `show.json` + Yjs `schema` map | Each migration appended |
| Per-module `persisted_config.version` | Module-specific persisted blob | Module config schema changes (see `module_loader.md`) |

---

## 12. Open questions (for Architect ratification)

These are decisions Forge should NOT make unilaterally. Bundle them for Architect review before the relevant Forge task is queued.

### 12.1 Y.Text vs plain strings for notes (§2.5)
Whether `notes`, `standby_note`, `description` are `Y.Text` (collab character-merging) or plain strings (last-write-wins). Recommendation: plain strings in MVP, revisit at 0.2 based on user reports.

### 12.2 Payload-level department field (§6.6)
Whether each payload gets explicit `department: DepartmentTag | null` or stays inferred from cue + tag heuristic. Recommendation: heuristic in MVP, first-class field in 0.2.

### 12.3 Auto-follow completion when `duration_hint_ms` is null (§4.2.a)
Recommendation: fire immediately (equivalent to `auto_continue(0)`).

### 12.4 SHOW-mode metadata edit policy
Spec currently allows live edits to notes/standby in SHOW mode (last-write-wins). Should LWW also apply to `label`? Recommendation: yes — operators sometimes rename cues mid-show for clarity. Forge implements LWW for label too; if Architect rules otherwise, change in 1 file.

### 12.5 history.jsonl rotation policy
Recommendation: rotate at 50 MB or 10 days, whichever first. Compressed archives kept indefinitely under `history.<n>.jsonl.gz`. No automatic deletion.

### 12.6 Snapshot retention
SHOW-mode snapshots accumulate per LOCK SHOW press. Recommendation: keep all (they're small, ~50-500 KB each) until user explicitly prunes via UI. Post-MVP add "auto-keep last 30 days + final" policy.

### 12.7 Cuelist primary key in Postgres (§9.2)
Currently `cuelists.id UUID PRIMARY KEY` matches `.showx` `cl_<uuid>` form. Confirm we want to expose internal UUIDs in cloud — privacy review? Recommendation: keep UUIDs; they're opaque and accounts are RLS-scoped.

### 12.8 Group payload nesting depth
`GroupPayload` can reference other cues that themselves contain `GroupPayload`. Recommendation: hard limit 4 levels deep + circular reference check. Forge implements with cycle detector.

### 12.9 Idempotency LRU size for GO requests (§8.4)
Current rec: 1000 entries. May be tight for high-density corporate event with 20-cue/min cascade. Recommendation: configurable per-show via `meta.go_idempotency_lru_size`, default 1000, max 10000.

### 12.10 Per-cue lock granularity in SHOW mode
Spec freezes all payloads on lock. Alternative: per-cue freeze (so SM can lock Act 1 cues but leave Act 2 editable). Recommendation: NO per-cue locking in MVP (complexity ROI bad); revisit at 0.3 if Production tier customers request it.

### 12.11 Default `presence_color` palette
Forge needs a palette of 12 distinct colors. Recommendation: WCAG-AA-distinguishable, color-blind safe (use ColorBrewer or similar). Architect to provide palette in a follow-up task spec.

### 12.12 `.showx` package extension and MIME type registration
We've assumed `.showx` directory bundle. Should we register a MIME type for the macOS Launch Services so Finder shows ShowX icon? Recommendation: yes, ship `Info.plist` with bundle hint + register UTI `cz.xlab.showx.package`. Forge in packaging task.

---

## References

### XLAB internal
- `/Users/machintoshhd/Daniel-local/showX/CLAUDE.md` — project DNA
- `/Users/machintoshhd/Daniel-local/xlab-strategy/docs/showx_mvp_scope.md` — MVP scope
- `/Users/machintoshhd/Daniel-local/xlab-strategy/docs/showx_module_architecture.md` — module architecture
- `/Users/machintoshhd/Daniel-local/xlab-strategy/docs/research_foh_cuelist_ux_conventions.md` — Phase 2 research
- `/Users/machintoshhd/Daniel-local/xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` — 2-product pivot lock
- `/Users/machintoshhd/Daniel-local/eventx/docs/channel-catalog.json` — EventX catalog analogue
- `feedback_aggregation_vs_parameters_split.md` — architectural rule: module declares semantics, dispatcher maps to hardware

### External
- [Yjs documentation](https://docs.yjs.dev/)
- [Yjs IndexedDB provider](https://github.com/yjs/y-indexeddb)
- [y-websocket](https://github.com/yjs/y-websocket)
- [QLab 5 — Cue Lists](https://qlab.app/docs/v5/fundamentals/cue-lists/)
- [QLab 5 — Collaboration](https://qlab.app/docs/v5/networking/collaboration/)
- [ETC Eos — Multi-Console Setup](https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Setting_up_Multi-Console_System)
- [USITT ASCII — Standard for Lighting Cue Data](http://westsidesystems.com/alq/ascii.html)
- [MIDI Show Control — Wikipedia](https://en.wikipedia.org/wiki/MIDI_Show_Control)
- [QLab 5 — OSC Dictionary v5](https://qlab.app/docs/v5/scripting/osc-dictionary-v5/)
- [Eos OSC Message Structure](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/About_OSC/OSC_Message_Structure.htm)
- UUIDv7 spec — [RFC 9562 §5.7](https://datatracker.ietf.org/doc/html/rfc9562#name-uuid-version-7)
