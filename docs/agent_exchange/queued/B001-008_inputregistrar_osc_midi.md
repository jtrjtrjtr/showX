---
id: "B001-008"
title: "InputRegistrar infrastructure (OSC + MIDI listeners)"
type: "implementation"
estimated_size_lines: 400
priority: "P1"
depends_on: ["B001-002", "B001-003"]
target_files:
  - "src/main/src/shared/InputRegistrar.ts"
  - "src/main/src/shared/input/oscListener.ts"
  - "src/main/src/shared/input/midiIn.ts"
  - "src/main/src/shared/input/types.ts"
  - "tests/unit/shared/InputRegistrar.test.ts"
  - "tests/unit/shared/input/oscListener.test.ts"
  - "tests/unit/shared/input/midiIn.test.ts"
acceptance_criteria:
  - "InputRegistrar exposes subscribe(transport, filter, handler) → Subscription handle (with unsubscribe())"
  - "One physical listener per OSC UDP port; multiplexed to all subscribing modules whose filter matches"
  - "One physical handler per MIDI input port name; multiplexed to subscribers"
  - "Refcounted unsubscribe: when last subscriber on a port leaves, the port is closed and resources released"
  - "OSC filter supports glob-style address patterns (e.g. /showx/cue/*, /eventx/poll/?), parsed once and matched on every incoming packet"
  - "MIDI filter supports message-type match (noteOn / noteOff / cc / programChange / sysex / any) and optional channel match (0-15 or any)"
  - "Module crash inside a handler is caught and logged via Logger; the port stays open and other subscribers continue receiving"
  - "All listeners stop cleanly on InputRegistrar.shutdown() (used at Shell teardown)"
  - "Vitest unit tests: happy path + multi-subscriber multiplex + refcounted close + filter mismatch + handler throw isolation"
---

## Context

The InputRegistrar is the inbound counterpart to the OutputDispatcher (B001-007). Multiple modules will subscribe to the same OSC port or MIDI input — e.g. the EventX Bridge module listens for `/eventx/cue/*` while a Custom Router rule listens for `/lights/*` on the same UDP port 8000. The OS only allows ONE process to bind a UDP port or hold a MIDI input handle, so ShowX must own the physical listener once and fan-out to subscribers.

InputRegistrar is part of shared infrastructure (`src/main/src/shared/`) and is wired into `ModuleContext` so every module can call `context.input.subscribe(...)` without ever touching the raw network or MIDI layer.

This task creates the registrar + two transport implementations (OSC, MIDI). DMX-in / HTTP webhook / serial transports are explicitly out of scope and arrive in later bundles.

## Implementation notes

### Dependencies (add to `src/main/package.json`)

```
"osc-min": "^1.1.2",
"@julusian/midi": "^3.5.2"
```

Both are already in use in BridgeX 0.3.x and proven on macOS — keep versions in sync where possible.

### `src/main/src/shared/input/types.ts`

```ts
export type InputTransport = 'osc' | 'midi';

export interface OscInputFilter {
  /** Glob address pattern, e.g. "/showx/cue/*". Use "*" to match any. */
  address: string;
  /** Optional source host filter (CIDR not required for v1; exact IP or "any"). */
  fromHost?: string;
}

export interface OscMessage {
  address: string;
  args: Array<number | string | boolean | Buffer>;
  fromHost: string;
  fromPort: number;
  receivedAt: number; // ms epoch
}

export interface MidiInputFilter {
  type?: 'noteOn' | 'noteOff' | 'cc' | 'programChange' | 'sysex' | 'any';
  /** 0-15 or 'any'. */
  channel?: number | 'any';
}

export interface MidiMessage {
  type: 'noteOn' | 'noteOff' | 'cc' | 'programChange' | 'sysex';
  channel: number;          // 0-15
  data1: number;            // note / cc number / program
  data2: number;            // velocity / cc value (0 for sysex)
  raw: number[];            // raw bytes
  receivedAt: number;
}

export interface Subscription {
  id: string;               // uuid
  unsubscribe(): Promise<void>;
}

export interface OscPortKey { kind: 'osc'; port: number; }
export interface MidiPortKey { kind: 'midi'; portName: string; }
export type ListenerKey = OscPortKey | MidiPortKey;
```

### `src/main/src/shared/input/oscListener.ts`

Wraps `osc-min` parsing on a `dgram` UDP socket.

```ts
import * as dgram from 'node:dgram';
import oscMin from 'osc-min';
import type { Logger } from 'showx-shared';
import type { OscMessage } from './types.js';

export class OscPortListener {
  private socket: dgram.Socket | null = null;
  private handlers = new Set<(msg: OscMessage) => void>();
  constructor(private port: number, private logger: Logger) {}

  async start(): Promise<void> { /* bind UDP socket; on 'message' → parse → fan-out */ }
  async stop(): Promise<void>  { /* close socket, clear handlers */ }
  addHandler(fn: (msg: OscMessage) => void): void { ... }
  removeHandler(fn: (msg: OscMessage) => void): void { ... }
  get handlerCount(): number { return this.handlers.size; }
}
```

Parse incoming packet via `oscMin.fromBuffer`. Support OSC bundles (recursively unpack). For each parsed message, build `OscMessage` with `fromHost`/`fromPort` from the dgram `rinfo`. Wrap each handler call in try/catch — never let one handler take down the listener.

### `src/main/src/shared/input/midiIn.ts`

Wraps `@julusian/midi.Input`.

```ts
export class MidiPortListener {
  private input: MidiInput | null = null;
  private handlers = new Set<(msg: MidiMessage) => void>();
  constructor(private portName: string, private logger: Logger) {}

  async start(): Promise<void> {
    // enumerate ports, find by portName, open. Throw if not found.
    // on message → parseMidi(bytes) → fan-out
  }
  async stop(): Promise<void> { /* close port */ }
  ...
}

function parseMidi(bytes: number[]): MidiMessage | null {
  // status byte → type + channel decode
  // 0x80-0x8F = noteOff, 0x90-0x9F = noteOn (velocity 0 = noteOff), 0xB0-0xBF = cc,
  // 0xC0-0xCF = programChange, 0xF0/0xF7 = sysex
}
```

### `src/main/src/shared/InputRegistrar.ts`

```ts
export interface InputRegistrar {
  init(): Promise<void>;
  shutdown(): Promise<void>;

  subscribeOsc(filter: OscInputFilter, handler: (msg: OscMessage) => void, opts: { port: number }): Promise<Subscription>;
  subscribeMidi(filter: MidiInputFilter, handler: (msg: MidiMessage) => void, opts: { portName: string }): Promise<Subscription>;

  /** Diagnostic snapshot for HealthBus / status UI. */
  listActiveListeners(): Array<{ key: ListenerKey; subscriberCount: number }>;
}

export class InputRegistrarImpl implements InputRegistrar { ... }
```

Internal data structures:

```ts
private oscPorts = new Map<number, OscPortListener>();   // port → listener
private midiPorts = new Map<string, MidiPortListener>(); // portName → listener
private subscriptions = new Map<string, { key: ListenerKey; cleanup: () => Promise<void> }>();
```

Subscription flow (OSC example):
1. Look up or lazily create `OscPortListener` for `opts.port` (start it).
2. Compile the glob `filter.address` once (cache a matcher fn — simple `*` → `[^/]*` and `?` → `.` regex; bake `^...$`).
3. Build a per-subscription handler that runs the matcher, applies optional `fromHost`, then calls user handler in try/catch.
4. `listener.addHandler(perSubHandler)`.
5. Return Subscription with `unsubscribe()` that: removes handler, decrements refcount, and if `listener.handlerCount === 0` then `listener.stop()` + `delete from map`.

MIDI subscription is analogous but filter is `(type, channel)` and listener key is `portName`.

### Wiring

`InputRegistrar` is constructed once by the Shell (B001-011) and passed into every `ModuleContext` as `context.input`. This task only creates the class + tests; the Shell wiring lives in B001-011.

Export from `src/main/src/shared/index.ts` (if it exists; otherwise add the named export). Re-export public types from `src/shared/index.ts` so modules can import them via `showx-shared`.

### Logging

Every state transition writes a structured log line via the Logger from B001-003:
- `input.osc.bound { port }`
- `input.osc.closed { port }`
- `input.osc.parse_error { port, err }`
- `input.midi.opened { portName }`
- `input.midi.closed { portName }`
- `input.handler.threw { transport, subscriptionId, err }`

## Refer to specs

- `docs/specs/protocol_dictionary.md` section 3.3 (IN addresses) — binding for which OSC address spaces InputRegistrar must support. Glob matcher must cover every example in that section.
- `docs/specs/module_loader.md` — describes `ModuleContext.input` shape that this registrar satisfies.

## Test plan

`tests/unit/shared/input/oscListener.test.ts`
- Start listener on an ephemeral port (use `port: 0` or pick a random free port via Node's net helpers); send a UDP packet with a known OSC message via a temp `dgram` socket; assert handler receives parsed `OscMessage` with correct address + args + fromHost.
- Send an OSC bundle of 2 messages → both handlers fire.
- Send malformed bytes → no throw, `parse_error` logged.
- After `stop()`, sending packets has no effect; no handler fires.

`tests/unit/shared/input/midiIn.test.ts`
- Use `@julusian/midi.Output` to create a virtual MIDI port (Node side both ends), open `MidiPortListener` on the same port name, send noteOn → assert handler receives parsed `MidiMessage`.
- If virtual ports not available in CI: fall back to feeding raw bytes through an exposed `_injectForTest(bytes)` method (mark with leading underscore + JSDoc `@internal`). Both paths acceptable.
- noteOn with velocity 0 → reported as noteOff.
- sysex packet → handler receives `type: 'sysex'` with full raw byte array.

`tests/unit/shared/InputRegistrar.test.ts`
- subscribeOsc to `/showx/cue/*` on port X + subscribeOsc to `/lights/scene/*` on same port X → one OscPortListener instance shared (assert via `listActiveListeners()`). Send `/showx/cue/go` → only first handler fires. Send `/lights/scene/1` → only second handler fires.
- Unsubscribe the first → listener still up (refcount 1). Unsubscribe the second → listener closed (refcount 0), `listActiveListeners()` empty.
- subscribeMidi twice on same portName → one MidiPortListener shared.
- Handler throws → caught + logged; sibling handler on same port still receives the next message.
- `shutdown()` closes all listeners; subsequent subscribe calls re-open.

Run: `pnpm --filter showx-main test tests/unit/shared/InputRegistrar tests/unit/shared/input`

## Out of scope

- DMX-in (Art-Net / sACN receive) — future bundle
- HTTP webhook input — future bundle
- Serial / TCP raw input — future bundle
- Persistence of subscription state across restarts (subscriptions are runtime-only)
- Wiring into Shell (B001-011 owns)
- mDNS announcement of input listeners (not needed; inputs are passive)

## Notes for Critic

- Verify the refcount logic: write a stress test or just walk through the test case where 5 modules subscribe to the same OSC port, 4 unsubscribe in random order, listener still up; 5th unsubscribes → listener closes.
- Check that the glob matcher is compiled once per subscription, NOT once per incoming packet. The hot path (every UDP packet) must not allocate a new RegExp.
- Confirm `try/catch` wraps every user handler call — no path where a handler throw kills the listener.
- Confirm `OscPortListener.stop()` cleans up the socket (no leaked dgram socket in `listActiveListeners()` after shutdown).
- MIDI status-byte decoding is easy to get wrong; spot-check the masking (`status & 0xF0` for type, `status & 0x0F` for channel).
- Logging: every log line must include the listener key so an operator can grep `port=8000` and see all OSC events on that port.
