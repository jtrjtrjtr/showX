---
id: "B004-004"
title: "DMX payload editor UI"
type: "implementation"
estimated_size_lines: 320
priority: "P0"
bundle: "ShowX-4"
depends_on: ["B004-003"]
target_files:
  - "pwa/src/components/cuelist/payloadEditors/DmxPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/PayloadEditorSwitch.tsx"
  - "pwa/src/components/cuelist/AddPayloadMenu.tsx"
  - "pwa/src/components/cuelist/PayloadList.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "New DmxPayloadEditor: device select (reuse device picker pattern from OscPayloadEditor/LxRefPayloadEditor), universe number input, and an add/remove list of {channel(1-512), value(0-255)} rows. Inline validation matching B004-003 (channel/value bounds)."
  - "PayloadEditorSwitch routes type 'dmx' → DmxPayloadEditor."
  - "AddPayloadMenu gains 'DMX' entry; makeDefaultPayload('dmx') factory in PayloadList returns { type:'dmx', tag:null, note:'', device_id:'', universe:0, channels:[{channel:1,value:0}] }."
  - "Writes via cuelist-core addPayload/updatePayload (NEVER ad-hoc Y.Map). SHOW mode locks editor (disabled inputs, consistent with other editors)."
  - "Dark FOH theme tokens; legible. Channel/value rows usable on iPad touch (adequate hit targets)."
  - "Unit tests: editor renders, add/remove channel row, validation error states, locked disables, AddPayloadMenu lists DMX + creates default."
  - "`pnpm --filter showx-pwa build` clean (no node:* leak), `pnpm -r typecheck` clean, tests pass. No edits outside target_files."
---

## Context

B004-003 adds the dmx payload type + dispatch. This task gives it an authoring UI in the browser station, completing the 'create any payload type' promise (audit G3 + G2).

## Implementation notes

- Copy the structure of an existing multi-row editor (OscPayloadEditor has a dynamic args list — same add/remove pattern for channel/value rows).
- Reuse the device select used by Osc/LxRef editors.
- Keep all writes through document/payload.ts helpers.

## Test plan

- Add DMX payload via menu → default appears with 1 channel row.
- Add/remove channel rows; set channel 600 → error; value 300 → error.
- SHOW mode → inputs disabled.

## Out of scope

- Dispatch/type (B004-003).
