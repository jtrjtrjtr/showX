---
id: "B003-004"
title: "REHEARSAL mode state machine + SHOW-mode lock primitives + snapshot writer"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B003-002", "B003-003"]
target_files:
  - "src/modules/cuelist-core/src/mode/rehearsalState.ts"
  - "src/modules/cuelist-core/src/mode/transitions.ts"
  - "src/modules/cuelist-core/src/mode/snapshot.ts"
  - "src/modules/cuelist-core/src/mode/lockGuards.ts"
  - "tests/unit/modules/cuelist-core/mode/rehearsalState.test.ts"
  - "tests/unit/modules/cuelist-core/mode/transitions.test.ts"
  - "tests/unit/modules/cuelist-core/mode/snapshot.test.ts"
  - "tests/unit/modules/cuelist-core/mode/lockGuards.test.ts"
acceptance_criteria:
  - "`getMode(doc): 'rehearsal' | 'show'` reads `meta.mode` from Y.Doc"
  - "`canTransitionMode(doc, byOperatorId, targetMode): { ok: true } | { ok: false; reason: string }` — gates transition: only SM identity may toggle (operator's role === 'stage_manager'); transition to same mode returns ok: false with reason='no_op'"
  - "`transitionMode(doc, byOperatorId, targetMode, pkgPath): Promise<TransitionResult>` performs the gated transition: emit `transitioning` event, write snapshot (on REHEARSAL→SHOW), update meta.mode, set payload_frozen_at on each cue, set cuelist.show_snapshot_id, append history.jsonl `mode_changed` event"
  - "Snapshot writer `writeSnapshot(doc, cuelistId, pkgPath, byOperatorId): Promise<{ snapshotId; filePath }>`: writes `snapshots/snap_<uuid>_<iso>.json` containing full cuelist + cues + payloads at lock time; returns snapshot id (UUIDv7)"
  - "On REHEARSAL→SHOW: iterate every cue in active cuelist (and all cuelists in MVP=1), set `payload_frozen_at = now` in Y.Doc transaction; this is a copy-on-write marker only — payload objects not duplicated in CRDT"
  - "On SHOW→REHEARSAL: clear `payload_frozen_at` to null on every cue (snapshot file retained for forensics)"
  - "Lock guards: `assertEditAllowed(doc, kind: 'payload' | 'structure' | 'meta'): void` throws `LockedError` when in SHOW mode for payload+structure edits; allows meta edits (label, notes, standby_note, description) per data_model.md §7.3 + Q7"
  - "`isLockedForEdit(doc, kind): boolean` non-throwing check for UI to gray out edit affordances"
  - "Mode transition emits `show-mode-change` event on ModuleContext EventBus + appends `mode_changed` to history.jsonl with `{ ts, kind, from, to, by }` matching data_model.md §3.6 HistoryEvent shape"
  - "All Y.Doc mutations wrapped in single `doc.transact(...)` so observers see atomic update"
  - "SHOW→REHEARSAL retains snapshot file (does NOT delete); follow-up snapshot indexes accumulate in `show.json.snapshot_index`"
  - "Q6 default: cuelist-level lock only — no per-cue lock granularity in MVP"
  - "20+ vitest tests across the 4 test files covering happy path, gating, idempotency, snapshot round-trip, lock guards"
---

## Context

The REHEARSAL/SHOW mode distinction is the heart of ShowX's "we don't break shows" guarantee. REHEARSAL allows free Yjs collaboration; SHOW freezes the payload contract and routes edits through a proposal queue (the proposal queue itself is ShowX-4). This task implements the **state machine + lock primitives + snapshot mechanic** that SHOW mode will build on later.

ShowX-3 ships with the lock infrastructure live and tested but the proposal queue UI deferred to ShowX-4 — that's intentional. Operators in 0.1 will mostly work in REHEARSAL; the LOCK SHOW button works and freezes payloads, but mid-show edit proposals (the SHOW-mode mid-performance affordance) waits.

## Implementation notes

### Public API

```ts
// src/modules/cuelist-core/src/mode/transitions.ts
import * as Y from 'yjs';
import { writeSnapshot, type SnapshotResult } from './snapshot';
import { appendHistoryEvent } from '../persistence/historyJsonl';
import { getCuelists, getCues } from '../document/cuelist';
import type { ModuleContext } from 'showx-shared';

export type Mode = 'rehearsal' | 'show';

export interface TransitionContext {
  doc: Y.Doc;
  pkgPath: string;
  byOperatorId: string;
  operatorRole?: 'stage_manager' | 'operator' | 'director' | 'watcher';
  ctx?: ModuleContext;   // for EventBus + logger
}

export type TransitionResult =
  | { ok: true; from: Mode; to: Mode; snapshotId?: string }
  | { ok: false; reason: 'no_op' | 'not_sm' | 'package_unwritable' | 'unknown_target' };

export function getMode(doc: Y.Doc): Mode {
  return (doc.getMap('meta').get('mode') as Mode) ?? 'rehearsal';
}

export function canTransitionMode(
  doc: Y.Doc, byOperatorId: string, target: Mode, operatorRole?: string,
): { ok: true } | { ok: false; reason: TransitionResult extends { ok: false; reason: infer R } ? R : never } {
  const current = getMode(doc);
  if (current === target) return { ok: false, reason: 'no_op' };
  if (target !== 'rehearsal' && target !== 'show') return { ok: false, reason: 'unknown_target' };
  if (operatorRole !== 'stage_manager') return { ok: false, reason: 'not_sm' };
  return { ok: true };
}

export async function transitionMode(
  target: Mode, params: TransitionContext,
): Promise<TransitionResult> {
  const { doc, pkgPath, byOperatorId, operatorRole, ctx } = params;
  const current = getMode(doc);
  const gate = canTransitionMode(doc, byOperatorId, target, operatorRole);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  let snapshotId: string | undefined;
  if (target === 'show') {
    // Snapshot before flipping mode (so the snapshot reflects last-edit state)
    const active = doc.getMap('meta').get('active_cuelist_id') as string;
    const snap = await writeSnapshot(doc, active, pkgPath, byOperatorId);
    snapshotId = snap.snapshotId;
    doc.transact(() => {
      // Freeze payloads on every cue
      const cuelists = getCuelists(doc);
      cuelists.forEach((cuelist) => {
        const cues = getCues(cuelist);
        cues.forEach((cue) => {
          cue.set('payload_frozen_at', new Date().toISOString());
        });
        if ((cuelist.get('id') as string) === active) {
          cuelist.set('show_snapshot_id', snapshotId);
        }
      });
      doc.getMap('meta').set('mode', 'show');
    });
  } else {
    // SHOW → REHEARSAL
    doc.transact(() => {
      const cuelists = getCuelists(doc);
      cuelists.forEach((cuelist) => {
        const cues = getCues(cuelist);
        cues.forEach((cue) => cue.set('payload_frozen_at', null));
      });
      doc.getMap('meta').set('mode', 'rehearsal');
    });
  }

  // History.jsonl + EventBus
  await appendHistoryEvent(pkgPath, {
    ts: new Date().toISOString(),
    kind: 'mode_changed',
    from: current,
    to: target,
    by: byOperatorId,
    snapshot_id: snapshotId ?? null,
  });
  ctx?.events.publish({
    type: 'show-mode-change',
    show_id: doc.getMap('meta').get('show_id') as string,
    from: current,
    to: target,
    by_operator_id: byOperatorId,
  });

  return { ok: true, from: current, to: target, snapshotId };
}
```

### Snapshot writer

```ts
// src/modules/cuelist-core/src/mode/snapshot.ts
import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../persistence/atomicWrite';
import { uuidv7 } from '../document/uuid';
import { getCuelist } from '../document/cuelist';

export interface SnapshotResult {
  snapshotId: string;
  filePath: string;
}

export async function writeSnapshot(
  doc: Y.Doc, cuelistId: string, pkgPath: string, byOperatorId: string,
): Promise<SnapshotResult> {
  const snapshotId = uuidv7();
  const isoZ = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `snap_${snapshotId}_${isoZ}.json`;
  const filePath = path.join(pkgPath, 'snapshots', fileName);

  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);

  // Serialize full cuelist + cues + payloads as JSON snapshot
  const snapshot = {
    snapshot_id: snapshotId,
    taken_at: new Date().toISOString(),
    by: byOperatorId,
    cuelist_id: cuelistId,
    cuelist: cuelist.toJSON(), // includes cues + payloads
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteFile(filePath, JSON.stringify(snapshot, null, 2) + '\n');

  return { snapshotId, filePath };
}
```

### Lock guards

```ts
// src/modules/cuelist-core/src/mode/lockGuards.ts
import * as Y from 'yjs';
import { getMode } from './transitions';

export type EditKind = 'payload' | 'structure' | 'meta';

export class LockedError extends Error {
  constructor(public readonly kind: EditKind, public readonly mode: 'show') {
    super(`edit (${kind}) blocked: show mode locks payload + structure; route via proposal queue`);
  }
}

/**
 * MVP policy per data_model.md §7.3 + Q7 (label LWW also allowed in SHOW):
 *   - 'payload'   → blocked in SHOW
 *   - 'structure' → blocked in SHOW (insert/delete/reorder)
 *   - 'meta'      → allowed in SHOW (notes, standby_note, label, description — LWW)
 */
export function isLockedForEdit(doc: Y.Doc, kind: EditKind): boolean {
  if (getMode(doc) !== 'show') return false;
  return kind === 'payload' || kind === 'structure';
}

export function assertEditAllowed(doc: Y.Doc, kind: EditKind): void {
  if (isLockedForEdit(doc, kind)) throw new LockedError(kind, 'show');
}
```

Wire `assertEditAllowed` into B003-002's mutators where appropriate:
- `addCue`, `insertCueAfter`, `removeCue`, `reorderCues` → `assertEditAllowed(doc, 'structure')`
- `addPayload`, `removePayload`, `updatePayload` → `assertEditAllowed(doc, 'payload')`
- `setCueLabel`, `setCueDescription`, `setCueStandbyNote`, `setCueNotes` → `assertEditAllowed(doc, 'meta')` — passes through in SHOW per Q7

**Note for Forge:** B003-002 mutators currently don't import lock guards. This task adds the import lines to existing B003-002 files where the mutators live. If B003-002 spec was different and mutators live elsewhere, update accordingly. Keep guard additions minimal — one line per mutator.

### Snapshot index update

After `writeSnapshot`, the next `saveShowxPackage` (B003-003) will pick up the new snapshot file from the `snapshots/` dir and rebuild `show.json.snapshot_index`. This task does NOT update `show.json` directly; it relies on the save procedure to denormalize.

Alternative: emit a `snapshot-taken` EventBus event so the save procedure can append immediately. Prefer this for atomicity.

### Rehearsal state

`rehearsalState.ts` is mostly a thin re-export module for now — exposes `getMode`, `assertRehearsal(doc)`, `assertShow(doc)` for clarity. The state machine logic lives in `transitions.ts`.

## Test plan

### `rehearsalState.test.ts`

1. Fresh `initShowDoc` → `getMode === 'rehearsal'`.
2. `assertRehearsal` no-op in REHEARSAL; throws in SHOW.

### `transitions.test.ts`

3. `canTransitionMode` rejects non-SM operator: `operatorRole === 'operator'` → reason='not_sm'.
4. `canTransitionMode` rejects same-mode transition: target === current → reason='no_op'.
5. `canTransitionMode` accepts valid SM + different target.
6. `transitionMode('show', {sm})` succeeds: returns `{ok: true, snapshotId}`; doc.meta.mode === 'show'; snapshot file written; history.jsonl `mode_changed` line appended.
7. After `transitionMode('show')`, every cue's `payload_frozen_at` is non-null ISO timestamp.
8. After SHOW→REHEARSAL, every cue's `payload_frozen_at === null`; snapshot file retained.
9. `cuelist.show_snapshot_id` set on transition; cleared on REHEARSAL.
10. EventBus `show-mode-change` event published with correct `from`/`to`/`by_operator_id`.
11. Concurrent mode-transition attempts from two clients → Yjs LWW ensures one wins; history.jsonl records both attempts but only one succeeds the doc state (second is no-op).

### `snapshot.test.ts`

12. `writeSnapshot` writes file with correct name pattern `snap_<uuid>_<iso>.json`.
13. Snapshot JSON contains full cuelist + nested cues + payloads.
14. Snapshot is idempotent — re-running with same cuelist produces a new file (new UUIDv7, different timestamp).
15. `taken_at` is ISO 8601.
16. Atomic write semantics — partial failure leaves no stale snapshot.

### `lockGuards.test.ts`

17. `isLockedForEdit(doc, 'payload')` false in REHEARSAL, true in SHOW.
18. `isLockedForEdit(doc, 'structure')` false in REHEARSAL, true in SHOW.
19. `isLockedForEdit(doc, 'meta')` false in BOTH modes (per Q7).
20. `assertEditAllowed(doc, 'payload')` throws `LockedError` in SHOW; no-op in REHEARSAL.
21. `LockedError.kind` and `LockedError.mode` are queryable for UI error messages.
22. After B003-002 mutators wired: calling `addCue(doc, ...)` in SHOW throws LockedError; `setCueLabel` does NOT throw.

## Out of scope

- Proposal queue creation + approve/reject mechanics (ShowX-4 module).
- SM authentication beyond role check — 0.1 trusts operator role from awareness; 0.2 will add token-scope check (Q23, pairing_auth.md).
- Per-cue lock granularity (Q6 → deferred to 0.3).
- Cuelist-level "freeze Act 1 only" (post-MVP).
- SHOW-mode GO authority enforcement (B003-008 implements baseline; SHOW-mode stricter enforcement in ShowX-4).
- Snapshot pruning (Q6 → all kept until user prunes; no auto-deletion).
- UI affordances for lock status (B003-013 SM master view shows lock badge; this task is logic only).

## Notes for Critic

- Verify `transitionMode` is the ONLY public path to flip mode. There must be no `setMode` mutator in B003-002 that bypasses guards. If B003-002 exposed `setMode`, this task should either remove it or wrap it.
- Confirm snapshot is written BEFORE `meta.mode = 'show'` is set (so a crash mid-transition leaves REHEARSAL state on disk, not half-locked SHOW).
- Confirm `payload_frozen_at` is null on every cue after SHOW→REHEARSAL (not just on active cuelist's cues — Forge must iterate all cuelists even though MVP has 1).
- Verify history.jsonl `mode_changed` event includes `snapshot_id` field (null on REHEARSAL-bound transitions, UUIDv7 on SHOW-bound).
- Confirm lock guards on meta edits are PERMISSIVE (per Q7 default — labels editable in SHOW). If Forge implemented strict meta lock, that's a spec deviation requiring discussion.
- Verify `LockedError` is exported from showx-shared so PWA UI can catch it via IPC error mapping.
- Confirm B003-002 mutators are updated with `assertEditAllowed` calls — Critic should diff the touched mutator files to ensure no mutator slipped through.
