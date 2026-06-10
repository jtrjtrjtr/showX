# ShowX-3.5 bundle open — Testable Station Loop + FOH Redesign

**Project:** ShowX
**Date:** 2026-06-11
**Bundle:** ShowX-3.5 (open)
**Authorized:** Jindřich "go" — full scope including redesign + onboarding UX additions

## Why

Live E2E test 2026-06-10 (Jindřich driving, Architect reproducing via chrome-devtools) found v0.1.13 station mode functionally alive but untestable as a product:

1. **Contrast broken** — PWA global dark style bleeds into cuelist's light-cream components that don't set explicit text color → cue labels ~invisible (`#E0E0E0` on `#FAF8F1`). Confirmed by computed-style inspection.
2. **GO is wired to nothing** — `go.request` reaches broker SideChannel; GoEventChannel + dispatchCue exist as fully tested cuelist-core libraries but are never instantiated/called in the shell. No OSC ever leaves the process.
3. **No cue editing in PWA** — never built; Jindřich's first instinct (double-click) hits dead UI.
4. **"SM offline — playhead frozen" misfires** — derived from playhead write age (30s), not SM presence; plus authority election via Map iteration order = split-brain with 2+ SM tabs.
5. **Pairing friction** — session not persisted; every launch = URL + full form + PIN.

## Decisions

- **Dark FOH theme replaces cream** (not a contrast patch). FOH tools live in dark venues; QLab/EOS precedent. Token palette specified in B003-501.
- **Cloud-hosting station UI rejected** — https → LAN ws:// mixed content. Friction killed instead via persistent session + QR onboarding (B003-503).
- **GoExecutor lives in main runtime**, not in the CuelistCore module class — composes shell-shared services; module sandboxing later.
- **Demo Show seeds default OSC device 127.0.0.1:7000** = integration osc-ws-bridge → Notch simulator chain becomes the standard verification path.
- **Editing scope = text fields only** (label/description/standby_note), rehearsal mode, not authority-gated (CRDT collaborative semantics per data_model.md).

## Scope flag

`claude_runner_scope.json` → enabled: true, bundle ShowX-3.5, allowed B003-501..506.

## Checkpoint

Pre-bundle commit `3a10e56` checkpoints all ShowX-3.4 work (39 files, v0.1.9–0.1.13 fixes) — was sitting uncommitted since 2026-06-08.
