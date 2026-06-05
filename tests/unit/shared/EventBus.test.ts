import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../../src/main/src/shared/EventBus.js';
import { PassThrough } from 'node:stream';
import { Logger } from '../../../src/main/src/shared/Logger.js';
import type { CueFiredEvent, HealthChangedEvent, CueCatalogUpdatedEvent } from 'showx-shared';

function cueFired(id = 'c1'): CueFiredEvent {
  return { type: 'cue-fired', showId: 's1', cueId: id, firedAt: 0, origin: 'test' };
}

function healthChanged(slug = 'm1'): HealthChangedEvent {
  return { type: 'health-changed', slug, status: 'healthy' };
}

describe('EventBus', () => {
  it('subscribe(type) + publish invokes handler once', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.subscribe('cue-fired', h);
    bus.publish(cueFired());
    expect(h).toHaveBeenCalledTimes(1);
    expect(h.mock.calls[0]![0].type).toBe('cue-fired');
  });

  it('subscribe([type1, type2]) matches both types', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.subscribe(['cue-fired', 'health-changed'], h);
    bus.publish(cueFired());
    bus.publish(healthChanged());
    expect(h).toHaveBeenCalledTimes(2);
  });

  it('subscribe("*") matches every event type', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.subscribe('*', h);
    bus.publish(cueFired());
    bus.publish(healthChanged());
    bus.publish({ type: 'module-state-changed', slug: 'm', prev: 'stopped', next: 'started', at: 0 });
    expect(h).toHaveBeenCalledTimes(3);
  });

  it('subscribePattern("cue*") matches cue-fired and cue-catalog-updated but not health-changed', () => {
    const bus = new EventBus();
    const h = vi.fn();
    bus.subscribePattern('cue*', h);
    bus.publish(cueFired());
    const catalogEvent: CueCatalogUpdatedEvent = {
      type: 'cue-catalog-updated',
      showId: 's1',
      catalog: { showId: 's1', version: 1, cues: [] },
    };
    bus.publish(catalogEvent);
    bus.publish(healthChanged());
    expect(h).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe() stops subsequent publishes from reaching handler', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const sub = bus.subscribe('cue-fired', h);
    bus.publish(cueFired());
    sub.unsubscribe();
    bus.publish(cueFired());
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('handler exception is swallowed; other handlers still called; logger receives error call', () => {
    const out = new PassThrough();
    const lines: string[] = [];
    out.on('data', (c: Buffer) => lines.push(...c.toString().split('\n').filter(Boolean)));
    const log = new Logger({ output: out, level: 'debug' });
    const bus = new EventBus(log);

    const good = vi.fn();
    bus.subscribe('cue-fired', () => { throw new Error('boom'); });
    bus.subscribe('cue-fired', good);

    expect(() => bus.publish(cueFired())).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(lines.some((l) => l.includes('event handler threw'))).toBe(true);
  });

  it('two unsubscribe calls on same Subscription are safe (idempotent)', () => {
    const bus = new EventBus();
    const h = vi.fn();
    const sub = bus.subscribe('cue-fired', h);
    sub.unsubscribe();
    expect(() => sub.unsubscribe()).not.toThrow();
    bus.publish(cueFired());
    expect(h).not.toHaveBeenCalled();
  });

  it('handlers fire in registration order', () => {
    const bus = new EventBus();
    const order: number[] = [];
    bus.subscribe('cue-fired', () => order.push(1));
    bus.subscribe('cue-fired', () => order.push(2));
    bus.subscribe('cue-fired', () => order.push(3));
    bus.publish(cueFired());
    expect(order).toEqual([1, 2, 3]);
  });
});
