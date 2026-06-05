---
id: "B003-016"
title: "PWA cue editor — REHEARSAL mode + per-payload-type editors"
type: "implementation"
estimated_size_lines: 800
priority: "P0"
depends_on: ["B003-006", "B003-013"]
target_files:
  - "pwa/src/components/cuelist/CueEditor.tsx"
  - "pwa/src/components/cuelist/CueMetaFields.tsx"
  - "pwa/src/components/cuelist/PayloadList.tsx"
  - "pwa/src/components/cuelist/payloadEditors/OscPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/MscPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/LxRefPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/MidiPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/WebhookPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/WaitPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/GroupPayloadEditor.tsx"
  - "pwa/src/components/cuelist/payloadEditors/PayloadEditorSwitch.tsx"
  - "pwa/src/components/cuelist/TriggerEditor.tsx"
  - "pwa/src/components/cuelist/DepartmentSelector.tsx"
  - "pwa/src/components/cuelist/AddPayloadMenu.tsx"
  - "pwa/tests/unit/components/cuelist/CueEditor.test.tsx"
  - "pwa/tests/unit/components/cuelist/payloadEditors/**.test.tsx"
acceptance_criteria:
  - "`CueEditor` opens as modal drawer (full-screen on mobile, side-drawer on desktop) when user taps cue row / presses Enter on focused cue"
  - "REHEARSAL only: when SHOW mode, editor shows lock banner + 'Propose change' button (proposal queue logic deferred to ShowX-4; button stub shows 'Coming in 0.2' toast)"
  - "Meta fields: label (text input), description (textarea), standby_note (text input), notes (textarea), department[] (multi-select chips), trigger (TriggerEditor sub-component), duration_hint_ms (number input optional)"
  - "Each meta edit dispatches CRDT mutation immediately via B003-002 mutators (`setCueLabel`, `setCueDescription`, etc.); no save button — auto-saves to Y.Doc on field blur"
  - "Payload list: ordered list of payloads with type badge + summary; drag-handle for reorder (B003-006 `reorderPayloads`); +Add payload button opens AddPayloadMenu (Osc/Msc/LxRef/Midi/Webhook/Wait/Group)"
  - "Per-payload-type editor (PayloadEditorSwitch routes by type):"
  - "  - OscPayloadEditor: address text input (validates / prefix), arg list (type discriminator + value), device_id selector (dropdown of `devices` map)"
  - "  - MscPayloadEditor: command select (go/stop/resume/load/set/fire/all_off), cue_list/cue_number text inputs, device_id select, device_id_msc 0..127 number"
  - "  - LxRefPayloadEditor: device_id select, cue_list (number ≥ 1), cue_number (number ≥ 0, allows fractional)"
  - "  - MidiPayloadEditor: message kind select (note_on/off, cc, pc, raw), conditional fields per kind"
  - "  - WebhookPayloadEditor: url + method + headers (key-value list) + body (textarea) + timeout_ms"
  - "  - WaitPayloadEditor: duration_ms number input (0..600000 validation)"
  - "  - GroupPayloadEditor: child cue picker (multi-select from cuelist), fire_mode (parallel/series)"
  - "DepartmentSelector: chip-style multi-select for canonical departments; validates ≥ 1 selection (B003-002 / B003-006 invariant)"
  - "TriggerEditor: discriminated union editor — kind select + conditional fields (auto_follow needs prev_cue_id picker, auto_continue needs delay_ms, timecode shows 'deferred to 0.2' message)"
  - "Validation errors inline below fields; per data_model.md §5.2 rules (e.g. webhook URL non-https outside loopback shows red border + error text)"
  - "Cancel button discards local input state; underlying Y.Doc unchanged (because mutators not called) — but blur-then-cancel means dirty state already committed (forge documents)"
  - "Delete cue button at bottom (red, requires confirmation dialog)"
  - "25+ vitest + RTL tests across files covering each payload type editor, validation, lock state, department selector, trigger editor, delete confirm"
---

## Context

The cue editor is where shows get built. In REHEARSAL mode, every operator with edit permissions can author cues collaboratively — Yjs CRDT handles concurrent edits. The editor's job is to present typed editors for each payload variant + the cue metadata, with immediate save-as-you-type semantics.

The discriminated payload union from B003-002 / data_model.md §5 maps to one editor component per type. PayloadEditorSwitch routes by payload.type.

## Implementation notes

### CueEditor shell

```tsx
// pwa/src/components/cuelist/CueEditor.tsx
import { useState } from 'react';
import { useCue, useMode } from '../../hooks';
import { CueMetaFields } from './CueMetaFields';
import { PayloadList } from './PayloadList';
import { isLockedForEdit } from 'showx-shared';

export function CueEditor({ cuelistId, cueId, onClose }: { cuelistId: string; cueId: string; onClose: () => void }) {
  const cue = useCue(cuelistId, cueId);
  const { mode } = useMode();
  const isLocked = mode === 'show';
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!cue) return null;

  return (
    <div role="dialog" aria-modal="true" style={drawerStyle}>
      <header>
        <button onClick={onClose} aria-label="Close editor">×</button>
        <h2>Edit cue {cue.label}</h2>
      </header>

      {isLocked && (
        <div role="status" style={{ background: tokens.color.red, color: tokens.color.cream, padding: tokens.space.m }}>
          🔒 SHOW mode — payload edits locked. <button onClick={() => alert('Proposal queue coming in ShowX 0.2')}>Propose change</button>
        </div>
      )}

      <CueMetaFields cue={cue} cuelistId={cuelistId} disabled={isLocked && /* meta still allowed per Q7 */ false} />
      <PayloadList cue={cue} cuelistId={cuelistId} locked={isLocked} />

      <footer>
        <button onClick={() => setConfirmDelete(true)} style={{ background: tokens.color.red, color: tokens.color.cream }}>
          Delete cue
        </button>
      </footer>

      {confirmDelete && (
        <DeleteConfirmDialog
          cueLabel={cue.label}
          onConfirm={() => { removeCue(useConnection().doc, cuelistId, cueId); onClose(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
```

### CueMetaFields

```tsx
export function CueMetaFields({ cue, cuelistId, disabled }: { cue: Cue; cuelistId: string; disabled?: boolean }) {
  const conn = useConnection();
  return (
    <div>
      <label>
        Label
        <input
          type="text" value={cue.label}
          onChange={e => setCueLabel(conn.doc, cuelistId, cue.id, e.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        Description
        <textarea
          value={cue.description}
          onChange={e => setCueDescription(conn.doc, cuelistId, cue.id, e.target.value)}
        />
      </label>
      <label>
        Standby note
        <input type="text" value={cue.standby_note}
          onChange={e => setCueStandbyNote(conn.doc, cuelistId, cue.id, e.target.value)} />
      </label>
      <DepartmentSelector
        value={cue.department}
        onChange={depts => setCueDepartments(conn.doc, cuelistId, cue.id, depts)}
      />
      <TriggerEditor
        cuelistId={cuelistId} cue={cue}
        onChange={t => setCueTrigger(conn.doc, cuelistId, cue.id, t)}
      />
      <label>
        Duration hint (ms)
        <input type="number" value={cue.duration_hint_ms ?? ''}
          onChange={e => setCueDurationHint(conn.doc, cuelistId, cue.id, e.target.value === '' ? null : Number(e.target.value))} />
      </label>
    </div>
  );
}
```

### DepartmentSelector

```tsx
export function DepartmentSelector({ value, onChange }: { value: DepartmentTag[]; onChange: (v: DepartmentTag[]) => void }) {
  const CANONICAL = ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER'];
  const toggle = (d: DepartmentTag) => {
    const next = value.includes(d) ? value.filter(x => x !== d) : [...value, d];
    if (next.length === 0) return; // reject empty per invariant
    onChange(next);
  };
  return (
    <div>
      <label>Departments</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {CANONICAL.map(d => (
          <button
            key={d} onClick={() => toggle(d)} aria-pressed={value.includes(d)}
            style={{ background: value.includes(d) ? tokens.color.teal : tokens.color.gray_50, color: value.includes(d) ? tokens.color.cream : tokens.color.ink, padding: 4, borderRadius: 4 }}
          >
            {d}
          </button>
        ))}
      </div>
      {value.length === 0 && <div role="alert" style={{ color: tokens.color.red }}>Must have ≥ 1 department</div>}
    </div>
  );
}
```

### TriggerEditor

```tsx
export function TriggerEditor({ cuelistId, cue, onChange }: { cuelistId: string; cue: Cue; onChange: (t: Cue['trigger']) => void }) {
  const { cues } = useCuelist(cuelistId);
  const [kind, setKind] = useState(cue.trigger.kind);

  return (
    <div>
      <label>Trigger</label>
      <select value={kind} onChange={e => {
        const k = e.target.value as Cue['trigger']['kind'];
        setKind(k);
        if (k === 'manual') onChange({ kind: 'manual' });
        if (k === 'auto_continue') onChange({ kind: 'auto_continue', delay_ms: 0 });
        if (k === 'auto_follow') {
          const idx = cues.findIndex(c => c.id === cue.id);
          const prev = cues[idx - 1];
          onChange({ kind: 'auto_follow', prev_cue_id: prev?.id ?? '' });
        }
        if (k === 'timecode') onChange({ kind: 'timecode', time_ms: 0, source: 'internal' });
      }}>
        <option value="manual">Manual (GO press)</option>
        <option value="auto_continue">Auto continue (delay after prev fire)</option>
        <option value="auto_follow">Auto follow (after prev complete)</option>
        <option value="timecode" disabled>Timecode (post-MVP, ShowX-4)</option>
      </select>
      {cue.trigger.kind === 'auto_continue' && (
        <input type="number" min={0} value={cue.trigger.delay_ms}
          onChange={e => onChange({ ...cue.trigger, delay_ms: Number(e.target.value) } as any)} />
      )}
      {cue.trigger.kind === 'auto_follow' && (
        <select value={(cue.trigger as any).prev_cue_id}
          onChange={e => onChange({ ...cue.trigger, prev_cue_id: e.target.value } as any)}>
          {cues.filter(c => c.id !== cue.id).map(c => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      )}
      {cue.trigger.kind === 'timecode' && (
        <div style={{ color: tokens.color.yellow }}>Timecode triggers deferred to 0.2; cue treated as manual until then.</div>
      )}
    </div>
  );
}
```

### Per-payload editors

```tsx
// OscPayloadEditor.tsx
export function OscPayloadEditor({ payload, cuelistId, cueId, locked }: { payload: OscPayload; cuelistId: string; cueId: string; locked: boolean }) {
  const conn = useConnection();
  const [addrErr, setAddrErr] = useState<string | null>(null);

  const updateAddress = (addr: string) => {
    if (!addr.startsWith('/')) { setAddrErr('Address must start with /'); return; }
    setAddrErr(null);
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { ...payload, address: addr });
  };

  return (
    <div>
      <label>Address
        <input type="text" value={payload.address} onChange={e => updateAddress(e.target.value)} disabled={locked} />
        {addrErr && <span style={{ color: tokens.color.red }}>{addrErr}</span>}
      </label>
      <DeviceSelector value={payload.device_id} onChange={d => updatePayload(conn.doc, cuelistId, cueId, payload.id, { ...payload, device_id: d })} disabled={locked} />
      <ArgList args={payload.args} onChange={args => updatePayload(conn.doc, cuelistId, cueId, payload.id, { ...payload, args })} disabled={locked} />
    </div>
  );
}
```

```tsx
// WebhookPayloadEditor.tsx
export function WebhookPayloadEditor({ payload, cuelistId, cueId, locked }: ...) {
  const conn = useConnection();
  const [urlErr, setUrlErr] = useState<string | null>(null);

  const updateUrl = (url: string) => {
    const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost|::1)/.test(url);
    if (!url.startsWith('https://') && !isLoopback) {
      setUrlErr('URL must be https unless loopback');
      return;
    }
    setUrlErr(null);
    updatePayload(conn.doc, cuelistId, cueId, payload.id, { ...payload, url });
  };
  // ... method select, headers k-v list, body textarea, timeout_ms
}
```

```tsx
// WaitPayloadEditor.tsx
export function WaitPayloadEditor({ payload, cuelistId, cueId, locked }: ...) {
  const conn = useConnection();
  return (
    <label>Duration (ms)
      <input type="number" min={0} max={600_000} value={payload.duration_ms}
        onChange={e => {
          const v = Number(e.target.value);
          if (v < 0 || v > 600_000) return;
          updatePayload(conn.doc, cuelistId, cueId, payload.id, { ...payload, duration_ms: v });
        }} disabled={locked} />
    </label>
  );
}
```

### PayloadList + reordering

```tsx
export function PayloadList({ cue, cuelistId, locked }: { cue: Cue; cuelistId: string; locked: boolean }) {
  const conn = useConnection();
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  return (
    <div>
      {cue.payloads.map((p, i) => (
        <div
          key={p.id}
          draggable={!locked}
          onDragStart={() => setDraggingIdx(i)}
          onDrop={() => {
            if (draggingIdx == null) return;
            const newOrder = [...cue.payloads.map(x => x.id)];
            const [moved] = newOrder.splice(draggingIdx, 1);
            newOrder.splice(i, 0, moved);
            reorderPayloads(conn.doc, cuelistId, cue.id, newOrder);
          }}
          onDragOver={e => e.preventDefault()}
        >
          <PayloadEditorSwitch payload={p} cuelistId={cuelistId} cueId={cue.id} locked={locked} />
          <button onClick={() => removePayload(conn.doc, cuelistId, cue.id, p.id)} disabled={locked}>Remove</button>
        </div>
      ))}
      <AddPayloadMenu onAdd={(type) => addPayload(conn.doc, cuelistId, cue.id, makeDefaultPayload(type))} disabled={locked} />
    </div>
  );
}
```

### makeDefaultPayload

```ts
function makeDefaultPayload(type: PayloadType): Omit<Payload, 'id'> {
  switch (type) {
    case 'osc': return { type: 'osc', tag: null, note: '', device_id: '', address: '/', args: [] };
    case 'msc': return { type: 'msc', tag: null, note: '', device_id: '', command: 'go', cue_list: null, cue_number: null, device_id_msc: 127 };
    case 'lx_ref': return { type: 'lx_ref', tag: null, note: '', device_id: '', cue_list: 1, cue_number: 1 };
    case 'midi': return { type: 'midi', tag: null, note: '', device_id: '', message: { kind: 'note_on', channel: 1, note: 60, velocity: 127 } };
    case 'webhook': return { type: 'webhook', tag: null, note: '', url: 'https://', method: 'POST', headers: {}, body: null, timeout_ms: 5000 };
    case 'wait': return { type: 'wait', tag: null, note: '', duration_ms: 1000 };
    case 'group': return { type: 'group', tag: null, note: '', child_cue_ids: [], fire_mode: 'parallel' };
  }
}
```

## Test plan

### `CueEditor.test.tsx`

1. Renders with cue meta + payloads.
2. SHOW mode shows lock banner.
3. Close button calls onClose.
4. Delete button opens DeleteConfirmDialog.
5. Confirm delete removes cue.

### `payloadEditors/OscPayloadEditor.test.tsx`

6. Address change updates payload via mutator.
7. Address without `/` shows error inline.
8. Args list add/remove.
9. Device selector lists devices map.

### `payloadEditors/WebhookPayloadEditor.test.tsx`

10. https URL accepted.
11. http://example.com rejected with error.
12. http://127.0.0.1:8080 accepted (loopback).
13. Headers k-v list add/edit.
14. timeout_ms editable.

### `payloadEditors/WaitPayloadEditor.test.tsx`

15. duration_ms 100 accepted.
16. duration_ms -1 rejected (clamped or error).
17. duration_ms 700000 rejected.

### `payloadEditors/LxRefPayloadEditor.test.tsx`

18. cue_list 0 rejected (≥ 1).
19. cue_number fractional 1.5 accepted.
20. device_id select bound to devices map.

### `payloadEditors/GroupPayloadEditor.test.tsx`

21. child_cue_ids multi-select from cuelist (excluding self).
22. fire_mode parallel/series selectable.

### `DepartmentSelector.test.tsx`

23. Multi-select toggles.
24. Empty selection shows error.

### `TriggerEditor.test.tsx`

25. Manual select → trigger={kind:'manual'}.
26. Auto continue + delay → trigger updated.
27. Auto follow + prev select → prev_cue_id set.
28. Timecode shows deferred message + disabled in MVP.

### `PayloadList.test.tsx`

29. Drag reorder fires reorderPayloads mutator.
30. Add payload menu lists 7 types.

## Out of scope

- Proposal queue for SHOW mode edits (ShowX-4).
- Inline preview of payload (e.g. "this OSC will fire to host:port") — surface via summary only.
- Cue duplication ("Duplicate cue" button — post-MVP).
- Bulk edit (multi-select + apply) — post-MVP.
- Undo/redo (Yjs natively supports — could expose Cmd+Z; post-MVP).
- Validation error toasts (inline errors only).
- Form auto-save indicator (changes commit on every mutator call; no batched save).

## Notes for Critic

- Verify mutator calls are wrapped in B003-002's `doc.transact` so observers see atomic updates.
- Confirm SHOW mode lock banner is visible; meta fields still editable (Q7 default); payload + delete disabled.
- Verify webhook URL validation matches data_model.md §5.2 exactly (https + loopback exception).
- Verify wait duration_ms bounds 0..600000.
- Verify LxRef cue_list ≥ 1, cue_number ≥ 0 fractional allowed.
- Confirm DepartmentSelector enforces ≥ 1 — reject empty.
- Confirm TriggerEditor handles auto_follow's prev_cue_id selection (default = previous cue in cuelist).
- Confirm delete cue requires confirmation dialog (no accidental destructive action).
- Verify PayloadList reorder uses B003-006's reorderPayloads (NOT direct Y.Array manipulation).
- Watch for stale state in payload editors during rapid edits — useEffect dependencies should re-render on cue.payloads change.
