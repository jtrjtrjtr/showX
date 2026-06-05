---
id: "B001-003"
title: "Logger + EventBus + HealthBus services"
type: "implementation"
estimated_size_lines: 350
priority: "P0"
depends_on: ["B001-002"]
target_files:
  - "src/main/src/shared/Logger.ts"
  - "src/main/src/shared/EventBus.ts"
  - "src/main/src/shared/HealthBus.ts"
  - "src/main/src/shared/index.ts"
  - "src/main/package.json"
  - "tests/unit/shared/Logger.test.ts"
  - "tests/unit/shared/EventBus.test.ts"
  - "tests/unit/shared/HealthBus.test.ts"
acceptance_criteria:
  - "`Logger` implements `Logger` interface from `showx-shared`; supports debug/info/warn/error + `child(suffix)`; auto-prefixes `[<slug>]` when constructed via `forSlug(slug)`"
  - "Logger writes structured JSON lines (one per call) to a configurable Writable stream; defaults to process.stdout in dev"
  - "Logger respects `LOG_LEVEL` env (debug/info/warn/error); messages below level dropped before serialization"
  - "`EventBus` implements `EventBus` interface; supports exact-type subscribe, array of types, `'*'` wildcard, and `subscribePattern('cue:*')` glob"
  - "EventBus.publish is synchronous; handler exceptions logged but never crash publisher"
  - "EventBus subscribe returns `Subscription` with idempotent `unsubscribe()`"
  - "`HealthBus` tracks per-slug status; emits `health-changed` ShowxEvent on transition; `aggregate()` follows error > warning > healthy > unknown reduction"
  - "All three services tested with vitest fake timers + no real I/O; ≥18 test cases total across three files"
  - "`pnpm --filter showx-main typecheck` passes"
  - "`pnpm vitest run tests/unit/shared` passes 100%"
---

## Context

These three services form the **observability backbone** of the ShowX shell. Every other service (B001-004 PersistedStore, B001-005 AssetServer, B001-006 SyncBroker, B001-007 OutputDispatcher) writes through Logger, publishes through EventBus, and reports to HealthBus. Module loader (B001-010) depends on all three. They must be implemented before the rest of the bundle and they must be correct — bugs here propagate everywhere.

The implementations stay deliberately minimal: no async machinery, no external dependencies (besides `showx-shared` types). EventBus is in-process sync, Logger writes to stdout/file by line, HealthBus is an in-memory map with subscribers. Fancy features (transport-level fanout, log rotation, persistent health history) belong to later bundles.

## Implementation notes

### Package deps to add to `src/main/package.json`

```json
{
  "dependencies": {
    "showx-shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^1.3.0",
    "typescript": "^5.4.0"
  }
}
```

No external runtime deps in this task — Logger writes via Node's built-in `fs.createWriteStream` if a file path is given.

### `src/main/src/shared/Logger.ts`

Concrete `Logger` class implementing `Logger` interface from showx-shared. Signature sketch:

```ts
import { createWriteStream, type WriteStream } from 'node:fs';
import type { Logger as LoggerIface } from 'showx-shared';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface LoggerOptions {
  level?: LogLevel;          // default read from env LOG_LEVEL, fallback 'info'
  prefix?: string;           // module slug; injected into every line
  output?: NodeJS.WritableStream;  // default process.stdout
  filePath?: string;         // if set, also tee to this file
  now?: () => number;        // injectable for tests
}

export class Logger implements LoggerIface {
  private readonly level: LogLevel;
  private readonly prefix?: string;
  private readonly out: NodeJS.WritableStream;
  private readonly fileOut?: WriteStream;
  private readonly now: () => number;

  constructor(opts: LoggerOptions = {}) { /* ... */ }

  static forSlug(slug: string, opts: LoggerOptions = {}): Logger {
    return new Logger({ ...opts, prefix: slug });
  }

  child(suffix: string): Logger {
    const nextPrefix = this.prefix ? `${this.prefix}:${suffix}` : suffix;
    return new Logger({ level: this.level, prefix: nextPrefix, output: this.out, now: this.now });
  }

  debug(msg: string, meta?: Record<string, unknown>) { this.emit('debug', msg, meta); }
  info(msg: string, meta?: Record<string, unknown>)  { this.emit('info',  msg, meta); }
  warn(msg: string, meta?: Record<string, unknown>)  { this.emit('warn',  msg, meta); }
  error(msg: string, meta?: Record<string, unknown>) { this.emit('error', msg, meta); }

  private emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return;
    const line = JSON.stringify({
      ts: this.now(),
      level,
      prefix: this.prefix,
      msg,
      ...(meta ? { meta } : {}),
    }) + '\n';
    this.out.write(line);
    this.fileOut?.write(line);
  }

  close(): void { this.fileOut?.end(); }
}
```

Behavior to nail:
- Constructor reads `process.env.LOG_LEVEL` (lowercased) if `opts.level` not set; default `'info'`.
- When `filePath` is set, open with `createWriteStream(filePath, { flags: 'a' })`. Don't crash if dir missing — log a single warning to stdout and continue without file output.
- `now()` injectable so tests can use `vi.useFakeTimers()` + a fixed clock.
- `child(suffix)`: chain prefix with `:`; reuse same output stream + level + clock.

### `src/main/src/shared/EventBus.ts`

```ts
import type { EventBus as EventBusIface, ShowxEvent, Subscription } from 'showx-shared';
import { randomUUID } from 'node:crypto';
import type { Logger } from './Logger.js';

type Handler = (e: ShowxEvent) => void;

interface HandlerEntry {
  id: string;
  matcher: (e: ShowxEvent) => boolean;
  fn: Handler;
}

export class EventBus implements EventBusIface {
  private handlers: HandlerEntry[] = [];

  constructor(private readonly log?: Logger) {}

  publish(event: ShowxEvent): void {
    for (const h of this.handlers) {
      if (!h.matcher(event)) continue;
      try {
        h.fn(event);
      } catch (err) {
        this.log?.error('event handler threw', { eventType: event.type, error: String(err) });
      }
    }
  }

  subscribe(typeOrTypes: ShowxEvent['type'] | ShowxEvent['type'][] | '*', fn: Handler): Subscription {
    const matcher: (e: ShowxEvent) => boolean =
      typeOrTypes === '*'
        ? () => true
        : Array.isArray(typeOrTypes)
          ? (e) => typeOrTypes.includes(e.type)
          : (e) => e.type === typeOrTypes;
    return this.register(matcher, fn);
  }

  subscribePattern(pattern: string, fn: Handler): Subscription {
    const regex = globToRegex(pattern);
    return this.register((e) => regex.test(e.type), fn);
  }

  private register(matcher: (e: ShowxEvent) => boolean, fn: Handler): Subscription {
    const id = randomUUID();
    this.handlers.push({ id, matcher, fn });
    return {
      id,
      unsubscribe: () => {
        this.handlers = this.handlers.filter((h) => h.id !== id);
      },
    };
  }
}

function globToRegex(glob: string): RegExp {
  // 'cue:*' → /^cue:[^:]*$/
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '[^:]*') + '$');
}
```

Critical behavior:
- `publish` is synchronous; handlers called in registration order.
- Handler exception is swallowed (logged via Logger if provided) — publisher never sees throw.
- `unsubscribe()` is idempotent — calling twice is fine; second call no-op.
- `subscribePattern('cue:*')` matches `'cue-fired'` and `'cue-catalog-updated'`? Decision: spec types use kebab (`cue-fired`), not colon — adjust glob to also accept hyphen variant: `'cue*'` matches both. Forge: implement `*` as `.*` non-greedy (escape special regex chars except `*`); document trade-off in inline comment. The pattern matching is permissive on purpose — power-user only.

### `src/main/src/shared/HealthBus.ts`

```ts
import type {
  HealthBus as HealthBusIface, HealthStatus, HealthSnapshot, Subscription,
} from 'showx-shared';
import { randomUUID } from 'node:crypto';
import type { EventBus } from './EventBus.js';
import type { Logger } from './Logger.js';

type SlugHandler = (snap: HealthSnapshot) => void;
type AggregateHandler = (status: HealthStatus) => void;

export class HealthBus implements HealthBusIface {
  private snapshots = new Map<string, HealthSnapshot>();
  private slugHandlers = new Map<string, Array<{ id: string; fn: SlugHandler }>>();
  private aggregateHandlers: Array<{ id: string; fn: AggregateHandler }> = [];

  constructor(
    private readonly events?: EventBus,
    private readonly log?: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  report(slug: string, status: HealthStatus, detail?: string): void {
    const prev = this.snapshots.get(slug);
    if (prev && prev.status === status && prev.detail === detail) return;
    const snap: HealthSnapshot = { slug, status, detail, updatedAt: this.now() };
    this.snapshots.set(slug, snap);
    this.fanout(slug, snap);
    this.events?.publish({ type: 'health-changed', slug, status, detail });
  }

  observe(slug: string, fn: SlugHandler): Subscription {
    const list = this.slugHandlers.get(slug) ?? [];
    const id = randomUUID();
    list.push({ id, fn });
    this.slugHandlers.set(slug, list);
    return { id, unsubscribe: () => this.removeSlugHandler(slug, id) };
  }

  observeAggregate(fn: AggregateHandler): Subscription {
    const id = randomUUID();
    this.aggregateHandlers.push({ id, fn });
    return { id, unsubscribe: () => {
      this.aggregateHandlers = this.aggregateHandlers.filter((h) => h.id !== id);
    }};
  }

  aggregate(): HealthStatus {
    let result: HealthStatus = 'unknown';
    let sawHealthy = false;
    for (const snap of this.snapshots.values()) {
      if (snap.status === 'error') return 'error';
      if (snap.status === 'warning') result = 'warning';
      if (snap.status === 'healthy') sawHealthy = true;
    }
    if (result === 'warning') return 'warning';
    return sawHealthy ? 'healthy' : 'unknown';
  }

  snapshot(): HealthSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  private fanout(slug: string, snap: HealthSnapshot): void {
    const list = this.slugHandlers.get(slug);
    if (list) for (const h of list) this.safeCall(() => h.fn(snap));
    const agg = this.aggregate();
    for (const h of this.aggregateHandlers) this.safeCall(() => h.fn(agg));
  }

  private safeCall(fn: () => void) {
    try { fn(); } catch (err) {
      this.log?.error('health observer threw', { error: String(err) });
    }
  }

  private removeSlugHandler(slug: string, id: string) {
    const list = this.slugHandlers.get(slug);
    if (!list) return;
    this.slugHandlers.set(slug, list.filter((h) => h.id !== id));
  }
}
```

Critical behavior:
- `report()` debounces no-op transitions (same status + detail → no emit, no event).
- Reduction rule: ANY error → error; else ANY warning → warning; else if anything healthy → healthy; else unknown. (Matches loader spec §10.2.)
- Aggregate handler fires on EVERY report that changes any slug, regardless of whether aggregate value changed. (Simple; refinement to fire only on aggregate transition is fine if Forge documents in code comment.)

### `src/main/src/shared/index.ts`

Barrel re-export:

```ts
export { Logger } from './Logger.js';
export { EventBus } from './EventBus.js';
export { HealthBus } from './HealthBus.js';
```

## Test plan

### `tests/unit/shared/Logger.test.ts` (≥6 cases)

Use a `PassThrough` from `node:stream` to capture output. `vi.useFakeTimers()` + `vi.setSystemTime()` for deterministic `ts`.

- `info()` writes a JSON line with correct shape `{ts, level: 'info', prefix, msg}`.
- `debug()` below default `info` level is dropped (zero writes).
- `LOG_LEVEL=debug` env override emits debug.
- `child('osc')` chains prefix: `forSlug('eventx-bridge').child('osc')` → prefix `'eventx-bridge:osc'`.
- `meta` arg merged into JSON output under `meta` key.
- Handler attached to a closed file stream doesn't throw (graceful — Forge: catch the EBADF and warn once to stdout).

### `tests/unit/shared/EventBus.test.ts` (≥7 cases)

- `subscribe('cue-fired', h)` + `publish({type:'cue-fired', ...})` invokes h once.
- `subscribe(['cue-fired', 'health-changed'], h)` matches both types.
- `subscribe('*', h)` matches every event type.
- `subscribePattern('cue*', h)` matches `cue-fired` + `cue-catalog-updated`, NOT `health-changed`.
- `unsubscribe()` removes handler; subsequent publishes don't invoke.
- Handler that throws is swallowed; other handlers still called; logger receives error.
- Two unsubscribe calls on same Subscription are safe (idempotent).

### `tests/unit/shared/HealthBus.test.ts` (≥5 cases)

- `report('m1', 'healthy')` → `aggregate() === 'healthy'`.
- Two modules: one `error`, one `healthy` → `aggregate() === 'error'`.
- `report('m1', 'warning')`, no errors → `aggregate() === 'warning'`.
- Empty → `aggregate() === 'unknown'`.
- Same-state re-report is no-op (no fanout, no event emitted). Use EventBus spy.
- `observe('m1', h)` fires on transition; `unsubscribe()` stops it.
- `report` publishes `health-changed` event via injected EventBus.

Use `vi.useFakeTimers()` so `updatedAt` is deterministic.

## Out of scope

- Log rotation, file size caps (later — Mechanic territory in production).
- Async event bus / persistent event queue (in-process sync only for MVP).
- Persistent health history beyond current snapshot (future telemetry hook).
- Transport-level fanout for events (e.g. forwarding to renderer via IPC) — that lives in `src/main/ipc/` written in B001-011.
- Aggregate-handler "fire only on transition" optimization (current spec fires on every report change; refine later if profile shows churn).
- Pattern subscribe with multiple wildcards or character classes (`?`, `[abc]`) — only `*` for MVP.

## Notes for Critic

- Verify Logger output is valid JSON line-by-line (one `JSON.parse()` per line should succeed). Critic should run a test where multiple writes happen and parse each line.
- EventBus subscribe order: ensure handlers fire in registration order (not reverse). Critic: add a test if missing.
- HealthBus reduction precedence: write a 4-module test (`error`, `warning`, `healthy`, `unknown`) and confirm result is `error`. Same for 3-module no-error case → `warning`.
- `Subscription.id` is a string and is set (not undefined). Used later by ModuleRegistry for diagnostics.
- No `console.log` calls anywhere — all logging through Logger.
- `randomUUID` import works in Node 20+; ShowX targets Electron's Node bundled version (verify Electron 28+ ships Node 20+). Critic: if doubts, suggest `crypto.randomBytes(16).toString('hex')` fallback.
- All three classes are stateless across constructions (no module-level state). Verify by instantiating two HealthBus instances in a test — reports to one don't leak to the other.
