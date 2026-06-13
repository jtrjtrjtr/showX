import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthBus } from '../../../src/main/src/shared/HealthBus.js';
import { OutputDispatcher } from '../../../src/main/src/shared/OutputDispatcher.js';
import { EventBus } from '../../../src/main/src/shared/EventBus.js';
import { OscPool } from '../../../src/main/src/shared/dispatcher/oscClient.js';
import type { OscSocketFactory } from '../../../src/main/src/shared/dispatcher/oscClient.js';

// ── Mock OSC pool (ok or fail based on flag) ──────────────────────────────────

function makeMockOscPool(succeeds = true): OscPool {
  const socket = {
    send: vi.fn((_buf: unknown, _port: unknown, _host: unknown, cb: (err?: Error) => void) => {
      cb(succeeds ? undefined : new Error('osc send failed'));
    }),
    close: vi.fn(),
  };
  const factory: OscSocketFactory = { create: vi.fn(() => socket as unknown as ReturnType<OscSocketFactory['create']>) };
  return new OscPool(factory);
}

function makeOscMsg() {
  return {
    transport: 'osc' as const,
    host: '127.0.0.1',
    port: 8000,
    address: '/go',
    args: [],
  };
}

// ── HealthBus — device tracking ───────────────────────────────────────────────

describe('HealthBus.getDeviceHealth()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });
  afterEach(() => vi.useRealTimers());

  it('returns empty map when no device slugs reported', () => {
    const hb = new HealthBus();
    hb.report('module:x', 'healthy');
    expect(hb.getDeviceHealth().size).toBe(0);
  });

  it('report device:A healthy → getDeviceHealth returns healthy + last_ok_at', () => {
    const hb = new HealthBus(undefined, undefined, () => 10_000);
    hb.report('device:A', 'healthy');
    const health = hb.getDeviceHealth();
    expect(health.get('A')).toMatchObject({ status: 'healthy', last_ok_at: 10_000 });
  });

  it('report device:A error → getDeviceHealth returns error + last_error', () => {
    const hb = new HealthBus();
    hb.report('device:A', 'error', 'connect refused');
    const health = hb.getDeviceHealth();
    expect(health.get('A')).toMatchObject({ status: 'error', last_error: 'connect refused' });
    expect(health.get('A')?.last_ok_at).toBeUndefined();
  });

  it('recovery: error then healthy clears last_error and sets last_ok_at', () => {
    const hb = new HealthBus(undefined, undefined, () => 10_000);
    hb.report('device:A', 'error', 'timeout');
    hb.report('device:A', 'healthy');
    const entry = hb.getDeviceHealth().get('A');
    expect(entry?.status).toBe('healthy');
    expect(entry?.last_error).toBeUndefined();
    expect(entry?.last_ok_at).toBe(10_000);
  });

  it('never-reported device → not in getDeviceHealth map (shows as unknown/grey)', () => {
    const hb = new HealthBus();
    hb.report('device:B', 'healthy');
    expect(hb.getDeviceHealth().has('A')).toBe(false);
  });

  it('slug mapping: device:my-device-01 → key "my-device-01"', () => {
    const hb = new HealthBus();
    hb.report('device:my-device-01', 'healthy');
    expect(hb.getDeviceHealth().has('my-device-01')).toBe(true);
  });
});

describe('HealthBus DeviceStatusEvent', () => {
  it('emits device-status event on EventBus when device:* slug is reported', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('device-status', spy);
    const hb = new HealthBus(bus, undefined, () => 5_000);

    hb.report('device:X', 'healthy');
    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0]![0];
    expect(evt.type).toBe('device-status');
    expect(evt.device_id).toBe('X');
    expect(evt.status).toBe('healthy');
    expect(evt.last_ok_at).toBe(5_000);
  });

  it('emits device-status with status=error when HealthStatus=error', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('device-status', spy);
    const hb = new HealthBus(bus);

    hb.report('device:Y', 'error', 'timeout');
    const evt = spy.mock.calls[0]![0];
    expect(evt.status).toBe('error');
    expect(evt.last_error).toBe('timeout');
  });

  it('emits device-status with status=unknown when HealthStatus=warning', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('device-status', spy);
    const hb = new HealthBus(bus);

    hb.report('device:Z', 'warning', 'slow');
    const evt = spy.mock.calls[0]![0];
    expect(evt.status).toBe('unknown');
  });

  it('non-device slugs do NOT emit device-status events', () => {
    const bus = new EventBus();
    const spy = vi.fn();
    bus.subscribe('device-status', spy);
    const hb = new HealthBus(bus);

    hb.report('module:something', 'error');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── OutputDispatcher.send(msg, deviceId) ─────────────────────────────────────

describe('OutputDispatcher device health via send(msg, deviceId)', () => {
  let healthBus: HealthBus;
  let dispatcher: OutputDispatcher;
  let oskPool: OscPool;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    healthBus = new HealthBus(undefined, undefined, () => 20_000);
    oskPool = makeMockOscPool(true);
    dispatcher = new OutputDispatcher('test', { oscPool: oskPool, healthBus });
  });
  afterEach(() => vi.useRealTimers());

  it('ok dispatch with deviceId → device reported healthy', async () => {
    const result = await dispatcher.send(makeOscMsg(), 'device-A');
    expect(result.ok).toBe(true);
    const h = healthBus.getDeviceHealth().get('device-A');
    expect(h?.status).toBe('healthy');
    expect(h?.last_ok_at).toBe(20_000);
  });

  it('failed dispatch with deviceId → device reported error', async () => {
    const failPool = makeMockOscPool(false);
    const d = new OutputDispatcher('test', { oscPool: failPool, healthBus });
    const result = await d.send(makeOscMsg(), 'device-B');
    expect(result.ok).toBe(false);
    const h = healthBus.getDeviceHealth().get('device-B');
    expect(h?.status).toBe('error');
  });

  it('send without deviceId → no health entry created', async () => {
    await dispatcher.send(makeOscMsg());
    expect(healthBus.getDeviceHealth().size).toBe(0);
  });

  it('unused device (never sent) → not in health map (unknown/grey in UI)', () => {
    expect(dispatcher.getDeviceHealth().has('device-Z')).toBe(false);
  });

  it('recovery: fail then ok → status becomes healthy', async () => {
    const failPool = makeMockOscPool(false);
    const failDispatcher = new OutputDispatcher('test', { oscPool: failPool, healthBus });
    await failDispatcher.send(makeOscMsg(), 'device-C');
    expect(healthBus.getDeviceHealth().get('device-C')?.status).toBe('error');

    const okPool = makeMockOscPool(true);
    const okDispatcher = new OutputDispatcher('test', { oscPool: okPool, healthBus });
    await okDispatcher.send(makeOscMsg(), 'device-C');
    expect(healthBus.getDeviceHealth().get('device-C')?.status).toBe('healthy');
  });

  it('getDeviceHealth() delegates to HealthBus', async () => {
    await dispatcher.send(makeOscMsg(), 'dev-1');
    const map = dispatcher.getDeviceHealth();
    expect(map.has('dev-1')).toBe(true);
  });

  it('slug mapping: getDeviceHealth key matches deviceId passed to send', async () => {
    await dispatcher.send(makeOscMsg(), 'board-01');
    expect(dispatcher.getDeviceHealth().has('board-01')).toBe(true);
    expect(dispatcher.getDeviceHealth().has('device:board-01')).toBe(false);
  });
});
