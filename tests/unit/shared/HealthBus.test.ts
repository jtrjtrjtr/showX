import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthBus } from '../../../src/main/src/shared/HealthBus.js';
import { EventBus } from '../../../src/main/src/shared/EventBus.js';

describe('HealthBus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('single healthy report → aggregate() returns "healthy"', () => {
    const hb = new HealthBus();
    hb.report('m1', 'healthy');
    expect(hb.aggregate()).toBe('healthy');
  });

  it('error + healthy → aggregate() returns "error"', () => {
    const hb = new HealthBus();
    hb.report('m1', 'error');
    hb.report('m2', 'healthy');
    expect(hb.aggregate()).toBe('error');
  });

  it('warning with no errors → aggregate() returns "warning"', () => {
    const hb = new HealthBus();
    hb.report('m1', 'warning');
    hb.report('m2', 'healthy');
    expect(hb.aggregate()).toBe('warning');
  });

  it('empty HealthBus → aggregate() returns "unknown"', () => {
    const hb = new HealthBus();
    expect(hb.aggregate()).toBe('unknown');
  });

  it('four modules (error, warning, healthy, unknown) → aggregate is "error"', () => {
    const hb = new HealthBus();
    hb.report('a', 'error');
    hb.report('b', 'warning');
    hb.report('c', 'healthy');
    hb.report('d', 'unknown');
    expect(hb.aggregate()).toBe('error');
  });

  it('same-state re-report is a no-op (no fanout, no event emitted)', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('health-changed', spy);
    const hb = new HealthBus(bus);

    hb.report('m1', 'healthy');
    hb.report('m1', 'healthy'); // duplicate — must be suppressed
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('observe(slug, h) fires on transition; unsubscribe() stops it', () => {
    const hb = new HealthBus();
    const h = vi.fn();
    const sub = hb.observe('m1', h);
    hb.report('m1', 'healthy');
    expect(h).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
    hb.report('m1', 'warning');
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('report publishes health-changed event via injected EventBus', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('health-changed', spy);
    const hb = new HealthBus(bus);
    hb.report('m1', 'warning', 'high latency');
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0]![0];
    expect(evt.type).toBe('health-changed');
    expect(evt.slug).toBe('m1');
    expect(evt.status).toBe('warning');
    expect(evt.detail).toBe('high latency');
  });

  it('snapshot() returns current snapshots with correct updatedAt', () => {
    const hb = new HealthBus(undefined, undefined, () => 5000);
    hb.report('m1', 'healthy');
    hb.report('m2', 'error');
    const snaps = hb.snapshot();
    expect(snaps).toHaveLength(2);
    expect(snaps.every((s) => s.updatedAt === 5000)).toBe(true);
  });

  it('two HealthBus instances are isolated — reports do not leak between instances', () => {
    const hb1 = new HealthBus();
    const hb2 = new HealthBus();
    hb1.report('m1', 'error');
    expect(hb2.aggregate()).toBe('unknown');
    expect(hb1.aggregate()).toBe('error');
  });

  it('observeAggregate fires on every report that changes a slug', () => {
    const hb = new HealthBus();
    const agg = vi.fn();
    hb.observeAggregate(agg);
    hb.report('m1', 'healthy');
    hb.report('m2', 'warning');
    expect(agg).toHaveBeenCalledTimes(2);
  });
});
