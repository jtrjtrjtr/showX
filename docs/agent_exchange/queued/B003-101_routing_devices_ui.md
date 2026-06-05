---
id: "B003-101"
title: "Routing + Devices UI in Cuelist Core panel"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: []
target_files:
  - "src/modules/cuelist-core/src/ui/DevicesTable.tsx"
  - "src/modules/cuelist-core/src/ui/RoutingTable.tsx"
  - "src/modules/cuelist-core/src/ui/DeviceEditDialog.tsx"
  - "src/modules/cuelist-core/src/ui/RoutingRuleEditDialog.tsx"
  - "src/modules/cuelist-core/src/ui/CuelistCorePanel.tsx"
  - "src/modules/cuelist-core/src/document/devices.ts"
  - "src/modules/cuelist-core/src/document/routing.ts"
  - "tests/unit/modules/cuelist-core/document/devices.test.ts"
  - "tests/unit/modules/cuelist-core/document/routing.test.ts"
  - "tests/unit/modules/cuelist-core/ui/DevicesTable.test.tsx"
  - "tests/unit/modules/cuelist-core/ui/RoutingTable.test.tsx"
acceptance_criteria:
  - "CuelistCorePanel renders a tabbed sub-region with three tabs: Show (existing content) | Devices | Routing. Default tab on load is Show; tab state persists across panel close/open (in PersistedStore)."
  - "DevicesTable lists all entries in show.devices (Y.Map keyed by device_id). Columns: ID, Label, Transport (OSC/MIDI/MSC/DMX), Host, Port, Driver (Eos/MA3/Hog4/ChamSys/QLab — only for OSC), Status dot (last dispatch ok/fail)"
  - "DevicesTable rows have inline buttons: Edit / Delete / Test. Delete prompts confirmation. Test sends a no-op test packet via OutputDispatcher and reports result inline (2s)"
  - "DeviceEditDialog: add or edit device. Validates device_id pattern `[a-z0-9_-]+`, host pattern `IPv4 | hostname`, port range 1-65535. Driver dropdown only enabled for transport=osc. Save commits Y.Doc mutation through `addDevice` / `updateDevice` from `document/devices.ts`. Dialog uses `role=\"dialog\" aria-modal=\"true\"`"
  - "RoutingTable lists rules from show.routing. Each row: Priority (drag handle), Match (display: `payload_type=osc, device_id=lx_eos`), Target device (link to Devices tab), Edit / Delete buttons"
  - "RoutingTable supports drag-and-drop reorder; priority field is a `sort_key`-style float per [02 data model] pattern. Higher priority = matched first"
  - "RoutingRuleEditDialog: add or edit routing rule. Match builder offers: payload_type (select), tag_pattern (string), device_id (dropdown from devices). Target device is required. Validates that target exists in show.devices"
  - "`src/document/devices.ts` exports: `getDevices(doc)`, `getDevice(doc, id)`, `addDevice(doc, init, ctx)`, `updateDevice(doc, id, patch, ctx)`, `removeDevice(doc, id, ctx)`. All wrap `doc.transact(...)`. Validation pre-integration via `validateDevice(init)` throwing `ValidationError`. Lock-gated via `assertEditAllowed(getMeta(doc), 'structural')` in SHOW mode"
  - "`src/document/routing.ts` exports: `getRoutingRules(doc)`, `addRoutingRule`, `updateRoutingRule`, `removeRoutingRule`, `reorderRoutingRules`. Mutator semantics match `document/cue.ts` patterns (transact, validate, assertEditAllowed)"
  - "Removing a device that is referenced by routing rules: blocked with `DeviceInUseError` listing the dependent rules. Force-delete option in confirmation dialog (cascades + removes orphaned rules)"
  - "Status dot in DevicesTable subscribes to OutputDispatcher health events. Green = recent successful send (<60s), red = failure in last 60s, gray = no recent dispatch"
  - "Default routing rule auto-created when adding a device (matches `payload_type` of device's transport, no tag pattern, target = new device). Smooths the empty-state onboarding"
  - "Tests: device CRUD + validation edge cases + cascade delete; routing CRUD + reorder + reference integrity; UI tests for both tables + dialogs cover empty state, populated state, edit flow, delete confirmation"
  - "Full suite 950+ tests still pass; no regressions"
  - "TypeScript strict typecheck clean for cuelist-core module"
---

## Context

Per data_model.md §10, `show.devices` is a `Y.Map<device_id, Device>` and `show.routing` is `Y.Map<rule_id, RoutingRule>`. Both already exist in the document factory ([02 data model]) and resolveRouting consumes them ([09 dispatch]). But there is no UI to author or edit either — operators must hand-edit JSON files or insert via console.

Without this UI, ShowX cannot reach a single OSC console. Users can build a cuelist but firing a cue produces `{ error: 'no_route' }` for every payload. This is the highest-priority gap before any real-venue deploy.

The implementation parallels existing patterns: mutators in `document/*.ts` with validation + lock guards, React components in `ui/` using the same design tokens as the existing `CuelistCorePanel`.

## Implementation notes

### Tab structure

`CuelistCorePanel.tsx` currently has a single content body. Refactor into:

```tsx
const [activeTab, setActiveTab] = usePersistedState<'show' | 'devices' | 'routing'>(
  'cuelist-core:active-tab', 'show'
)
return (
  <div>
    <TabBar tabs={['Show', 'Devices', 'Routing']} active={activeTab} onChange={setActiveTab} />
    {activeTab === 'show' && <ShowTabContent ... />}
    {activeTab === 'devices' && <DevicesTable doc={doc} />}
    {activeTab === 'routing' && <RoutingTable doc={doc} />}
  </div>
)
```

`usePersistedState` is a thin wrapper around PersistedStore via IPC — write a helper hook if it doesn't exist.

### Device shape

Per data_model.md §10.2:

```ts
type Device = {
  device_id: string         // unique, kebab-case
  label: string             // human display
  transport: 'osc' | 'midi' | 'msc' | 'dmx'
  host?: string             // IPv4 / hostname (OSC, MSC over network)
  port?: number             // 1-65535
  driver?: 'eos' | 'ma3' | 'hog4' | 'chamsys' | 'qlab' | 'generic'  // OSC only
  midi_port?: string        // MIDI port name (MIDI, MSC over MIDI)
  dmx_universe?: number     // DMX
  notes?: string
}
```

### RoutingRule shape

Per data_model.md §10.3:

```ts
type RoutingRule = {
  rule_id: string
  sort_key: number          // priority via float (B003-002 pattern)
  match: {
    payload_type?: 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group'
    tag_pattern?: string    // regex or literal
    device_id?: string      // exact match
  }
  target_device_id: string
  notes?: string
}
```

Resolver in `resolveRouting.ts` already understands precedence; this task only adds the authoring UI + mutators.

### Status dot subscription

OutputDispatcher exposes `onDeviceStatus(device_id, callback)` — if not, add it as a small B001-007 follow-up (out of scope here; if missing, status dot stays gray with TODO comment). Verify at the start; flag in done report if missing.

### Reference integrity

When user attempts to delete a device:

1. Scan `routing` for rules with `target_device_id === device_id` or `match.device_id === device_id`
2. If found: show confirm dialog listing the rules
3. On force-delete: cascade-remove rules in same transaction

Implement as:

```ts
export function removeDevice(doc: Y.Doc, id: string, opts: { force?: boolean } = {}, ctx: { actorId }): void {
  doc.transact(() => {
    assertEditAllowed(getMeta(doc), 'structural')
    const dependents = findDependentRules(doc, id)
    if (dependents.length > 0 && !opts.force) throw new DeviceInUseError(id, dependents)
    // remove dependents first if force=true
    if (opts.force) {
      for (const rule of dependents) removeRoutingRule(doc, rule.rule_id, ctx)
    }
    getDevices(doc).delete(id)
  })
}
```

### Default routing rule on device add

```ts
export function addDevice(doc, init, ctx): Device {
  doc.transact(() => {
    assertEditAllowed(getMeta(doc), 'structural')
    validateDevice(init)
    getDevices(doc).set(init.device_id, init)
    // Auto-create rule
    addRoutingRule(doc, {
      match: { payload_type: transportToPayloadType(init.transport) },
      target_device_id: init.device_id,
    }, ctx)
  })
  return init
}
```

Operator can then refine or delete the auto-rule.

### UI styling

Mirror existing CuelistCorePanel tokens. Tables: monospaced ID columns, serif labels, status dot 8px circle. Use the same `border border-rule rounded-sm` cards as the existing panel.

## Notes for Critic

- Verify devices.ts + routing.ts mutators all run through `assertEditAllowed` for SHOW mode lock
- Verify Test button doesn't crash on disconnected device
- Verify cascade-delete restores Y.Doc consistency (no orphan rules)
- Verify auto-rule creation is idempotent if user adds same device_id twice (mutator should throw `DuplicateDeviceError`)
- Out of scope: routing rule wildcard / regex compilation — `tag_pattern` is stored as string but matching logic is in `resolveRouting.ts` already (no change)
- Non-blocking flag: if OutputDispatcher lacks `onDeviceStatus`, leave dot gray and TODO comment for B001-007 follow-up
