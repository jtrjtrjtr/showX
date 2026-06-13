---
id: "B006-010"
title: "Per-operator authority / registry"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "src/main/src/shared/PairingStore.ts"
  - "src/main/src/runtime/GoExecutor.ts"
  - "src/modules/cuelist-core/src/go/authority.ts"
  - "src/modules/cuelist-core/src/ui/StationsTable.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Real operator registry from PairingStore: each paired device resolves to { device_id, display_name, owned_departments[], role, status: 'active'|'revoked', last_seen_at }. GoExecutor octx factory (GoExecutor.ts:100-108) populates OperatorContext from this registry so authority.ts authorise() works with real data — `sm_called` and `per_dept` authorities resolve correctly (today: 'without octx sm_called always rejects')."
  - "authority.ts (authority.ts:23-50): with a real octx, an SM-owned operator passes sm_called; a department operator passes per_dept only for cues in their owned departments; unknown/revoked operators are rejected. No regression to auto_cascade/timecode authorities."
  - "Registry visible: StationsTable shows paired operators + their departments + active/revoked + last-seen. Revoking a device (existing PairingStore.revoke) removes authority immediately."
  - "Unit tests (authority + registry): sm_called passes for SM operator, rejects for non-SM; per_dept passes only for owned dept; revoked operator rejected; unknown rejected; registry resolve from pairing."
  - "`pnpm --filter showx-pwa build` clean (if PWA touched), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §7. Audit: authority deferred — 'without octx, sm_called always rejects'. This wires a real per-operator registry from pairing so GO authority is enforced by who-you-are, not a stub.

## Implementation notes

- PairingStore already stores owned_departments at claim time (seam map). Surface a registry lookup (resolveToken/getDevice → operator record).
- octx factory in GoExecutor maps operator_id (==device_id) → record → operatorOwns/operatorOwned.
- Keep the role/department model consistent with existing pairing (SM gets 'SM' dept).

## Test plan

- See ACs. Cover sm/per_dept/revoked/unknown.

## Out of scope

- Pairing UI changes. Proposals (B006-009).
