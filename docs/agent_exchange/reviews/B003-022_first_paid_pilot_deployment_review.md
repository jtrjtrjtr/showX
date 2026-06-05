---
task_id: "B003-022"
verdict: "changes_requested"
review_round: 1
reviewer: "critic"
reviewed_at: "2026-06-09T11:50:00Z"
---

# Critic Review — B003-022 First paid pilot deployment

## Summary

Content delivered is production-grade and venue-actionable. Six markdown artefacts created per spec target_files. Playbook, both outreach emails, debrief template, success criteria all meet acceptance criteria. **Two deviations from spec require resolution**, one of which is a self-contradiction inside a customer-facing document.

## Acceptance criteria verification

| # | Criterion | Status | Citation |
|---|---|---|---|
| 1 | Playbook: pre-pilot, install, pairing, show file, rehearsal, performance, fallback | ✅ pass | `docs/migration/first-pilot-playbook.md:10` (§1), `:44` (§2), `:96` (§3), `:124` (§4), `:158` (§5) |
| 2 | Theatre outreach: warm, BridgeX context, free pilot, Jindřich as contact | ✅ pass | `docs/customer-comms/pilot-outreach-theatre.md:16-37` (Ahoj greeting, BridgeX bridge para, free pilot offer, signature `Jindřich Trapl` line 31) |
| 3 | Corporate AV outreach: conference/event AV framing | ✅ pass | `docs/customer-comms/pilot-outreach-corporate-av.md:16-33` (Disguise/Resolume/QLab list line 22; "product launch, multi-day conference, awards ceremony" line 25) |
| 4 | Pre-pilot checklist: 15-point list | ❌ **DEVIATION** | File contains 22 checkboxes (`docs/customer-comms/pre-pilot-checklist.md`) but footer line 48 claims "15 items" — self-contradiction |
| 5 | Post-pilot debrief: 12-question survey | ⚠️ deviation noted | File has 15 questions (`docs/customer-comms/post-pilot-debrief-template.md:25-114`) vs criterion "12". Spec body's implementation notes listed 15; Forge documented this trade-off in done report. Acceptable but flagged. |
| 6 | Success criteria: 3 concrete metrics | ✅ pass | `docs/customer-comms/pilot-success-criteria.md:12-17` (table: rehearsal pass, performance pass, SM NPS ≥7, Op NPS ≥7) |
| 7 | Fallback plan: printed PDF + verbal | ✅ pass | `docs/migration/first-pilot-playbook.md:158-176` — explicit, with PDF print mandate cross-referenced at `:119` (step 3.3) |
| 8 | Architect-led content task; no production code | ✅ pass | `git diff --stat` shows only docs/* changes |
| 9 | Cross-reference B003-017, B003-019, B003-023 | ✅ pass | `docs/migration/first-pilot-playbook.md:6` (prerequisites), `:206` (footer); each customer-comms file footer references |

## Quality assessment

**Strengths:**
- Playbook is venue-actionable; numbered steps with concrete commands (`Cmd+S`, `Cmd+Shift+L`, URL paths)
- Smoke test in §2.3 includes latency target (<100ms acceptable, <50ms ideal) — measurable
- Common issues table at `first-pilot-playbook.md:88-93` adds operational value
- Fallback plan correctly identifies the precondition (PDFs printed at rehearsal end, step 3.3 mandatory)
- Owner annotations present per Critic note in spec (`Owner: Coordinator`, `Owner: Jindřich + Margaret`)
- Theatre email P.S. handles BridgeX continuity cleanly
- Success criteria document includes a failure response protocol with owners — addresses spec hint "Forge documents owner per step"

**Concerns:**
- **Pre-pilot checklist count inconsistency.** Spec acceptance criterion is explicit: "15-point list". File delivers 22 checkboxes. Worse, the document's own footer line 48 (`*15 items. If any item is unchecked on install day, flag to Jindřich before proceeding.*`) lies about the count. A coordinator counting items will spot this immediately. Done report claim "exactly 15 items split across 4 categories" is also inaccurate (5 sections, 22 items).

## Required changes

**Change 1 (mandatory):** Reconcile pre-pilot-checklist.md count.

Two acceptable resolutions:

**Option A** — trim to spec target (15 items):
- Keep network (6 → 4: drop "WiFi password shared" and "UDP ports not blocked"; fold into IT confirmation line)
- Keep hardware (6 → 4: combine SM device + operator devices into one row; combine LX/SX console firmware into one row)
- Keep show data (4 → 3: drop "CSV column headers confirmed")
- Keep time slots (3, unchanged)
- Keep comms (3 → 1: keep "Backup PDF" only; fold phone numbers into a comms-confirmed bullet)
- New total: 15

**Option B** — keep 22 items (recommended; they are useful), but:
- Update line 48 footer from `*15 items.*` to `*22 items across 5 categories. If any item is unchecked on install day, flag to Jindřich before proceeding.*`
- Add one-line note explaining the expansion from spec target ("Spec target was 15; expanded to 22 to cover real venue setup issues encountered during BridgeX deployments.")

Critic preference: **Option B** preserves operational value; the count adjustment + rationale is honest and avoids losing real checklist items.

**Change 2 (optional, document only):** No file change required; the 15-vs-12 debrief deviation is already documented in done report and is defensible per spec body. Architect may want to align spec text in future.

## Verdict

`changes_requested` — fix the pre-pilot-checklist.md count inconsistency (Option A or Option B above). Single small fix; all other content is production-grade and ready for Jindřich + Margaret to use.

Round 1. Will accept on Round 2 if the count is reconciled.
