# 02 — Document model

The Yjs CRDT tree that represents a show. Single source of truth — every station observes the same Y.Doc via y-websocket.

## Root structure

`src/document/show.ts`'s `createShow(doc)` populates 7 root entries per data_model.md §2.2:

```
Y.Doc
├── meta          Y.Map         show name, timestamps, mode, last_meta_editor
├── operators     Y.Array       paired stations (id, role, depts, presence)
├── devices       Y.Map         hardware endpoints (host, port, transport, driver)
├── routing       Y.Map         payload → device routing table (data_model.md §10.3)
├── cuelists      Y.Map         cuelistId → Y.Map (each cuelist)
├── proposals     Y.Array       SHOW mode edit proposals (0.2 feature, empty in 0.1)
└── schema        Y.Map         { version: 1 } — used by migration system
```

Typed accessors live alongside the factories: `getMeta(doc)`, `getOperators(doc)`, etc. They return the raw Y.Map/Y.Array reference — **never** `toJSON()`. Callers observe directly to get CRDT change events.

## Cue + Payload shape

A cuelist is a Y.Map:

```
Cuelist (Y.Map)
├── id          string
├── label       string
├── go_authority 'sm_only' | 'sm_called' | 'any_owner'
└── cues        Y.Array<Y.Map>     ordered, but display order comes from sort_key
```

Each cue is a Y.Map keyed by `id` (UUIDv7, RFC 9562) with these fields (data_model.md §2.5):

```
Cue (Y.Map)
├── id                  string (UUIDv7)
├── label               string
├── description         string
├── department          string[]    canonical dept tags
├── standby_note        string
├── script_line_ref     string | null
├── trigger             { kind, ... }     see [07]
├── payloads            Y.Array<Y.Map>    see below
├── duration_hint_ms    number | null
├── notes               string
├── payload_frozen_at   string (ISO) | null     for SHOW mode lock
├── sort_key            number     display ordering
├── created_at / by     ISO timestamp / station_id
└── modified_at / by    ISO timestamp / station_id
```

A payload is a Y.Map with a discriminated `type` field — one of `osc`, `msc`, `lx_ref`, `midi`, `webhook`, `wait`, `group` per data_model.md §5.

## sort_key — the reorder workaround

**Decision (B003-002):** the spec originally specified `reorderCues` via `cues.delete(i)` + `cues.insert(j)` on the Y.Array. Yjs 13.6.x throws `Cannot read properties of null (reading 'forEach')` when reinserting an already-integrated Y.Map (the prelim content is nulled after first integration).

**Fix:** every cue carries a `sort_key: number` field. `reorderCues` updates `sort_key` values only (Y.Map LWW). `getCues(cuelist)` returns the raw Y.Array in insertion order. `getCuesSorted(cuelist)` returns the array sorted by `sort_key` — that's what the UI iterates.

**CRDT convergence:** two clones reordering concurrently both settle to one `sort_key` value per cue (LWW resolution). Verified by `tests/unit/modules/cuelist-core/document/crdt-merge.test.ts:80-112`.

**Insertion (`insertCueAfter`):** computes `sort_key = (prev.sort_key + next.sort_key) / 2`. Bounded precision drift ~2^53 inserts between fixed neighbours — not a real concern.

## Mutator API

Every mutator wraps work in `doc.transact(() => { ... })` so observers see a single change event. Pattern (`cue.ts:86-101`):

```ts
export function addCue(
  cuelist: Y.Map<unknown>,
  init: NewCueInit,
  ctx: { actorId: string }
): Y.Map<unknown> {
  const doc = cuelist.doc!
  let cue: Y.Map<unknown>
  doc.transact(() => {
    assertEditAllowed(getMeta(doc))   // [04] REHEARSAL/SHOW gate
    cue = makeCueMap(init, ctx)        // factory (validation pre-integration)
    const cues = cuelist.get('cues') as Y.Array<Y.Map<unknown>>
    cues.push([cue])
    assertCueMapValid(cue)             // [06] post-integration invariants
  })
  return cue!
}
```

Mutators that exist (`cue.ts`, `payload.ts`, `show.ts`, `cuelist.ts`):

| Mutator | What |
|---|---|
| `addCue` / `removeCue` / `insertCueAfter` | structural cue ops |
| `reorderCues` | sort_key update (see above) |
| `setCueLabel` / `setCueDescription` / `setStandbyNote` / `setNotes` | meta edits (allowed in SHOW per Q7) |
| `setCueDepartments` | structural — locked in SHOW |
| `setCueTrigger` | structural — locked in SHOW |
| `setCueDurationHint` | added in B003-016 for editor; structural |
| `addPayload` / `removePayload` / `updatePayload` | payload-level structural |
| `setMode` / `setMetaField` | mode flips (must go through `transitionMode` for snapshot, see [04]) |

## Validation strategy

Two layers:

1. **Pre-integration validation** — `makePayloadMap(init)` validates the plain JS object BEFORE constructing the Y.Map. Throws `ValidationError` on bad shape (e.g., OSC address without `/` prefix).
2. **Post-integration invariants** — `assertCueMapValid(cueMap)` runs AFTER the mutation lands. Catches things only visible on the integrated map (e.g., duplicate payload ids after concurrent add).

The dual approach catches both user input mistakes and CRDT merge edge cases. Belt and braces.

## Prelim Y.Map gotcha

In Yjs 13.6.x, `typeMapGet` reads from `_map` (integrated content), not `_prelimContent`. Standalone factory maps return `undefined` for `.get()` until integrated into a Y.Doc.

**Pattern:** factory functions DON'T `.get()` from the Y.Map they're building. Tests use a one-line `integrate()` helper before asserting field values:

```ts
const cue = makeCueMap({ label: 'test', ... })
integrate(cue)                    // attach to Y.Doc
expect(cue.get('label')).toBe('test')
```

Production code doesn't hit this because mutators always integrate via `cues.push([cue])` before reading.

## Compound cue + nested arrays

A compound cue is just a cue with `department.length >= 2`. When `splitCompoundCue` distributes payloads back to individual cues, the new cues' `payloads` Y.Array can't be `.get()` until the parent cueMap is integrated:

```ts
// inside transact:
const newCue = makeCueMap({ ... })
cues.push([newCue])                              // integrates parent
const newPayloads = newCue.get('payloads') as Y.Array<Y.Map<unknown>>
// now we can fill it
```

Pattern: integrate, then access child arrays. Documented in `cue/compoundCue.ts` and `cue/payloadOps.ts`.

## Public types

The same shape ships TWO ways for now:

- `src/types/{show,cue,payload,department,cueCatalog}.ts` — the "published" public contract (matches data_model.md normatively)
- `src/shared/src/types/*.ts` — what `showx-shared` re-exports for internal code

This is a known duplication (flagged by Critic in B003-002 / B003-010 reviews). Plan: consolidate to `src/shared/src/types/` and have `src/types/` re-export. Deferred to post-bundle hygiene.

## Test patterns

- Factory tests: integrate, assert field defaults
- Mutator tests: build doc, mutate, assert observable change
- CRDT merge: `tests/unit/modules/cuelist-core/document/crdt-merge.test.ts` runs two Y.Docs with `applyUpdate` between them, asserts convergence
- Reorder: assert `getCuesSorted` ordering, not raw Y.Array order
- Validation: pass bad input to factory, expect throw
