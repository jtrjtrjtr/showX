---
id: "B003-102"
title: "Real-time playhead broadcast via Yjs awareness"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: []
target_files:
  - "pwa/src/hooks/usePlayhead.ts"
  - "pwa/src/lib/awareness.ts"
  - "pwa/src/components/cuelist/PlayheadIndicator.tsx"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/OperatorView.tsx"
  - "tests/unit/pwa/hooks/usePlayhead.test.tsx"
  - "tests/unit/pwa/lib/awareness-playhead.test.ts"
acceptance_criteria:
  - "Playhead state moves from per-station React `useState` into Yjs awareness. Field key: `playhead`. Shape: `{ cuelist_id: string; cue_id: string | null; armed_cue_id: string | null; updated_at: ISO; updated_by: station_id }`"
  - "`usePlayhead()` hook returns the SHARED playhead: from awareness of the station currently designated as 'playhead authority' (default: SM station). All non-SM stations READ this awareness state; only SM station writes via `setPlayhead`, `advance`, `retreat`, `arm`, `unarm`"
  - "Playhead authority: in 0.1 simple rule — SM-role station is the authority. If no SM connected, fall back to first paired station (deterministic across all observers). Document this in code + tests"
  - "PlayheadIndicator subscribes to awareness; renders red NOW chip on the cue whose ID is `playhead.cue_id`. Multiple stations see same indicator simultaneously"
  - "Armed indicator: when SM presses Q (standby next), `arm(cueId)` updates awareness.playhead.armed_cue_id. All stations render armed callout in StandbyPanel + red pulse on the cue row"
  - "Latency target: playhead change propagates to other stations in <500ms over typical LAN. Verified by `awareness-playhead.test.ts` via two-Doc simulation"
  - "Awareness write rate-limited to 10 Hz max — avoid storm if SM rapidly arrows through cues"
  - "On SM disconnect: awareness state expires per Yjs awareness default (30s timeout). Stations see playhead 'frozen' at last known position; visual indicator shows 'SM offline' below the playhead chip"
  - "Operator stations attempting to call `setPlayhead` / `arm` etc. throw `NotAuthorityError` — only SM can write. SM-called GO flow on non-SM stations still works (separate request) — only LOCAL playhead manipulation is gated"
  - "Useful side effect: when a station joins mid-show, its initial render shows the current playhead position immediately (awareness is in the Yjs sync state)"
  - "Tests: usePlayhead returns correct value for SM (writer) and Operator (reader); awareness updates propagate to second Doc via applyUpdate; rate limit verified with fake timers; authority fallback verified when SM disconnects"
  - "PWA tests still pass (38+ baseline); no regressions"
  - "TypeScript strict typecheck clean"
---

## Context

Per [12 pwa-ui-components], the existing `usePlayhead` hook stores playhead in local React state via `useState`. This is documented as a known limitation:

> "Yjs-awareness playhead broadcast (currently local state)"

The consequence is that multi-operator collab — the headline feature of ShowX — is broken in its most basic interaction. SM sees their cursor on cue 47; LX op still sees cursor on cue 1. Standby on SM doesn't show up on LX side. The PWA "feels disconnected" even with everything else perfectly synced over Yjs.

This task migrates playhead state to Yjs awareness. Awareness (not Y.Doc) is the right channel for ephemeral presence-like state — it auto-expires when a station disconnects, doesn't persist to disk, and broadcasts instantly.

## Implementation notes

### Authority pattern

```ts
// In a hook used by both SM and Operator views:
function getPlayheadAuthority(awareness: Awareness): number | null {
  const states = Array.from(awareness.getStates().entries())
  // First, find an SM station
  const sm = states.find(([_, s]) => s.station?.role === 'sm')
  if (sm) return sm[0]   // clientID
  // Fallback: lowest clientID (deterministic across observers)
  const sorted = states.sort(([a], [b]) => a - b)
  return sorted[0]?.[0] ?? null
}

function getPlayheadState(awareness: Awareness): PlayheadState | null {
  const authorityClientId = getPlayheadAuthority(awareness)
  if (authorityClientId === null) return null
  return awareness.getStates().get(authorityClientId)?.playhead ?? null
}
```

### Writer side (SM station only)

```ts
function setPlayhead(awareness: Awareness, doc: Y.Doc, partial: Partial<PlayheadState>, role: string): void {
  if (role !== 'sm') throw new NotAuthorityError('Only SM can set playhead')
  const current = awareness.getLocalState()?.playhead ?? { cuelist_id: '', cue_id: null, armed_cue_id: null }
  awareness.setLocalStateField('playhead', {
    ...current,
    ...partial,
    updated_at: new Date().toISOString(),
    updated_by: awareness.clientID.toString(),
  })
}
```

### Rate limiting

Use `requestAnimationFrame` or `setTimeout(0)` debounce with 100ms max latency. Implementation pattern:

```ts
let pending: PlayheadState | null = null
let scheduled = false
function setPlayheadRateLimited(state: PlayheadState) {
  pending = state
  if (scheduled) return
  scheduled = true
  setTimeout(() => {
    if (pending) awareness.setLocalStateField('playhead', pending)
    pending = null
    scheduled = false
  }, 100)
}
```

10 Hz max — well below Yjs awareness throughput, enough for arrow-key spam.

### Hook API (unchanged surface, new impl)

```ts
export function usePlayhead(): {
  playhead: PlayheadState | null
  setPlayhead: (state: Partial<PlayheadState>) => void
  advance: () => void
  retreat: () => void
  arm: (cueId: string) => void
  unarm: () => void
  isAuthority: boolean
}
```

All writers check `isAuthority` and no-op if false (with optional warn log). Existing call sites in `SMMasterView` don't change — they call `arm()`, `advance()` etc. as before; the hook handles authority.

### Visual: offline indicator

When `awareness.getStates()` lacks an SM clientID for > 30s (or playhead.updated_at age > 30s):

```tsx
<PlayheadIndicator cueId={playhead.cue_id} />
{!authority.online && <span className="text-xs text-muted">SM offline — playhead frozen</span>}
```

### Operator view consumes too

`OperatorView` (and all 7 variants) currently doesn't render PlayheadIndicator. This task wires it in — operators see SM's cursor.

## Notes for Critic

- Verify awareness write rate-limited (assert with fake timers no more than 10 writes per second)
- Verify authority fallback determinism — both stations agree on same fallback authority when no SM connected
- Verify operator setPlayhead throws cleanly (no silent fail)
- Verify SM disconnect → playhead "freezes" in last position, visual offline indicator appears
- Out of scope: presence color palette (Q11), per-station authority override (future SHOW mode feature)
- Non-blocking flag: rate-limit test brittleness — accept as long as max-writes assertion holds
