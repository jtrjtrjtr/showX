# ShowX

**XLAB master FOH product.** LAN-first Electron app on the FOH Mac, modular, with loadable feature modules (EventX Bridge, Cuelist Core, SHOW mode, Custom Router, Cloud Sync). PWA stations connect over LAN with mDNS discovery + local pairing.

> **Status (2026-06-05):** Repo bootstrapped. No source code yet — scaffolding pending ShowX-1 Foundation bundle execution by Forge agent post-Kongres (2026-06-17).

## Quick links

- `CLAUDE.md` — project DNA, team roles, stack
- `docs/agent_exchange/WORKFLOW.md` — multi-agent coordination protocol
- `docs/specs/` — module + protocol specifications
- `../xlab-strategy/docs/showx_mvp_scope.md` — MVP scope (strategic)
- `../xlab-strategy/docs/showx_module_architecture.md` — module architecture (strategic)
- `../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md` — binding 2-product pivot decision

## Architecture (one-paragraph)

ShowX is a single signed Electron app on the FOH Mac. Inside the Electron main process: a module loader hosts feature modules (each can be enabled/disabled per pricing tier and per user setting), plus shared infrastructure (embedded y-websocket Yjs sync broker, static HTTP asset server, mDNS service advertise, local pairing token store, protocol dispatcher for OSC/MIDI/DMX/MSC/LTC). PWA stations (browsers on iPad / Mac / Win) discover ShowX via mDNS, pair with QR/PIN, connect to the sync broker over LAN WSS, and render per-operator views of the shared cuelist document. No cloud dependency for venue runtime; cloud sync is a Pro+ opt-in module.

## Stack

- Electron + Node.js + TypeScript (main process)
- React 18 + Vite + TypeScript + Yjs + IndexedDB (PWA frontend)
- y-websocket (embedded sync broker)
- Express (asset server)
- bonjour-service (mDNS)
- osc-min / node-osc, @julusian/midi, dmxnet (Art-Net), e131 (sACN), MSC over MIDI
- Vitest + Playwright + custom parity test harness

## Team

Three-Claude team (Architect / Forge / Critic). See `CLAUDE.md` for role boundaries.

## License

Proprietary (XLAB). License terms TBD pre-public-beta (Q4 2027 target).
