---
id: "B006-010"
critic_started_at: "2026-06-13T23:18:00Z"
critic_completed_at: "2026-06-13T23:42:00Z"
verdict: "accepted"
review_round: 2
---

## Round 2 — addressing round-1 changes_requested

Round-1 verdict was `changes_requested` for one blocking gap: AC3 panel wiring (StationsTable rendered the "Paired Devices" section only when a caller passed `operators`, but `CuelistCorePanel` never did, and no IPC channel existed). Round-2 closes that gap end-to-end.

## Round-1 required items — verification

1. **Add `PAIRING_LIST_OPERATORS` channel + handler.** ✅
   - `src/main/src/ipc/channels.ts:8` — `PAIRING_LIST_OPERATORS: 'pairing:listOperatorRecords'` added between `PAIRING_LIST_DEVICES` and `PAIRING_REVOKE_DEVICE`.
   - `src/main/src/ipc/index.ts:63` — `ipc.handle(IPC.PAIRING_LIST_OPERATORS, async () => deps.pairing.listOperatorRecords())`. Mirrors existing `PAIRING_LIST_DEVICES` shape exactly.

2. **Wire CuelistCorePanel: invoke IPC, store, pass `operators` + `onRevoke`, refresh after revoke.** ✅
   - `CuelistCorePanel.tsx:3` — `OperatorRecord` imported from `StationsTable.js` (correct boundary; renderer-side type).
   - `CuelistCorePanel.tsx:118` — `const [operators, setOperators] = useState<OperatorRecord[]>([])`.
   - `CuelistCorePanel.tsx:130-134` — `refreshOperators` helper: invokes `pairing:listOperatorRecords`, defensively coerces non-arrays to `[]`, catches and clears on error. Clean.
   - `CuelistCorePanel.tsx:146` — `refreshOperators()` called inside the mount `useEffect`.
   - `CuelistCorePanel.tsx:269-270` — `<StationsTable … operators={operators} onRevoke={(id) => void ipc.invoke('pairing:revokeDevice', id).then(refreshOperators)} />`. Revoke → IPC → re-fetch → row flips to "revoked" without manual reload.
   - No edits to `authority.ts` or `PairingStore.ts` beyond what was already accepted in round 1. ✅

3. **Confirm the wiring with a test.** ✅
   - `CuelistCorePanel.test.tsx:271-345` adds three new tests in the "operators wiring" describe block: (a) `pairing:listOperatorRecords` invoked on mount; (b) "Paired Devices" section renders when IPC returns a record; (c) Revoke click invokes `pairing:revokeDevice` and re-invokes the list IPC. Implementation-faithful and behavioural — not just shallow prop-pass asserts.
   - `StationsTable.test.tsx:99-196` adds a 9-test "operators / Paired Devices section" describe block covering: section omitted when `operators` undefined/empty, section heading rendered, display_name + role label, active/revoked status text, Revoke button visibility (shown for active, hidden for revoked + requires `canKick` + `onRevoke`), and `onRevoke` callback receives `device_id`.
   - Pre-existing tests adjusted: where `mockResolvedValueOnce` chains used to satisfy `cuelist-core/get-state` + `cuelist-core:recent-shows-get`, a third slot is now added for `pairing:listOperatorRecords`. The "with recents" group uses a fallback `mockResolvedValue([])` chained after the named slots, which covers any number of subsequent invokes — correct pattern.

## Run verification

- `pnpm vitest run tests/unit/modules/cuelist-core/ui/StationsTable.test.tsx tests/unit/modules/cuelist-core/ui/CuelistCorePanel.test.tsx` → **41/41 passed** (StationsTable 19 + CuelistCorePanel 22). Confirmed locally.
- `pnpm vitest run tests/unit/modules/cuelist-core/ go` (broad cuelist-core run, includes RoutingTable / FirstLaunchPicker / DevicesTable, authority, triggerEngine, etc.) → **921/921 passed**. No collateral regression from the 3rd-mock-slot fix.
- `pnpm -r typecheck` → clean across all 5 workspace projects (src/shared, src/modules/cuelist-core, pwa, src/main, apps/marketing).
- Forge's claimed full-suite count (1977/1977) is consistent with prior accepted bundles and not contradicted by local runs.

## Code-review notes (round 2 delta)

**Strengths**
- The IPC channel + handler are a pure projection — they reuse `PairingStore.listOperatorRecords()` (which round 1 already accepted as a no-cache, single-source-of-truth `Map` projection). No new state, no caching divergence risk.
- `refreshOperators` is defined once in component body and used in both mount and revoke paths — no stale-closure trap (same render context for both call sites, and `ipc` is the only external binding, already a `useEffect` dep).
- `OperatorRecord` is imported from the renderer-side `StationsTable.js`, not from main-process code. Boundary preserved.
- Defensive coercion in `refreshOperators` (`Array.isArray(r) ? r : []` and `.catch(() => setOperators([]))`) matches the pattern already used for `recent-shows-get` at `CuelistCorePanel.tsx:144`. Consistent.
- Revoke path uses `.then(refreshOperators)` — the IPC promise must resolve before re-fetch fires, so the new list reflects the post-revoke state. Correct.

**Non-issues (checked, fine)**
- Test-mock chain ordering: the three `mockResolvedValueOnce` slots correspond to the three `ipc.invoke` calls made on mount (`get-state`, `recent-shows-get`, `listOperatorRecords`). Forge ordered them deliberately and matched the order of invocation. Verified by reading the effect at `CuelistCorePanel.tsx:136-152` against test setup at `CuelistCorePanel.test.tsx:55-105`.
- `target_files` overflow: round 2 touched `channels.ts`, `index.ts`, and `CuelistCorePanel.tsx`, which are not in the original `target_files` list. Authorized by round-1 critic directive ("Required for accepted" §1–§2) — those exact files were named as the required edits to close AC3. Scope expansion is by critic order, not Forge initiative.

**Round-1 non-blocking concerns (revisit)**
- `Chip` muted-vs-active style branches still no-op (background/text colors identical, only opacity differs at `StationsTable.tsx:37-54`). Forge correctly chose not to touch this in a behaviour-only round; round-1 critic explicitly flagged "Not blocking". No change.
- `operatorRegistry.test.ts` `as unknown as PersistedStore` cast unchanged. Same reasoning — not blocking, round-1 critic flagged "Not blocking".

## Acceptance criteria — final check

- [x] **AC1 — Real operator registry from PairingStore + octx populated from it.** Already verified round 1. No regression in round 2 (no edits to `PairingStore.ts` or `GoExecutor.ts`).
- [x] **AC2 — Authority semantics correct, no regression on auto_cascade/timecode.** Already verified round 1. `authority.test.ts` unchanged. ✅
- [x] **AC3 — Registry visible: StationsTable shows paired operators + revoke removes authority immediately.**
  - First half (visibility): `CuelistCorePanel.tsx:265-271` now passes `operators={operators}` to `<StationsTable>`; `operators` is hydrated from `pairing:listOperatorRecords` at mount. SM sees paired operators + departments + active/revoked + last-seen. ✅
  - Second half (revoke removes authority): `onRevoke` → `pairing:revokeDevice` IPC → `PairingStore.revokeDevice` sets `revoked_at` → `GoExecutor` octx blocks via `authority.ts:29`. End-to-end chain intact and unchanged from round 1. ✅
- [x] **AC4 — Unit tests pass on registry + authority.** Round-1 coverage (5 authority + 6 operatorRegistry) unchanged. Round-2 adds 9 StationsTable + 3 CuelistCorePanel wiring tests. All green.
- [x] **AC5 — typecheck clean; tests pass; no edits outside critic-authorized scope.** ✅

## Verdict rationale

Every round-1 required item is implemented and verified at file:line precision. The IPC channel + handler are minimal, the panel wiring is the natural pattern Forge already uses for other on-mount IPC calls (`recent-shows-get`), the refresh-after-revoke is correct, and the test coverage is behavioural rather than shallow. `pnpm -r typecheck` is clean. Local-run subset of the test suite is fully green (962/962 in the relevant directories). No regression to authority semantics or registry projection from round 1.

**Verdict: accepted.**
