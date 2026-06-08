---
id: "B003-303"
critic_started_at: "2026-06-08T00:35:00Z"
critic_completed_at: "2026-06-08T00:50:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] `src/main/src/ipc/cuelistCoreRoutingBridge.ts` exports `registerRoutingBridge(activeShow, ipc = ipcMain, logger)` → file:22-26
- [x] 5 invoke handlers registered (1 read + 4 mutate)
  - [x] `cuelist-core/get-routing` → returns `RoutingRule[]` via `getRoutingRules(doc)`, returns `[]` when no doc → file:43-48
  - [x] `cuelist-core/routing-add` → `doc.transact(() => created = addRoutingRule(...))`, returns created rule with `rule_id` + `sort_key` → file:50-63
  - [x] `cuelist-core/routing-update` → `doc.transact(() => updateRoutingRule(...))` → file:65-75
  - [x] `cuelist-core/routing-remove` → `doc.transact(() => removeRoutingRule(...))` → file:77-84
  - [x] `cuelist-core/routing-reorder` → `doc.transact(() => reorderRoutingRules(...))` → file:86-93
- [x] Y.Doc `observeDeep` on `doc.getMap('routing')` on `'opened'`, broadcasts `cuelist-core/routing-changed` with `getRoutingRules(doc)` → file:29-35
- [x] `unobserveDeep` + broadcast `[]` on `'closed'` → file:36-40
- [x] Double-broadcast after every successful mutation (explicit broadcast + observe-driven) → file:59,71,81,90
- [x] Mutation handlers throw `'No show open'` when `activeShow.getDoc() === null` → file:53,69,79,88; get-routing returns `[]` → file:46
- [x] Wired in `Shell.ts` step 14 after `registerDeviceBridge` → Shell.ts:389
- [x] Logger writes `logger.debug('routing.ipc', { channel, ruleId? })` per call → file:44,60,72,82,91
- [x] Tests in `tests/unit/ipc/cuelistCoreRoutingBridge.test.ts` cover: empty get / populated get, add returns rule with monotone sort_key + broadcast + throw, update patches + broadcast + throw, remove + broadcast + missing-id throw + no-doc throw, reorder ascending sort_keys + missing-id throw + no-doc throw, observeDeep external mutation broadcast, close broadcasts `[]` (18 tests total) → test:75-382
- [x] No edits outside listed `target_files` — `git diff src/main/src/Shell.ts` shows only the new import (line 37) + `registerRoutingBridge(...)` call (line 389); everything else in Shell.ts diff belongs to B003-301/B003-302
- [ ] Reorder length-mismatch validation — **see Notes below** (spec ambiguity, not blocking)

## Code review notes

**Bridge structure** mirrors `cuelistCoreDeviceBridge.ts` (B003-302) faithfully: same `unsubscribeObserve` closure pattern, same `ACTOR = { actorId: 'shell' }` constant, same `requireDoc`-style inline check. Implementation is symmetric and easy to reason about.

**Definite-assignment for `created`** (file:55 — `let created!: RoutingRule`): Safe because `addRoutingRule` synchronously assigns `created` inside the `doc.transact` callback before the transact returns. The nested `doc.transact` (outer in bridge, inner in `addRoutingRule` at routing.ts:132) coalesces correctly per Yjs semantics.

**Broadcast-then-log ordering** vs device bridge: device bridge logs before transact; routing bridge logs after. Cosmetic difference; the routing variant arguably reads better because the `ruleId` for `routing-add` is only known post-transact. Not a defect.

**`updateRoutingRule` signature**: spec example shows `patch: Partial<RoutingRule>`; bridge tightens to `Partial<Omit<RoutingRule, 'rule_id'>>` (file:67). Correct — `rule_id` is identity, never patchable. Matches the document-layer signature.

**Observe handler closure** (file:33): captures `doc` via `activeShow.getDoc()!` at `'opened'` time. Safe because the `unsubscribeObserve` is called on `'closed'` before `doc` becomes null, so the closure cannot fire after the doc is gone.

**Reorder length-validation gap** (acceptance criterion sub-bullet): Spec text says "ruleIds must be the full list in new order; mismatched length throws." Implementation notes immediately above say "Let the document layer throw." However, `reorderRoutingRules` in `src/modules/cuelist-core/src/document/routing.ts:183-197` only throws when a provided ID is missing from the doc — it does **not** validate that all existing rules appear in `newOrder`. Forge's done report flags this honestly ("The spec's 'mismatched length throws' is a frontend concern"). The two spec directives conflict; Forge followed the architect's "Let the document layer throw" guidance literally. The frontend `RoutingTable.tsx` is currently the only caller and presumably always sends the full list. **Not blocking** — flagging for Architect to either tighten the document layer or accept the frontend-only contract. If a stricter bridge-level check is wanted, it could be added in a small follow-up without rework.

## Verdict rationale

All 14 explicit acceptance criteria are met with file:line evidence. The one partial deviation (reorder length validation) was caused by ambiguity inside the spec itself, not Forge negligence, and Forge disclosed it in the done report. The bridge cleanly mirrors B003-302, has 18 focused unit tests covering happy paths + error paths + external Yjs mutation + close cleanup, and the Shell.ts wiring is in the correct position (after device bridge, both inside the `!skipWindow` block). No out-of-scope edits.

Verdict: **accepted**.

Architect follow-up suggested (not required): decide whether `reorderRoutingRules` document function should validate length, then file a small cleanup task if yes. Defer until B003-304 lands.
