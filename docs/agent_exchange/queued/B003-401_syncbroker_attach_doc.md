---
id: "B003-401"
title: "SyncBroker.attachDoc + ActiveShowDoc integration — broker serves shell's Y.Doc"
type: "implementation"
estimated_size_lines: 180
priority: "P0"
bundle: "ShowX-3.4"
depends_on: ["B003-301"]
target_files:
  - "src/main/src/shared/syncBroker/yWebsocketAdapter.ts"
  - "src/main/src/shared/SyncBroker.ts"
  - "src/main/src/runtime/ActiveShowDoc.ts"
  - "tests/unit/shared/syncBroker/yWebsocketAdapter.test.ts"
  - "tests/unit/runtime/ActiveShowDoc.test.ts"
acceptance_criteria:
  - "`YWebsocketAdapter` gains method `attachDoc(name: string, doc: Y.Doc): void` — registers an external Y.Doc as the canonical doc for room <name>. If a YDocEntry already exists for that name (e.g. lazily created on prior WS connect), replaces its `.doc` reference. New WS connections to /yjs/<name> sync to/from this external doc."
  - "`YWebsocketAdapter` gains method `detachDoc(name: string): void` — closes all WS connections for room <name>, removes entry from `.docs` map without destroying the external doc (caller still owns it). Used on ActiveShowDoc.close()."
  - "`attachDoc` is idempotent — calling it twice with same name + same doc is a no-op; with same name + different doc, replaces and closes old WS connections (clean break, clients will reconnect)."
  - "`SyncBroker` exposes `attachDoc(name, doc)` and `detachDoc(name)` as passthrough to adapter."
  - "`ActiveShowDoc` gains constructor-injected `syncBroker?: SyncBroker` parameter (optional for backward-compat with existing tests). When set:"
  - "  • `open(pkgPath)`: after `openShowxPackage` returns Y.Doc D, read show_id from D's 'meta' Y.Map (key `show_id`, falling back to reading show.json from pkgPath if not in doc). Call `syncBroker.attachDoc(show_id, D)`."
  - "  • `close()`: before clearing state, call `syncBroker.detachDoc(this.showId)`."
  - "  • Add `getShowId(): string | null` returning the active show's show_id (from meta), null if no show open."
  - "`Shell.ts` boot step 13 (where ActiveShowDoc is created): pass `this.sync` as syncBroker dep."
  - "Tests in `tests/unit/shared/syncBroker/yWebsocketAdapter.test.ts` (extend existing): attachDoc creates entry, attachDoc replaces existing entry, WS connection after attachDoc syncs from external doc state (not empty doc), detachDoc closes WS connections, detachDoc preserves external doc."
  - "Tests in `tests/unit/runtime/ActiveShowDoc.test.ts` (extend existing): mock SyncBroker, verify attachDoc called on open with correct show_id, verify detachDoc called on close, getShowId returns the show_id from .showx meta."
  - "`pnpm --filter showx-main typecheck` clean. `pnpm --filter showx-main test` passes (existing + new)."
  - "No edits outside listed `target_files`. No PWA edits."
---

## Context

PWA stations connect via WebSocket to `/yjs/<show_id>` on the shell's asset server. The current `YWebsocketAdapter` creates a fresh empty Y.Doc per room name when first asked. That doc is **completely separate** from the Y.Doc that `ActiveShowDoc` (B003-301) loads from the `.showx` package — so PWA gets nothing, hangs on "Loading show…".

This task bridges them: shell loads .showx → registers that Y.Doc with broker → PWA WS connects → adapter routes WS sync to the shared doc. Both sides (shell IPC mutations + PWA Yjs mutations) now write to the same authoritative doc instance. ActiveShowDoc's existing autosave fires on changes from either source.

## Architectural decisions

**Why not "copy state then sync separately":** Two-doc model with bidirectional sync (Y.encodeStateAsUpdate + Y.applyUpdate cross-applied) is conceptually simpler but introduces consistency races (concurrent mutation on both sides, vector clock drift). Single shared doc instance is the right Yjs idiom — the library is designed for one logical doc with many connected peers (one peer = shell main process, other peers = PWA station tabs).

**Why `attachDoc` not "openDocument with externalDoc param":** explicit replace-or-create API is clearer for the operational case (shell opens show after broker may already have a stale entry from a stray PWA connect attempt).

**Why detachDoc closes connections:** When ActiveShowDoc.close() runs, the shared doc is about to be released. Letting PWA WS connections linger with reference to a stale doc would leak. Forcing reconnect is correct — PWA will reconnect when shell opens new show (next bundle B003-403 makes that reactive).

## Implementation notes

### YWebsocketAdapter.attachDoc

```ts
attachDoc(name: string, doc: Y.Doc): void {
  const existing = this.docs.get(name);
  if (existing) {
    if (existing.doc === doc) return; // idempotent
    // Replace: close existing connections (they'd be out of sync with new doc)
    for (const ws of existing.conns) {
      try { ws.close(1000, 'doc_replaced'); } catch { /* ignore */ }
    }
    // Don't destroy old doc — caller may still hold a reference
  }
  const awareness = new awarenessProtocol.Awareness(doc);
  const entry: YDocEntry = { name, doc, awareness, conns: new Set() };
  this.docs.set(name, entry);
  this.log?.info('y-doc.attached', { name });
}

detachDoc(name: string): void {
  const entry = this.docs.get(name);
  if (!entry) return;
  for (const ws of entry.conns) {
    try { ws.close(1000, 'doc_detached'); } catch { /* ignore */ }
  }
  // Do NOT call entry.doc.destroy() — external owner still holds the ref
  this.docs.delete(name);
  this.log?.info('y-doc.detached', { name });
}
```

Note: existing `getOrCreateDoc` stays unchanged — lazy-creates internal doc when no external doc attached. This handles edge case where PWA connects before shell opens any show (broker serves empty doc; PWA shows "Loading"; later when shell opens show, attachDoc replaces and forces PWA reconnect).

### ActiveShowDoc integration

```ts
constructor(
  private readonly logger: Logger,
  private readonly syncBroker?: SyncBroker,  // NEW
) {}

private showId: string | null = null;

async open(pkgPath: string): Promise<void> {
  if (this.meta) await this.close();

  const { doc } = await openShowxPackage(pkgPath);

  // Extract show_id from doc meta (already populated by openShowxPackage)
  const meta = doc.getMap('meta');
  let showId = meta.get('show_id') as string | undefined;
  if (!showId) {
    // Fallback: read show.json directly (defensive)
    const raw = await fs.readFile(path.join(pkgPath, 'show.json'), 'utf8');
    showId = (JSON.parse(raw) as { show_id?: string }).show_id;
  }
  if (!showId) throw new Error(`No show_id in ${pkgPath}`);

  // ... existing setup: title, mode, listeners, etc

  this.doc = doc;
  this.showId = showId;
  this.meta = { pkgPath, title, mode };

  // Bridge to SyncBroker so PWA stations share this doc
  this.syncBroker?.attachDoc(showId, doc);

  // ... existing autosave wiring

  this.listeners.forEach((cb) => cb('opened'));
}

async close(): Promise<void> {
  // ... existing flush save
  if (this.showId) {
    this.syncBroker?.detachDoc(this.showId);
    this.showId = null;
  }
  // ... existing cleanup
}

getShowId(): string | null {
  return this.showId;
}
```

### Tests

Adapter test (key new case):
```ts
test('attachDoc replaces existing entry and serves external doc state', async () => {
  const adapter = new YWebsocketAdapter();
  const extDoc = new Y.Doc();
  extDoc.getMap('test').set('hello', 'world');

  adapter.attachDoc('room1', extDoc);
  const entry = adapter['docs'].get('room1');
  expect(entry?.doc).toBe(extDoc);
  expect((entry?.doc.getMap('test').get('hello'))).toBe('world');
});
```

ActiveShowDoc test (key new case):
```ts
test('open() calls syncBroker.attachDoc with show_id from meta', async () => {
  const mockBroker = { attachDoc: vi.fn(), detachDoc: vi.fn() };
  const ad = new ActiveShowDoc(logger, mockBroker as unknown as SyncBroker);
  await ad.open(demoShowPath);
  expect(mockBroker.attachDoc).toHaveBeenCalledWith(
    expect.stringMatching(/^[0-9a-f-]{36}$/i),
    expect.any(Object),
  );
  expect(ad.getShowId()).toBeTruthy();
});
```

## Done report

Standard format. Confirm SyncBroker now shares doc with PWA — note in done report that B003-402 (pairing returns show_id) is required before this is end-user-visible.
