# 12 — PWA UI components

The React component tree that runs on iPad / browser stations. Built with the same design tokens as the Electron panel.

## Component tree

```
ConnectionProvider              // [11] context
└── App routes
    ├── /pair                   // PWA pairing flow (B001-012)
    ├── /sm                     // SM master view
    │   └── SMMasterView
    │       ├── CallingText
    │       ├── CueRow[]
    │       │   ├── CueTypeBadge
    │       │   ├── DepartmentChips
    │       │   ├── OperatorPresenceIndicators
    │       │   └── PlayheadIndicator
    │       ├── StandbyPanel
    │       ├── GoButton + GoConfirmDialog
    │       └── HelpOverlay
    ├── /op/:dept               // Operator view
    │   └── OperatorView
    │       └── (routes to variant by dept)
    │           ├── LxOperatorView
    │           ├── SxOperatorView
    │           ├── VideoOperatorView
    │           ├── AutoOperatorView
    │           ├── PyroOperatorView    ← special safety gate
    │           ├── FsOperatorView
    │           └── GenericOperatorView
    └── /edit/:cueId            // Cue editor (REHEARSAL)
        └── CueEditor
            ├── CueMetaFields
            ├── DepartmentSelector
            ├── TriggerEditor
            ├── PayloadList
            ├── AddPayloadMenu
            └── PayloadEditorSwitch
                └── (per-type editor: OSC/MSC/LXRef/MIDI/Webhook/Wait/Group)
```

## Design tokens

`pwa/src/components/cuelist/tokens.ts` — single source of truth for colors, spacing, typography. Mirrors `src/modules/cuelist-core/src/ui/tokens.ts` (Electron panel) plus extras (`green`, department color map).

```ts
export const TOKENS = {
  colors: {
    paper: '#F8F5F0', ink: '#1C1816',
    accent: '#E5DDC8', accentDeep: '#2E3640',
    red: '#C8312A', green: '#26AC56',
    deptColor: {
      LX: '#D6921C',  // amber
      SX: '#4C8BBE',  // teal
      VIDEO: '#8E4FAE', // purple
      AUTO: '#7E8B92',
      PYRO: '#C8312A',
      FS: '#5A6C7A',
      SM: '#1C1816',
    },
  },
  spacing: { unit: 4 },
  font: { serif: 'Fraunces, serif', sans: 'Manrope, system-ui', mono: 'JetBrains Mono, monospace' },
}
```

## SMMasterView

`pwa/src/components/cuelist/SMMasterView.tsx`.

Layout:

- Top bar: search + cuelist label + cue counter
- Center: scrollable cuelist of `CueRow`s
- Sticky bottom: `StandbyPanel` (drawer) + `GoButton`

Wired:

- `usePlayhead` for playhead position (Yjs-backed)
- `useShow` + `useCuelist` for show meta + active cuelist
- `useGoChannel.lastRejected` triggers shake on GO
- `useKeyboardShortcuts({ Space: go, Q: standbyNext, '?': toggleHelp, ... })`

Calling text states:

```ts
type CallingState = 'IDLE' | 'STANDBY' | 'GO' | 'COMPLETE'
```

`aria-live="polite"` so screen readers announce state changes without interrupting.

## CueRow

Single row with:

- Trigger badge (⏵ / → / ⏩ / ⏱ icons, aria-label)
- Label (24px bold serif)
- Department chips (multi-stripe DepartmentSideBar for compound)
- Operator presence dots (up to 5 + overflow count)
- Standby note (smaller)
- States: playhead (red NOW chip), armed (red callout), firing (white flash), locked (lock icon)

`data-testid="cue-row"` on root for E2E tests.

## OperatorView

`OperatorView.tsx` decides which variant to render based on station's owned departments:

```ts
function chooseVariant(owned: DepartmentTag[]): VariantComponent {
  if (owned.length > 1) return GenericOperatorView   // multi-owned fallback
  switch (owned[0]) {
    case 'LX': return LxOperatorView
    case 'SX': return SxOperatorView
    // ...
    default: return GenericOperatorView
  }
}
```

Each variant filters cues via `useDepartment` and renders `OperatorCueRow`s with dept-specific columns.

### PyroOperatorView (special)

Two-stage Arm → Fire safety:

```tsx
const [armed, setArmed] = useState(false)

function handleFire() {
  if (!armed) return                           // disabled
  if (!isActionable || !isSmCalled) return     // authority gate
  go.fire(cue.id)
  setArmed(false)
}

return (
  <>
    <div className="bg-red-900 text-white">PYRO — Two-stage GO</div>
    <button onClick={() => setArmed(!armed)}>{armed ? 'Disarm' : 'Arm'}</button>
    <button disabled={!armed} onClick={handleFire}>Fire</button>
  </>
)
```

Triple-guard: button `disabled`, `handleFire` early-return, `isActionable && isSmCalled` gate. Arm clears after fire.

## CueEditor

Opens in modal or full page (route `/edit/:cueId`).

Auto-saves on field blur + every 30s (config). NO save button (Critic non-blocking flag: documented decision, semantically moot per Yjs CRDT).

In SHOW mode:

- Meta fields editable (label, description, standby_note, notes)
- Payload editors render `<LockBanner>` + read-only fields
- "Propose change" button stub for 0.2 SHOW mode edit-proposals

## PayloadList

Drag-and-drop reorder using `reorderPayloads` mutator. In SHOW: drag disabled.

`+ Add payload` button → `AddPayloadMenu` (7 types). Each type, on select, calls `addPayload` with a sensible default shape.

## PayloadEditorSwitch

Routes to one of 7 type-specific editors. Each editor:

- Owns local state for the field being edited
- Calls `updatePayload` on blur
- Uses dept-specific routing dropdown (devices filtered by transport)

Known duplication: `useDeviceIds` hook is reimplemented in 4 editors. Critic non-blocking flag (B003-016). Lift to shared in hygiene pass.

## Keyboard shortcuts

`pwa/src/hooks/useKeyboardShortcuts.ts`:

```ts
export function useKeyboardShortcuts(map: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // GUARD: skip if focus is inside an input/textarea/contenteditable
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const fn = map[e.key]
      if (fn) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [map])
}
```

INPUT-guard prevents shortcuts from firing while editing a field.

## Accessibility

- `aria-live` on calling text (polite — doesn't interrupt active screen reader speech)
- `aria-label` on every icon button (GO, trigger icons)
- `role="dialog"` `aria-modal="true"` on GoConfirmDialog
- `data-testid` on key elements for E2E test selectors

## Tests

- `tests/unit/pwa/components/cuelist/CueRow.test.tsx` (9 tests)
- `tests/unit/pwa/components/cuelist/SMMasterView.test.tsx` (15 tests incl. toast)
- `tests/unit/pwa/components/cuelist/StandbyPanel.test.tsx` (9 tests + CallingText)
- `tests/unit/pwa/components/cuelist/OperatorView.test.tsx` + per-variant tests
- `tests/unit/pwa/components/cuelist/CueEditor.test.tsx`
- `tests/unit/pwa/components/cuelist/payloadEditors/<each>.test.tsx`
- `tests/unit/pwa/components/cuelist/GoButton.test.tsx` (12 tests)

## Open issues

- Screenshots / video tour for User Guide page (currently text-only)
- Drag-reorder DOM test for cue list in PWA (Critic non-blocking flag B003-016)
- Yjs-awareness playhead broadcast (currently local state)
- Write-back persistence for SMMasterView search filter (currently in-memory)
