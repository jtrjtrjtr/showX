# ShowX 0.1.0 — Pre-publish smoke test checklist

Run on a **clean macOS install** (fresh VM or freshly wiped user account) before publishing.
All items must pass. A single FAIL blocks release.

Tester: ___________________  Date: ___________________  macOS version: ___________________

---

## Install

- [ ] DMG mounts without error; license / XLAB branding visible
- [ ] Drag ShowX.app to /Applications copies successfully
- [ ] Launch passes Gatekeeper — "XLAB s.r.o." developer shown, no unsigned warning
- [ ] Network + Bonjour permission dialogs appear on first launch; accepting grants correctly

---

## Boot

- [ ] App starts within 5 seconds from cold launch
- [ ] No crash, no uncaught exception in Console.app for ShowX process
- [ ] mDNS service `_showx._tcp.local` visible (verify with `dns-sd -B _showx._tcp`)
- [ ] Asset HTTP server on `:5300` responds: `curl http://localhost:5300/` returns PWA index.html

---

## Show file

- [ ] Open existing `.showx` fixture — show loads; cuelist visible with correct cue count
- [ ] `doc.yjs` is preferred over JSON projection (check log: "loaded from yjs doc")
- [ ] Create new show — title/venue/date prompt appears; file saved to disk
- [ ] **Negative:** rename `doc.yjs` to `doc.yjs.bak`, reopen — show loads from JSON projections; log shows `recovery_from_json`

---

## Pairing

- [ ] Open ShowX PWA URL on iPad (http://\<mac-ip\>:5300) — pairing screen shown
- [ ] SM iPad pairs via QR code — presence indicator turns green on both Mac and iPad
- [ ] LX laptop pairs via 6-digit PIN — presence indicator turns green
- [ ] Station list in ShowX shell shows both paired stations with correct department labels

---

## Cuelist

- [ ] SM view displays all cues in correct order
- [ ] LX view filters to LX department cues only + highlights compound cues
- [ ] A compound cue is visible in both SM and LX views
- [ ] SM edits a cue label in REHEARSAL mode → LX station sees the update within 1 second

---

## GO

- [ ] SM presses Space → GO fires; both stations animate "cue fired" confirmation
- [ ] OSC packet sent to console (verify with OSC monitor or Eos `[OSC]` status)
- [ ] `go.dispatched` broadcast received by both stations (check network tab or station UI)
- [ ] **Negative (replay window):** resend same `request_id` within 5s → request is rejected with `duplicate`; no re-fire
- [ ] **Negative (idempotency):** send same `request_id` after 5s → cached acknowledged reply returned; no re-fire

---

## SHOW mode

- [ ] SM enters SHOW mode → red lock badge visible on both stations
- [ ] LX operator cue editor shows lock banner; payload editors are disabled
- [ ] Meta edits (cue label) are still allowed in SHOW mode
- [ ] SM exits SHOW mode → badge removed; LX editor re-enables

---

## Import / export

- [ ] CSV import from QLab fixture → correct number of cues created with correct labels
- [ ] .showx export to a new path → file written; can be reopened
- [ ] Single-file JSON export → re-import round-trip produces identical cue count and labels
- [ ] PDF cue sheet export → PDF opens; one sheet per department plus SM master; all cue labels present

---

## Stream Deck (if available)

- [ ] Companion module `showx-companion` loaded in Bitfocus Companion
- [ ] GO action triggers cue fire visible in ShowX
- [ ] Standby advance action moves standby cue

---

## Security / signature / notarization

- [ ] `codesign --verify --verbose ShowX.app` — exits 0
- [ ] `spctl --assess --type exec ShowX.app` — exits 0 (shows `accepted`)
- [ ] `xcrun stapler validate ShowX.app` — exits 0

---

## Uninstall

- [ ] Drag ShowX.app to Trash + empty Trash — app removed
- [ ] `~/Library/Application Support/ShowX/` persists (user data, NOT auto-deleted by uninstall)
- [ ] No leftover LaunchAgents in `~/Library/LaunchAgents/` with ShowX prefix
- [ ] No system daemons installed — `launchctl list | grep showx` returns empty

---

## Sign-off

All items passed: [ ] YES  [ ] NO — blocked items: ___________________

Release authorized by: ___________________  Date: ___________________
