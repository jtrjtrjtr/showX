# ShowX 0.1 — Pilot Success Criteria

> **Owner:** Jindřich reviews after each pilot; aggregate reviewed after all 5 pilots complete
> **Source data:** Post-pilot debrief (`post-pilot-debrief-template.md`) + coordinator observation notes

---

## Per-pilot verdict

A single pilot **hard-passes** when ALL of the following are true:

| # | Criterion | Measurement | Pass threshold |
|---|---|---|---|
| 1 | Rehearsal completed | No ShowX-caused cue failures during rehearsal run | Zero misfires attributable to ShowX |
| 2 | Performance completed | No ShowX-caused cue failures during live performance | Zero misfires attributable to ShowX |
| 3 | SM NPS | Q12 score from SM debrief | ≥ 7 / 10 |
| 4 | Operator NPS | Q12 score from at least 1 operator | ≥ 7 / 10 |

A pilot **soft-passes** when hard-pass criteria 1 and 2 are met but NPS is 5–6. Soft-pass still counts as learning; does not count toward the programme success metric.

A pilot **fails** when:
- Any ShowX crash occurs during a live performance cue call
- Any cue misfires and the root cause is attributed to ShowX (not operator error or console issue)
- SM NPS < 5

---

## Programme success metric

**ShowX 0.1 pilot programme succeeds when: ≥ 3 of 5 pilots hard-pass.**

Reaching this threshold unlocks:
- Paid plan proposal + pricing negotiation with pilot venues
- Reference permission requests (Q14 of debrief)
- ShowX 0.2 scope planning (post-Kongres roadmap)

---

## Bonus indicators (soft, not required for programme success)

| Indicator | Measurement |
|---|---|
| Paid interest | SM/producer expresses willingness to pay (Q13 ≥ any number given) |
| Reference agreement | SM agrees to Q14 reference call |
| Repeat booking | Customer commits to using ShowX for a second production |
| Unsolicited referral | Customer names another venue/company that should try ShowX |

---

## Failure response protocol

| Failure type | Response | Owner |
|---|---|---|
| ShowX crash during performance | Root-cause call + critical patch within 7 days | Jindřich + Forge |
| Cue misfire attributed to ShowX | Root-cause + regression test added | Forge |
| NPS < 5 | Exit interview (Q15 + extended call); understand why | Jindřich |
| 2+ pilots fail for same reason | Stop programme; fix root cause before resuming | Architect decision |

---

## Log

| Pilot # | Venue / Company | Rehearsal pass | Performance pass | SM NPS | Op NPS | Verdict | Date |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

**Programme result:** ___ / 5 hard-pass

---

*Cross-references: B003-019 (PDF backup generation — must happen before performance day), B003-020 (multi-operator integration tests — baseline for confidence), B003-023 (ShowX 0.1 DMG — prerequisite for any pilot).*
