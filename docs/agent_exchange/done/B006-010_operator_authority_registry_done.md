---
id: "B006-010"
title: "Per-operator authority / registry"
status: "done"
round: 2
forge_ended_at: "2026-06-13T23:35:00Z"
---

## Round 2 — Addressing Critic feedback

### Critic items addressed

1. **AC3 panel wiring (blocking gap, round 1)** — Done.
   - `src/main/src/ipc/channels.ts`: Added `PAIRING_LIST_OPERATORS: 'pairing:listOperatorRecords'`.
   - `src/main/src/ipc/index.ts`: Registered handler calling `deps.pairing.listOperatorRecords()`.
   - `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx`:
     - Imported `OperatorRecord` from `StationsTable.js`.
     - Added `operators` state (`useState<OperatorRecord[]>([])`).
     - Added `refreshOperators` helper that invokes `pairing:listOperatorRecords` and updates state.
     - Called `refreshOperators()` inside the mount `useEffect`.
     - Passed `operators={operators}` and `onRevoke={(id) => ipc.invoke('pairing:revokeDevice', id).then(refreshOperators)}` to `<StationsTable>`.
     - Revoke path refreshes the operator list after the IPC resolves — row flips to "revoked" without manual reload.

2. **Minor: `Chip` styling dead branches** — Not addressed (Critic marked "Not blocking"). No unrelated churn.

3. **Test cast pattern smell** — Not addressed (Critic marked "Not blocking").

### Files changed (round 2)

| File | Change |
|---|---|
| `src/main/src/ipc/channels.ts` | + `PAIRING_LIST_OPERATORS` constant |
| `src/main/src/ipc/index.ts` | + handler for `PAIRING_LIST_OPERATORS` |
| `src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx` | + `OperatorRecord` import, `operators` state, `refreshOperators`, mount call, prop pass-through |
| `tests/unit/modules/cuelist-core/ui/StationsTable.test.tsx` | + 9 operator-section tests; fixed `getAllByText` for SM chip; imported `OperatorRecord` |
| `tests/unit/modules/cuelist-core/ui/CuelistCorePanel.test.tsx` | + 3 new operators wiring tests; fixed 7 existing tests to insert 3rd mock slot for new IPC call |

### Test Results

```
Test Files  155 passed (155)
     Tests  1977 passed (1977)
  Duration  12.67s
pnpm -r typecheck: clean across all 5 workspace projects
```

New StationsTable tests (9): section absent when `operators` not passed or empty; section renders when non-empty; display_name + role label; active/revoked status text; Revoke button visibility (shown for active, hidden for revoked); `onRevoke` callback fires with `device_id`.

New CuelistCorePanel tests (3): `pairing:listOperatorRecords` invoked on mount; Paired Devices section renders when IPC returns records; Revoke button calls `pairing:revokeDevice` and re-invokes list.

### Decisions within task scope

None. `authority.ts` and `PairingStore.ts` untouched (per Critic requirement #4).

### Notes for Critic

- `refreshOperators` is defined in component body; called on mount and after revoke. Both usages are within the same render closure so no stale-reference issue.
- Existing tests that used sequential `mockResolvedValueOnce` needed a 3rd slot for the new IPC call. "with recents" group got `.mockResolvedValue([])` as the base fallback (covers all subsequent calls). "no recents" action tests got an explicit 3rd `mockResolvedValueOnce([])` before the action-specific mock values. All 1977 tests green.
- `pnpm -r typecheck` clean across all 5 workspace projects.
