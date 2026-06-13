---
id: "B006-005"
critic_started_at: "2026-06-13T22:04:00Z"
critic_completed_at: "2026-06-13T22:10:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **RoutingRule gains optional `backup_device_id?: string`; failover (not both-send) semantics** → `src/modules/cuelist-core/src/document/routing.ts:21-22` (typed + JSDoc). `addRoutingRule` validates against devices map at `routing.ts:119-124`; `updateRoutingRule` validates at `routing.ts:174-179`. Persisted into Y.Map at `routing.ts:137`. Spec calls out failover-only (not both-send) and that's what's wired.
- [x] **resolveRouting/payloadDispatch handle backup; primary attempted first, backup only on primary failure; result aggregated** → `payloadDispatch.ts:192-227`. On primary `r.ok===false` → `resolveRoutingWithBackup` (`resolveRouting.ts:245-270`) → backup dispatch via `dispatchOne` with synthetic single-entry routing table (`payloadDispatch.ts:63-76`). Combined error string includes both primary + backup error text (`payloadDispatch.ts:211, 217`).
- [x] **Dispatch Log shows which device fired** → `payloadDispatch.ts:208` writes `transport: \`${p.type}→backup\`` when backup fires; primary-success and primary-fail-without-backup keep plain `p.type`. `buildTransportSummary` (GoExecutor.ts:472-483) passes the string through unchanged → Dispatch Log panel shows `osc→backup×1` when failover used.
- [x] **RoutingTable UI: optional backup dropdown per rule; primary vs backup clearly labelled** → `RoutingTable.tsx:279-280` renames header to "Primary Device" + adds "Backup Device" column. Backup cell at `RoutingTable.tsx:314-325` renders health dot + device label, or "—" when unset. Edit dialog field at `RoutingRuleEditDialog.tsx:230-242` is a select with "None (no failover)" default option and labelled "Backup Device (failover, optional)".
- [x] **No behavior change when backup_device_id unset (exactly as today)** → Verified by trace: `dispatchOne` runs unchanged in primary path. On primary `ok===true` the backup branch is not entered at all (`payloadDispatch.ts:194-196`). On primary fail with unset backup, `resolveRoutingWithBackup` returns `{ primary, primaryDeviceId, backup: undefined }`; the `if (… resolution.backup)` guard at `payloadDispatch.ts:203` is false → fallthrough to original error reporting at `payloadDispatch.ts:224-227`. Existing 19 `resolveRouting.test.ts` tests + 15 `RoutingTable.test.tsx` tests still pass (zero regression).
- [x] **Unit tests cover ok / fail / both-fail / unset / log reflects fired device** → `tests/unit/modules/cuelist-core/dispatch/backupFailover.test.ts` 13 tests, run pass:
  - `dispatchCue — backup failover` (5 tests): `primary ok → backup not attempted` (lines 195-217), `primary fail → backup ok` with `osc→backup` label + host verification (lines 219-245), `primary fail → backup fail` with combined error (lines 247-271), `no backup_device_id → primary fail → error, no retry` (lines 273-290), `dispatch log detail shows fired device` (lines 292-314).
  - `resolveRoutingWithBackup` (5 tests): no rules, no backup field, backup field set, backup device missing, primaryDeviceId field.
  - `addRoutingRule backup_device_id validation` (3 tests).
- [x] **Typecheck + tests clean, no edits outside target_files** → `pnpm -r typecheck` green across all 5 workspace projects. `pnpm vitest run` for the three affected test files = 47/47 pass. Diff confined to declared target_files + the test file.

## Code review notes

**Refactor in `resolveRouting.ts`.** Extracted `findBestMatchingRuleWithTransport` (lines 179-205) shared by both `resolveRoutingForPayload` (old API, unchanged contract) and `resolveRoutingWithBackup` (new API). Precedence logic (class-1 device match > class-2 payload/tag match, then sort_key) preserved 1:1 — confirmed by 19/19 existing tests still green.

**Failover dispatch hack — `buildBackupRoutingTable` (`payloadDispatch.ts:63-76`).** Creates a synthetic single-entry routing table mapping the payload's `device_id` → backup `TransportDescriptor` with `specificity 4` (device_id match). Calls the *same* transport dispatch functions (osc/msc/lxRef/midi) so no transport file was touched. This is clean and well-isolated. The synthetic key `__backup__` is fine since it's a private table only used for this call.

**Failover gate `resolveParams.deviceId` (`payloadDispatch.ts:201`).** Worth noting: `payloadToResolveParams` extracts `deviceId` from `payload.device_id`. Per `payload.ts:14-46`, `OscPayload`/`MscPayload`/`LxRefPayload`/`MidiPayload` all declare `device_id: string` (required, non-nullable). So this guard never short-circuits for valid device-routed payloads — it's defensive but harmless.

**Scope exclusions are correct.** `dmx` is not in `RulePayloadType` (pre-existing system limitation, not B006-005's job to fix) → returns `null` from `payloadToResolveParams` → backup branch skipped. `webhook`/`wait`/`group` likewise don't use device routing.

**`updateRoutingRule` patch clearing.** `routing.ts:182-187` iterates `Object.entries(patch)` and deletes Y.Map keys when value is `undefined`. JavaScript `Object.entries({backup_device_id: undefined})` *does* include the key with undefined value, so explicit `patch = { backup_device_id: undefined }` correctly removes the field. Confirmed by Forge's note + the type signature.

**RoutingTable UI / column header rename.** "Target Device" → "Primary Device" is a small terminology shift. The RoutingTable test file only needed one extra `mockResolvedValueOnce(null)` for the `health:snapshot` call in the new effect (added in B006-003) — not a B006-005 concern, just a pre-existing mount-effect cascade that test had to account for.

**No `target_files` violations.** Diff against HEAD limited to: `routing.ts`, `resolveRouting.ts`, `payloadDispatch.ts`, `RoutingTable.tsx`, `RoutingRuleEditDialog.tsx`, plus `tests/unit/**`. All within scope.

## Verdict rationale

All six acceptance criteria met with file:line evidence. The failover semantics match the spec ("backup only on primary fail"), the Dispatch Log shows which device fired via `osc→backup` suffix, the UI clearly distinguishes primary vs backup with a labelled optional dropdown, and the unchanged-when-unset invariant is preserved (verified by passing existing test suites). Implementation is clean: the shared `findBestMatchingRuleWithTransport` refactor is correct, and the synthetic-routing-table approach to backup dispatch avoids touching any transport code. Tests are thorough — 13 new tests cover all 5 spec scenarios plus the resolver/validation edges.

Verdict: **accepted**.
