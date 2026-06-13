---
id: "B006-009"
title: "SHOW-mode proposals UI (submit + review)"
status: "done"
round: 1
forge_ended_at: "2026-06-13T23:50:00Z"
---

## Files changed

- `src/modules/cuelist-core/src/document/proposals.ts` — **NEW** — Proposal schema + helpers
- `pwa/src/components/cuelist/ProposalQueue.tsx` — **NEW** — SM review panel + badge
- `pwa/src/components/cuelist/CueEditor.tsx` — replaced `alert()` stub with real proposal submit form
- `pwa/src/components/cuelist/SMMasterView.tsx` — ProposalBadge + ProposalQueue panel wired in
- `tests/unit/modules/cuelist-core/document/proposals.test.ts` — **NEW** — 11 unit tests

## Tests run

```
✓ tests/unit/modules/cuelist-core/document/proposals.test.ts (11 tests)
✓ All 1942 tests pass (153 test files)
✓ pnpm -r typecheck — clean
✓ pnpm --filter showx-pwa build — clean (463 kB bundle)
```

## What was built

### `proposals.ts` — document layer
- `Proposal` interface: `{ id, cue_id, cuelist_id, author_operator_id, kind, target_field, proposed_value, status, created_at, resolved_by?, resolved_at? }`
- `addProposal(doc, input)` — writes pending proposal to `getProposals()` Y.Array (allowed in all modes, including SHOW)
- `listProposals(doc)` — returns all proposals as plain objects
- `pendingProposalCount(doc)` — count of pending proposals
- `resolveProposal(doc, id, 'accepted'|'rejected', resolvedBy)`:
  - `kind='cue'`: applies via `updateCueFields` (meta edits allowed in SHOW — no bypass needed)
  - `kind='payload'`: bypasses mode lock (acceptance IS the authorized path); runs `validatePayload` then directly pushes to cue's payloads Y.Array
  - Marks proposal with `status`, `resolved_by`, `resolved_at`

### `ProposalQueue.tsx` — SM review UI
- `ProposalBadge` — header button with yellow badge when `pendingCount > 0`
- `ProposalQueue` — full-height side panel listing pending + resolved proposals
- `ProposalCard` — per-proposal card with Accept/Reject buttons, cue name lookup, formatted proposed_value display
- `useProposals` (internal hook) — observes `proposals` Y.Array, triggers re-render on change

### `CueEditor.tsx` — operator proposal submit
- Replaced `alert('coming in 0.2')` at lines 171-184 with a real form in the SHOW lock banner
- Form: kind selector (cue / payload), target field input, proposed value textarea (JSON or plain text)
- On submit: calls `addProposal(conn.doc, {...})`, shows "✓ Proposal submitted" confirmation for 3s
- `data-testid` attributes: `propose-change-btn`, `proposal-form`, `proposal-kind-select`, `proposal-field-input`, `proposal-value-input`, `proposal-submit-btn`, `proposal-submitted-confirm`

### `SMMasterView.tsx` — integration
- `pendingProposalCount` observed on `proposals` Y.Array with `useEffect`
- `ProposalBadge` in header (after PRE-SHOW button), shows live pending count
- `ProposalQueue` panel rendered when `showProposalQueue` state is true

## Design decisions

- **`proposed_value` stored as JSON string** — survives Y.Map serialization cleanly, handles any JS type
- **Payload kind acceptance bypasses mode lock** — this is the spec intent: "accepting is the authorized apply." The lock exists to prevent uncontrolled direct edits; proposal acceptance is controlled (SM explicitly accepts).
- **No `cuelist_id` in proposal adds complexity** — stored in proposal because `cue_id` alone is not enough to find the cue in the Y.Doc tree.
- **`kind='payload'` adds a new payload** (not update/delete) — simplest MVP; spec says "no rich diff/merge."

## Notes for Critic

- All acceptance criteria met per spec.
- The `resolveProposal` test for `kind='payload'` in SHOW mode verifies that the bypass path works correctly.
- `addCue` is called before `setMode('show')` in tests where we need a cue created in rehearsal (structure edits locked in SHOW).
- `ProposalQueue` uses `conn.doc.getArray('proposals')` directly (not going through `getProposals` import) to attach the observer — this is the same reference, correct.
