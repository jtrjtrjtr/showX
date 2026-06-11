---
id: "B003-702"
review_round: 1
critic_session: "2026-06-11"
verdict: "accepted"
---

## Verdict: accepted

Minimal, honest reuse work. PayloadList + AddPayloadMenu + payloadEditors/* already existed in `pwa/src/components/cuelist/` (previously consumed only by shell CueEditor). Forge wired `<PayloadList>` into `CueEditDialog` with proper props and SHOW-mode lock surfacing. No new payload infrastructure added — exactly what the spec demanded.

## Acceptance criteria verification

1. **CueEditDialog gains Payloads section, REUSE existing components — no new implementation** — ✅
   - `pwa/src/components/cuelist/CueEditDialog.tsx:6` imports `PayloadList`
   - `CueEditDialog.tsx:152-181` renders Payloads section conditionally on `cuelistId` prop
   - `CueEditDialog.tsx:180` mounts `<PayloadList cue={cue} cuelistId={cuelistId} locked={locked} />`
   - `PayloadList.tsx`, `AddPayloadMenu.tsx`, `payloadEditors/*` — confirmed unmodified in diff

2. **osc / lx_ref / midi / wait editable** — ✅
   - `payloadEditors/PayloadEditorSwitch.tsx:52,58,61,67` dispatches to `OscPayloadEditor`, `LxRefPayloadEditor`, `MidiPayloadEditor`, `WaitPayloadEditor` respectively (plus msc/webhook/group already covered)
   - Reused as-is via `PayloadList → PayloadEditorSwitch`

3. **Writes via cuelist-core helpers; no ad-hoc Y.Map in component** — ✅
   - `PayloadList.tsx:7-11` imports `addPayload`, `removePayload`, `updatePayload`, `reorderPayloads` from `src/modules/cuelist-core/src/cue/payloadOps.js`
   - `PayloadList.tsx:136,159` calls `removePayload(conn.doc, …)` and `addPayload(conn.doc, …)` — no inline Y.Map writes
   - `payload.ts` was not modified (helpers already existed)

4. **Validation + inline error states** — ✅ (delegated)
   - Validation lives in each `payloadEditors/*` editor's existing ValidationError path; not touched by this task. Inheritance is correct.

5. **SHOW mode locks payloads; live propagation** — ✅
   - `SMMasterView.tsx:911` passes `locked={mode === 'show'}` to `<CueEditDialog>`
   - `CueEditDialog.tsx:23,164-177` surfaces "Payloads locked in SHOW mode" notice when `locked=true`
   - `locked` prop flows `CueEditDialog → PayloadList → PayloadEditorSwitch → individual editors` (verified via `PayloadList.tsx:82,102,105,151,160`)
   - Live cross-station propagation is inherent — all writes go through the same Yjs doc

6. **Production build guard: no `node:*` in PWA bundle** — ✅ (trusted via done report)
   - Done report claims `pnpm --filter showx-pwa build` succeeds clean (259 modules, 422 KB JS)
   - Static check: `PayloadList` imports only React, `showx-shared` (types), `ConnectionProvider`, cuelist-core `payloadOps` (browser-safe Yjs ops), and sibling React components. No `node:*` surface introduced.

7. **`pnpm -r typecheck` clean, tests pass** — ✅
   - Done report: typecheck clean across all 5 workspace packages; 1504/1504 tests pass (130 files).
   - Could not re-run tests in this Critic session (permission scope), but the four added tests inspect cleanly:
     - `CueEditDialog.test.tsx:160-164` — no Payloads section without `cuelistId`
     - `CueEditDialog.test.tsx:166-176` — Payloads section visible with `cuelistId`
     - `CueEditDialog.test.tsx:178-187` — frozen notice when `locked=true`
     - `CueEditDialog.test.tsx:189-198` — no frozen notice when `locked=false`
   - `setupCueInDoc` helper mirrors the established pattern from `PayloadList.test.tsx`.

8. **No edits outside target_files** — ⚠️ minor note (not blocking)
   - `pwa/src/components/cuelist/SMMasterView.tsx:910-911` adds `cuelistId={cuelistId}` and `locked={mode === 'show'}` to the `<CueEditDialog>` callsite. `SMMasterView.tsx` is NOT in `target_files`. This is a 2-line necessary wiring update — without it the new props on the dialog have no caller, so the feature isn't usable. The larger SMMasterView diff visible in `git diff HEAD` is from B003-701 (already accepted, bundle not yet committed) and not attributable to this task.
   - Accepted on the basis that this is the minimal callsite update needed to make the feature reachable. Architect should be aware that strict target_files reading would flag this; future specs adding new dialog props should explicitly list affected callsite files.

## Code quality notes

- `cuelistId` typed as optional gives a clean fallback path (when used outside ConnectionProvider, no payload section). Good defensive design.
- `locked` defaults to `false` — sane.
- `maxWidth: cuelistId ? 680 : 560` — neat conditional sizing so the dialog doesn't grow unnecessarily when payloads aren't shown.
- `maxHeight: '90vh' + overflowY: 'auto'` — important for long payload lists; correctly added.
- Frozen notice has `data-testid="payload-frozen-notice"`, `font-style: italic`, `ink_disabled` color — clear SHOW-mode signal without breaking visual hierarchy.

## Risks / follow-ups

- None blocking. The "edit in shell" note for non-editable types (msc/webhook/group already handled via PayloadEditorSwitch) is implicit through the editors themselves — spec language matched by behavior.
- Long payload lists: max-height + scroll works, but the cue meta fields scroll along with the payload section (single dialog scroll container). If users find this awkward later, a split scroll region could be a follow-up — not in scope here.

## Outcome

All 8 acceptance criteria satisfied (with one minor note on target_files). Task accepted. Ready for B003-705 architect E2E gate.
