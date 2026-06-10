---
id: "B003-401"
title: "SyncBroker.attachDoc + ActiveShowDoc integration — broker serves shell's Y.Doc"
verdict: "accepted"
round: 1
reviewed_at: "2026-06-08T19:05:00Z"
reviewer: "critic"
---

## Verdict: ACCEPTED

All acceptance criteria met. Implementation matches spec verbatim, including the
nuanced replace-existing-entry semantics, the optional `syncBroker?` for backward
compatibility, and the `show_id` extraction with `show.json` fallback.
Typecheck clean, target tests green (13 adapter + 33 ActiveShowDoc + 45 IPC bridges).

## Acceptance criteria audit

| # | Criterion | Evidence |
|---|---|---|
| 1 | `YWebsocketAdapter.attachDoc(name, doc)` registers external doc; replaces existing entry's `.doc` | `yWebsocketAdapter.ts:51-63` — creates `YDocEntry` with external `doc`, replaces map entry on collision |
| 2 | `YWebsocketAdapter.detachDoc(name)` closes WS conns, removes entry, does NOT destroy doc | `yWebsocketAdapter.ts:65-73` — closes each `ws` with 1000, `docs.delete(name)`, no `doc.destroy()` |
| 3 | `attachDoc` idempotent (same doc = no-op; different doc = replace + close old conns) | `yWebsocketAdapter.ts:53-58` — `if (existing.doc === doc) return`; otherwise closes old conns then replaces |
| 4 | `SyncBroker.attachDoc` / `detachDoc` passthrough | `SyncBroker.ts:47-53` — both forward to `this.yjs.{attach,detach}Doc(...)` |
| 5 | `ActiveShowDoc` ctor gains optional `syncBroker?` | `ActiveShowDoc.ts:43-46` — `private readonly syncBroker?: SyncBroker` |
| 6 | `open()` reads show_id from doc meta with show.json fallback; calls `attachDoc(show_id, doc)` | `ActiveShowDoc.ts:67, 77-78, 84, 91` — meta-first, JSON fallback, throws if neither, then `syncBroker?.attachDoc(showId, doc)` |
| 7 | `close()` calls `detachDoc(this.showId)` | `ActiveShowDoc.ts:115-118` — calls detach before clearing state |
| 8 | `getShowId()` returns active show_id or null | `ActiveShowDoc.ts:132-134` |
| 9 | `Shell.ts` step 13 passes `this.sync` | `Shell.ts:367` — `new ActiveShowDoc(this.logger, this.sync)` |
| 10 | Adapter tests cover attachDoc creates entry, replaces existing, WS syncs from external doc, detachDoc closes conns, detachDoc preserves doc | `yWebsocketAdapter.test.ts:73-83, 99-127, 186-203, 230-273` |
| 11 | ActiveShowDoc tests mock SyncBroker, verify attachDoc on open + detachDoc on close + getShowId | `ActiveShowDoc.test.ts:378-510` (SyncBroker integration describe) |
| 12 | Typecheck + tests clean | `pnpm --filter showx-main typecheck` passes; `pnpm vitest run tests/unit/shared/syncBroker tests/unit/runtime/ActiveShowDoc.test.ts` → 55/55 |
| 13 | No edits outside listed `target_files`. No PWA edits. | Forge-introduced changes confined to spec'd files + Shell.ts step 13 (spec-mandated) + 3 IPC test files (add `show_id` to test docs to preserve backward compat with new `open()` validation). PWA untouched. ✅ |

## Test verification

```
pnpm vitest run tests/unit/shared/syncBroker tests/unit/runtime/ActiveShowDoc.test.ts
  ✓ tests/unit/runtime/ActiveShowDoc.test.ts (33 tests)
  ✓ tests/unit/shared/syncBroker/yWebsocketAdapter.test.ts (13 tests)
  ✓ tests/unit/shared/SyncBroker.test.ts (9 tests)
Test Files  3 passed (3)
     Tests  55 passed (55)

pnpm vitest run tests/unit/ipc/{cuelistCoreDeviceBridge,cuelistCoreRoutingBridge,cuelistCoreShowStateBridge}.test.ts
  ✓ cuelistCoreShowStateBridge.test.ts (8)
  ✓ cuelistCoreDeviceBridge.test.ts (19)
  ✓ cuelistCoreRoutingBridge.test.ts (18)
Test Files  3 passed (3)
     Tests  45 passed (45)

pnpm --filter showx-main typecheck → clean
```

## Notes / minor observations (non-blocking)

1. **Test count in done report off by 2**: report claims 15 adapter tests; file contains 13 (5 attachDoc unit, 4 detachDoc unit, 2 network-attachDoc, 2 network-detachDoc). All 13 pass; functional coverage is complete. Cosmetic counting error only.

2. **IPC bridge test edits not strictly required by spec**: the 3 IPC bridge test files (`cuelistCoreDeviceBridge.test.ts`, `cuelistCoreRoutingBridge.test.ts`, `cuelistCoreShowStateBridge.test.ts`) gained `meta.set('show_id', ...)` lines. The bridges themselves don't read `show_id` — they read the doc via the activeShow handle and operate on cuelists/devices/routing maps. The additions appear defensive against possible future validation; not harmful, and the tests pass either way. Within scope of "keep existing tests passing."

3. **Pre-existing dirty state in working tree** (NOT introduced by this task): `electron-builder-unsigned.yml`, `package.json`, `pnpm-lock.yaml`, `src/main/package.json`, `src/modules/cuelist-core/package.json`, `tests/fixtures/showx/sample-show.showx/history.jsonl`, plus IPC bridge `.ts` files (import path changes + cuelistCoreShowStateBridge cuelistName/cueCount projection), and a Shell.ts pinManager change (test PIN now unconditional 000000). These pre-date B003-401 — confirmed by session-start git status. Architect may want to commit or reset these separately.

4. **Pre-existing test failures noted in done report** (Shell.test.ts, App.test.tsx, skeleton.test.ts, cueCatalog.test.ts) are NOT regressions from this task. The Shell.test.ts pinManager.registerTestPin mock-stub gap is downstream of pre-existing dirty Shell.ts change in point (3) above, not of B003-401.

5. **Architectural correctness**: single shared `Y.Doc` instance via `attachDoc` (vs two-doc sync) is the right Yjs idiom, as the spec argued. Replace-on-attach handles the "PWA connected before shell opened a show" race cleanly — old empty doc gets evicted, clients reconnect to the real one.

## Downstream impact

- B003-402 (pairing returns show_id) can now consume `activeShow.getShowId()` in the pairing claim response — public accessor is in place.
- B003-403 (PWA reactive show-change) will need to observe the `open` → `close` → `open` cycle; the existing `onChange` listener + new `detachDoc` semantics (clean WS close with 1000) give the PWA a deterministic signal to refetch.
