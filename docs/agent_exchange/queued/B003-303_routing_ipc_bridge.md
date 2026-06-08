---
id: "B003-303"
title: "Routing IPC bridge — 4 invoke handlers + routing-changed broadcast"
type: "implementation"
estimated_size_lines: 170
priority: "P0"
bundle: "ShowX-3.3"
depends_on: ["B003-301"]
target_files:
  - "src/main/src/ipc/cuelistCoreRoutingBridge.ts"
  - "src/main/src/Shell.ts"
  - "tests/unit/ipc/cuelistCoreRoutingBridge.test.ts"
acceptance_criteria:
  - "New file `src/main/src/ipc/cuelistCoreRoutingBridge.ts` exports `registerRoutingBridge(activeShow: ActiveShowDoc, ipc: IpcMainBridge = ipcMain, logger: Logger): void`"
  - "Registers 4 invoke handlers, all delegating to `src/modules/cuelist-core/src/document/routing.ts`:"
  - "  • `cuelist-core/get-routing` → returns `RoutingRule[]` via `getRoutingRules(doc)`. Returns `[]` if no active show."
  - "  • `cuelist-core/routing-add` (rule: Omit<RoutingRule, 'rule_id' | 'sort_key'>) → `doc.transact(() => addRoutingRule(doc, rule, ctx))`. Returns the created rule with assigned rule_id + sort_key."
  - "  • `cuelist-core/routing-update` (ruleId: string, patch: Partial<RoutingRule>) → `doc.transact(() => updateRoutingRule(doc, ruleId, patch, ctx))`"
  - "  • `cuelist-core/routing-remove` (ruleId: string) → `doc.transact(() => removeRoutingRule(doc, ruleId, ctx))`"
  - "  • `cuelist-core/routing-reorder` (ruleIds: string[]) → `doc.transact(() => reorderRoutingRules(doc, ruleIds, ctx))`. ruleIds must be the full list in new order; mismatched length throws."
  - "Y.Doc observe registration: on `activeShow.onChange('opened')` attach `doc.getMap('routing').observeDeep(...)` that broadcasts `cuelist-core/routing-changed` with current `getRoutingRules(doc)`. Unsubscribe on 'closed'."
  - "After each successful mutation handler, also broadcasts `cuelist-core/routing-changed` immediately (in addition to the observe-driven broadcast — observe may be debounced inside Yjs)."
  - "Mutation handlers throw `'No show open'` Error if `activeShow.getDoc() === null`. `get-routing` returns `[]`."
  - "Wired in `Shell.ts` doBoot step 13: `registerRoutingBridge(activeShow, this.deps.ipcBridge, this.logger);` after `registerDeviceBridge` (B003-302)."
  - "Logger writes: `logger.debug('routing.ipc', { channel, ruleId? })` per call."
  - "Tests in `tests/unit/ipc/cuelistCoreRoutingBridge.test.ts`: get-routing empty/populated, routing-add returns assigned rule_id + broadcasts, routing-update patches in place, routing-remove succeeds + broadcasts, routing-reorder reorders correctly, observe broadcasts on external mutation, mutations without active show throw. Use mock IpcMainBridge + tmp .showx pkg."
  - "`pnpm --filter showx-main typecheck` clean. `pnpm --filter showx-main test` passes."
  - "No edits outside listed `target_files`."
---

## Context

Parallel structure to B003-302 (device bridge). Cuelist Core's `RoutingTable.tsx` calls 5 IPC channels (1 read + 4 mutate + reorder is its own) and listens to 2 broadcasts (`routing-changed`, `devices-changed`). The devices-changed listener is already covered by B003-302; this task adds the routing side.

## Architecture decisions

Same as B003-302. Bridge in `src/main/src/ipc/`, uses `ActiveShowDoc.getDoc()`, observes Y.Doc for external mutation broadcasts.

**Why also broadcast immediately after mutation** (in addition to observe):
- Yjs `observeDeep` may batch updates within a transaction. UI expects immediate feedback after the await resolves.
- Belt-and-suspenders: if observe fires later with same data, UI re-renders with identical state (React reconciliation is idempotent for `Object.is`-equal arrays of stable IDs). No harm.

## Implementation notes

### Skeleton (analogous to device bridge)

```ts
import { ipcMain, BrowserWindow } from 'electron';
import type { Logger } from 'showx-shared';
import { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';
import {
  getRoutingRules,
  addRoutingRule,
  updateRoutingRule,
  removeRoutingRule,
  reorderRoutingRules,
  type RoutingRule,
} from '@showx/module-cuelist-core/document/routing.js';
import type { IpcMainBridge } from './index.js';

function broadcastRoutingChanged(rules: RoutingRule[]): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.webContents.send('cuelist-core/routing-changed', rules);
  });
}

export function registerRoutingBridge(activeShow, ipc = ipcMain, logger): void {
  const ACTOR = { actorId: 'shell' };
  function requireDoc() {
    const doc = activeShow.getDoc();
    if (!doc) throw new Error('No show open');
    return doc;
  }

  ipc.handle('cuelist-core/get-routing', async () => {
    const doc = activeShow.getDoc();
    if (!doc) return [];
    return getRoutingRules(doc);
  });

  ipc.handle('cuelist-core/routing-add', async (_e, rule) => {
    const doc = requireDoc();
    let created: RoutingRule;
    doc.transact(() => { created = addRoutingRule(doc, rule, ACTOR); });
    broadcastRoutingChanged(getRoutingRules(doc));
    logger.debug('routing.ipc', { channel: 'routing-add', ruleId: created!.rule_id });
    return created!;
  });

  // ... update / remove / reorder

  // Observe wiring (mirror B003-302)
  let unsub: (() => void) | null = null;
  activeShow.onChange((kind) => {
    if (kind === 'opened') {
      const doc = activeShow.getDoc()!;
      const routingMap = doc.getMap('routing');
      const handler = () => broadcastRoutingChanged(getRoutingRules(doc));
      routingMap.observeDeep(handler);
      unsub = () => routingMap.unobserveDeep(handler);
    } else if (kind === 'closed') {
      unsub?.();
      unsub = null;
      broadcastRoutingChanged([]);
    }
  });
}
```

### Reorder validation

`reorderRoutingRules(doc, ruleIds, ctx)` already validates that `ruleIds` length matches current count + all IDs exist (per existing tests). Let the document layer throw; surface to IPC caller.

### Tests

Mirror B003-302 test pattern. Verify:
- routing-add returns rule with non-empty `rule_id` (UUID v7 format) and sort_key larger than any existing
- routing-reorder([new order]) updates sort_keys to monotone ascending matching new order
- observe fires when mutations happen outside IPC path (simulate via direct `doc.transact(() => addRoutingRule(...))`)

## Done report

Standard format.
