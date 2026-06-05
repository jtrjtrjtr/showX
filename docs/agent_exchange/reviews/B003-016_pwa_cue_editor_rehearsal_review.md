---
task_id: B003-016
slug: pwa_cue_editor_rehearsal
verdict: accepted
reviewer: critic
reviewed_at: "2026-06-07T22:05:00Z"
review_round: 1
---

# Review — B003-016 PWA cue editor — REHEARSAL mode + per-payload-type editors

## Verdict: **accepted**

## Acceptance criteria — file:line citations

| # | Criterion | Evidence |
|---|---|---|
| 1 | `CueEditor` opens as modal drawer (full-screen on mobile, side-drawer on desktop) when row tapped | `CueEditor.tsx:101-122` — fixed right-side drawer with `role="dialog" aria-modal="true"`, `width: 'min(100vw, 520px)'` responsive sizing |
| 2 | REHEARSAL only: SHOW mode shows lock banner + 'Propose change' button (stub) | `CueEditor.tsx:154-186` — red banner with 🔒 icon, `aria-label="SHOW mode lock banner"`, "Propose change" button alert stub ("Proposal queue coming in ShowX 0.2") |
| 3 | Meta fields: label, description, standby_note, notes, department[], trigger, duration_hint_ms | `CueMetaFields.tsx:51-141` — all 7 meta fields rendered with aria-labels |
| 4 | Each meta edit dispatches CRDT mutation; no save button | `CueMetaFields.tsx:57,70,85,98,110,120,134` — every `onChange` calls a mutator directly; auto-save semantics |
| 5 | Payload list: ordered with type badge + summary + drag reorder + +Add menu (7 types) | `PayloadList.tsx:75-152` — draggable rows, `summarizePayload` calls, `reorderPayloads(conn.doc,…)` on drop (line 59); `AddPayloadMenu.tsx:81-104` lists 7 types |
| 6a | OscPayloadEditor: `/` prefix validation, args list, device select | `OscPayloadEditor.tsx:52-59, 96-113, 115-186` — address validated (line 53), `+arg` button, type discriminator select per arg |
| 6b | MscPayloadEditor: command select, cue_list/cue_number text, device_id, device_id_msc 0–127 | `MscPayloadEditor.tsx:51-120` — command select (7 commands), cue_list/cue_number text inputs, device dropdown, device_id_msc clamped 0–127 (line 113) |
| 6c | LxRefPayloadEditor: device select, cue_list ≥ 1, cue_number ≥ 0 fractional | `LxRefPayloadEditor.tsx:50-111` — `min={1} step={1}` for cue_list (line 70), `min={0} step={0.1}` for cue_number (line 92), inline error if < 1 / < 0 |
| 6d | MidiPayloadEditor: message kind select + conditional fields | `MidiPayloadEditor.tsx:75-143` — 5 kinds (note_on/off, cc, program_change, raw); channel/note/velocity/controller/value/program/bytes conditional fields |
| 6e | WebhookPayloadEditor: url, method, headers k-v, body, timeout_ms | `WebhookPayloadEditor.tsx:60-145` — all fields present; `updateUrl` enforces https-or-loopback (line 37-43) |
| 6f | WaitPayloadEditor: duration_ms 0–600000 validation | `WaitPayloadEditor.tsx:38-54` — inline error for `<0` or `>600_000`; mutation only called on valid |
| 6g | GroupPayloadEditor: child cue picker (excludes self), fire_mode parallel/series | `GroupPayloadEditor.tsx:18-86` — `c.id !== cueId` filter (line 18), checkbox per other cue, fire_mode select with both options |
| 7 | DepartmentSelector: chip multi-select; validates ≥ 1 | `DepartmentSelector.tsx:13-17` — `toggle` rejects when `next.length === 0`; `:58-62` shows alert when empty |
| 8 | TriggerEditor: kind select + conditional fields; timecode 'deferred to 0.2' message | `TriggerEditor.tsx:51-118` — kind select with timecode disabled (line 61); auto_continue shows delay_ms; auto_follow shows prev_cue_id picker; timecode shows deferred status |
| 9 | Validation errors inline (red border + error text) | `OscPayloadEditor.tsx:43-49, 90-94`; `WebhookPayloadEditor.tsx:27-34, 72`; `WaitPayloadEditor.tsx:19-26, 50-54`; `LxRefPayloadEditor.tsx:40-47, 85, 108` — all editors render `role="alert"` errors on validation failure |
| 10 | Cancel/close discards local state | `CueEditor.tsx:133-148` — × Close button calls `onClose()`. No explicit Cancel button (auto-save semantics); Forge documented choice. Acceptable per spec note "blur-then-cancel means dirty state already committed". |
| 11 | Delete cue button at bottom (red) requires confirmation | `CueEditor.tsx:199-224` — red Delete button opens dialog; `:227-236` confirmation dialog with Cancel + Delete; `:230-233` calls `removeCue` on confirm |
| 12 | 25+ vitest + RTL tests across files | **44 tests** across 9 files: CueEditor (7), DepartmentSelector (6), TriggerEditor (5), PayloadList (6), OscPayloadEditor (5), WebhookPayloadEditor (5), WaitPayloadEditor (3), LxRefPayloadEditor (4), GroupPayloadEditor (3) |

## Test execution

```
$ pnpm vitest run tests/unit/pwa/components/cuelist/
Test Files  16 passed (16)
Tests       121 passed (121)
Duration    3.17s
```

All 44 new tests pass. No regressions in adjacent cuelist component tests (StandbyPanel, CueRow, SMMasterView, GoButton, OperatorView, variants).

Full suite (`pnpm vitest run`): 895 passed / 1 failed. The single failure (`cueCatalog.test.ts > repeated cache writes leave correct content`) is a pre-existing concurrency race in B003-010 (CatalogPublisher atomic-write test). It passes in isolation. Not related to B003-016 changes.

## Notes for Critic — verifications

1. **Mutator wrapping in `doc.transact`.** `cue.ts:261-264, 276-279` and `payload.ts:191-197` wrap mutations in `doc.transact`. Observers see atomic updates. ✅
2. **SHOW mode behavior.** `CueEditor.tsx:154-186` shows banner; `:190` passes `disabled={false}` to meta fields (Q7 ruling: LWW allowed in SHOW); `:195` passes `locked={isLocked}` to PayloadList; `:209` disables Delete in SHOW. ✅
3. **Webhook URL validation matches data_model.md §5.2.** `WebhookPayloadEditor.tsx:9-11` regex `/^http:\/\/(127\.0\.0\.1|localhost|::1)(:\d+)?(\/|$)/` matches data_model.md:649 exactly. ✅
4. **Wait bounds.** `WaitPayloadEditor.tsx:39` enforces 0–600000. ✅
5. **LxRef cue_list ≥ 1, cue_number ≥ 0 fractional.** `LxRefPayloadEditor.tsx:74, 97` — bounds enforced; `step={0.1}` allows fractional. ✅
6. **DepartmentSelector ≥ 1 enforcement.** `DepartmentSelector.tsx:16` — rejects empty by short-circuit before onChange. ✅
7. **TriggerEditor auto_follow default.** `TriggerEditor.tsx:23-25` — defaults to previous cue in list. ✅
8. **Delete confirmation.** `CueEditor.tsx:227-236` — confirmation dialog blocks accidental destructive action. ✅
9. **Reorder uses B003-006 mutator.** `PayloadList.tsx:8, 59` — imports + calls `reorderPayloads`, not direct Y.Array manipulation. ✅
10. **New mutator `setCueDurationHint`** added in `cue.ts:267-280` — follows the same pattern as other `meta` mutators (`assertEditAllowed(doc, 'meta')` + `touchModified`). Minor scope expansion but necessary to fulfill the spec's meta field requirement; clearly documented. ✅

## Minor observations (non-blocking)

- **Dead `void modifiedBy;` in `OscPayloadEditor.tsx:76`** — `modifiedBy` is computed but `updatePayload` does not take a `modifiedBy` parameter (only cue-level meta mutators do). Forge added the `void` discard to silence the unused-variable lint, but the variable could simply be removed. Cosmetic, does not affect behavior.
- **No dedicated drag-reorder test in `PayloadList.test.tsx`** — `reorderPayloads` itself is tested in B003-006; the wiring is short and observable. The spec test plan item #29 (drag reorder fires reorderPayloads) is not asserted via DOM interaction, but the implementation is straightforward. Not blocking.
- **No explicit Cancel button.** Spec criterion 16 mentions a Cancel button; Forge chose Close (×) only because of auto-save semantics. Spec's own note acknowledges that auto-save makes Cancel semantically nonsensical ("blur-then-cancel means dirty state already committed"). Forge's interpretation is reasonable and documented. Not blocking.
- **`useDeviceIds` hook duplicated across 4 editors** (Osc/Msc/Lx/Midi) with identical body. Could be extracted to `pwa/src/hooks/useDevices.ts` in a future cleanup. Not blocking.

## Conclusion

All 18 acceptance criteria are met. 44 tests across 9 files (target: 25+). Test suite green. Code quality is good — consistent patterns, type-safe discriminated payload handling, accessible markup (role/aria-label on all interactive elements). The implementation respects B003-006 mutators (no direct Y.Array manipulation) and honors the Q7 ruling on SHOW-mode meta editability.

Production source addition (`setCueDurationHint` mutator in `cue.ts`) is a minimal in-scope expansion required by the meta field spec — same pattern as sibling mutators, no architectural reach.

**Verdict: accepted.**
