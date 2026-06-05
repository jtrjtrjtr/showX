# ShowX Developer Documentation

Welcome to the ShowX engineering docs. ShowX is XLAB's master FOH product — a LAN-first Electron app on the FOH Mac with loadable feature modules (EventX Bridge, Cuelist Core, SHOW mode, Custom Router, Cloud Sync). PWA stations connect over LAN with mDNS discovery and local pairing. These pages explain how the codebase is organised, how to build against it, and how the multi-agent team coordinates work. The canonical contracts live in `docs/specs/` — these dev docs onboard, illustrate, and motivate; the specs bind.

## Table of contents

| # | Doc | What it covers |
|---|---|---|
| 1 | [index.md](./index.md) | This page |
| 2 | [architecture.md](./architecture.md) | System architecture overview, shared services, module boundary, data flow |
| 3 | [getting-started.md](./getting-started.md) | Local dev setup, prerequisites, common commands |
| 4 | [module-sdk.md](./module-sdk.md) | Writing a ShowX module — Manifest, Module, ModuleContext, worked example |
| 5 | [protocol-reference.md](./protocol-reference.md) | Wire protocol — OSC, WSS, HTTP, mDNS, in-process events |
| 6 | [cuelist-data-model.md](./cuelist-data-model.md) | Yjs document, `.showx` package, Cues, Payloads, REHEARSAL/SHOW |
| 7 | [pairing-and-auth.md](./pairing-and-auth.md) | Two-context auth model, HMAC device tokens, pairing flow, threat model |
| 8 | [testing-and-ci.md](./testing-and-ci.md) | Vitest, Playwright, parity harness, CI workflow, test patterns |
| 9 | [agent-exchange-workflow.md](./agent-exchange-workflow.md) | Three-Claude team — Architect, Forge, Critic — and how they coordinate |
| 10 | [contributing.md](./contributing.md) | Role limits, commit conventions, code style, decisions process |

## Where to start

### If you are a first-time contributor

Read in this order:

1. `getting-started.md` — get the workspace running.
2. `architecture.md` — understand the shell / module split.
3. `agent-exchange-workflow.md` — understand how tasks reach you (and why your work needs a done report).
4. `contributing.md` — role-specific hard limits, branching, commits.

### If you are writing a module

1. `architecture.md` — get the mental model of shared services.
2. `module-sdk.md` — the contract you implement (Manifest + Module + ModuleContext).
3. `cuelist-data-model.md` and `protocol-reference.md` — the upstream data the cuelist publishes and the downstream transports the dispatcher accepts.
4. `testing-and-ci.md` §"Unit test (per module)" — the mock ModuleContext pattern.

### If you are an external integrator

You are not writing ShowX code; you are talking to ShowX from Companion, Eos, MA3, QLab, or a custom script.

1. `protocol-reference.md` — every OSC address, every WSS topic, every HTTP endpoint.
2. `pairing-and-auth.md` §"External OSC IN auth" — IP whitelist + shared-secret gates.
3. `cuelist-data-model.md` §"Cue catalog export" — the schema your tool can poll for "what could fire".

## Binding specs vs onboarding docs

These dev docs are **onboarding material**. The canonical contracts live in:

- `docs/specs/data_model.md` — Yjs schema, `.showx` package, REHEARSAL/SHOW
- `docs/specs/module_loader.md` — Module interface, ModuleContext, lifecycle
- `docs/specs/protocol_dictionary.md` — every OSC address, every WSS topic
- `docs/specs/pairing_auth.md` — pairing flow, tokens, threat model
- `docs/specs/bridgex_absorption.md` — BridgeX 0.3.x migration plan
- `src/types/module.ts` — TypeScript contract

When dev docs and specs disagree, the **spec wins**. File a doc fix.

## Strategic context

ShowX exists because of the 2026-06-05 evening 2-product pivot (`../../xlab-strategy/decisions/2026-06-05_bridgex_to_showx_module.md`). The MVP scope is `../../xlab-strategy/docs/showx_mvp_scope.md`. The module architecture sketch is `../../xlab-strategy/docs/showx_module_architecture.md`. Read those if you want to know **why** the codebase is shaped the way it is.

## Where to file issues

ShowX is a private XLAB project (proprietary; license TBD pre-public-beta Q4 2027). Use the GitHub repo issue tracker if you have one configured. For agent-internal coordination (Architect / Forge / Critic), file a task spec in `docs/agent_exchange/queued/` and update `state.json` — see `agent-exchange-workflow.md`.
