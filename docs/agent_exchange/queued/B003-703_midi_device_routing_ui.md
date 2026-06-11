---
id: "B003-703"
title: "MIDI device end-to-end — Routing UI podpora MIDI zařízení + verifikace dispatch"
type: "implementation"
estimated_size_lines: 250
priority: "P1"
bundle: "ShowX-3.7"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/ui/DeviceEditDialog.tsx"
  - "src/modules/cuelist-core/src/ui/DevicesTable.tsx"
  - "src/main/src/shared/dispatcher/midiOut.ts"
  - "tests/unit/**"
acceptance_criteria:
  - "DeviceEditDialog: transport selector zahrnuje 'midi' s poli per midiOut.ts skutečné API (port name / virtual output; čti dispatcher/midiOut.ts PŘED návrhem polí). Validace."
  - "DevicesTable zobrazuje MIDI devices s portem; available MIDI outputs nabídnuté v dialogu (IPC z main — @julusian/midi list; nový malý IPC endpoint follow existing patterns)."
  - "Routing rule s target MIDI device + cue s midi payloadem → dispatchCue pošle reálnou MIDI zprávu (unit test s mock pool; manuální verifikace v done reportu: virtual MIDI port + receive log, na macOS lze IAC Driver)."
  - "Dispatch Log zobrazuje transport 'midi×N' korektně."
  - "`pnpm -r typecheck` clean, tests pass, PWA build clean."
  - "No edits outside target_files."
---

## Context
Engine MIDI transport existuje (midiOut pool, msc), Routing UI umí jen OSC. FOH realita = půlka zařízení MIDI. IAC Driver na macOS = testovací cesta bez hardwaru.
