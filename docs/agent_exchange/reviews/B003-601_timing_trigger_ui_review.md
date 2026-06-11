# B003-601 Review — Timing & trigger UI

**Reviewer:** Critic
**Bundle:** ShowX-3.6
**Date:** 2026-06-11
**Review round:** 1
**Verdict:** **accepted**

---

## Acceptance criteria verification

| # | Criterion | Evidence | OK |
|---|---|---|---|
| 1 | `updateCueFields` accepts `trigger` + `duration_hint_ms`, per-kind validation, prev_cue_id existence check | `src/modules/cuelist-core/src/document/cue.ts:284-343`; tests `tests/unit/modules/cuelist-core/document/cue.test.ts:198-271` (9 new tests cover manual/auto_continue/auto_follow/timecode + duration validation) | ✅ |
| 2 | CueRow Duration column `M:SS.t` + em-dash; sticky header row in SMMasterView | `CueRow.tsx:12-18` (formatDuration), `CueRow.tsx:183-195` (column), `SMMasterView.tsx:239-269` (sticky Trigger/Dur header); tests `CueRow.test.tsx:393-439` | ✅ |
| 3 | TriggerCell new component, MagicQ-style, glyph + text per kind, popover editor, `updateCueFields` write path | `TriggerCell.tsx:28-48` (display), `TriggerCell.tsx:179-302` (popover), `SMMasterView.tsx:287-289` wires `onTriggerUpdate → updateFields`; tests `TriggerCell.test.tsx` (12 tests) | ✅ |
| 4 | Eos-style `>` left gutter marker for non-manual cues, hidden when playhead | `CueRow.tsx:117-133` — `cue.trigger.kind !== 'manual' && !isPlayhead`, `aria-hidden`, dim color, `pointerEvents: none` | ✅ |
| 5 | CueEditDialog gains Duration field (seconds, 0.1 precision) editing `duration_hint_ms` | `CueEditDialog.tsx:13-16, 22, 37-40, 133-143`; tests `CueEditDialog.test.tsx:109-137` | ✅ |
| 6 | SHOW mode: TriggerCell + duration editing locked (no-op + lock glyph) | TriggerCell: `TriggerCell.tsx:86-90` `handleOpen` early-returns when not rehearsal; lock icon `:172-176`. Duration editing: CueRow's `onEdit` is gated to rehearsal at `CueRow.tsx:57, 96` (and SMMasterView triggers edit only via that path), so CueEditDialog cannot open in SHOW. Engine-level meta edits remain LWW-permitted as in existing policy (`mode/lockGuards.ts:24-27`) — consistent with spec wording "behavior consistent with existing payload lock". | ✅ |
| 7 | CueTypeBadge stays in right column, TriggerCell is a new mid column | `CueRow.tsx:104` grid `'8px 80px 1fr auto auto auto auto auto'` — TriggerCell at column 5, Duration column 6, CueTypeBadge at column 7 (`CueRow.tsx:196-197`) | ✅ |
| 8 | Edits propagate via CRDT (verify) | `updateFields → updateCueFields` uses `doc.transact(...)` (`cue.ts:335-342`); Y.Map mutation observed by SMMasterView's `useCuelist` via `observeDeep` → other stations rerender. By construction; not separately reproduced in this review. | ✅ |
| 9 | `pnpm -r typecheck`, tests pass, `pnpm --filter showx-pwa build` succeeds | Critic re-ran: `vitest run` for the four touched specs → 74/74 green; `pnpm -r typecheck` → all workspaces Done; `pnpm --filter showx-pwa build` → 244 modules, dist 372KB, 957ms | ✅ |
| 10 | No edits outside target_files | Edits confined to `cue.ts`, `TriggerCell.tsx` (new), `CueRow.tsx`, `CueEditDialog.tsx`, `SMMasterView.tsx`, and their tests. Other modified working-tree files (`AddPayloadMenu`, `OperatorCueRow`, `PayloadList`, `TriggerEditor`, payloadEditors, variants, cuelist-core/ui tokens) belong to **B003-604 dark sweep** working tree and are out of scope for this task. Spec's listed `index.ts` (re-export of `updateCueFields`) — already present from prior B003-506. CueTypeBadge wasn't modified, which is fine: target_files is the allowed surface, not a mandate. | ✅ |

---

## Code quality observations (non-blocking)

1. **Timecode kind disabled in selector.** The kind selector renders `<option value="timecode" disabled>Timecode (ShowX 0.2)</option>` (`TriggerCell.tsx:209-211`), and the input field exists only conditionally. The spec lists `timecode mm:ss.t input` as a per-kind field, but does not require users be able to select the timecode kind from the dropdown. The engine accepts `timecode` writes via `updateCueFields` (validates `time_ms >= 0`), so the data path is complete; only the popover hides the option. Defensible product call given M2 timecode-auto-fire scope. **No change required.**

2. **prev_cue_id pre-population on dialog open + kind switch.** Both `handleOpen` (`TriggerCell.tsx:89-102`) and `handleKindChange` (`TriggerCell.tsx:104-113`) pre-fill the previous cue in list order — matches spec acceptance criterion 3.

3. **Y.Map write path.** All writes go through library-owned `updateCueFields`; no ad-hoc `Y.Map.set` from components. Respects the 3.4 Y-type trap warning in the spec.

4. **data-testids preserved:** `trigger-cell`, `duration-cell`, plus `trigger-cell-save` for E2E save action. Spec asked for the first two; the third is a useful add-on.

5. **Display tenths in cell glyph.** Cell shows `TC mm:ss` (no tenths); spec only required tenths in the input format, so no issue.

6. **CRDT propagation — not separately reproduced.** Done report claims this from the `doc.transact` construction. Architecturally sound (existing label/desc/notes edits propagate the same way and have parity coverage), but no two-tab integration test is added for trigger updates specifically. Acceptable for this scope; suggest adding to B003-606 E2E gate when the gate runs.

---

## Tests run

```
vitest run tests/unit/modules/cuelist-core/document/cue.test.ts
            tests/unit/pwa/components/cuelist/TriggerCell.test.tsx
            tests/unit/pwa/components/cuelist/CueEditDialog.test.tsx
            tests/unit/pwa/components/cuelist/CueRow.test.tsx
→ 4 files, 74 tests passed
```

```
pnpm -r typecheck → all workspaces Done
pnpm --filter showx-pwa build → ✓ built in 957ms (244 modules)
```

---

## Verdict

**accepted** — all 10 acceptance criteria met with file:line evidence, tests green, typecheck clean, production PWA build clean. Implementation is library-clean (no ad-hoc Y.Map writes), gutter marker is well-isolated (absolute + pointer-events:none), and the popover correctly respects mode + editable gating. One minor product call (timecode kind disabled in selector) is non-blocking and well-marked for ShowX 0.2.

Next: B003-602 (playback status / countdown) — depends on B003-601, now unblocked.
