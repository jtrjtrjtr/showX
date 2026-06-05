---
id: "B001-008"
critic_started_at: "2026-06-05T17:05:00Z"
critic_completed_at: "2026-06-05T17:15:00Z"
verdict: "accepted"
review_round: 1
---

## Acceptance criteria check

- [x] **InputRegistrar exposes subscribe(...) → Subscription handle (with unsubscribe())** → `src/main/src/shared/InputRegistrar.ts:69-119` (`subscribeOsc`) and `:121-170` (`subscribeMidi`), each returning `{ id, unsubscribe(): Promise<void> }`. Spec's own implementation notes mandate `subscribeOsc` / `subscribeMidi` as the API shape, not a generic `subscribe(transport, …)`; matches.
- [x] **One physical listener per OSC UDP port; multiplexed to matching subscribers** → `InputRegistrar.ts:44` (`oscPorts: Map<port, listener>`) + `:74-79` (lookup-or-create). Verified by `tests/unit/shared/InputRegistrar.test.ts:89-102` (`subscriberCount === 2` on shared port).
- [x] **One physical handler per MIDI input port name; multiplexed** → `InputRegistrar.ts:45` (`midiPorts: Map<portName, listener>`) + `:126-131`. Verified by `tests/unit/shared/InputRegistrar.test.ts:230-242`.
- [x] **Refcounted unsubscribe — last subscriber closes port** → OSC: `InputRegistrar.ts:100-106` (decrement → stop + delete on 0). MIDI: `:151-157`. Stress-tested with 5 subs + shuffled-order unsubscribe at `tests/unit/shared/InputRegistrar.test.ts:200-219`.
- [x] **OSC glob filter compiled once per subscription, matched on every packet** → `compileGlob` at `InputRegistrar.ts:32-38` is called once at `:82` and the resulting `RegExp` is captured in the `perSubHandler` closure at `:86-94`. No allocation on hot path. Verified by `tests/unit/shared/InputRegistrar.test.ts:120-130` (`/eventx/poll/?` matches single segment char only).
- [x] **MIDI filter supports type + channel match (or 'any')** → `InputRegistrar.ts:133-139`. Type test at `:244-258`, channel test at `:260-274`.
- [x] **Handler crash caught and logged; port stays open; siblings continue** → triple coverage: outer `OscPortListener` fan-out `try/catch` at `src/main/src/shared/input/oscListener.ts:78-83`; inner per-sub `try/catch` at `InputRegistrar.ts:89-93` and `:140-144`; MIDI fan-out `try/catch` at `src/main/src/shared/input/midiIn.ts:127-133`. Verified by `tests/unit/shared/InputRegistrar.test.ts:160-174` (sibling receives next message after throw) and `oscListener.test.ts:124-142`.
- [x] **All listeners stop cleanly on shutdown()** → `InputRegistrar.ts:58-67` (`Promise.all` over both port maps, then clear). Verified by `tests/unit/shared/InputRegistrar.test.ts:188-198` (both ports stopped + `listActiveListeners() === []`).
- [x] **Vitest unit tests cover happy + multi-subscriber multiplex + refcount + filter mismatch + handler throw isolation** → `pnpm vitest run tests/unit/shared/InputRegistrar.test.ts tests/unit/shared/input/` → **3 files, 35 tests passed (0 failed)** locally. All scenarios from the test plan represented.

## Logging audit (spec section "Logging")

All six required log keys present and structured:

| Required key | File:Line |
|---|---|
| `input.osc.bound { port }` | `src/main/src/shared/input/oscListener.ts:92` |
| `input.osc.closed { port }` | `oscListener.ts:106` |
| `input.osc.parse_error { port, err }` | `oscListener.ts:73` |
| `input.midi.opened { portName }` | `src/main/src/shared/input/midiIn.ts:91` |
| `input.midi.closed { portName }` | `midiIn.ts:104` |
| `input.handler.threw { transport, subscriptionId, err }` | `InputRegistrar.ts:92, :143` (per-sub) + `oscListener.ts:81` + `midiIn.ts:131` (inner) |

## Code review notes

- **Glob safety**: `compileGlob` escapes all regex metacharacters before substituting `*` / `?`, then anchors with `^…$` (`InputRegistrar.ts:32-38`). No regex-injection risk via malicious filter strings, and the `[^/]*` semantics correctly stop at `/` boundaries (matches OSC address space conventions).
- **Closure capture vs. re-lookup race**: `cleanup` closures capture `capturedListener` and `capturedPort` / `capturedPortName` (`InputRegistrar.ts:98-99, 149-150`) instead of re-reading the map at unsubscribe time. Prevents a class of races where a re-bound port could be wrongly stopped by a stale subscription. Good defensive choice.
- **Idempotent unsubscribe**: `:113-117` and `:164-168` short-circuit if the subscription was already removed. Safe to call `.unsubscribe()` twice.
- **`OscPortListener.stop()`**: zeroes `this.socket` before awaiting `close`, and `handlers.clear()` runs synchronously before the close completes (`oscListener.ts:99-106`). No leaked socket reference or fan-out into a dead socket.
- **`MidiPortListener.stop()`**: removes the bound message handler before `closePort()` to prevent late `message` events firing into a torn-down `_fanOut` (`midiIn.ts:94-105`). Correct order.
- **Factory injection**: optional `oscFactory` / `midiFactory` constructor args (`InputRegistrar.ts:48-52`) keep the production path identical to the spec while making tests fully deterministic without UDP / MIDI hardware. Matches the spec's `_injectForTest` alternative for MIDI.
- **`createRequire` for native deps** (`oscListener.ts:6`, `midiIn.ts:5`): pragmatic workaround for ESM + CJS native modules. Acceptable given the ESM-first project layout and the fact that BridgeX 0.3.x uses the same packages.
- **`shared/index.ts`**: only re-exports `InputRegistrarImpl` + the local `InputRegistrar` interface (`src/main/src/shared/index.ts:14-15`). The inbound filter / message types are exported via `InputRegistrar.ts:14` under renamed aliases (`InboundOscMessage`, `InboundMidiMessage`) to avoid collision with the outbound types in `showx-shared`. Adapter to the existing `showx-shared.InputRegistrar` interface (`listen` / `unlisten`) is deferred to B001-011 per task's "Out of scope" → "Wiring into Shell (B001-011 owns)". Acceptable scope boundary.
- **fromHost filter**: implemented at `InputRegistrar.ts:88` — accepts `'any'` as wildcard or an exact IP match. Verified at `InputRegistrar.test.ts:176-186`.

## Concerns considered, none blocking

- `_boundPort` mutation in `OscPortListener.start()` (`oscListener.ts:91`) handles the port=0 ephemeral-bind case correctly so logging reflects the actual OS-assigned port. Sound.
- Lazy-init non-concurrency note (`done.md` decision #3) is correctly self-documented: tests use sequential `for` loops, and module startup in the Shell is sequential, so this is fine for current usage. If concurrent same-port `subscribeOsc` is ever needed, B001-011 or a follow-up can add an in-flight map. Not a blocker for this task.

## Tests run locally

```
pnpm vitest run tests/unit/shared/InputRegistrar.test.ts tests/unit/shared/input/

 ✓ tests/unit/shared/input/midiIn.test.ts  (16 tests) 5ms
 ✓ tests/unit/shared/InputRegistrar.test.ts  (13 tests) 7ms
 ✓ tests/unit/shared/input/oscListener.test.ts  (6 tests) 366ms

 Test Files  3 passed (3)
      Tests  35 passed (35)
   Duration  661ms
```

## Verdict rationale

All 9 acceptance criteria verified with file:line citations against actual source. All 6 required log keys present in the right modules. Refcount, glob compilation, handler-throw isolation, and shutdown lifecycle all behave correctly under unit tests; the 5-sub shuffled-unsubscribe stress test explicitly covers the failure mode flagged in the task's "Notes for Critic". Factory injection cleanly separates production from test paths. The deliberate split of the `subscribeOsc`/`subscribeMidi` API from the `showx-shared.InputRegistrar` `listen`/`unlisten` adapter is consistent with the task's own out-of-scope clause.

**Verdict: accepted.**
