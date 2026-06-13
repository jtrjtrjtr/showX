---
id: "B006-009"
title: "SHOW-mode proposals UI (submit + review)"
verdict: "accepted"
round: 1
critic_reviewed_at: "2026-06-13T22:55:00Z"
---

## Acceptance criteria verification

### 1. Proposal schema + helpers — ✅ PASS

`src/modules/cuelist-core/src/document/proposals.ts:13-25` defines `Proposal` interface:
- `id, cue_id, author_operator_id, kind ('cue'|'payload'), target_field, proposed_value, status ('pending'|'accepted'|'rejected'), created_at, resolved_by?, resolved_at?` — all required fields present.
- Adds `cuelist_id` — justified (single `cue_id` cannot locate cue in Y.Doc tree). Documented in done report.
- `getProposals()` already exists at `src/modules/cuelist-core/src/document/show.ts:76-78` (unchanged, reused).
- Helpers: `addProposal` (proposals.ts:36-53), `listProposals` (55-57), `pendingProposalCount` (59-61), `resolveProposal` (79-123).
- Accept of `kind='cue'` calls `updateCueFields` (existing helper). Accept of `kind='payload'` validates via `validatePayload`, then pushes via `makePayloadMap` to the cue's `payloads` Y.Array — bypasses mode lock but preserves validation per spec intent ("acceptance IS the authorized apply").
- Reject just marks `status='rejected'` with `resolved_by`/`resolved_at`.

### 2. SHOW-mode submit replaces the alert stub — ✅ PASS

`pwa/src/components/cuelist/CueEditor.tsx:189-351` — replaces the prior `alert('coming in 0.2')` stub. The SHOW lock banner now hosts a "Propose change" button that opens an inline form (kind selector, target field input, proposed value textarea). On submit (line 109-132), calls `addProposal(conn.doc, {...})` — works in SHOW because `addProposal` writes directly to the proposals Y.Array with no mode guard. Confirmation chip "✓ Proposal submitted" shown for 3s. Test `proposals.test.ts:218-237` verifies SHOW-mode submit does not throw.

### 3. SM badge + accept/reject — ✅ PASS

`pwa/src/components/cuelist/ProposalQueue.tsx:35-76` — `ProposalBadge` with live pending count. Wired in `SMMasterView.tsx:939-942` after PRE-SHOW button. `SMMasterView.tsx:320-326` observes the `proposals` Y.Array and updates count. `ProposalQueue.tsx:85-250` — full-height side panel split into Pending + Resolved sections; per-card Accept/Reject buttons in pending section. Accept respects validation: kind='cue' via `updateCueFields` (preserves meta-edit-allowed logic), kind='payload' via `validatePayload`. Test `proposals.test.ts:138-164` confirms accept-payload-in-SHOW applies.

### 4. Yjs sync + audit trail — ✅ PASS

Proposals live in `doc.getArray('proposals')` (initialized in `show.ts:47`). Test `proposals.test.ts:240-268` ("proposals sync between two Y.Doc instances via state vectors") verifies CRDT sync round-trips status + fields. `resolveProposal` sets `status`, `resolved_by`, `resolved_at` (proposals.ts:119-121) — leaves audit trail.

### 5. Unit tests — ✅ PASS

`tests/unit/modules/cuelist-core/document/proposals.test.ts` — 11 tests covering:
- add/list/pendingCount (lines 25-79)
- accept applies cue field (82-111)
- accept of cue meta in SHOW (113-136)
- accept of payload in SHOW (138-164)
- reject does not apply (166-191)
- not-found + double-resolve guards (193-214)
- addProposal allowed in SHOW (217-238)
- Yjs CRDT sync (240-268)

### 6. Build + typecheck + tests + scope — ✅ PASS

Verified locally:
- `pnpm vitest run tests/unit/modules/cuelist-core/document/proposals.test.ts` → 11/11 pass (273ms).
- `pnpm -r typecheck` → all 5 projects clean.
- `pnpm --filter showx-pwa build` → clean, 463.45 kB bundle.
- Edits confined to target files: `proposals.ts` (NEW), `ProposalQueue.tsx` (NEW), `proposals.test.ts` (NEW), `CueEditor.tsx` + `SMMasterView.tsx` (modified). Other modified files in working tree (`oscListener.ts`, `OutputDispatcher.ts`, etc.) are residue from prior B006-001…007 tasks — not B006-009's territory.

## Design decision sanity check

- **`proposed_value` stored as JSON string** — reasonable. Y.Map can hold structured values, but a JSON string sidesteps deep merge edge cases for MVP. `ProposalCard` re-stringifies for display (ProposalQueue.tsx:267) and `CueEditor.tsx:115-118` falls back to plain-string on parse error — both ends of the contract handle this.
- **Payload accept bypasses mode lock but keeps `validatePayload`** — aligned with criterion 3 ("ACCEPT applies change, even in SHOW") and spec context line 18 ("proposals are the sanctioned SHOW-mode edit path"). The bypass is intentional and scoped: only inside `resolveProposal` for `kind='payload'`, validation still runs.
- **Cue kind uses `updateCueFields`** which gates on `assertEditAllowed(doc,'meta')` — meta is allowed in SHOW, so cue-field proposals apply cleanly. If a future caller proposes a non-meta cue field, the existing assert will reject — correct conservative default.
- **`kind='payload'` adds a new payload (not update/delete)** — explicitly listed in spec as out-of-scope ("no rich diff/merge"). MVP-appropriate.
- **`useProposals` hook uses `doc.getArray('proposals')` directly** — same Y.Array reference as `getProposals` export; observer attaches correctly. Verified live via badge update in `SMMasterView.tsx:322-325`.

## Verdict

**accepted** — all 6 acceptance criteria verified with file:line citations. Tests, typecheck, and PWA build all green locally. Design decisions are well-reasoned and documented. Scope respected.
