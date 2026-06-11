---
id: "B003-502"
title: "SM presence from awareness + deterministic playhead authority"
type: "implementation"
estimated_size_lines: 120
priority: "P0"
bundle: "ShowX-3.5"
depends_on: ["B003-501"]
target_files:
  - "pwa/src/lib/awareness.ts"
  - "pwa/src/hooks/usePlayhead.ts"
  - "pwa/src/components/cuelist/SMMasterView.tsx"
  - "pwa/src/components/cuelist/OperatorView.tsx"
  - "pwa/src/components/cuelist/PlayheadIndicator.tsx"
  - "tests/unit/pwa/**"
acceptance_criteria:
  - "New `isSmPresent(awareness): boolean` in awareness.ts: true iff any awareness state (INCLUDING local) has role === 'sm'. Yjs awareness protocol already prunes disconnected clients (~30s), so presence in the states map is the liveness signal — no timestamp math."
  - "usePlayhead exposes `smOnline` computed from isSmPresent, NOT from playhead.updated_at age. Remove SM_OFFLINE_MS write-age logic for smOnline (keep nothing time-based)."
  - "A station that IS the SM never sees 'SM offline — playhead frozen'. Reproduces today's bug: SM idle >30s currently shows the banner — must not after fix."
  - "getPlayheadAuthorityClientId made deterministic: among states with role==='sm', pick LOWEST clientID (today it uses Map iteration order via .find() — order differs per client, so two SMs each think a different station is authority = split-brain). No SM → lowest clientID overall (existing fallback)."
  - "getPlayheadState reads playhead from the deterministic authority. When authority has no playhead yet, fall back to ANY state carrying a playhead for the cuelist (so a freshly-promoted authority doesn't blank the UI)."
  - "Unit tests: (a) two SM clients on both ends agree on the same authority; (b) smOnline true when SM present and idle 60s; (c) smOnline false when no role==='sm' in states; (d) authority failover when SM disconnects (state removed) → lowest clientID takes over."
  - "`pnpm --filter showx-pwa typecheck` clean, all tests pass."
  - "No edits outside listed target_files."
---

## Context

Live E2E 2026-06-10 findings:

1. **"SM offline — playhead frozen" shows even when SM is connected and active.** `smOnline` is derived from `playhead.updated_at` age (30s window) — i.e., it measures *SM recently clicked something*, not *SM is present*. An idle SM = "offline". Confusing and wrong.

2. **Authority split-brain.** `getPlayheadAuthorityClientId` does `states.find(role === 'sm')` over awareness Map entries. Map iteration order = insertion order, which differs per client (local state inserted first on each client). With 2+ SM-role stations (Jindřich had two paired tabs), each client can elect a different authority. Clicks then write to local playhead while other clients display a different authority's playhead.

## Implementation notes

```ts
// awareness.ts
export function isSmPresent(awareness: AwarenessLike): boolean {
  for (const [, s] of awareness.getStates()) {
    if ((s as unknown as StationAwareness).role === 'sm') return true;
  }
  return false;
}

export function getPlayheadAuthorityClientId(awareness: AwarenessLike): number | null {
  const states = Array.from(awareness.getStates().entries());
  if (states.length === 0) return null;
  const sms = states
    .filter(([, s]) => (s as unknown as StationAwareness).role === 'sm')
    .sort(([a], [b]) => a - b);
  if (sms.length > 0) return sms[0][0];
  return [...states].sort(([a], [b]) => a - b)[0]?.[0] ?? null;
}
```

In usePlayhead: subscribe to awareness change (already done) and recompute `smOnline = isSmPresent(aw)`. Delete the age-based IIFE.

PlayheadIndicator's "(SM offline)" text: keep, driven by the new signal.

Note: multiple simultaneous SM tabs remain *possible* (same person, two windows) — deterministic election makes them consistent; UX guard against multi-SM is future scope, do not add here.

## Done report

Standard format. State explicitly which split-brain test scenario you covered.
