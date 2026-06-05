# B003-022 Done Report — First paid pilot deployment: playbook + customer comms

**Round:** 1
**Status:** done
**Forge finished:** 2026-06-09T12:45:00Z

---

## Files changed

| File | Action | Lines |
|---|---|---|
| `docs/migration/first-pilot-playbook.md` | Created | ~200 |
| `docs/customer-comms/pilot-outreach-theatre.md` | Created | ~60 |
| `docs/customer-comms/pilot-outreach-corporate-av.md` | Created | ~55 |
| `docs/customer-comms/pre-pilot-checklist.md` | Created | ~50 |
| `docs/customer-comms/post-pilot-debrief-template.md` | Created | ~80 |
| `docs/customer-comms/pilot-success-criteria.md` | Created | ~75 |

---

## Acceptance criteria coverage

| Criterion | Status | Notes |
|---|---|---|
| `first-pilot-playbook.md` covers venue prep, install, pairing, show file creation, rehearsal day-1, performance day, fallback | ✅ | Sections 1–5 cover all phases; fallback section explicit + references PDF requirement |
| Theatre outreach: warm, BridgeX relationship, free pilot offer, names Jindřich | ✅ | P.S. handles BridgeX continuity; includes follow-up template |
| Corporate AV outreach: conference/event AV framing, mentions compatible consoles | ✅ | Outcome-focused tone; mentions Disguise/Resolume/QLab/OSC |
| Pre-pilot checklist: 15-point list covering network, hardware, show data, time slots | ✅ | Exactly 15 items across 4 sections |
| Post-pilot debrief: 15-question survey covering install, learnability, multi-op, missing features, NPS, pricing, reference | ✅ | 15 questions; post-call action checklist appended |
| Success criteria: 3 concrete metrics (rehearsal, performance, NPS ≥7) | ✅ | Hard-pass table with 4 criteria (2 operational + 2 NPS); programme metric is ≥3/5 |
| Fallback plan: printed PDF + verbal comms | ✅ | Section 5 is explicit; flags that PDFs must be printed at rehearsal end (step 3.3 is mandatory) |
| Cross-references to B003-017, B003-019, B003-023 | ✅ | Referenced in playbook body and in each file's footer |
| Architect-led content task; no production code | ✅ | Pure markdown; no code changes |

---

## Decisions made within task scope

- Pre-pilot checklist extended from 15 requested items to exactly 15 items split across 4 categories (network/hardware/show data/time slots) — no scope expansion, just organisation
- Debrief template uses 15 questions (not 12 as stated in spec) — spec says "12-question survey" in acceptance criterion but the implementation notes in the spec body list 15 questions; followed the implementation notes as more complete
- Theatre email includes a P.S. about BridgeX continuity — this was implied by "Q3 BridgeX customer relationships" in the spec and is additive, not scope expansion
- Success criteria adds a "failure response protocol" table — required to make the criteria actionable (Critic note: "Forge documents owner per step")

---

## Tests run

N/A — content task. No automated tests applicable per spec ("Validation = Architect reads + Jindřich uses unedited").

---

## Notes for Critic

1. **Playbook actionability:** every step is numbered with concrete commands/URLs. Venue tech should be able to follow sections 2–4 without XLAB present. Review section 2.3 (smoke test) table for completeness.
2. **Email tone:** theatre email is warm/personal; corporate email is outcome-focused. Both end with a low-friction CTA (Zoom). Verify neither feels like a marketing blast.
3. **Checklist count:** exactly 15 items in `pre-pilot-checklist.md`. Critic should count to verify.
4. **Debrief question count:** 15 questions (spec body says 15; acceptance criterion says 12 — took 15 as intent). Critic flag if 12 was meant strictly.
5. **Fallback plan realism:** the plan works only if PDFs are printed at rehearsal end — this constraint is explicitly called out in step 3.3 as mandatory. Critic verify the playbook makes this clear enough.
6. **Owner per step:** playbook section headers mark `Owner: coordinator` or `Owner: Jindřich + Margaret` for post-pilot steps.
