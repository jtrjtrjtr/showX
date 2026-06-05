# 04 — REHEARSAL ↔ SHOW mode

The state machine that gates edits during a live show.

## Two modes, one boolean (sort of)

`show.meta.mode` is `'REHEARSAL' | 'SHOW'`. Default `'REHEARSAL'` on `New Show`.

| Mode | Edit semantics |
|---|---|
| REHEARSAL | Everything editable. Anyone with write access can mutate any field. |
| SHOW | Payloads frozen. Cue structure frozen. Only meta fields (label, description, standby_note, notes) editable. |

The lock isn't really about preventing edits — it's about preventing accidents during a live performance. Per Q7 ruling, label edits in SHOW mode are allowed because SMs sometimes need to rewrite a cue label live ("oh that's actually Act II opener"). Payload edits are not.

## Transition flow

`src/mode/transitions.ts` — `transitionMode(doc, target, actor)`:

```
1. assertCanTransition(currentMode, target)
   - REHEARSAL → SHOW: always allowed (if SM)
   - SHOW → REHEARSAL: allowed but warns if cuelist mid-fire
2. Take pre-flip snapshot (writeSnapshot → snapshots/<ts>.json)
3. Iterate all cuelists; set payload_frozen_at = ISO if SHOW
4. doc.transact(() => show.meta.set('mode', target))
5. Emit show-mode-change event on EventBus
6. Append history.jsonl entry
```

The snapshot-BEFORE-flip ordering is critical. If step 4 crashes after step 2, the snapshot is intact and we can recover. If step 2 fails (disk full), we abort BEFORE flipping — the show stays in its current consistent mode.

## Edit guards

`src/mode/lockGuards.ts`:

```ts
export class LockedError extends Error { /* ... */ }

export function isLockedForEdit(meta: Y.Map<unknown>, field: LockField): boolean {
  if (meta.get('mode') !== 'SHOW') return false
  return STRUCTURAL_FIELDS.has(field)
}

export function assertEditAllowed(meta: Y.Map<unknown>, field?: LockField): void {
  if (isLockedForEdit(meta, field ?? 'structural')) throw new LockedError(field)
}
```

`STRUCTURAL_FIELDS` = `addCue`, `removeCue`, `addPayload`, `setCueDepartments`, `setCueTrigger`, etc. — anything that changes the show's behavior.

`META_FIELDS` (always permitted) = label, description, standby_note, notes.

Every mutator in `document/cue.ts` and `document/payload.ts` opens with:

```ts
doc.transact(() => {
  assertEditAllowed(getMeta(doc), 'structural')
  // ... mutation
})
```

If lock fails, the transact closure throws and no Y.Doc change happens. Caller sees `LockedError` and renders an error toast.

## Calling-layer integration

The `last_meta_editor` field (which station last touched meta) is NOT auto-updated by `setCueLabel` or `setStandbyNote`. Per Q7 / Critic B003-002 review, the calling layer is responsible for setting it. Rationale: avoids hidden side effects in low-level mutators.

Pattern in the UI:

```ts
doc.transact(() => {
  setCueLabel(cue, newLabel)
  getMeta(doc).set('last_meta_editor', currentStationId)
})
```

Both writes land in one transaction; observers see one change event.

## REHEARSAL state checker

`src/mode/rehearsalState.ts` exposes two thin helpers:

```ts
export function assertRehearsal(meta: Y.Map<unknown>): void {
  if (meta.get('mode') !== 'REHEARSAL') throw new Error('Operation requires REHEARSAL mode')
}

export function assertShow(meta: Y.Map<unknown>): void {
  if (meta.get('mode') !== 'SHOW') throw new Error('Operation requires SHOW mode')
}
```

Used by edit-proposal scaffolding (0.2 SHOW mode module) and SM call commands.

## Mutators wired

B003-004 wired the following mutators to the lock:

- `cue.ts`: addCue, insertCueAfter, removeCue, reorderCues, setCueDepartments, setCueTrigger, setCueDurationHint (B003-016)
- `payload.ts`: addPayload, removePayload, updatePayload
- `cuelist.ts`: addCuelist, removeCuelist (these are NOT covered by lock yet — TBD for 0.2)

Meta-only mutators (label, description, standby_note, notes) bypass the lock per Q7.

## Tests

- `tests/unit/modules/cuelist-core/mode/lockGuards.test.ts` (17 tests) — assertEditAllowed gates per field
- `tests/unit/modules/cuelist-core/mode/transitions.test.ts` (17 tests) — snapshot-before-flip, atomic transact, history.jsonl write
- `tests/unit/modules/cuelist-core/mode/rehearsalState.test.ts` (7 tests) — assert helpers
- `tests/unit/modules/cuelist-core/mode/snapshot.test.ts` (8 tests) — atomic file write + snapshots/ dir creation

## Open questions for 0.2

- Per-cue lock granularity (Q6) — currently cuelist-level only
- Edit proposals queue (SHOW mode module owns this)
- Override mode (force-unlock) — currently only via direct doc edit, no UI

## Gotchas

- A long-running mutator transaction that takes a snapshot can race with another station's edit. Snapshot is on the main process; Y.Doc writes flow through SyncBroker. Concurrent writes from PWAs land WHILE snapshot is being computed → snapshot may miss those last few writes. Mitigation: snapshot from `Y.encodeStateAsUpdate(doc)` directly (a frozen state), not by observing.
- Setting `payload_frozen_at` to ISO timestamp uses `new Date().toISOString()` — clock skew between stations could theoretically produce out-of-order timestamps, but we only use this field as a marker (not for ordering).
