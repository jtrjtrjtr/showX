---
id: "B001-007"
title: "OutputDispatcher infrastructure (OSC + MIDI + DMX + MSC + webhook stub)"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B001-002", "B001-003"]
target_files:
  - "src/main/src/shared/OutputDispatcher.ts"
  - "src/main/src/shared/dispatcher/oscClient.ts"
  - "src/main/src/shared/dispatcher/midiOut.ts"
  - "src/main/src/shared/dispatcher/dmxOut.ts"
  - "src/main/src/shared/dispatcher/mscOut.ts"
  - "src/main/src/shared/dispatcher/webhookOut.ts"
  - "src/main/src/shared/dispatcher/index.ts"
  - "src/main/package.json"
  - "tests/unit/shared/OutputDispatcher.test.ts"
  - "tests/unit/shared/dispatcher/oscClient.test.ts"
  - "tests/unit/shared/dispatcher/midiOut.test.ts"
  - "tests/unit/shared/dispatcher/dmxOut.test.ts"
acceptance_criteria:
  - "`OutputDispatcher.send(msg)` dispatches to correct sub-adapter by `msg.transport`; returns `DispatchResult` with `ok`, `transport`, `latencyMs`"
  - "`claim(destination)` returns `ClaimToken` (refcount++) OR `ClaimConflict` (when destination is exclusive and already owned)"
  - "OSC destinations: shared, refcounted; same host:port returns same socket; last release closes UDP socket"
  - "MIDI output: exclusive per port name; second claim returns ClaimConflict with ownerSlug"
  - "DMX universes: exclusive per (protocol, universe) tuple; second claim returns ClaimConflict"
  - "OscClient uses `osc-min` to build OSC packet bytes; sends via `dgram.createSocket('udp4')`"
  - "MidiOut uses `@julusian/midi` Output; opens by port name (substring match), throws if not found"
  - "DmxOut: Art-Net via `dmxnet`, sACN via `e131`; each adapter accepts universe + 512-byte channel array"
  - "MscOut composes Sysex bytes per docs/specs/protocol_dictionary.md §6 and routes through MidiOut"
  - "WebhookOut: stub for 0.1 — accepts message, logs, returns ok=false with `not_implemented` reason"
  - "`poolStatus()` reports current OSC connections + MIDI port owners + DMX universe owners"
  - "≥18 vitest cases total; all sub-adapters mocked via DI factories (no real network/MIDI in tests)"
  - "`pnpm --filter showx-main typecheck` passes"
  - "`pnpm vitest run tests/unit/shared/OutputDispatcher tests/unit/shared/dispatcher` passes 100%"
---

## Context

The OutputDispatcher is the **shared output bus** for ShowX. Every module that sends OSC, MIDI, DMX, MSC, or webhooks goes through this one service. Rationale (from `xlab-strategy/docs/showx_module_architecture.md`):

- **Pooling.** Two modules wanting OSC port `10.0.1.10:8000` share one UDP socket — operator sees one connection, debugging is sane.
- **Exclusivity arbitration.** Only one process can hold a MIDI output port. The dispatcher resolves contention inside ShowX instead of letting the OS fail one module.
- **Single semantic surface.** Modules don't import OSC/MIDI/DMX libraries directly; they call `dispatcher.send({transport, ...})`. Future protocol changes (e.g. swap dmxnet for a better Art-Net lib) happen in one place.

Forge can borrow code patterns liberally from BridgeX 0.3.x (`/Users/machintoshhd/Daniel-local/bridgeX/bridgex/src/outputs/` and `/Users/machintoshhd/Daniel-local/bridgeX/bridgex/src/adapters/`) — `osc.ts`, `midi.ts`, `dmx.ts`, `osc-adapter.ts`, `midi-adapter.ts`, `dmx-adapter.ts`. The ShowX dispatcher generalizes those into a single facade.

Read `docs/specs/protocol_dictionary.md` §3–6 for OSC arg formats, MIDI byte conventions, MSC Sysex layout (per MIDI Show Control 1.0), and DMX universe shapes. Read `docs/specs/bridgex_absorption.md` §4 for what BridgeX 0.3.x already does — that's the parity target for ShowX-2 (next bundle).

## Implementation notes

### Package deps to add to `src/main/package.json`

```json
{
  "dependencies": {
    "osc-min": "^1.1.2",
    "@julusian/midi": "^3.5.0",
    "dmxnet": "^0.9.7",
    "e131": "^1.1.2",
    "showx-shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.11.0"
  }
}
```

`@julusian/midi` ships native bindings — same caveat as keytar (rebuild for Electron in prod). For tests, we always inject a mock factory.

### `src/main/src/shared/dispatcher/oscClient.ts`

```ts
import dgram from 'node:dgram';
import oscMin from 'osc-min';
import type { OscMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

export interface OscSocketFactory {
  create(): dgram.Socket;
}

export class OscPool {
  private connections = new Map<string, { socket: dgram.Socket; refcount: number }>();

  constructor(private readonly factory: OscSocketFactory = defaultFactory, private readonly log?: Logger) {}

  private keyFor(host: string, port: number): string { return `${host}:${port}`; }

  claim(host: string, port: number): { release(): void; send(msg: OscMessage): Promise<DispatchResult> } {
    const key = this.keyFor(host, port);
    let entry = this.connections.get(key);
    if (!entry) {
      entry = { socket: this.factory.create(), refcount: 0 };
      this.connections.set(key, entry);
    }
    entry.refcount += 1;
    return {
      release: () => this.release(key),
      send: (msg) => this.send(entry!.socket, msg),
    };
  }

  private async send(socket: dgram.Socket, msg: OscMessage): Promise<DispatchResult> {
    const t0 = performance.now();
    try {
      const buf = oscMin.toBuffer({
        oscType: 'message',
        address: msg.address,
        args: msg.args.map(toOscArg),
      });
      await new Promise<void>((resolve, reject) => {
        socket.send(buf, msg.port, msg.host, (err) => (err ? reject(err) : resolve()));
      });
      return { ok: true, transport: 'osc', latencyMs: performance.now() - t0 };
    } catch (err) {
      this.log?.error('osc send failed', { host: msg.host, port: msg.port, error: String(err) });
      return { ok: false, transport: 'osc', latencyMs: performance.now() - t0, error: String(err) };
    }
  }

  private release(key: string) {
    const entry = this.connections.get(key);
    if (!entry) return;
    entry.refcount -= 1;
    if (entry.refcount <= 0) {
      try { entry.socket.close(); } catch {}
      this.connections.delete(key);
    }
  }

  status(): Array<{ host: string; port: number; refcount: number }> {
    return Array.from(this.connections.entries()).map(([key, entry]) => {
      const [host, port] = key.split(':');
      return { host, port: Number(port), refcount: entry.refcount };
    });
  }
}

function toOscArg(arg: unknown): unknown {
  // map JS types to osc-min arg shape; see osc-min README
  if (typeof arg === 'number') return Number.isInteger(arg) ? { type: 'integer', value: arg } : { type: 'float', value: arg };
  if (typeof arg === 'string') return { type: 'string', value: arg };
  if (typeof arg === 'boolean') return { type: arg ? 'true' : 'false' };
  if (Buffer.isBuffer(arg)) return { type: 'blob', value: arg };
  return { type: 'string', value: String(arg) };
}

const defaultFactory: OscSocketFactory = { create: () => dgram.createSocket('udp4') };
```

### `src/main/src/shared/dispatcher/midiOut.ts`

```ts
// @julusian/midi types not bundled; declare minimal interface
interface MidiOutLike {
  getPortCount(): number;
  getPortName(index: number): string;
  openPort(index: number): void;
  closePort(): void;
  sendMessage(bytes: number[]): void;
}

interface MidiFactory {
  output(): MidiOutLike;
}

import type { MidiMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

export class MidiOutPool {
  // per portName → { handle, ownerSlug }
  private outputs = new Map<string, { handle: MidiOutLike; ownerSlug: string }>();

  constructor(private readonly factory: MidiFactory = defaultMidiFactory(), private readonly log?: Logger) {}

  claim(portName: string, ownerSlug: string): { ok: true; release: () => void; send: (m: MidiMessage) => Promise<DispatchResult> } | { ok: false; reason: 'exclusive_owned'; ownerSlug: string } {
    const existing = this.outputs.get(portName);
    if (existing) return { ok: false, reason: 'exclusive_owned', ownerSlug: existing.ownerSlug };
    const handle = this.factory.output();
    const idx = findPortIndex(handle, portName);
    if (idx < 0) throw new Error(`MIDI output port not found: ${portName}`);
    handle.openPort(idx);
    this.outputs.set(portName, { handle, ownerSlug });
    return {
      ok: true,
      release: () => this.release(portName),
      send: async (m) => {
        const t0 = performance.now();
        try {
          handle.sendMessage(m.bytes);
          return { ok: true, transport: 'midi', latencyMs: performance.now() - t0 };
        } catch (err) {
          this.log?.error('midi send failed', { portName, error: String(err) });
          return { ok: false, transport: 'midi', latencyMs: performance.now() - t0, error: String(err) };
        }
      },
    };
  }

  status(): Array<{ portName: string; ownerSlug: string }> {
    return Array.from(this.outputs.entries()).map(([portName, e]) => ({ portName, ownerSlug: e.ownerSlug }));
  }

  private release(portName: string) {
    const e = this.outputs.get(portName);
    if (!e) return;
    try { e.handle.closePort(); } catch {}
    this.outputs.delete(portName);
  }
}

function findPortIndex(out: MidiOutLike, name: string): number {
  for (let i = 0; i < out.getPortCount(); i++) {
    if (out.getPortName(i).includes(name)) return i;
  }
  return -1;
}

function defaultMidiFactory(): MidiFactory {
  // Lazy require so tests don't need the native module installed
  return {
    output(): MidiOutLike {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const midi = require('@julusian/midi');
      return new midi.Output();
    },
  };
}
```

### `src/main/src/shared/dispatcher/mscOut.ts`

Composes MIDI Show Control SysEx messages per docs/specs/protocol_dictionary.md §6. MSC frame:

```
F0 7F <deviceId> 02 <commandFormat> <command> <data...> F7
```

```ts
import type { MscMessage, DispatchResult } from 'showx-shared';
import type { MidiOutPool } from './midiOut.js';

export function encodeMsc(msg: MscMessage): number[] {
  const frame: number[] = [];
  frame.push(0xF0);             // SysEx start
  frame.push(0x7F);             // Universal real-time
  frame.push(msg.deviceId & 0x7F);
  frame.push(0x02);             // MSC sub-id
  frame.push(msg.commandFormat & 0x7F);
  frame.push(msg.command & 0x7F);
  for (const b of msg.data) frame.push(b & 0x7F);
  frame.push(0xF7);             // SysEx end
  return frame;
}

export class MscOut {
  constructor(private readonly midi: MidiOutPool) {}

  async send(msg: MscMessage, ownerSlug: string): Promise<DispatchResult> {
    const claim = this.midi.claim(msg.midiPortName, ownerSlug);
    if (!claim.ok) return { ok: false, transport: 'msc', latencyMs: 0, error: `port_owned_by_${claim.ownerSlug}` };
    try {
      const bytes = encodeMsc(msg);
      const r = await claim.send({ transport: 'midi', midiPortName: msg.midiPortName, bytes });
      return { ...r, transport: 'msc' };
    } finally {
      claim.release();
    }
  }
}
```

Note: MSC claims + releases the MIDI port per call. This is wasteful for high-rate use; for MVP it's fine because MSC fires are infrequent (one per cue). Document this trade-off.

### `src/main/src/shared/dispatcher/dmxOut.ts`

Two protocols, two adapters; same interface. Universe is the exclusivity key.

```ts
import type { DmxArtnetMessage, DmxSacnMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

export interface DmxAdapter {
  send(universe: number, data: number[], opts: { priority?: number; host?: string }): Promise<void>;
  close(): Promise<void>;
}

export interface DmxFactories {
  artnet?: () => DmxAdapter;
  sacn?: () => DmxAdapter;
}

type Protocol = 'artnet' | 'sacn';

interface UniverseLock { adapter: DmxAdapter; protocol: Protocol; ownerSlug: string; }

export class DmxPool {
  private universes = new Map<string, UniverseLock>();   // key = `${protocol}:${universe}`

  constructor(private readonly factories: DmxFactories = defaultDmxFactories(), private readonly log?: Logger) {}

  claim(protocol: Protocol, universe: number, ownerSlug: string): { ok: true; release: () => void; send: (msg: DmxArtnetMessage | DmxSacnMessage) => Promise<DispatchResult> } | { ok: false; reason: 'exclusive_owned'; ownerSlug: string } {
    const key = `${protocol}:${universe}`;
    const existing = this.universes.get(key);
    if (existing) return { ok: false, reason: 'exclusive_owned', ownerSlug: existing.ownerSlug };
    const factory = protocol === 'artnet' ? this.factories.artnet : this.factories.sacn;
    if (!factory) throw new Error(`DMX adapter not configured: ${protocol}`);
    const adapter = factory();
    const lock: UniverseLock = { adapter, protocol, ownerSlug };
    this.universes.set(key, lock);
    return {
      ok: true,
      release: () => this.release(key),
      send: async (msg) => {
        const t0 = performance.now();
        try {
          await adapter.send(universe, msg.data, {
            priority: 'priority' in msg ? msg.priority : undefined,
            host: 'host' in msg ? msg.host : undefined,
          });
          return { ok: true, transport: msg.transport, latencyMs: performance.now() - t0 };
        } catch (err) {
          this.log?.error('dmx send failed', { protocol, universe, error: String(err) });
          return { ok: false, transport: msg.transport, latencyMs: performance.now() - t0, error: String(err) };
        }
      },
    };
  }

  status(): Array<{ universe: number; protocol: Protocol; ownerSlug: string }> {
    return Array.from(this.universes.entries()).map(([key, lock]) => {
      const [, universe] = key.split(':');
      return { universe: Number(universe), protocol: lock.protocol, ownerSlug: lock.ownerSlug };
    });
  }

  private async release(key: string) {
    const lock = this.universes.get(key);
    if (!lock) return;
    try { await lock.adapter.close(); } catch {}
    this.universes.delete(key);
  }
}

function defaultDmxFactories(): DmxFactories {
  return {
    artnet: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dmxnet = require('dmxnet');
      const dmx = new dmxnet.dmxnet({ log: { level: 'warn' } });
      let sender: any;
      return {
        async send(universe, data) {
          sender = sender ?? dmx.newSender({ ip: '255.255.255.255', subnet: 0, universe, net: 0 });
          for (let i = 0; i < data.length; i++) sender.setChannel(i + 1, data[i]);
          sender.transmit();
        },
        async close() {
          try { sender?.stop?.(); } catch {}
        },
      };
    },
    sacn: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const e131 = require('e131');
      let client: any;
      return {
        async send(universe, data, opts) {
          client = client ?? new e131.Client(universe);
          const pkt = client.createPacket(data.length);
          pkt.setSourceName('ShowX');
          pkt.setUniverse(universe);
          pkt.setPriority(opts.priority ?? 100);
          pkt.setOption(pkt.Options.PREVIEW, false);
          const slots = pkt.getSlotsData();
          for (let i = 0; i < data.length; i++) slots[i] = data[i];
          await new Promise<void>((resolve, reject) => client.send(pkt, (err: unknown) => (err ? reject(err) : resolve())));
        },
        async close() { /* e131 has no explicit close */ },
      };
    },
  };
}
```

### `src/main/src/shared/dispatcher/webhookOut.ts`

```ts
import type { WebhookMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

export class WebhookOut {
  constructor(private readonly log?: Logger) {}

  async send(_msg: WebhookMessage): Promise<DispatchResult> {
    this.log?.warn('webhook dispatch not implemented in 0.1');
    return { ok: false, transport: 'webhook', latencyMs: 0, error: 'not_implemented' };
  }
}
```

Future B003-* task will implement using `undici` or built-in `fetch`.

### `src/main/src/shared/OutputDispatcher.ts`

Facade that owns the pools + routes by transport.

```ts
import type {
  OutputDispatcher as OutputDispatcherIface, TransportMessage, TransportDestination,
  DispatchResult, ClaimToken, ClaimConflict, PoolStatus,
} from 'showx-shared';
import { randomUUID } from 'node:crypto';
import { OscPool } from './dispatcher/oscClient.js';
import { MidiOutPool } from './dispatcher/midiOut.js';
import { DmxPool } from './dispatcher/dmxOut.js';
import { MscOut } from './dispatcher/mscOut.js';
import { WebhookOut } from './dispatcher/webhookOut.js';
import type { Logger } from './Logger.js';

interface ActiveClaim {
  token: ClaimToken;
  destination: TransportDestination;
  release: () => void;
  sender?: { send: (msg: TransportMessage) => Promise<DispatchResult> };
}

export interface OutputDispatcherOptions {
  oscPool?: OscPool;
  midiPool?: MidiOutPool;
  dmxPool?: DmxPool;
  webhook?: WebhookOut;
  log?: Logger;
}

export class OutputDispatcher implements OutputDispatcherIface {
  private osc: OscPool;
  private midi: MidiOutPool;
  private dmx: DmxPool;
  private msc: MscOut;
  private webhook: WebhookOut;
  private claims = new Map<string, ActiveClaim>();

  constructor(private readonly slugSeed: string, opts: OutputDispatcherOptions = {}) {
    this.osc = opts.oscPool ?? new OscPool(undefined, opts.log);
    this.midi = opts.midiPool ?? new MidiOutPool(undefined, opts.log);
    this.dmx = opts.dmxPool ?? new DmxPool(undefined, opts.log);
    this.msc = new MscOut(this.midi);
    this.webhook = opts.webhook ?? new WebhookOut(opts.log);
  }

  claim(dest: TransportDestination, ownerSlug: string = this.slugSeed): ClaimToken | ClaimConflict {
    if (dest.transport === 'osc') {
      if (!dest.host || dest.port === undefined) throw new Error('osc destination needs host+port');
      const handle = this.osc.claim(dest.host, dest.port);
      const token = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token, destination: dest,
        release: () => handle.release(),
        sender: { send: (m) => m.transport === 'osc' ? handle.send(m) : notMatch(m) },
      });
      return token;
    }
    if (dest.transport === 'midi') {
      if (!dest.midiPortName) throw new Error('midi destination needs midiPortName');
      const handle = this.midi.claim(dest.midiPortName, ownerSlug);
      if (!handle.ok) return { ok: false, reason: 'exclusive_owned', ownerSlug: handle.ownerSlug };
      const token = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token, destination: dest,
        release: () => handle.release,
        sender: { send: (m) => m.transport === 'midi' ? handle.send(m) : notMatch(m) },
      });
      return token;
    }
    if (dest.transport === 'dmx-artnet' || dest.transport === 'dmx-sacn') {
      if (dest.dmxUniverse === undefined) throw new Error('dmx destination needs dmxUniverse');
      const proto = dest.transport === 'dmx-artnet' ? 'artnet' : 'sacn';
      const handle = this.dmx.claim(proto, dest.dmxUniverse, ownerSlug);
      if (!handle.ok) return { ok: false, reason: 'exclusive_owned', ownerSlug: handle.ownerSlug };
      const token = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token, destination: dest,
        release: () => handle.release(),
        sender: { send: (m) => (m.transport === 'dmx-artnet' || m.transport === 'dmx-sacn') ? handle.send(m as any) : notMatch(m) },
      });
      return token;
    }
    // msc + webhook: no claim required
    const token = { id: randomUUID(), slug: ownerSlug, destination: dest };
    this.claims.set(token.id, { token, destination: dest, release: () => {} });
    return token;
  }

  release(token: ClaimToken): void {
    const c = this.claims.get(token.id);
    if (!c) return;
    try { c.release(); } catch {}
    this.claims.delete(token.id);
  }

  async send(msg: TransportMessage): Promise<DispatchResult> {
    switch (msg.transport) {
      case 'osc': {
        // claim → send → release per message (operator simplicity; pool absorbs cost)
        const claim = this.osc.claim(msg.host, msg.port);
        try { return await claim.send(msg); } finally { claim.release(); }
      }
      case 'midi': {
        // for sends without prior claim, find existing claim or auto-claim+release
        const existing = this.findClaimForPort(msg.midiPortName);
        if (existing?.sender) return existing.sender.send(msg);
        const auto = this.midi.claim(msg.midiPortName, this.slugSeed);
        if (!auto.ok) return { ok: false, transport: 'midi', latencyMs: 0, error: `port_owned_by_${auto.ownerSlug}` };
        try { return await auto.send(msg); } finally { auto.release(); }
      }
      case 'msc': return this.msc.send(msg, this.slugSeed);
      case 'dmx-artnet':
      case 'dmx-sacn': {
        const existing = this.findClaimForUniverse(msg.transport === 'dmx-artnet' ? 'artnet' : 'sacn', msg.universe);
        if (existing?.sender) return existing.sender.send(msg);
        const proto = msg.transport === 'dmx-artnet' ? 'artnet' : 'sacn';
        const auto = this.dmx.claim(proto, msg.universe, this.slugSeed);
        if (!auto.ok) return { ok: false, transport: msg.transport, latencyMs: 0, error: `universe_owned_by_${auto.ownerSlug}` };
        try { return await auto.send(msg); } finally { auto.release(); }
      }
      case 'webhook': return this.webhook.send(msg);
    }
  }

  poolStatus(): PoolStatus {
    return {
      oscConnections: this.osc.status(),
      midiOutputs: this.midi.status(),
      dmxUniverses: this.dmx.status(),
    };
  }

  private findClaimForPort(portName: string): ActiveClaim | undefined {
    for (const c of this.claims.values()) if (c.destination.transport === 'midi' && c.destination.midiPortName === portName) return c;
    return undefined;
  }

  private findClaimForUniverse(protocol: 'artnet' | 'sacn', universe: number): ActiveClaim | undefined {
    for (const c of this.claims.values()) {
      const t = c.destination.transport;
      if ((t === 'dmx-artnet' && protocol === 'artnet') || (t === 'dmx-sacn' && protocol === 'sacn')) {
        if (c.destination.dmxUniverse === universe) return c;
      }
    }
    return undefined;
  }
}

function notMatch(_m: TransportMessage): Promise<DispatchResult> {
  return Promise.resolve({ ok: false, transport: _m.transport, latencyMs: 0, error: 'transport_mismatch' });
}
```

Sandboxing: when the module loader (B001-010) constructs a per-module facade, it creates `new OutputDispatcher(slug, sharedOpts)` so the slug used for exclusivity is baked in. The shared singleton pools (OscPool, MidiOutPool, DmxPool) are constructed ONCE at shell boot (B001-011) and passed via `opts` to every per-module facade. **Critic check: pools are NOT re-instantiated per facade.**

### `src/main/src/shared/dispatcher/index.ts`

Barrel export.

```ts
export { OscPool } from './oscClient.js';
export { MidiOutPool } from './midiOut.js';
export { DmxPool } from './dmxOut.js';
export { MscOut, encodeMsc } from './mscOut.js';
export { WebhookOut } from './webhookOut.js';
```

## Test plan

### `tests/unit/shared/dispatcher/oscClient.test.ts` (≥4 cases)

Mock `OscSocketFactory` so `socket.send` is recorded into an array.

- `claim('10.0.1.10', 8000)` returns a handle; `send({...})` calls `socket.send` with buffer + port + host.
- Two claims of same `host:port` share one socket (factory.create called once).
- Refcount drops to zero → socket.close called.
- Send latency reported in `DispatchResult.latencyMs` (positive number).
- Send error (socket.send callback err) → `DispatchResult.ok = false`, error string captured.
- OSC arg type mapping: integer → `{type:'integer'}`; float → `{type:'float'}`; string → `{type:'string'}`; bool → `{type:'true'|'false'}`.

### `tests/unit/shared/dispatcher/midiOut.test.ts` (≥4 cases)

Provide a mock MidiFactory with a fake `MidiOutLike` (records `sendMessage` calls).

- `claim('IAC Bus 1', 'm1')` opens port + returns ok handle.
- Second claim for same port returns `ClaimConflict` with ownerSlug `'m1'`.
- Port not found → `claim` throws `MIDI output port not found: ...`.
- `send(bytes)` invokes `handle.sendMessage(bytes)`.
- Release → `handle.closePort` called and map entry removed.
- Substring port matching: claim with `'IAC'` finds `'IAC Driver Bus 1'`.

### `tests/unit/shared/dispatcher/dmxOut.test.ts` (≥4 cases)

Mock `DmxFactories.artnet` + `DmxFactories.sacn` returning fakes that record send calls.

- ArtNet claim: send `{universe:1, data:[1,2,3]}` → adapter.send invoked with universe 1.
- Second claim same universe → ClaimConflict.
- Two claims different universes both ok.
- Switching protocols on same universe (artnet u1 + sacn u1) treated as separate exclusivity keys (both ok).
- Release closes adapter.
- sACN priority passthrough: `priority: 150` reaches adapter.send opts.

### `tests/unit/shared/OutputDispatcher.test.ts` (≥6 cases)

- Send OSC message without prior claim: auto-claims, sends, releases (status shows 0 active OSC connections after).
- Send MIDI message after `claim()` uses the existing claim's handle (no re-claim).
- Send MIDI without prior claim auto-claims + releases.
- Send to exclusive MIDI already owned by another slug → `ok: false`, error `port_owned_by_<slug>`.
- MSC send composes correct SysEx bytes (use `encodeMsc` directly + spot-check `[0xF0, 0x7F, deviceId, 0x02, ...]` shape).
- DMX dispatch routes to artnet OR sacn adapter based on transport literal.
- Webhook send returns `not_implemented`.
- `poolStatus()` reflects current pool state.

Unit test for `encodeMsc`:
- Input `{deviceId: 0x10, commandFormat: 0x10, command: 0x01, data:[0x35]}` → bytes `[0xF0, 0x7F, 0x10, 0x02, 0x10, 0x01, 0x35, 0xF7]`.
- Each byte forced into 0-127 range (0x80+ values masked).

## Out of scope

- Real network send to a live OSC target (defer to integration/parity tests in B001-013).
- Webhook actual HTTP request (stubbed; B003-* implements).
- LTC audio generation (jungle-style timecode; ShowX-4+ module territory, not infra).
- Serial transport (post-MVP).
- MA-Net / Eos direct protocols (post-MVP module).
- Refcount eviction policy beyond zero (no TTL on idle sockets).
- Backpressure / rate limiting (DMX 30+ fps in particular — left to module to throttle).
- Channel-catalog metadata; dispatcher is semantic-free per `feedback_aggregation_vs_parameters_split.md`.
- MIDI input — that's B001-008 InputRegistrar.
- Per-message destination caching beyond the existing claim map.

## Notes for Critic

- Verify pools are SINGLE INSTANCES across the dispatcher facade: the per-module OutputDispatcher (slug-bound) accepts pre-built pools via opts; if it instantiates its own pools, refcounting across modules breaks. This is the #1 architectural bug to check.
- MSC encoding: bytes 4–6 (commandFormat, command, data) MUST be masked to 7 bits (& 0x7F). Anything ≥0x80 is illegal in MIDI Sysex except start/end.
- OSC arg mapping: 1.0 is float, not integer. Check `Number.isInteger(1.0) === true` is handled correctly — the typeof+integer pattern above sends 1.0 as integer; that's acceptable but flag if module testing reveals fixture mismatch.
- DMX data length: 1-512 channels. Forge should not crash on shorter/longer arrays; document behavior (e.g. pad with zeros or send as-is).
- Exclusivity contract: MIDI port and DMX universe are exclusive; OSC destination is NOT. OSC same host:port from multiple modules is INTENTIONALLY shared. Critic: confirm this in test cases.
- `WebhookOut` returning `not_implemented` is the contract; don't accept Forge writing a real fetch — it's deferred.
- `randomUUID` for ClaimToken.id — verify Node 20+ availability (Electron 28+ fine).
- Native module rebuild: in done report Forge should note `pnpm rebuild @julusian/midi keytar` is needed before running shell in Electron. Tests don't need rebuild because of factory injection.
- `bridgex/src/outputs/` patterns: it's fine if Forge ports verbatim, but ShowX dispatcher is single facade; BridgeX uses per-output adapters at top level. Don't drag BridgeX's adapter-factory pattern in if it complicates the pool model.
- Test count: with 4+4+4+6+3 = 21 cases across files, well above the 18 required.
