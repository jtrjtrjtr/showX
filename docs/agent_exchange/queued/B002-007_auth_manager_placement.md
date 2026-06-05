---
id: "B002-007"
title: "Auth manager placement (module-local per Q23 ruling)"
type: "implementation"
estimated_size_lines: 500
priority: "P0"
depends_on: ["B002-005"]
target_files:
  - "src/modules/eventx-bridge/src/auth/AuthManager.ts"
  - "src/modules/eventx-bridge/src/auth/auth-ipc.ts"
  - "src/modules/eventx-bridge/src/auth/types.ts"
  - "src/modules/eventx-bridge/src/auth/migrate-from-bridgex.ts"
  - "src/modules/eventx-bridge/src/EventXBridge.ts"
  - "src/modules/eventx-bridge/tests/unit/auth-manager.test.ts"
  - "src/modules/eventx-bridge/tests/unit/auth-migrate-bridgex.test.ts"
  - "src/modules/eventx-bridge/tests/unit/auth-ipc.test.ts"
acceptance_criteria:
  - "`AuthManager` ports `~/Daniel-local/bridgeX/apps/bridgex-app/src/main/auth-manager.ts` semantics: Supabase login (email + password); refresh-token persistence via `ctx.secrets`; scheduled refresh 60s before token expiry; broadcast `onTokenRefreshed` to subscribers"
  - "Persistence moves FROM `safeStorage`-encrypted `userData/bridgex-session.enc` TO `ctx.secrets.set('refresh-token', <token>)` (shell's SecretStore from B001-004 wraps OS keychain — equivalent security; namespaced under module slug)"
  - "Module-local placement per Q23 default ruling (open questions doc): AuthManager class lives at `src/modules/eventx-bridge/src/auth/`, NOT in shell shared services"
  - "Token refresh subscribers receive new access token via callback; `SupabaseSubscriber.updateAccessToken(token)` from B002-005 is the primary consumer"
  - "Auth IPC namespaced under module: `eventx-bridge:auth:login`, `eventx-bridge:auth:logout`, `eventx-bridge:auth:get-session`, `eventx-bridge:auth:get-token` (per module_loader spec §4 module-namespaced IPC convention)"
  - "Migration from BridgeX 0.3.x `userData/bridgex-session.enc` → ShowX SecretStore happens on first start of EventX Bridge module if BridgeX install detected; migration is one-time and logged at info level"
  - "AuthManager exposes `getCurrentToken(): Promise<string | null>` for SupabaseSubscriber initialization"
  - "Auth manager lifecycle hooks: `start()` reads persisted refresh token + schedules refresh; `stop()` cancels scheduled refresh; `teardown()` clears in-memory state"
  - "EventXBridgeModule wires AuthManager: `init()` constructs it; `start()` starts it; `stop()` stops it; `teardown()` tears down"
  - "Auth status surface via HealthBus: logged in → `'healthy'`, refresh failure → `'warning'`, not logged in → `'unknown'`"
  - "AuthManager throws clear errors on missing Supabase URL / anon key; surfaces via UI panel error display (B002-008)"
  - "Tests cover: login happy path; logout clears state; refresh-token persisted across module restart; expiry refresh triggers refresh; refresh failure escalates; migration from BridgeX session file"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test src/modules/eventx-bridge/tests/unit/auth` passes ≥12 tests"
---

## Context

BridgeX 0.3.x has an `AuthManager` (`apps/bridgex-app/src/main/auth-manager.ts`, 162 LOC) that handles Supabase email/password login + token refresh + `safeStorage`-encrypted refresh-token persistence at `userData/bridgex-session.enc`. The token refresh is the linchpin of long-running BridgeX sessions: tokens expire after ~1h, so the manager schedules a refresh 60s before expiry and broadcasts the new access token to subscribers (`EventRuntime.updateAccessToken`).

Per Q23 ruling (open questions doc), AuthManager stays **module-local** in EventX Bridge for now. Cloud Sync module (ShowX-3+, Q3 2027) will absorb auth and migrate AuthManager into shared `Identity` service. For ShowX 0.5 we duplicate auth UX in the module — accepted trade-off for 9-12 month bridge period.

This task ports the BridgeX AuthManager into the module, wires it to the shell's SecretStore (replacing `safeStorage`), and connects token refresh to `SupabaseSubscriber.updateAccessToken` from B002-005.

## Implementation notes

### Types

```ts
// src/modules/eventx-bridge/src/auth/types.ts
export interface SessionInfo {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;  // unix epoch seconds
}

export interface AuthSnapshot {
  authenticated: boolean;
  email?: string;
  expiresAt?: number;
}

export type TokenRefreshHandler = (newAccessToken: string) => void | Promise<void>;

export interface AuthError extends Error {
  code: 'invalid_credentials' | 'network' | 'unauthorized' | 'unknown';
}
```

### AuthManager class

```ts
// src/modules/eventx-bridge/src/auth/AuthManager.ts
import type { ModuleContext } from 'showx-shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionInfo, AuthSnapshot, TokenRefreshHandler } from './types.js';

const REFRESH_BEFORE_EXPIRY_MS = 60_000;
const SECRET_KEY_REFRESH = 'auth.refresh-token';
const SECRET_KEY_SESSION = 'auth.session-info';  // JSON-stringified SessionInfo (minus refresh)

export class AuthManager {
  private session: SessionInfo | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribers = new Set<TokenRefreshHandler>();

  constructor(
    private ctx: ModuleContext,
    private supabase: SupabaseClient,
  ) {}

  async start(): Promise<void> {
    // Try to restore from SecretStore
    const refreshToken = await this.ctx.secrets.get(SECRET_KEY_REFRESH);
    if (!refreshToken) {
      this.ctx.log.info('no persisted session');
      this.ctx.health.report(this.ctx.slug, 'unknown', 'not logged in');
      return;
    }
    try {
      const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) throw error ?? new Error('no session in refresh response');
      await this.applySession(data.session as any);
    } catch (err) {
      this.ctx.log.error('session restore failed', { err: String(err) });
      await this.clearPersistedSession();
      this.ctx.health.report(this.ctx.slug, 'warning', 'session expired — re-login needed');
    }
  }

  async login(email: string, password: string): Promise<AuthSnapshot> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const e: any = new Error(error.message);
      e.code = error.status === 400 ? 'invalid_credentials' : 'unknown';
      throw e;
    }
    if (!data.session) throw new Error('no session in login response');
    await this.applySession(data.session as any);
    return this.snapshot();
  }

  async logout(): Promise<void> {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    await this.supabase.auth.signOut().catch(() => {});
    await this.clearPersistedSession();
    this.session = null;
    this.ctx.health.report(this.ctx.slug, 'unknown', 'logged out');
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
  }

  async teardown(): Promise<void> {
    await this.stop();
    this.subscribers.clear();
    this.session = null;
  }

  subscribe(handler: TokenRefreshHandler): { unsubscribe(): void } {
    this.subscribers.add(handler);
    return { unsubscribe: () => this.subscribers.delete(handler) };
  }

  async getCurrentToken(): Promise<string | null> {
    return this.session?.accessToken ?? null;
  }

  snapshot(): AuthSnapshot {
    if (!this.session) return { authenticated: false };
    return {
      authenticated: true,
      email: this.session.email,
      expiresAt: this.session.expiresAt,
    };
  }

  private async applySession(supSession: {
    access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string };
  }): Promise<void> {
    this.session = {
      userId: supSession.user.id,
      email: supSession.user.email ?? '',
      accessToken: supSession.access_token,
      refreshToken: supSession.refresh_token,
      expiresAt: supSession.expires_at,
    };
    await this.ctx.secrets.set(SECRET_KEY_REFRESH, this.session.refreshToken);
    await this.ctx.secrets.set(SECRET_KEY_SESSION, JSON.stringify({
      userId: this.session.userId, email: this.session.email, expiresAt: this.session.expiresAt,
    }));
    this.scheduleRefresh();
    this.ctx.health.report(this.ctx.slug, 'healthy', `authenticated as ${this.session.email}`);
    // Notify subscribers of access token (SupabaseSubscriber will call setAuth)
    for (const handler of this.subscribers) {
      try { await handler(this.session.accessToken); } catch (err) {
        this.ctx.log.warn('subscriber threw on token refresh', { err: String(err) });
      }
    }
  }

  private scheduleRefresh(): void {
    if (!this.session) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const expiresInMs = this.session.expiresAt * 1000 - Date.now();
    const refreshIn = Math.max(0, expiresInMs - REFRESH_BEFORE_EXPIRY_MS);
    this.ctx.log.info('scheduling token refresh', { refreshInMs: refreshIn });
    this.refreshTimer = setTimeout(async () => {
      try {
        if (!this.session) return;
        const { data, error } = await this.supabase.auth.refreshSession({
          refresh_token: this.session.refreshToken,
        });
        if (error || !data.session) throw error ?? new Error('no session');
        await this.applySession(data.session as any);
      } catch (err) {
        this.ctx.log.error('token refresh failed', { err: String(err) });
        this.ctx.health.report(this.ctx.slug, 'warning', 'token refresh failed');
        // Retry once in 30s, then give up and require re-login
        this.refreshTimer = setTimeout(() => this.scheduleRefresh(), 30_000);
      }
    }, refreshIn);
  }

  private async clearPersistedSession(): Promise<void> {
    await this.ctx.secrets.delete(SECRET_KEY_REFRESH).catch(() => {});
    await this.ctx.secrets.delete(SECRET_KEY_SESSION).catch(() => {});
  }
}
```

### Migration from BridgeX 0.3.x session file

```ts
// src/modules/eventx-bridge/src/auth/migrate-from-bridgex.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ModuleContext } from 'showx-shared';

const BRIDGEX_SESSION_PATH = path.join(
  os.homedir(),
  'Library/Application Support/bridgex',
  'bridgex-session.enc',
);

/**
 * Detects a BridgeX 0.3.x session file and imports the refresh token
 * into ShowX SecretStore. Run once on first EventX Bridge module start
 * if no ShowX session already exists.
 *
 * Note: BridgeX 0.3.x uses Electron's `safeStorage.encryptString()` (OS keychain
 * + per-user key). ShowX SecretStore uses the same OS keychain via `keytar`
 * (B001-004). We CANNOT decrypt the BridgeX file from outside the BridgeX
 * process. The migration path is:
 *   1. BridgeX 0.3.x detect on first ShowX launch
 *   2. UI prompts user to "Import BridgeX session" → opens BridgeX side-by-side
 *      OR asks user to log in again to ShowX
 * For 0.5 internal release: simplest path is "re-login required" (no
 * cross-process decryption). Document this as known limitation.
 */
export async function migrateFromBridgex(ctx: ModuleContext): Promise<{ migrated: boolean; reason: string }> {
  try {
    const stat = await fs.stat(BRIDGEX_SESSION_PATH);
    if (!stat.isFile()) return { migrated: false, reason: 'no-bridgex-file' };
  } catch {
    return { migrated: false, reason: 'no-bridgex-file' };
  }
  // BridgeX session file present
  const existing = await ctx.secrets.get('auth.refresh-token');
  if (existing) return { migrated: false, reason: 'showx-session-already-present' };

  // Cannot decrypt cross-process. Surface a notification.
  ctx.log.info('BridgeX 0.3.x session file detected — re-login required to migrate auth');
  return { migrated: false, reason: 'requires-relogin' };
}
```

### IPC handlers

```ts
// src/modules/eventx-bridge/src/auth/auth-ipc.ts
import type { ModuleContext } from 'showx-shared';
import type { AuthManager } from './AuthManager.js';

export function registerAuthIpc(ctx: ModuleContext, auth: AuthManager): void {
  // ctx.registerIpc is expected from module loader; shell handles routing
  // by module slug. Channel names are prefixed with slug at the shell layer.
  // For ShowX 0.5: assume shell provides a `ctx.ipc.register(name, handler)`.
  // If not yet available, expose handlers via EventBus events that shell IPC bridge
  // listens to. Forge: check shell's IPC API surface; if minimal, simulate.
  const ipc = (ctx as any).ipc;  // typed in showx-shared follow-up if needed
  if (!ipc?.register) {
    ctx.log.warn('shell IPC not available — auth UI must use EventBus fallback');
    return;
  }
  ipc.register('auth:login', async (args: { email: string; password: string }) => auth.login(args.email, args.password));
  ipc.register('auth:logout', async () => auth.logout());
  ipc.register('auth:get-session', async () => auth.snapshot());
  ipc.register('auth:get-token', async () => auth.getCurrentToken());
}
```

If shell IPC isn't yet a `ctx` service (verify against B001-010 module-loader implementation), expose via the optional `manifest.menuItem` action OR via UI panel direct call from B002-008 (renderer→main IPC bridged at shell). Document the chosen path.

### EventXBridge module integration

```ts
// EventXBridge.ts (additions)
private authManager?: AuthManager;
private supabase?: SupabaseClient;

async init(ctx: ModuleContext): Promise<void> {
  // ... existing init logic
  this.ctx = ctx;
  this.config = await ctx.persisted.load(configSchema);

  // Construct Supabase client (URL/key from SecretStore or config)
  const url = (await ctx.secrets.get('supabase-url')) ?? this.config.supabaseUrl;
  const anonKey = (await ctx.secrets.get('supabase-anon-key')) ?? this.config.supabaseAnonKey;
  if (!url || !anonKey) {
    ctx.log.warn('Supabase URL/anonKey not configured — module will be degraded');
    return;
  }
  this.supabase = defaultSupabaseClientFactory.create({ url, anonKey });
  this.authManager = new AuthManager(ctx, this.supabase);
  // Wire token refresh → subscriber.updateAccessToken (deferred binding until subscriber exists)
  // Migration probe
  const migrationResult = await migrateFromBridgex(ctx);
  ctx.log.info('bridgex migration probe', migrationResult);
  // Register IPC
  registerAuthIpc(ctx, this.authManager);
}

async start(): Promise<void> {
  if (!this.authManager) {
    this.ctx?.log.warn('start without supabase — degraded mode');
    this.started = true;
    return;
  }
  await this.authManager.start();
  // Subscribe to token refresh — subscriber updates Realtime auth
  this.authManager.subscribe(async (newToken) => {
    if (this.subscriber) this.subscriber.updateAccessToken(newToken);
  });
  // Continue with subscriber + rule engine wiring (delegated to B002-005/006)
  // ...
  this.started = true;
}

async stop(): Promise<void> {
  if (this.authManager) await this.authManager.stop();
  // ... rest of stop logic
}

async teardown(): Promise<void> {
  if (this.authManager) await this.authManager.teardown();
  // ... rest of teardown
}
```

## Test plan

### `tests/unit/auth-manager.test.ts` (≥10 tests)

Use a mock SupabaseClient with controllable `auth.signInWithPassword`, `auth.refreshSession`, `auth.signOut`. Use fake timers for refresh scheduling.

1. `login(email, pw)` happy path → session saved to SecretStore, health reported `'healthy'`.
2. `login` invalid_credentials → throws with code `invalid_credentials`.
3. `logout` clears session + SecretStore.
4. `getCurrentToken` returns null when not logged in; returns access token when logged in.
5. `start()` with no persisted refresh token → no-op + health `'unknown'`.
6. `start()` with persisted refresh token → refreshSession called → session restored.
7. Token refresh scheduled 60s before expiry → after fake timer advance, refresh fires.
8. Refresh failure → health `'warning'`, retry scheduled in 30s.
9. Subscriber callback fired on session apply (login + refresh).
10. `teardown()` clears subscribers.

### `tests/unit/auth-migrate-bridgex.test.ts` (≥3 tests)

1. BridgeX file absent → `migrated: false, reason: 'no-bridgex-file'`.
2. BridgeX file present + existing ShowX session → `migrated: false, reason: 'showx-session-already-present'`.
3. BridgeX file present + no ShowX session → `migrated: false, reason: 'requires-relogin'` (cannot cross-process decrypt; log info).

### `tests/unit/auth-ipc.test.ts` (≥3 tests)

Mock the `ctx.ipc.register` interface; verify each of the 4 IPC handlers wires correctly + delegates to AuthManager.

## Out of scope

- Cloud Sync auth (ShowX-3+).
- Centralizing AuthManager into shell as `Identity` service (later — when Cloud Sync ships).
- Cross-process decryption of `bridgex-session.enc` (deferred — re-login is the migration path).
- UI panel login form (B002-008 — this task only wires backend + IPC).
- Token revocation server-side (Supabase handles).
- Multi-account support (one Supabase user per module instance; ShowX-3+ may revisit).

## Notes for Critic

- Verify SecretStore is module-namespaced — key `'auth.refresh-token'` is sandboxed under `eventx-bridge` slug; Cloud Sync (when it lands) gets its own namespace.
- Verify refresh timer schedules at `expires_at - 60s` not at `expires_at` directly.
- Verify token refresh failure does NOT immediately logout — retries once before giving up.
- Verify subscriber callback receives NEW access token (not old one).
- Verify `migrate-from-bridgex.ts` doesn't attempt to decrypt the BridgeX file (cross-process decryption forbidden); it should ONLY check file presence + log.
- Verify all SecretStore calls catch errors (keychain access can fail on OS dialog dismissal).
- Verify session JSON in SecretStore does NOT include access_token (we only persist refresh_token + non-secret metadata).
- Verify Q23 ruling honored: AuthManager file path is `src/modules/eventx-bridge/src/auth/`, NOT `src/main/shared/`.
