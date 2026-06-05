# @showx/module-cuelist-core

Multi-operator FOH cuelist with per-department views and REHEARSAL mode.

This is the **Cuelist Core** module for ShowX — the centerpiece of the ShowX product. It provides:

- Multi-operator collaborative cuelist (Yjs CRDT backed)
- Per-department filtered views (LX, SX, VIDEO, AUTO, PYRO, FS)
- REHEARSAL mode with full edit access; SHOW mode with locked playback
- Cue payload dispatch to OutputDispatcher (OSC, MIDI, MSC, webhook)
- GO event side-channel for Stream Deck / Companion integration
- CSV import (QLab / Eos / generic) and .showx package read/write
- PDF cue-sheet export (per-department + SM master)

**Tier:** Free (core feature of ShowX)

**Spec:** `../../docs/specs/data_model.md`

**Bundle:** ShowX-3 (tasks B003-001..023)
