---
id: "B003-504"
title: "Shell GO executor — wire GoEventChannel + dispatchCue + OutputDispatcher (GO finally fires OSC)"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
bundle: "ShowX-3.5"
depends_on: []
target_files:
  - "src/main/src/runtime/GoExecutor.ts"
  - "src/main/src/runtime/ActiveShowDoc.ts"
  - "src/main/src/Shell.ts"
  - "src/main/src/shared/syncBroker/sideChannel.ts"
  - "src/main/src/ipc/showActions.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "src/modules/cuelist-core/package.json"
  - "tests/unit/runtime/GoExecutor.test.ts"
acceptance_criteria:
  - "New src/main/src/runtime/GoExecutor.ts: lifecycle-bound to active show. On show open: instantiates cuelist-core GoEventChannel with deps adapted from SideChannel + EventBus + attached Y.Doc. On show close: GoEventChannel.stop() + unsubscribe everything."
  - "SideChannel→GoChannelDeps adapter: `subscribe(topic, handler)` via sideChannel.subscribeServer(showId, m => m.topic === topic && handler(m)); `broadcast(envelope)` via sideChannel.publish(showId, envelope); `publishToStation(station_id, envelope)` MAY fall back to broadcast (LAN, handful of stations — document this simplification in code comment)."
  - "EventBus 'cue-fire' subscription (the currently-dangling event GoEventChannel publishes): calls cuelist-core `dispatchCue` with DispatchDeps {doc, show_id, cuelist_id, output: shell's OutputDispatcher instance, events: EventBus, log, abortSignal}. After dispatch, publishes 'cue-complete' event WITH payloads_dispatched + payloads_failed populated from CueDispatchResult — GoEventChannel's existing onCueComplete then broadcasts go.dispatched to stations."
  - "cuelist-core exports needed symbols (GoEventChannel, dispatchCue, buildDispatchRoutingTable etc.) via its package exports map — REMEMBER feedback_electron_workspace_imports_packed: workspace imports MUST go through pkg-name + exports map subpaths, never relative cross-package paths (packed asar silently hangs otherwise)."
  - "Demo Show generator (showActions.ts or wherever the demo .showx is built) seeds a default routing device: OSC transport, host 127.0.0.1, port 7000 (integration osc-ws-bridge default), enabled, matching all payload types/departments used by demo cues — so a FRESH demo show dispatches out of the box."
  - "Env override SHOWX_OSC_OUT=host:port — when set, GoExecutor registers/overrides the default OSC device target at show open. Documented in code."
  - "Every dispatch logs at info: topic 'cue.dispatched' {cue_id, cue_label, payloads_dispatched, payloads_failed, duration_ms} — and failures log at warn. This is the observable backbone for B003-505."
  - "GO pressed in paired browser → shell log shows cue.dispatched + UDP OSC packet leaves the process toward 127.0.0.1:7000 (verifiable with `nc -ul 7000` / oscdump / integration bridge). Include this manual verification result in the done report."
  - "Unit tests for GoExecutor: go.request through side-channel fake → dispatchCue called with right deps → cue-complete published → go.dispatched broadcast observed. Rejection path (unknown cue) → go.rejected broadcast. Show close → handlers detached (no dispatch after close)."
  - "`pnpm -r typecheck` clean, all tests pass."
  - "No edits outside listed target_files."
---

## Context — the missing wire

Live E2E 2026-06-10: GO in the browser does nothing in the shell. Root cause mapped by Architect:

```
PWA GoButton → sideChannel.sendGoRequest → broker SideChannel topic (works)
                                              ↓
                            ??? NOBODY SUBSCRIBES SERVER-SIDE ???
                                              ↓
GoEventChannel (cuelist-core) — fully implemented + unit-tested, never instantiated in shell
  → onGoRequest: replay-guard, idempotency, authority, publishes EventBus 'cue-fire'
                                              ↓
                            ??? NOBODY LISTENS TO 'cue-fire' ???
                                              ↓
dispatchCue (cuelist-core/dispatch) — fully implemented + unit-tested, never called from shell
  → buildDispatchRoutingTable(doc) → transports → OutputDispatcher.send
```

The shell's CuelistCore module instance is an empty lifecycle husk (init/start/health only). All the GO machinery exists as a tested library. This task connects it. **This is the single highest-value task of the bundle — after it, ShowX does something in the real world.**

## Architecture decisions (binding)

- **GoExecutor lives in main runtime (src/main/src/runtime/), NOT inside the CuelistCore module class.** Rationale: it composes ActiveShowDoc + SyncBroker.sideChannel + OutputDispatcher — all shell-shared services; module sandboxing for this comes later (module loader currently doesn't pass these). Keep CuelistCore module untouched.
- **One GoExecutor per active show** — create on `active_show.opened`, destroy on close. ActiveShowDoc already has open/close lifecycle + getShowId(); follow how SyncBroker attachDoc is hooked there.
- **publishToStation = broadcast fallback** is acceptable for 3.5 (idempotent client handling; stations filter by topic). Note it in code for the future SHOW-mode hardening pass.
- **Routing source of truth = the show doc's routing rules** (buildDispatchRoutingTable). Seeding the demo show with a default OSC device keeps the data model honest — no hardcoded bypass in the dispatch path.

## Implementation sketch

```ts
export class GoExecutor {
  private channel: GoEventChannel | null = null;
  private unsubs: Array<() => void> = [];

  constructor(private deps: { sideChannel: SideChannel; events: EventBus; output: OutputDispatcher; log: Logger }) {}

  attach(showId: string, doc: Y.Doc): void {
    const abort = new AbortController();
    const sc = this.deps.sideChannel;
    this.channel = new GoEventChannel({
      doc,
      events: this.deps.events,
      log: this.deps.log,
      broadcast: (env) => sc.publish(showId, env as SideChannelMessage),
      publishToStation: (_sid, env) => sc.publish(showId, env as SideChannelMessage), // broadcast fallback, see spec
      subscribe: (topic, handler) => {
        const sub = sc.subscribeServer(showId, (m) => { if ((m as {topic?:string}).topic === topic) handler(m); });
        return sub.unsubscribe;
      },
    });
    this.channel.start();
    const cf = this.deps.events.subscribe('cue-fire', async (e) => {
      const result = await dispatchCue(/* cue from e, deps with doc/show_id/cuelist_id/output/events/log/abort.signal */);
      this.deps.events.publish({ type: 'cue-complete', ...e, payloads_dispatched: result.payloads_dispatched, payloads_failed: result.payloads_failed.map(f => f.payload_id) });
      this.deps.log.info('cue.dispatched', { cue_id: e.cue_id, cue_label: e.cue_label, ...resultSummary });
    });
    this.unsubs.push(() => cf.unsubscribe(), () => abort.abort());
  }

  detach(): void { this.channel?.stop(); this.channel = null; this.unsubs.forEach(u => u()); this.unsubs = []; }
}
```

(Adapt to actual dispatchCue signature — read src/modules/cuelist-core/src/dispatch/payloadDispatch.ts first. Check what envelope wrapping sideChannel messages expect vs what GoEventChannel's envelope() emits — the PWA client already consumes go.dispatched envelopes today, mirror that exact wire shape.)

## Watch out

- Side-channel wire shape: PWA `sideChannel.on('go.dispatched')` — confirm whether client unwraps `{topic, seq, ts, payload}` envelopes or flat messages; match exactly or stations won't see dispatches.
- `cue-fire` payloads come from the event, but dispatchCue may re-read the cue from doc — follow its actual contract.
- OutputDispatcher device registration: read src/main/src/shared/OutputDispatcher.ts + dispatcher/oscClient.ts for how devices are added; routing table entries reference device_id — demo seed + table must agree.
- Do NOT store any fire state in the Y.Doc (FORBIDDEN_CRDT_FIELDS guard will throw — by design).

## Done report

Standard format + paste the actual shell log lines + `nc -ul 7000` (or oscdump) capture proving a real OSC packet from a browser GO.
