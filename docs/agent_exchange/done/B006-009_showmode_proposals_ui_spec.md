---
id: "B006-009"
title: "SHOW-mode proposals UI (submit + review)"
type: "implementation"
estimated_size_lines: 450
priority: "P1"
bundle: "ShowX-6"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/document/proposals.ts"
  - "src/modules/cuelist-core/src/document/show.ts"
  - "pwa/src/components/cuelist/CueEditor.tsx"
  - "pwa/src/components/cuelist/ProposalQueue.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "tests/unit/**"
acceptance_criteria:
  - "Proposal schema defined for getProposals() Y.Array (show.ts:76-78): `{ id, cue_id, author_operator_id, kind: 'cue'|'payload', target_field, proposed_value, status: 'pending'|'accepted'|'rejected', created_at, resolved_by?, resolved_at? }`. Helpers in proposals.ts: addProposal/listProposals/resolveProposal (accept applies the change via existing cue/payload helpers; reject just marks)."
  - "In SHOW mode, an operator editing a locked cue (CueEditor.tsx:171-184, replace the 'coming in 0.2' alert) can SUBMIT a proposed change instead of being blocked. Submission writes a pending proposal (allowed in SHOW — proposals are the sanctioned SHOW-mode edit path per lockGuards.ts:12)."
  - "SM sees a ProposalQueue (badge with pending count) and can ACCEPT (applies change, even in SHOW) or REJECT each. Accept respects normal validation."
  - "Proposals sync across stations via Yjs (it's in the doc). Resolved proposals leave an audit trail (status + resolved_by)."
  - "Unit tests (proposals.ts): add/list/accept(applies)/reject; accept-applies-change correctness; pending count; SHOW-mode submit allowed; accept in SHOW applies."
  - "`pnpm --filter showx-pwa build` clean, `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

Per decision §6. SHOW mode locks edits; proposals are the sanctioned path (lockGuards message already says 'route via proposal queue'). Today it's an alert stub. This builds the real submit→review flow — a differentiator (safe mid-show changes).

## Implementation notes

- getProposals() Y.Array exists; define the schema + helpers.
- Accept applies via existing cue/payload document helpers (reuse, don't bypass validation/locks — accepting is the authorized apply).
- Keep change representation simple (field-level: target_field + proposed_value).

## Test plan

- Operator submits payload change in SHOW → pending proposal. SM accepts → applied. SM rejects → marked, not applied.

## Out of scope

- Rich diff/merge. Cue lights (B006-007/008).
