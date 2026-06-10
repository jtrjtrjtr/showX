---
id: "B003-506"
title: "Cue editing in PWA — double-click edit dialog, CRDT write-through, persists to .showx"
type: "implementation"
estimated_size_lines: 380
priority: "P1"
bundle: "ShowX-3.5"
depends_on: ["B003-501", "B003-502"]
target_files:
  - "pwa/src/components/cuelist/CueRow.tsx"
  - "pwa/src/components/cuelist/CueEditDialog.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/hooks/useCuelist.ts"
  - "src/modules/cuelist-core/src/document/cue.ts"
  - "src/modules/cuelist-core/src/index.ts"
  - "tests/unit/pwa/**"
  - "tests/unit/cuelist-core/**"
acceptance_criteria:
  - "Double-click (and long-press >500ms for touch) on a CueRow in SMMasterView opens CueEditDialog — ONLY when mode === 'rehearsal'. In show mode: no-op (payload lock UX already shows 🔒)."
  - "CueEditDialog edits: label (required, non-empty), description, standby_note. Save / Cancel buttons + Esc to cancel, Cmd/Ctrl+Enter to save. Dark theme tokens (B003-501)."
  - "Save writes through Yjs: cue fields updated inside a single doc.transact() on the cue's Y.Map (label/description/standby_note keys). Use/extend cue helpers in cuelist-core document/cue.ts — export an `updateCueFields(doc, cuelistId, cueId, patch)` helper so the write path is library-owned + unit-testable, not ad-hoc in the component."
  - "updateCueFields validates: label non-empty string; silently ignores undefined patch keys; throws on unknown cue. NEVER touches payloads or forbidden CRDT fields."
  - "Edit propagates live: second connected browser sees the new label without reload (CRDT sync — should be automatic via existing useCuelist observers; verify, don't assume)."
  - "Persistence: edit → shell autosave path picks up doc update → close show + reopen (or kill app + relaunch + open) → edited label survives in the .showx package. If autosave does NOT yet trigger on doc updates, wire the minimal hook in the existing persistence layer and document it in the done report (check src/main/src/runtime/ActiveShowDoc.ts save flow FIRST — it may already debounce-save on doc update)."
  - "Single-click still selects playhead (existing behavior) — double-click must NOT also fire two playhead selects + dialog; debounce/guard click vs dblclick (300ms window or e.detail check)."
  - "Keyboard shortcut: 'E' opens edit dialog for the playhead cue (register in SMMasterView shortcuts map, document in HelpOverlay)."
  - "Unit tests: updateCueFields (happy, unknown cue, empty label rejected); dialog render + save flow with mocked doc; dblclick guard."
  - "`pnpm -r typecheck` clean, all tests pass."
  - "No edits outside listed target_files."
---

## Context

Jindřich's first instinct in live test 2026-06-10: double-click a cue to edit it. Nothing happened — editing was never built into the PWA (SMMasterView is a calling/playback surface). This task adds the expected affordance.

Scope guard: TEXT fields only (label, description, standby_note). Payload editing, trigger editing, cue add/delete/reorder = future bundle (ShowX-4 scope discussion). Don't gold-plate.

## Implementation notes

### Click vs double-click

CueRow currently fires onSelect on click (sets playhead via authority). Add onEdit prop. Guard pattern:

```tsx
onClick={(e) => { if (e.detail === 1) selectTimer.current = setTimeout(onSelect, 250); }}
onDoubleClick={() => { clearTimeout(selectTimer.current); onEdit(); }}
```

(Or simpler accepted: select on click immediately, dblclick ALSO opens dialog — selecting before editing is harmless. Choose one, justify in done report.)

### Y.Doc write path

cuelist doc shape (B003-002): `doc.getArray<Y.Map>('cuelists')` → cuelist Y.Map → 'cues' Y.Array<Y.Map> → cue Y.Map with scalar keys. **Beware the Y.Array vs Y.Map trap from 3.4** (memory: feedback_electron_workspace_imports_packed + 3.4 close decision) — read document/cuelist.ts getters and mirror their access pattern exactly; type collisions fail silently in multi-process sync.

### Authority note

Cue text editing is NOT playhead authority-gated (any rehearsal station may edit; CRDT merges concurrent edits). Mode gate (rehearsal only) is the only gate. This is deliberate — matches data_model.md collaborative-edit semantics.

### Persistence check

ActiveShowDoc.open() loads .showx → attaches doc. Find the save path (autosave on update? explicit save?). The acceptance requires edits to survive relaunch — if only explicit save exists, hook the existing debounced autosave or add a 2s-debounce doc.on('update') → save. Minimal diff, document what you found.

## Done report

Standard format. Must include the persistence verification result (edit → relaunch → survived) and which click-guard variant you chose.
