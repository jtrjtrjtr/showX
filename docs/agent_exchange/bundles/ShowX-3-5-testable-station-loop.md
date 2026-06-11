# Bundle ShowX-3.5 — Testable Station Loop + FOH Redesign

**Opened:** 2026-06-11
**Authorized by:** Jindřich ("go", 2026-06-10 session)
**Architect:** Fable 5 (hub session)
**Origin:** Live E2E test 2026-06-10 — Jindřich + Architect walked v0.1.13 station mode and found the product untestable: invisible UI contrast, GO wired to nothing, no editing, re-pairing friction.

## Goal

Close the loop a tester can SEE: pair once → readable dark FOH UI → click/arm/GO → real OSC packet out → visible in dispatch log + integration simulator → edit cue text from browser → syncs + persists.

## Tasks

| ID | Title | Priority | Depends on |
|---|---|---|---|
| B003-501 | Dark FOH redesign (tokens + cuelist + pairing views) | P0 | — |
| B003-502 | SM presence from awareness + deterministic authority | P0 | 501 |
| B003-503 | Onboarding UX — persistent session, PIN prefill, QR in shell | P0 | 501 |
| B003-504 | Shell GO executor — GoEventChannel + dispatchCue wiring | P0 | — |
| B003-505 | Dispatch Log panel + OSC verification | P1 | 504, 501 |
| B003-506 | Cue editing in PWA (label/description/standby_note) | P1 | 501, 502 |

Suggested Forge order: 501 → 504 → 502 → 503 → 505 → 506 (501 unblocks the most; 504 is the highest-value independent track).

## Out of scope (explicitly)

- Payload/trigger editing, cue add/delete/reorder (ShowX-4 discussion)
- SHOW-mode hardening of publishToStation targeting
- Cloud-hosted station UI (rejected — mixed content vs LAN WS; LAN-first stands)
- showx.xlabproject.net "Launch station" web section — Architect handles post-bundle (marketing site repo, not this repo)

## Close criteria

All 6 accepted by Critic + Architect E2E walkthrough on v0.1.14 DMG: pair (once) → readable UI → GO → OSC packet captured → edit survives relaunch. Close decision note documents evidence.

## Polish notes (non-blocking, observed during Architect visual verification)

- CueRow label column (80px grid track) overflows into description for longer labels ("Announce") — needs `minWidth: 0` / wider track or ellipsis. Fold into B003-505/506 round or post-bundle polish.
