import { randomUUID } from 'node:crypto';
import type {
  HealthBus as HealthBusIface,
  HealthStatus,
  HealthSnapshot,
  Subscription,
} from 'showx-shared';
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

  // HealthBus interface doesn't expose observeAggregate; kept internal if needed by consumers
  observeAggregate(fn: AggregateHandler): Subscription {
    const id = randomUUID();
    this.aggregateHandlers.push({ id, fn });
    return {
      id,
      unsubscribe: () => {
        this.aggregateHandlers = this.aggregateHandlers.filter((h) => h.id !== id);
      },
    };
  }

  aggregate(): HealthStatus {
    let sawWarning = false;
    let sawHealthy = false;
    for (const snap of this.snapshots.values()) {
      if (snap.status === 'error') return 'error';
      if (snap.status === 'warning') sawWarning = true;
      if (snap.status === 'healthy') sawHealthy = true;
    }
    if (sawWarning) return 'warning';
    return sawHealthy ? 'healthy' : 'unknown';
  }

  snapshot(): HealthSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  private fanout(slug: string, snap: HealthSnapshot): void {
    const list = this.slugHandlers.get(slug);
    if (list) {
      for (const h of [...list]) this.safeCall(() => h.fn(snap));
    }
    const agg = this.aggregate();
    for (const h of [...this.aggregateHandlers]) this.safeCall(() => h.fn(agg));
  }

  private safeCall(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.log?.error('health observer threw', { error: String(err) });
    }
  }

  private removeSlugHandler(slug: string, id: string): void {
    const list = this.slugHandlers.get(slug);
    if (!list) return;
    this.slugHandlers.set(slug, list.filter((h) => h.id !== id));
  }
}
