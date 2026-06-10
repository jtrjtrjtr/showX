---
id: "B003-402"
title: "Pairing claim returns active show_id; PairingView + StationRouter consume it"
type: "implementation"
estimated_size_lines: 130
priority: "P0"
bundle: "ShowX-3.4"
depends_on: ["B003-401"]
target_files:
  - "src/main/src/shared/pairing/api.ts"
  - "src/main/src/Shell.ts"
  - "src/shared/src/types/pairing.ts"
  - "pwa/src/components/PairingView.tsx"
  - "pwa/src/lib/types.ts"
  - "tests/unit/shared/pairing/api.test.ts"
acceptance_criteria:
  - "`PairingApiDeps` interface gains `activeShow?: ActiveShowDoc` (optional dep to avoid breaking existing mounts in tests). When set, `POST /api/pairing/claim` response includes `show_id: activeShow.getShowId() | null` field."
  - "Backward compat: if `activeShow` not injected, response shape unchanged (no `show_id` field). Existing tests that don't pass activeShow keep working."
  - "`Shell.ts` `mountPairingRoutes` call updated to pass `activeShow: this.activeShow`."
  - "`PairedSession` type (in pwa/src/lib/types.ts) gains optional `show_id?: string` field (already declared per buildConnectOpts usage — verify and ensure type definition exists)."
  - "`PairingView.tsx` `handleSubmit`: parses `show_id` from claim response, stores in PairedSession before calling `saveSession + onPaired`."
  - "If claim response has no show_id (server doesn't have active show at pair time), session.show_id is undefined → StationRouter falls back to room 'default' as today (graceful degradation; PWA shows 'Loading show…' until B003-403 reactive wiring kicks in)."
  - "API test (`tests/unit/shared/pairing/api.test.ts`) extended: claim with mocked activeShow returning show_id 'X' → response.show_id === 'X'; claim with activeShow returning null → response.show_id === null; claim without activeShow dep → no show_id field at all."
  - "`pnpm --filter showx-main typecheck` clean. `pnpm --filter showx-pwa typecheck` clean. All tests pass."
  - "No edits outside listed `target_files`."
---

## Context

B003-401 wires shell's Y.Doc into SyncBroker keyed by `show_id`. For PWA to find that doc, its WebSocket connection must go to `/yjs/<show_id>` — but PWA today defaults to room `'default'` because `session.show_id` is never set during pairing.

This task closes the loop: pairing response now tells PWA the active show_id, so PWA's StationRouter connects to the right room and immediately syncs to shell's authoritative Y.Doc.

## Architectural decisions

**Why optional `activeShow` dep:** Keeps existing pairing API tests independent — they don't need ActiveShowDoc fixtures. Backward-compat at the wire level (no show_id field) preserves test stability.

**Why server returns null (not omit) when no show:** Explicit null tells PWA "we know there's no active show, don't fall back to 'default' room incorrectly." Omit means "unknown, do whatever." For 3.4 MVP this distinction doesn't matter (PWA treats both as undefined → default fallback), but explicit null is cleaner for B003-403 reactive wiring.

## Implementation notes

### Server side

```ts
// api.ts — extend response in /pairing/claim handler
res.json({
  token,
  device,
  show_id: deps.activeShow?.getShowId() ?? null,
});
```

### PairingApiDeps

```ts
export interface PairingApiDeps {
  pairing: PairingStore;
  pins: PinManager;
  tokens: TokenManager;
  hostInfo: { host: string; port: number };
  logger: Logger;
  localSecret?: string;
  activeShow?: ActiveShowDoc;  // NEW
}
```

### Shell.ts

```ts
mountPairingRoutes(this.assets.expressApiRouter, {
  pairing: this.pairing,
  pins: this.pinManager,
  tokens: this.tokenManager,
  hostInfo: { host: os.hostname(), port: this.assets.port() },
  logger: this.logger,
  activeShow: this.activeShow,  // NEW
});
```

### PWA PairingView

```ts
const claimResp = (await claimR.json()) as { 
  token: string; 
  device: { device_id: string }; 
  show_id?: string | null;
};

const session: PairedSession = {
  host: host.host,
  port: host.port,
  token: claimResp.token,
  display_name: displayName,
  device_id: claimResp.device.device_id,
  paired_at: Date.now(),
  show_id: claimResp.show_id ?? undefined,  // NEW
  role,
  owned_departments,
  watched_departments: watchedDepts,
};
```

### PairedSession type

Check `pwa/src/lib/types.ts` — `show_id?: string` may already be declared per StationRouter usage. If not, add it. Don't remove other fields.

## Done report

Standard format. Verify in done report: with active demo show in shell, claim PIN 000000 → response includes show_id matching demo show's UUID. Without active show → show_id null.
