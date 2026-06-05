---
id: "B002-005"
title: "Supabase subscriber + reconnect logic (postgres_changes Realtime)"
type: "implementation"
estimated_size_lines: 600
priority: "P0"
depends_on: ["B002-003"]
target_files:
  - "src/modules/eventx-bridge/src/SupabaseSubscriber.ts"
  - "src/modules/eventx-bridge/src/SupabaseClientFactory.ts"
  - "src/modules/eventx-bridge/src/EventRuntime.ts"
  - "src/modules/eventx-bridge/src/types.ts"
  - "src/modules/eventx-bridge/tests/unit/supabase-subscriber.test.ts"
  - "src/modules/eventx-bridge/tests/unit/supabase-reconnect.test.ts"
  - "src/modules/eventx-bridge/tests/integration/realtime-channel.test.ts"
acceptance_criteria:
  - "`SupabaseSubscriber` class encapsulates the Realtime channel `bridgex-activity-<eventId>` + 4 postgres_changes filters from parity contract §6.1 #6 (submissions INSERT, activity_sessions *, show_control_triggers INSERT WHERE event_id=eq.<eventId>, aggregations *)"
  - "Subscriber emits typed events on row arrival; EventRuntime consumes via callback handler (not EventBus — these are module-internal high-volume flows)"
  - "Reconnect logic: exponential backoff 1s → 2s → 4s → 8s → 16s → 30s (cap at 30s) per parity §6.1 #39; max attempts unbounded (Supabase Realtime ALWAYS retries until shutdown); each attempt logs at `info`, repeated failures bump health to `'warning'`"
  - "Supabase client created via `SupabaseClientFactory` factory taking `(url, anonKey, accessToken?)` — injected, NOT read from `process.env`; URL/key sourced from `ctx.secrets.get('supabase-url')` / `ctx.secrets.get('supabase-anon-key')` (set during auth flow in B002-007) or fallback from `ctx.persisted` config"
  - "`updateAccessToken(token)` calls `supabase.realtime.setAuth(token)` per parity §6.1 #43 — client NOT recreated; channels NOT re-subscribed; preserves existing subscriptions through token refresh"
  - "Subscriber lifecycle: `start(eventId)` opens channel; `stop()` removes channel; double-start is no-op + warning; double-stop is silent; `teardown()` releases everything"
  - "Channel state change events (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) logged per parity §6.1 #7: `[event-runtime] activity channel: <status>`"
  - "Row enrichment helpers (`enrichSubmissionRow`, `enrichActivitySessionRow`, `enrichAggregationRow`) per parity §6.1 #8-10 — runtime can drop rows when SessionTracker lookup fails"
  - "AbortSignal integration: `ctx.abortSignal` aborts in-flight Supabase calls + halts reconnect loop"
  - "Unit tests cover: happy-path subscribe → row arrival → callback fired; auth refresh while connected; reconnect on simulated socket drop with correct backoff timing (use fake timers); abort signal during reconnect halts loop"
  - "Integration test uses `@supabase/supabase-js` against a local Supabase project (skipped in CI unless `SUPABASE_TEST_URL` env present) to validate real channel subscription"
  - "`pnpm --filter @showx/module-eventx-bridge typecheck` passes"
  - "`pnpm --filter @showx/module-eventx-bridge test src/modules/eventx-bridge/tests/unit/supabase` passes"
---

## Context

EventX Bridge subscribes to Supabase `postgres_changes` on four tables. BridgeX 0.3.x has this logic in `bridgex/src/event-runtime.ts` lines 298-335. ShowX-2 splits it into a dedicated `SupabaseSubscriber` class for testability and to keep `EventRuntime` focused on event dispatch routing.

The subscriber owns:
- Realtime channel lifecycle (open / close / reconnect)
- Row arrival → callback delegation
- Auth token refresh propagation
- Health reporting on connection state

Per Q23 ruling (open questions doc), Supabase auth manager STAYS module-local for now (not shell-shared). The `SupabaseClientFactory` is a small abstraction that lets tests inject a mock client and B002-007's AuthManager inject token refresh hooks.

This task is **module-local** by design — only EventX Bridge needs Supabase. Cloud Sync module (ShowX-3+) will get its own client; we explicitly do NOT shellify the Supabase dependency now.

## Implementation notes

### SupabaseClientFactory

```ts
// src/modules/eventx-bridge/src/SupabaseClientFactory.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
  accessToken?: string;
}

export interface SupabaseClientFactory {
  create(config: SupabaseClientConfig): SupabaseClient;
}

export const defaultSupabaseClientFactory: SupabaseClientFactory = {
  create({ url, anonKey, accessToken }) {
    return createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,  // auth manager handles refresh (B002-007)
        persistSession: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,    // matches BridgeX 0.3.x default
        },
      },
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    });
  },
};
```

Tests inject a mock factory that returns a stub `SupabaseClient` with controllable `.channel()`, `.realtime.setAuth()`, `.removeChannel()`.

### SupabaseSubscriber class

```ts
// src/modules/eventx-bridge/src/SupabaseSubscriber.ts
import type { ModuleContext } from 'showx-shared';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type {
  SubmissionRow, ActivitySessionRow, ShowControlTriggerRow,
  AggregationRow,
} from './types.js';

export interface SubscriberHandlers {
  onSubmission: (row: SubmissionRow) => void;
  onActivitySession: (row: ActivitySessionRow, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  onShowControlTrigger: (row: ShowControlTriggerRow) => void;
  onAggregation: (row: AggregationRow, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
}

const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export class SupabaseSubscriber {
  private channel: RealtimeChannel | null = null;
  private currentEventId: string | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private ctx: ModuleContext,
    private supabase: SupabaseClient,
    private handlers: SubscriberHandlers,
  ) {}

  async start(eventId: string): Promise<void> {
    if (this.currentEventId === eventId && this.channel) {
      this.ctx.log.warn('start() called twice with same eventId — idempotent no-op');
      return;
    }
    if (this.channel) await this.stop();
    this.currentEventId = eventId;
    this.stopped = false;
    this.reconnectAttempt = 0;
    await this.openChannel(eventId);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.currentEventId = null;
  }

  updateAccessToken(newToken: string): void {
    // Per parity §6.1 #43: setAuth, no recreate
    this.supabase.realtime.setAuth(newToken);
    this.ctx.log.info('access token refreshed');
  }

  private async openChannel(eventId: string): Promise<void> {
    const channel = this.supabase
      .channel(`bridgex-activity-${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, (payload) => {
        this.handlers.onSubmission(payload.new as SubmissionRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_sessions' }, (payload) => {
        this.handlers.onActivitySession(payload.new as ActivitySessionRow, payload.eventType as any);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'show_control_triggers',
        filter: `event_id=eq.${eventId}`,
      }, (payload) => {
        this.handlers.onShowControlTrigger(payload.new as ShowControlTriggerRow);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aggregations' }, (payload) => {
        this.handlers.onAggregation(payload.new as AggregationRow, payload.eventType as any);
      });

    channel.subscribe((status) => {
      this.ctx.log.info(`activity channel: ${status}`);
      if (status === 'SUBSCRIBED') {
        this.reconnectAttempt = 0;
        this.ctx.health.report(this.ctx.slug, 'healthy', 'realtime subscribed');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!this.stopped) this.scheduleReconnect(eventId);
      }
    });

    this.channel = channel;
  }

  private scheduleReconnect(eventId: string): void {
    if (this.stopped) return;
    const idx = Math.min(this.reconnectAttempt, BACKOFF_SCHEDULE_MS.length - 1);
    const delay = BACKOFF_SCHEDULE_MS[idx];
    this.reconnectAttempt++;
    this.ctx.health.report(this.ctx.slug, 'warning', `reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.ctx.log.warn(`scheduling reconnect attempt ${this.reconnectAttempt} in ${delay}ms`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.stopped) return;
      try {
        if (this.channel) await this.supabase.removeChannel(this.channel);
        await this.openChannel(eventId);
      } catch (err) {
        this.ctx.log.error('reconnect failed', { err: String(err) });
        this.scheduleReconnect(eventId);
      }
    }, delay);
  }
}
```

### EventRuntime integration

EventRuntime composes SupabaseSubscriber + AdapterRegistry + SessionTracker + handlers:

```ts
async start(eventId: string): Promise<void> {
  await this.loadEventTopology(eventId);
  await this.loadOutputsAndMappings(eventId);
  await this.subscriber.start(eventId);
  this.healthReporter.start();
  this.periodicPush.start();
}

async stop(): Promise<void> {
  this.periodicPush.stop();
  this.healthReporter.stop();
  await this.subscriber.stop();
  await this.adapterRegistry.releaseAll();
  this.sessionTracker.clear();
}
```

Subscriber handlers wire to existing port from B002-003:

```ts
const handlers: SubscriberHandlers = {
  onSubmission: (row) => {
    const enriched = this.enrichSubmissionRow(row);
    if (!enriched) return;  // parity §6.1 #8
    this.routeSubmission(enriched);  // routing matrix per parity #12
  },
  onActivitySession: (row, type) => {
    const enriched = this.enrichActivitySessionRow(row);
    if (!enriched) return;
    this.controlHandler.handleSession(enriched);
    if (row.status === 'live') this.sessionTracker.add(row);
    else if (row.status === 'ended') this.sessionTracker.remove(row);
  },
  onShowControlTrigger: (row) => {
    this.showControlHandler.handleTrigger(row);
  },
  onAggregation: (row, type) => {
    const enriched = this.enrichAggregationRow(row);
    if (!enriched) return;
    this.sensorStreamHandler.handleAggregation(enriched);
  },
};
```

### Where credentials come from

Three sources, in priority order:
1. `ctx.secrets.get('supabase-anon-key')` — set by AuthManager (B002-007) after Supabase login
2. `ctx.secrets.get('supabase-url')` — same
3. Fallback to `ctx.persisted.load(configSchema)` — `supabaseUrl` / `supabaseAnonKey` fields added to schema (B002-006 extends schema)

If neither source has values, `EventRuntime.start(eventId)` throws with `'Supabase credentials not configured — log in via EventX Bridge panel'`. The shell HealthBus surfaces this as `'error'`.

For ShowX 0.5 internal: bake URL+anonKey via env via build process (`SHOWX_EVENTX_SUPABASE_URL`, `SHOWX_EVENTX_SUPABASE_ANON_KEY`) at app launch by AuthManager copying to SecretStore — matches BridgeX 0.3.x pattern.

### Fake timers for reconnect tests

Reconnect tests use Vitest fake timers:

```ts
import { vi } from 'vitest';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('reconnect backoff 1→2→4→8→16→30→30s', async () => {
  // simulate CHANNEL_ERROR 6 times
  // assert reconnect timer scheduled at each delay
  // verify cap at 30s on attempt 6+
});
```

### AbortSignal handling

```ts
this.ctx.abortSignal.addEventListener('abort', () => {
  this.stopped = true;
  if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  if (this.channel) this.supabase.removeChannel(this.channel).catch(() => {});
});
```

## Test plan

### `tests/unit/supabase-subscriber.test.ts` (≥10 tests)

1. `start(eventId)` calls `supabase.channel('bridgex-activity-<eventId>')`.
2. `start` registers 4 postgres_changes handlers (submissions/activity_sessions/show_control_triggers/aggregations).
3. show_control_triggers filter is `event_id=eq.<eventId>`.
4. Channel SUBSCRIBED → health reported `'healthy'`.
5. Channel SUBSCRIBED → log `[event-runtime] activity channel: SUBSCRIBED`.
6. Row arrival fires correct handler (submission → onSubmission, etc.).
7. `stop()` calls `supabase.removeChannel`.
8. `start(sameEventId)` after start = idempotent (warning logged).
9. `start(newEventId)` after start = closes old channel, opens new.
10. `teardown()` clears timer + channel.

### `tests/unit/supabase-reconnect.test.ts` (≥8 tests)

1. CHANNEL_ERROR → reconnect scheduled at 1s.
2. After 2nd error → reconnect at 2s.
3. After 3rd error → 4s. 4th → 8s. 5th → 16s. 6th → 30s. 7th → 30s (cap).
4. SUBSCRIBED resets reconnectAttempt to 0.
5. `stop()` mid-reconnect → timer cleared, no reconnect fires.
6. AbortSignal triggers → timer cleared.
7. `updateAccessToken(token)` → `supabase.realtime.setAuth(token)` called, channel NOT recreated, reconnect attempt counter unchanged.
8. Reconnect failure logs error + reschedules.

### `tests/integration/realtime-channel.test.ts` (≥3 tests, gated by env)

Run only if `SUPABASE_TEST_URL` + `SUPABASE_TEST_ANON_KEY` env vars present (skipped in CI default):

1. Real channel SUBSCRIBED against test Supabase project.
2. Insert a row into a test table → handler fires.
3. Disconnect network briefly → reconnect succeeds.

## Out of scope

- Auth manager implementation (B002-007).
- Rule engine + event_bridge_outputs Zod schema (B002-006) — types defined in B002-003.
- UI panel (B002-008).
- Health upsert to `bridge_health` table — that's HealthReporter from B002-003.
- Periodic state push — that's PeriodicStatePush from B002-003.
- Loading outputs + mappings + topology — that's EventRuntime's responsibility (already ported in B002-003).
- Migrating BridgeX 0.3.x token storage (`bridgex-session.enc`) — B002-007.
- Cloud Sync module (different concern entirely).

## Notes for Critic

- Verify reconnect backoff schedule MATCHES parity §6.1 #39: `[1, 2, 4, 8, 16, 30]` seconds, cap 30s.
- Verify `setAuth` is called, NOT `createClient` again — Supabase client preserved through token refresh (parity §6.1 #43).
- Verify show_control_triggers filter is `event_id=eq.<eventId>` (the other three tables have NO filter — enrichment is local per parity §6.1 #6, #8-10).
- Verify status log line format: `[event-runtime] activity channel: <status>` (parity #7).
- Check fake-timer reconnect tests actually advance time, not just call `next()`.
- Verify `stop()` clears reconnect timer (not just removes channel).
- Verify no `process.env.SUPABASE_*` reads inside `SupabaseSubscriber` (it's all injected).
- Confirm SubscriberHandlers callback shape matches BridgeX 0.3.x event-runtime.ts handler signatures — port should preserve every flag (`eventType`, payload shape).
