---
id: "B002-004"
title: "Adapter migration: route OSC/MIDI/DMX/webhook/WS dispatch through shared OutputDispatcher"
type: "refactor"
estimated_size_lines: 1200
priority: "P0"
depends_on: ["B002-003"]
target_files:
  - "src/modules/eventx-bridge/src/HandlerDispatcher.ts"
  - "src/modules/eventx-bridge/src/EventRuntime.ts"
  - "src/modules/eventx-bridge/src/AdapterRegistry.ts"
  - "src/modules/eventx-bridge/src/types.ts"
  - "src/modules/eventx-bridge/tests/unit/handler-dispatcher.test.ts"
  - "src/modules/eventx-bridge/tests/unit/adapter-registry.test.ts"
  - "src/modules/eventx-bridge/tests/integration/dispatch-via-shared.test.ts"
  - "src/modules/eventx-bridge/src/legacy/adapters/**"   # DELETED at end of task
acceptance_criteria:
  - "All cue dispatches in module code path go through `ctx.output.send(...)` (TransportMessage); zero direct UDP socket / MIDI port / DMX driver instantiation inside the module"
  - "Module-internal `AdapterRegistry.ts` maintains the mapping from `EventBridgeOutput` row → `TransportDestination` + claim token; refcounted via `ctx.output.claim()` / `ctx.output.release()` per B001-007 OutputDispatcher contract"
  - "`HandlerDispatcher.emitRaw(address, args)` translates to `ctx.output.send({ transport: 'osc', host, port, address, args })` for every registered OSC destination (broadcast semantics preserved)"
  - "`HandlerDispatcher.emit(channelId, value)` translates to: lookup mapping by channelId → resolve to `EventBridgeOutput` row → build TransportMessage of correct shape → `ctx.output.send()`"
  - "Transform pipeline (`transform.ts` from B002-003) still applies to mapping-resolved emit; raw emits skip transform"
  - "OSC leading-`/` autofix moves from `legacy/adapters/osc-adapter.ts:64-66` into either `AdapterRegistry.buildOscMessage()` or relies on shared OutputDispatcher implementation (B001-007 — verify the autofix exists in shared layer; if not, file follow-up)"
  - "MIDI address parsing (`cc:N`, `note:N`, `pc:N`) moves from `legacy/adapters/midi-adapter.ts:93-109` into `AdapterRegistry.buildMidiMessage()` — produces correct raw bytes per parity contract §6.1 #27-29"
  - "DMX address parsing (`ch:N`, `ch:N-M`, `{r,g,b}` at `ch:N`) moves from `legacy/adapters/dmx-adapter.ts:105-125` into `AdapterRegistry.buildDmxMessage()`"
  - "Webhook HMAC SHA-256 X-EventX-Signature + retry policy stay implemented (likely in shared OutputDispatcher webhook handler per B001-007); if not present in shared layer, module wraps `ctx.output.send` with retry; document in done report"
  - "WS reconnect backoff [1, 2, 4, 8, 16, 30]s preserved — likely in shared layer; verify and document"
  - "All files under `src/modules/eventx-bridge/src/legacy/adapters/` DELETED at end of task"
  - "`src/modules/eventx-bridge/src/legacy/listener/` DELETED — InputRegistrar from B001-008 owns OSC IN"
  - "EventRuntime's `createAdapter` stub from B002-003 replaced with real call to `AdapterRegistry.register(row)` returning a claim token; `stop()` releases all tokens"
  - "Tests assert: every transport type produces the expected TransportMessage shape; refcount works (two outputs to same host:port → single claim, shared refcount); release drops refcount to zero"
  - "Parity tests for PT-018 (OSC leading-slash autofix), PT-019 (MIDI cc:64 clamp), PT-020 (MIDI note timing), PT-021 (DMX ch:5 RGB), PT-022 (DMX heartbeat) PASS at the unit-test level (full parity in B002-010)"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test` passes ≥95% of tests (handler tests previously skipped in B002-003 now PASS)"
---

## Context

BridgeX 0.3.x adapters (`osc-adapter.ts`, `midi-adapter.ts`, `dmx-adapter.ts`, `webhook-adapter.ts`, `ws-adapter.ts`) each owned their own pool — multiple modules in ShowX would multiply sockets/ports/universes and collide at the OS layer. ShowX-1 B001-007 built a shared `OutputDispatcher` with refcounted pools, exposed via `ctx.output`. This task rewires the EventX Bridge module to consume that shared dispatcher exclusively.

After this task, the module has no direct socket/port/driver dependency. All transport-specific logic (address parsing, byte building) lives in a thin module-local `AdapterRegistry` that translates `EventBridgeOutput` rows + `ChannelValue`s into `TransportMessage`s, then delegates send to `ctx.output.send()`. The dispatcher pool, refcounting, autofix quirks, retry policies, and reconnect backoff are all the shell's responsibility.

This task is the prerequisite for parity tests (B002-010..B002-012) since byte-equality with BridgeX 0.3.x depends on the shared dispatcher emitting identical packets.

## Implementation notes

### AdapterRegistry — new module-internal class

Replaces the old `legacy/adapters/adapter-factory.ts`. Per-event lifecycle:

```ts
// src/modules/eventx-bridge/src/AdapterRegistry.ts
import type { ModuleContext, ClaimToken, TransportDestination } from 'showx-shared';
import type { EventBridgeOutput, EventBridgeMapping, ChannelValue } from './types.js';
import { applyTransform } from './transform.js';

export class AdapterRegistry {
  // outputId → claim token
  private claims = new Map<string, ClaimToken>();
  // output rows by id (for emit lookup)
  private outputs = new Map<string, EventBridgeOutput>();
  // mappings keyed by channelId → output rows targeted by that channel
  private mappingsByChannel = new Map<string, EventBridgeMapping[]>();

  constructor(private ctx: ModuleContext) {}

  async register(row: EventBridgeOutput): Promise<void> {
    const dest = this.rowToDestination(row);
    const claim = await this.ctx.output.claim(dest);
    if ('ok' in claim && claim.ok === false) {
      this.ctx.log.warn('claim conflict', { outputId: row.id, ownerSlug: claim.ownerSlug });
      // Soft-fail: skip; healthReporter will mark as 'error'
      return;
    }
    this.claims.set(row.id, claim as ClaimToken);
    this.outputs.set(row.id, row);
  }

  async unregister(outputId: string): Promise<void> {
    const token = this.claims.get(outputId);
    if (!token) return;
    await this.ctx.output.release(token);
    this.claims.delete(outputId);
    this.outputs.delete(outputId);
  }

  setMappings(rows: EventBridgeMapping[]): void {
    this.mappingsByChannel.clear();
    for (const m of rows) {
      if (!m.enabled) continue;
      const arr = this.mappingsByChannel.get(m.channel_id) ?? [];
      arr.push(m);
      this.mappingsByChannel.set(m.channel_id, arr);
    }
  }

  async emit(channelId: string, value: ChannelValue): Promise<void> {
    const mappings = this.mappingsByChannel.get(channelId);
    if (!mappings) return;
    for (const mapping of mappings) {
      const row = this.outputs.get(mapping.output_id);
      if (!row) continue;
      const transformed = applyTransform(value, mapping.transform);
      if (transformed === null) continue;  // transform threshold filter
      const msg = this.buildMessage(row, mapping.target_address, transformed);
      if (msg) await this.ctx.output.send(msg);
    }
  }

  async emitRaw(address: string, args: Array<number | string>): Promise<void> {
    // Broadcast to every registered OSC output
    for (const [, row] of this.outputs) {
      if (row.protocol !== 'osc') continue;
      const fixedAddress = address.startsWith('/') ? address : `/${address}`;
      const msg = {
        transport: 'osc' as const,
        host: row.config.host,
        port: row.config.port,
        address: fixedAddress,
        args,
      };
      await this.ctx.output.send(msg);
    }
  }

  async releaseAll(): Promise<void> {
    for (const token of this.claims.values()) {
      await this.ctx.output.release(token);
    }
    this.claims.clear();
    this.outputs.clear();
    this.mappingsByChannel.clear();
  }

  private rowToDestination(row: EventBridgeOutput): TransportDestination {
    switch (row.protocol) {
      case 'osc':     return { transport: 'osc', host: row.config.host, port: row.config.port };
      case 'midi':    return { transport: 'midi', midiPortName: row.config.portName };
      case 'dmx':     return { transport: row.config.protocol === 'sacn' ? 'dmx-sacn' : 'dmx-artnet', dmxUniverse: row.config.universe, host: row.config.host };
      case 'webhook': return { transport: 'webhook' };  // stateless, no claim semantics
      case 'ws':      return { transport: 'webhook' /* TODO: ws-out kind */ };
      default: throw new Error(`unknown protocol: ${row.protocol}`);
    }
  }

  private buildMessage(row: EventBridgeOutput, address: string, value: ChannelValue): TransportMessage | null {
    switch (row.protocol) {
      case 'osc':     return this.buildOscMessage(row, address, value);
      case 'midi':    return this.buildMidiMessage(row, address, value);
      case 'dmx':     return this.buildDmxMessage(row, address, value);
      case 'webhook': return this.buildWebhookMessage(row, address, value);
      case 'ws':      return this.buildWsMessage(row, address, value);
    }
  }

  // ... buildOscMessage handles autofix + value conversion (parity #22-26)
  // ... buildMidiMessage parses cc:N / note:N / pc:N (parity #27-29) + note-off via setTimeout 100ms
  // ... buildDmxMessage parses ch:N / ch:N-M / {r,g,b} (parity #30-33)
}
```

### Parity-critical helpers

These are the BridgeX 0.3.x quirks that must port byte-for-byte into `buildOscMessage`, `buildMidiMessage`, `buildDmxMessage`:

**OSC value conversion** (parity #23-26):
```ts
function oscArgs(value: ChannelValue): Array<number | string> {
  if (typeof value === 'number') return [Number(value)];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map(x => typeof x === 'string' ? x : Number(x));
  if (typeof value === 'object' && 'r' in value) return [value.r, value.g, value.b];
  return [];
}
```

**MIDI parsing** (parity #27-29):
```ts
function parseMidiAddress(address: string, channel: number, value: number): number[][] | null {
  const m = address.match(/^(cc|note|pc):(\d+)$/);
  if (!m) return null;
  const [, kind, nStr] = m;
  const n = Number(nStr);
  switch (kind) {
    case 'cc':   return [[0xB0 | channel, n, Math.max(0, Math.min(127, Math.round(value)))]];
    case 'note': return [
      [0x90 | channel, n, value],
      // schedule note-off at +100ms via setTimeout in caller
    ];
    case 'pc':   return [[0xC0 | channel, n]];
  }
}
```

Note-off scheduling is tricky with the shared dispatcher — `AdapterRegistry.buildMidiMessage` should emit the note-on immediately and schedule a separate `ctx.output.send` call after 100ms via `setTimeout` tracked in an internal Set so `stop()` can `clearTimeout` them.

**DMX parsing** (parity #30-33):
```ts
function parseDmxAddress(address: string, value: ChannelValue): { start: number; data: number[] } | null {
  // ch:N, ch:N-M, ch:N with {r,g,b}
  if (/^ch:(\d+)$/.test(address) && typeof value === 'object' && 'r' in value) {
    const n = Number(RegExp.$1);
    return { start: n, data: [value.r, value.g, value.b] };
  }
  if (/^ch:(\d+)-(\d+)$/.test(address)) {
    const [from, to] = [Number(RegExp.$1), Number(RegExp.$2)];
    const v = typeof value === 'number' ? value : 0;
    return { start: from, data: new Array(to - from + 1).fill(v) };
  }
  if (/^ch:(\d+)$/.test(address) && typeof value === 'number') {
    return { start: Number(RegExp.$1), data: [value] };
  }
  return null;
}
```

DMX heartbeat (1Hz channel 1 = 0) per parity #41 — this is the shared OutputDispatcher's responsibility (B001-007); verify it exists. If absent, file follow-up; do NOT implement in module.

### EventRuntime integration

Replace the B002-003 stub:

```ts
// OLD (B002-003 stub):
private createAdapter(row: EventBridgeOutput): OutputAdapter {
  throw new Error('B002-004 wires this');
}

// NEW (B002-004):
async start(eventId: string): Promise<void> {
  // ... load outputs + mappings
  for (const row of outputs) {
    await this.deps.adapterRegistry.register(row);
  }
  this.deps.adapterRegistry.setMappings(mappings);
  // ... start Realtime subscribers, etc.
}

async stop(): Promise<void> {
  // ... stop subscribers
  await this.deps.adapterRegistry.releaseAll();
}
```

### HandlerDispatcher → thin proxy

Old `HandlerDispatcher` from B002-003 becomes:

```ts
class HandlerDispatcher {
  constructor(private adapterRegistry: AdapterRegistry) {}
  emit(channelId: string, value: ChannelValue) { return this.adapterRegistry.emit(channelId, value); }
  emitRaw(address: string, args: Array<number | string>) { return this.adapterRegistry.emitRaw(address, args); }
}
```

If preferred, fold into AdapterRegistry directly and delete HandlerDispatcher; document the choice in done report.

### Webhook + WS specifics

- Webhook HMAC + retry: verify in `ctx.output.send({ transport: 'webhook', ... })` — per B001-007 OutputDispatcher contract. If shell impl doesn't include HMAC, AdapterRegistry adds it before calling send (signs body, adds X-EventX-Signature header).
- WS reconnect backoff: should be in shared layer. If not, AdapterRegistry wraps with a `ws-out` claim token holding the reconnect state. Document in done report.

### Cleanup

Delete:
- `src/modules/eventx-bridge/src/legacy/adapters/` (entire — every file moves into shared B001-007 OR into AdapterRegistry build* methods OR is retired)
- `src/modules/eventx-bridge/src/legacy/listener/` (entire — InputRegistrar from B001-008 handles OSC IN)

Update EventRuntime imports accordingly: remove `'./legacy/adapters/...'` references; add `import { AdapterRegistry } from './AdapterRegistry.js';`.

### Done report sections

Document:
1. Which BridgeX 0.3.x quirks ended up in shared OutputDispatcher (B001-007) vs in module AdapterRegistry. Specifically: OSC autofix, DMX heartbeat, WS backoff, webhook HMAC, MIDI note-off timing.
2. Any quirks NOT preserved (red flags for Critic).
3. Follow-up tasks needed in showx-shared/B001-007 if dispatcher missing critical features.

## Test plan

### `tests/unit/adapter-registry.test.ts` (≥15 tests)

1. `register(row)` calls `ctx.output.claim` with correct destination shape per protocol.
2. Two outputs to same OSC host:port → both call `claim`; shell refcounts; both get distinct tokens.
3. `claim` conflict → logged warning, no throw.
4. `unregister(outputId)` calls `release(token)`.
5. `releaseAll()` releases every claim.
6. `setMappings(rows)` filters enabled=false rows.
7. `emit('wordcloud.add', value)` builds correct TransportMessage shape via mapping lookup.
8. `emitRaw('/eventx/test', [1,2])` broadcasts to every OSC output.
9. `emitRaw('eventx/test', [1])` autofix prepends `/`.
10. OSC value conversion: number → `[n]`, string → `[s]`, array → arr, `{r,g,b}` → `[r,g,b]`.
11. MIDI `cc:64` value 200 → `[0xB0, 64, 127]` (clamp).
12. MIDI `note:60` value 100 → note-on immediately + note-off scheduled at +100ms.
13. MIDI `pc:5` → `[0xC5, 5]`.
14. DMX `ch:5` `{r:255,g:128,b:0}` → `{ start: 5, data: [255,128,0] }`.
15. DMX `ch:5-7` value 100 → `{ start: 5, data: [100,100,100] }`.

### `tests/unit/handler-dispatcher.test.ts` (≥5 tests)

If HandlerDispatcher stays as thin proxy: smoke tests proxying through to AdapterRegistry. Otherwise (folded into AdapterRegistry): skip this file.

### `tests/integration/dispatch-via-shared.test.ts` (≥5 tests)

Use a real `OutputDispatcher` from B001-007 with mock transports (in-memory UDP capture, etc.):

1. Module registers two OSC outputs to same `127.0.0.1:7000` → only ONE underlying socket opened (verify via dispatcher.poolStatus).
2. emitRaw broadcasts to both outputs → both receive packets (because both share the socket destination, the byte stream is identical; observe via OSC sink mock).
3. Module `stop()` → claims released → socket closed.
4. Parity case PT-018 (autofix): mapping `target_address: 'eventx/test'` → outbound packet has address `/eventx/test`.
5. Parity case PT-019 (MIDI clamp): cc:64 value 200 → bytes `[0xB0, 64, 127]`.

### Re-enable handler tests skipped in B002-003

All handler tests that B002-003 marked `.skip` due to deferred adapter wiring should now PASS. Track count in done report (target: ≥10 previously-skipped tests now pass).

## Out of scope

- Implementing the shared OutputDispatcher itself (that's B001-007; if features missing, file follow-up).
- Supabase subscriber wiring (B002-005).
- Rule engine + Zod schema for event_bridge_outputs (B002-006).
- UI panel (B002-008).
- Touching `legacy/outputs/html-renderer.ts` (Q22 pending).
- Parity scenarios PT-001..PT-035 — those are B002-010/011/012 (this task only verifies the unit-level versions of PT-018..PT-022).

## Notes for Critic

- Run `grep -rn "new OSCAdapter\|new MIDIAdapter\|new DMXAdapter\|require('osc')\|require('dmx')\|require('@julusian/midi')" src/modules/eventx-bridge/src/ --include="*.ts" | grep -v legacy` — should return zero hits.
- Run `ls src/modules/eventx-bridge/src/legacy/adapters/ 2>&1` — should fail (directory deleted).
- Verify `AdapterRegistry.releaseAll()` actually clears claims map.
- Verify MIDI note-off scheduling: send `note:60` → after 100ms exactly one more `ctx.output.send` call with `[0x80|ch, 60, 0]`.
- Verify DMX heartbeat — check whether it lives in shared OutputDispatcher (B001-007) or in module; if absent from both, that's a `changes_requested` with a follow-up B001-007 patch task.
- Verify previously-skipped handler tests now pass (count delta in done report).
- Verify no socket-level imports (`net`, `dgram`, `tls`, etc.) in module source.
