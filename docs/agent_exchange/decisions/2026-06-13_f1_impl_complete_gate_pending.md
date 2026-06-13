# F1 (ShowX-4) — impl complete, automated gate green, eyes-on pending

**Date:** 2026-06-13 ~16:55 CEST
**Status:** 11/11 implementation tasks ACCEPTED. B004-012 E2E gate: automated part PASSED, eyes-on part pending (HALT for Jindřich test).

---

## Implementation tasks — all accepted

| Task | Co | Rounds |
|---|---|---|
| B004-001 | Pre-wait data model + dispatch timing | r2 |
| B004-002 | Pre-wait UI + armed-waiting countdown | r1 |
| B004-003 | DMX payload type + dispatch | r1 |
| B004-004 | DMX payload editor UI | r3 |
| B004-005 | Webhook OUT real HTTP | r1 |
| B004-006 | Webhook IN listener | r1 |
| B004-007 | Disarm cue (skip+advance) | r1 |
| B004-008 | Audition / Preview GO | r1 |
| B004-009 | Hotkey trigger | r1 |
| B004-010 | CSV import pre-wait fix | r1 |
| B004-011 | Payload authoring discoverability | r1 |

10/11 accepted round 1; only 001 (r2, lock-semantics) + 004 (r3, DMX editor) needed iteration. Zero blocks, zero Architect rescues, zero round-4+. Clean bundle.

## Automated gate (B004-012 part 1) — PASSED

- ✅ `pnpm -r typecheck` clean (5 projects)
- ✅ `pnpm test` — **1666/1666** passed, 138 files (+157 tests vs v0.2.1 baseline 1509)
- ✅ `pnpm build` clean all packages; PWA bundle 436 KB, **no node:* leak** (3.5 lesson check)

## Eyes-on gate (B004-012 part 2) — PENDING

Requires (per spec + WORKFLOW binding gate): build/install DMG over installed app, then hands-on on the packed app:
- Create NEW payload of every type (osc/midi/msc/lx_ref/dmx/webhook/wait/group) in browser station + shell
- On-wire capture: OSC (nc -ul 7000), MIDI (virtual port), DMX (Art-Net/sACN packet), webhook (mock server)
- Pre-wait armed-waiting countdown; disarm skip+advance; audition zero-output; hotkey fire
- Screenshots reviewed BY EYE (3.6 layout-regression lesson)

**HALT here per agreed plan** (Jindřich: "po každé fázi HALT + checklist pro můj test, pokračování až po mém OK"). Eyes-on verification pairs naturally with Jindřich's own v0.3 test. Bundle NOT closed until this completes.

## Next

1. Build v0.3.0 DMG (on go).
2. Eyes-on gate (Architect CDP proklik + on-wire capture) + Jindřich test.
3. On pass → close F1, tag v0.3.0, push; then F2 (Time layer) on Jindřich OK.
