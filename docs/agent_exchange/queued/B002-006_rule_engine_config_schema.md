---
id: "B002-006"
title: "Rule engine + event_bridge_outputs/event_bridge_mappings Zod config schema"
type: "implementation"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B002-003", "B002-005"]
target_files:
  - "src/modules/eventx-bridge/src/RuleEngine.ts"
  - "src/modules/eventx-bridge/src/config/event-bridge-outputs.schema.ts"
  - "src/modules/eventx-bridge/src/config/event-bridge-mappings.schema.ts"
  - "src/modules/eventx-bridge/src/config/schema.ts"
  - "src/modules/eventx-bridge/src/EventRuntime.ts"
  - "src/modules/eventx-bridge/tests/unit/rule-engine.test.ts"
  - "src/modules/eventx-bridge/tests/unit/event-bridge-outputs-schema.test.ts"
  - "src/modules/eventx-bridge/tests/unit/event-bridge-mappings-schema.test.ts"
  - "src/modules/eventx-bridge/tests/fixtures/golden-event_bridge_outputs.json"
  - "src/modules/eventx-bridge/tests/fixtures/golden-event_bridge_mappings.json"
acceptance_criteria:
  - "Zod schema `eventBridgeOutputSchema` covers every field of `event_bridge_outputs` table from BridgeX 0.3.x: `id (uuid)`, `event_id (uuid)`, `enabled (boolean)`, `protocol ('osc' | 'midi' | 'dmx' | 'webhook' | 'ws')`, `config (jsonb, discriminated by protocol)`, `name (text)`, `created_at (timestamptz)`, `updated_at (timestamptz)`"
  - "Per-protocol `config` discriminated union: OSC `{ host, port, tag? }`, MIDI `{ portName, channel? }`, DMX `{ host?, universe, protocol: 'artnet' | 'sacn', priority? }`, Webhook `{ url, hmacSecret?, method? }`, WS `{ url, headers? }`"
  - "Zod schema `eventBridgeMappingSchema` covers: `id`, `event_id`, `output_id`, `channel_id (text)`, `target_address (text)`, `transform (ChannelTransform | null)`, `enabled (boolean)`, `created_at`, `updated_at`"
  - "`ChannelTransform` Zod union covers: scale `{ kind: 'scale', from: [n, n], to: [n, n] }`, threshold `{ kind: 'threshold', threshold: n, direction: 'above' | 'below' | 'crosses' }`, pick_index `{ kind: 'pick_index', index: n }`, colormap `{ kind: 'colormap', lookup: Record<string, [n, n, n]> }`, rate_limit `{ kind: 'rate_limit', windowMs: n }` (passthrough — legacy field)"
  - "Schemas match BridgeX 0.3.x format BYTE-FOR-BYTE: verified by parsing 2+ golden fixtures captured from a real BridgeX 0.3.x `event_bridge_outputs` query (read from a production-shaped JSON dump or BridgeX's own test fixtures); validate parses without errors and round-trips losslessly"
  - "`RuleEngine.matchAndDispatch(submissionOrAggregation, activityType)` per-row entry: identifies which channelIds the row produces, calls `AdapterRegistry.emit(channelId, value)` for each"
  - "Rule engine consumes rule predicates from mappings (per-mapping `target_address` + `transform` + which output it routes to) — purely declarative; module behavior driven by data rows, NOT by code branches per protocol"
  - "Config hot-reload via `ctx.persisted.onChange` — when output/mapping rows change (delivered via Realtime UPDATE on `event_bridge_outputs` / `event_bridge_mappings` tables OR via PersistedStore config update), RuleEngine re-imports rules without restart; in-flight emits complete before swap; matches parity §6.1 #33 known-limitation (not currently supported in BridgeX 0.3.x — we DOCUMENT and DEFER hot-reload to maintain parity, but architect for future)"
  - "Realtime subscription to `event_bridge_outputs` UPDATE / `event_bridge_mappings` UPDATE is OUT OF SCOPE for B002-006 (parity #33 — not supported in BridgeX 0.3.x); document as future task"
  - "Schemas exported from `src/types.ts` re-exports so other module files use them"
  - "Persisted config schema (B002-002) extended to optionally include `supabaseUrl`, `supabaseAnonKey` fields (for B002-005 fallback path)"
  - "Unit tests cover: every protocol shape validates; invalid shapes reject with informative Zod error; ChannelTransform discriminator works; round-trip preserves bytes; rule matching against fixture covers all 12 EventX activity types"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test` passes ≥30 new tests"
---

## Context

BridgeX 0.3.x reads `event_bridge_outputs` (target adapter configs) and `event_bridge_mappings` (channel → target_address routing rules) from Supabase. Both tables drive everything — they're the operator's only knob. Their JSON shape is the customer-facing contract.

This task does two things:
1. Locks the Zod schemas matching BridgeX 0.3.x format exactly so existing customer configs validate without translation.
2. Builds `RuleEngine` — the runtime entity that takes a row (submission/aggregation) and decides which channels to emit (via AdapterRegistry from B002-004).

Together, the rule engine + schemas are the **data contract** between EventX engine, EventX Bridge module, and the operator's Supabase config UI. Parity #33 (hot-reload) is explicitly NOT in scope — we match BridgeX 0.3.x's "restart-required" behavior to keep parity tests passing.

## Implementation notes

### Schema: event_bridge_outputs

```ts
// src/modules/eventx-bridge/src/config/event-bridge-outputs.schema.ts
import { z } from 'zod';

const oscConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  tag: z.string().optional(),
});

const midiConfigSchema = z.object({
  portName: z.string().min(1),
  channel: z.number().int().min(0).max(15).default(0),
});

const dmxConfigSchema = z.object({
  protocol: z.enum(['artnet', 'sacn']),
  universe: z.number().int().min(0).max(63999),
  host: z.string().optional(),
  priority: z.number().int().min(0).max(200).default(100).optional(),
});

const webhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['POST', 'PUT', 'GET']).default('POST').optional(),
  hmacSecret: z.string().optional(),
});

const wsConfigSchema = z.object({
  url: z.string().regex(/^wss?:\/\//),
  headers: z.record(z.string()).optional(),
});

export const eventBridgeOutputSchema = z.discriminatedUnion('protocol', [
  z.object({ protocol: z.literal('osc'),     config: oscConfigSchema }),
  z.object({ protocol: z.literal('midi'),    config: midiConfigSchema }),
  z.object({ protocol: z.literal('dmx'),     config: dmxConfigSchema }),
  z.object({ protocol: z.literal('webhook'), config: webhookConfigSchema }),
  z.object({ protocol: z.literal('ws'),      config: wsConfigSchema }),
]).and(z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  enabled: z.boolean(),
  name: z.string(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
}));

export type EventBridgeOutput = z.infer<typeof eventBridgeOutputSchema>;
export const eventBridgeOutputArraySchema = z.array(eventBridgeOutputSchema);
```

### Schema: event_bridge_mappings + transform

```ts
// src/modules/eventx-bridge/src/config/event-bridge-mappings.schema.ts
import { z } from 'zod';

const scaleTransform = z.object({
  kind: z.literal('scale'),
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()]),
});

const thresholdTransform = z.object({
  kind: z.literal('threshold'),
  threshold: z.number(),
  direction: z.enum(['above', 'below', 'crosses']),
});

const pickIndexTransform = z.object({
  kind: z.literal('pick_index'),
  index: z.number().int().min(0),
});

const colormapTransform = z.object({
  kind: z.literal('colormap'),
  lookup: z.record(z.tuple([z.number().int().min(0).max(255),
                            z.number().int().min(0).max(255),
                            z.number().int().min(0).max(255)])),
});

const rateLimitTransform = z.object({
  kind: z.literal('rate_limit'),
  windowMs: z.number().int().positive(),
});

export const channelTransformSchema = z.discriminatedUnion('kind', [
  scaleTransform, thresholdTransform, pickIndexTransform, colormapTransform, rateLimitTransform,
]);

export const eventBridgeMappingSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  output_id: z.string().uuid(),
  channel_id: z.string().min(1),
  target_address: z.string().min(1),
  transform: channelTransformSchema.nullable(),
  enabled: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type EventBridgeMapping = z.infer<typeof eventBridgeMappingSchema>;
export const eventBridgeMappingArraySchema = z.array(eventBridgeMappingSchema);
```

### Golden fixtures

Capture from BridgeX 0.3.x — Forge should:

1. Look in `~/Daniel-local/bridgeX/bridgex/src/__tests__/` for fixture files.
2. If none, derive from `~/Daniel-local/bridgeX/docs/EVENTX_CONTRACT.md` — that doc shows the canonical row shapes.
3. If still none, write 5-row sample fixtures by hand based on `event-runtime.ts` row-handling code paths.

Place in `tests/fixtures/golden-event_bridge_outputs.json` and `tests/fixtures/golden-event_bridge_mappings.json`. These get reused in B002-009 and B002-010.

Schema validation test:
```ts
const goldenOutputs = JSON.parse(readFileSync('tests/fixtures/golden-event_bridge_outputs.json', 'utf8'));
expect(() => eventBridgeOutputArraySchema.parse(goldenOutputs)).not.toThrow();
```

### RuleEngine class

```ts
// src/modules/eventx-bridge/src/RuleEngine.ts
import type { ModuleContext } from 'showx-shared';
import type { AdapterRegistry } from './AdapterRegistry.js';
import type { ChannelValue } from './types.js';
import type { EventBridgeMapping, EventBridgeOutput } from './config/event-bridge-mappings.schema.js';

export class RuleEngine {
  private channelTargets = new Map<string, { mapping: EventBridgeMapping; output: EventBridgeOutput }[]>();

  constructor(
    private ctx: ModuleContext,
    private adapterRegistry: AdapterRegistry,
  ) {}

  load(outputs: EventBridgeOutput[], mappings: EventBridgeMapping[]): void {
    this.channelTargets.clear();
    const outputById = new Map(outputs.filter(o => o.enabled).map(o => [o.id, o]));
    for (const m of mappings.filter(m => m.enabled)) {
      const output = outputById.get(m.output_id);
      if (!output) continue;
      const list = this.channelTargets.get(m.channel_id) ?? [];
      list.push({ mapping: m, output });
      this.channelTargets.set(m.channel_id, list);
    }
    // Forward mappings to AdapterRegistry for emit lookup
    this.adapterRegistry.setMappings(mappings);
    this.ctx.log.info('rule engine loaded', {
      outputs: outputs.length,
      mappings: mappings.length,
      channels: this.channelTargets.size,
    });
  }

  async emit(channelId: string, value: ChannelValue): Promise<void> {
    // The actual dispatch lives in AdapterRegistry.emit() — RuleEngine is a thin
    // entry point that handles future features like rule predicates, audit logs.
    await this.adapterRegistry.emit(channelId, value);
  }

  clear(): void {
    this.channelTargets.clear();
  }

  // Diagnostic helpers for UI panel
  countChannels(): number { return this.channelTargets.size; }
  listChannels(): string[] { return Array.from(this.channelTargets.keys()); }
  listTargetsForChannel(channelId: string): string[] {
    return (this.channelTargets.get(channelId) ?? []).map(t => `${t.output.name} → ${t.mapping.target_address}`);
  }
}
```

### EventRuntime integration

EventRuntime now composes RuleEngine in addition to SupabaseSubscriber + AdapterRegistry:

```ts
async start(eventId: string): Promise<void> {
  await this.loadEventTopology(eventId);
  const [outputs, mappings] = await this.fetchOutputsAndMappings(eventId);
  // Validate via Zod — throws on schema drift
  const validatedOutputs = eventBridgeOutputArraySchema.parse(outputs);
  const validatedMappings = eventBridgeMappingArraySchema.parse(mappings);
  // Register every output adapter (claims tokens via shared dispatcher)
  for (const row of validatedOutputs) {
    await this.adapterRegistry.register(row);
  }
  // Load rule engine
  this.ruleEngine.load(validatedOutputs, validatedMappings);
  await this.subscriber.start(eventId);
  this.healthReporter.start();
  this.periodicPush.start();
}

async stop(): Promise<void> {
  this.periodicPush.stop();
  this.healthReporter.stop();
  await this.subscriber.stop();
  this.ruleEngine.clear();
  await this.adapterRegistry.releaseAll();
  this.sessionTracker.clear();
}
```

Handlers (wordcloud, poll, etc) call `this.ruleEngine.emit(channelId, value)` instead of directly hitting AdapterRegistry — gives the engine the option to add audit logs / pattern matching / future hooks without touching handlers.

### Schema extension for persisted config

Update `src/config/schema.ts` (B002-002) to add optional Supabase fields:

```ts
export const eventXBridgeConfigSchema = z.object({
  lastEventId: z.string().nullable().default(null),
  oscHost: z.string().default('127.0.0.1'),
  oscPort: z.number().int().min(1).max(65535).default(7000),
  listenerHost: z.string().default('0.0.0.0'),
  listenerPort: z.number().int().min(1).max(65535).default(7001),
  listenerEnabled: z.boolean().default(false),
  // Added B002-006:
  supabaseUrl: z.string().url().optional(),
  supabaseAnonKey: z.string().optional(),
});
```

Bump `persistedConfigSchemaVersion` to `2` in manifest.ts. Add `migrate(prevVersion, prevValue)` to handle v1 → v2 (just pass-through; the new fields are optional):

```ts
migrate(prevVersion, prevValue) {
  if (prevVersion === 1) {
    return { ...(prevValue as object), supabaseUrl: undefined, supabaseAnonKey: undefined } as EventXBridgeConfig;
  }
  return eventXBridgeConfigSchema.parse(prevValue);
}
```

### Hot-reload (NOT IMPLEMENTED per parity #33)

Document in done report: BridgeX 0.3.x does NOT hot-reload `event_bridge_outputs` / `event_bridge_mappings` changes. Operator must restart runtime to apply config updates. ShowX maintains this behavior in 0.5 (parity preserved). Hot-reload deferred to ShowX 0.1+ as separate feature task — track in `docs/specs/bridgex_absorption.md` §12 Open Q4.

PersistedStore `onChange` IS wired (B002-002) for the module's own persisted config (host/port settings) — that hot-reloads. Only the Supabase-side rule data does not.

## Test plan

### `tests/unit/event-bridge-outputs-schema.test.ts` (≥10 tests)

1. OSC config valid: `{ protocol: 'osc', config: { host: '127.0.0.1', port: 7000 } }`.
2. OSC config missing port → reject with Zod error mentioning `port`.
3. MIDI config valid with channel default 0.
4. MIDI channel 16 → reject (max 15).
5. DMX artnet valid.
6. DMX sacn valid with priority.
7. Webhook URL invalid → reject.
8. WS URL valid `wss://...`.
9. WS URL `http://` → reject (must be ws/wss).
10. Golden fixture parses without errors.
11. Round-trip (parse + JSON.stringify) preserves all fields.
12. Unknown protocol → reject.

### `tests/unit/event-bridge-mappings-schema.test.ts` (≥10 tests)

1. Scale transform valid.
2. Scale `from` array of 3 → reject.
3. Threshold direction unknown → reject.
4. pick_index negative → reject.
5. colormap RGB out of range → reject.
6. rate_limit windowMs negative → reject.
7. transform null allowed.
8. target_address empty → reject.
9. Round-trip preserves.
10. Golden fixture parses.

### `tests/unit/rule-engine.test.ts` (≥10 tests)

1. `load(outputs, mappings)` populates channelTargets map.
2. Disabled outputs filtered out.
3. Disabled mappings filtered out.
4. Mapping referencing non-existent output → skipped (no throw).
5. `emit('wordcloud.add', value)` calls `adapterRegistry.emit` once.
6. Multiple mappings for same channel → AdapterRegistry called per mapping (verified via stub).
7. `clear()` empties channelTargets.
8. `countChannels()` accurate.
9. `listTargetsForChannel('foo')` returns formatted strings.
10. `load` called twice → second load replaces first (no merge).

## Out of scope

- Realtime subscription to `event_bridge_outputs` / `event_bridge_mappings` UPDATE events (parity #33 deferred).
- Hot-reload of rules without runtime restart (parity #33 limitation maintained).
- Customer-facing UI for editing rows (Supabase Studio is the operator's editor today; ShowX UI panel from B002-008 is read-only stats).
- BridgeX 0.3.x config import (B002-009 reads the persistedConfig JSON; this task only defines the schema).
- Transform implementation (`transform.ts` from B002-003 handles the actual math).

## Notes for Critic

- Pull `~/Daniel-local/bridgeX/docs/EVENTX_CONTRACT.md` and compare schema field-by-field against documented BridgeX 0.3.x format. Any mismatch = `changes_requested`.
- Verify golden fixture exists in tests/fixtures/ and is parseable.
- Verify schema rejects malformed input with informative errors (test the error message, not just that it throws).
- Verify discriminated union narrowing works: `if (output.protocol === 'osc') { /* config is OscConfig */ }`.
- Verify manifest's `persistedConfigSchemaVersion` bumped to 2 and `migrate(prev_version=1, prev_value)` returns a valid v2 shape.
- Verify RuleEngine.clear() actually clears (no leaked state across `start` cycles).
- Verify EventRuntime calls `eventBridgeOutputArraySchema.parse()` on Supabase fetch result (schema validation IS a load gate; never skip).
