---
bundle_id: "ShowX-3.1"
title: "Cuelist Core hotfix — Routing UI + Playhead broadcast + Demo onboarding"
status: "active"
opened_at: "2026-06-06"
goal: "Fix three critical gaps blocking real-world cuelist UI use: (1) no UI for routing + devices = hardware unreachable; (2) playhead is local state = multi-op workflow broken; (3) no demo fixture + onboarding = blank first-launch."
target_completion: "2026-06-08"
depends_on:
  - "ShowX-3 bundle accepted"
tasks_planned:
  - "B003-101 — Routing + Devices UI in Cuelist Core panel"
  - "B003-102 — Real-time playhead broadcast via Yjs awareness"
  - "B003-103 — Demo show fixture + first-launch picker (Demo / Open / New)"
---

# ShowX-3.1 Hotfix Bundle

## Why this bundle

ShowX 0.1 DMG is live, marketing site is live, dev/user docs are live. Real-world Cuelist UI use is blocked by three concrete gaps surfaced in Architect's 0.2 gap audit:

1. **Routing UI + Devices UI** — payload has `device_id` and routing table is in Y.Doc, but operators must JSON-edit the show document to configure hardware. Show with OSC to a real console is unusable today.
2. **Real-time playhead broadcast** — SM moves the cursor, LX op doesn't see it. Multi-operator collab is the headline feature; without sync this falls apart.
3. **Demo show fixture + first-launch onboarding** — opening ShowX shows an empty panel with three vague buttons (Open / New / Status). A tester has nothing to click; the first 60 seconds are friction.

This is a small, focused bundle (3 tasks, estimated 1 day Forge wall-clock). Each task ships a feature complete + tested + visible. After 3.1 we can run a real self-demo + first venue outreach.

## Tasks (3 planned)

- **B003-101** Routing + Devices UI — Electron panel gets two tables (Devices + Routing) with CRUD. Mutators wrap Y.Doc transactions, validation per data_model.md §10.
- **B003-102** Playhead broadcast — playhead state moves from local React state (per [12]) to Yjs awareness. All stations see the SM's cursor in real time.
- **B003-103** Demo show fixture + onboarding — built-in 25-cue `.showx` accessible via app "Open Demo Show" button. First-launch picker (no recent shows) shows three big cards: **Demo** / **Open existing** / **New from scratch**.

## Definition of done (bundle)

- All 3 tasks accepted by Critic
- Demo `.showx` ships inside the app bundle (extraResources in electron-builder)
- Routing UI tested with a real OSC destination (fake `osc-out` send + assert)
- Playhead awareness E2E scenario added to multiop.spec.ts (deferred until ShowX-1.1 shell harness)
- Architect decision note ratifying close

## Out of scope (defer to ShowX-3.2 or 0.2)

- CSV export (we have import only)
- PDF print preview / WYSIWYG
- Czech Unicode in PDF (embed Latin Extended-A subset font)
- Multi-cuelist switcher UI
- Edit proposals queue (SHOW mode module)
- Timecode trigger
- Webhook payload real impl
- Operator view search
- Help overlay in Operator view

## References

- ShowX-3 bundle close: `decisions/2026-06-06_showx_3_bundle_complete.md`
- Gap audit conversation: Architect inventory 2026-06-06 evening (in monitoring log)
