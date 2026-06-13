import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShowTimeOscBroadcaster } from '../../../../src/main/src/shared/output/showTimeOsc.js';
import { MasterClockImpl } from '../../../../src/main/src/shared/Clock.js';
import type { OscPool } from '../../../../src/main/src/shared/dispatcher/oscClient.js';
import type { OscMessage, DispatchResult } from 'showx-shared';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMockPool(): { pool: OscPool; sent: OscMessage[]; releaseCount: () => number } {
  const sent: OscMessage[] = [];
  let released = 0;

  const pool = {
    claim: vi.fn((_host: string, _port: number) => ({
      release: () => { released += 1; },
      send: async (msg: OscMessage): Promise<DispatchResult> => {
        sent.push(msg);
        return { ok: true, transport: 'osc' as const, latencyMs: 0 };
      },
    })),
    status: vi.fn(() => []),
  } as unknown as OscPool;

  return {
    pool,
    sent,
    releaseCount: () => released,
  };
}

// Flush the immediate void _tick() call (and its async Promise chain)
async function flushTick(): Promise<void> {
  // advanceTimersByTimeAsync(1) advances 1ms and drains microtask queue
  await vi.advanceTimersByTimeAsync(1);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ShowTimeOscBroadcaster', () => {
  let clock: MasterClockImpl;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = new MasterClockImpl();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── default state ─────────────────────────────────────────────────────────

  it('default: disabled, pool not claimed', () => {
    const { pool } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    expect(b.isEnabled).toBe(false);
    expect(pool.claim).not.toHaveBeenCalled();
  });

  // ── enable basics ─────────────────────────────────────────────────────────

  it('enable() claims pool with given host+port', () => {
    const { pool } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '192.168.1.10', port: 8000 });
    expect(pool.claim).toHaveBeenCalledWith('192.168.1.10', 8000);
    expect(b.isEnabled).toBe(true);
    b.disable();
  });

  it('enable() sends an immediate first broadcast', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    expect(sent.length).toBeGreaterThanOrEqual(1);
    b.disable();
  });

  // ── disable ───────────────────────────────────────────────────────────────

  it('disable() stops further broadcasts', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    b.disable();
    expect(b.isEnabled).toBe(false);
    const countAfterDisable = sent.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.length).toBe(countAfterDisable);
  });

  it('disable() releases the pool claim', () => {
    const { pool, releaseCount } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    b.disable();
    expect(releaseCount()).toBe(1);
  });

  it('disable() is idempotent', () => {
    const { pool } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    expect(() => { b.disable(); b.disable(); }).not.toThrow();
  });

  // ── OSC message format ────────────────────────────────────────────────────

  it('OSC message uses default address /showx/time', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    expect(sent[0]!.address).toBe('/showx/time');
    b.disable();
  });

  it('OSC address is configurable', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000, address: '/myapp/clock' });
    await flushTick();
    expect(sent[0]!.address).toBe('/myapp/clock');
    b.disable();
  });

  it('OSC args: int HH, int MM, int SS, int FF, string TC, bool running', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    // 01:02:03:04 @25fps
    clock.locate(1 * 3600 * 25 + 2 * 60 * 25 + 3 * 25 + 4);
    clock.start();
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    const msg = sent[0]!;
    const [hh, mm, ss, ff, tcStr, running] = msg.args;
    expect(hh).toBe(1);
    expect(mm).toBe(2);
    expect(ss).toBe(3);
    expect(ff).toBe(4);
    expect(typeof tcStr).toBe('string');
    expect(tcStr as string).toMatch(/01:02:03[:;]04/);
    expect(running).toBe(true);
    b.disable();
  });

  it('running=false when clock is stopped', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    // clock never started → running=false
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    expect(sent[0]!.args[5]).toBe(false);
    b.disable();
  });

  it('continues broadcasting with running=false after clock stops', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    clock.start();
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    clock.stop();
    const countBeforeCheck = sent.length;
    // Advance 300ms → 3 more interval ticks at 10Hz
    await vi.advanceTimersByTimeAsync(300);
    expect(sent.length).toBeGreaterThan(countBeforeCheck);
    // All post-stop messages have running=false
    for (const msg of sent.slice(countBeforeCheck)) {
      expect(msg.args[5]).toBe(false);
    }
    b.disable();
  });

  // ── rate ─────────────────────────────────────────────────────────────────

  it('broadcasts at ~10Hz (100ms interval) by default', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    const sentBefore = sent.length;
    // 500ms at 10Hz → 5 more ticks
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.length - sentBefore).toBeGreaterThanOrEqual(4);
    expect(sent.length - sentBefore).toBeLessThanOrEqual(6);
    b.disable();
  });

  it('rate is capped at 10Hz even if higher is requested', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000, rateHz: 100 });
    await flushTick();
    const sentBefore = sent.length;
    await vi.advanceTimersByTimeAsync(500);
    // At capped 10Hz (100ms interval): ~5 ticks; at 100Hz would be ~50
    expect(sent.length - sentBefore).toBeLessThanOrEqual(6);
    expect(sent.length - sentBefore).toBeGreaterThanOrEqual(4);
    b.disable();
  });

  // ── error resilience ──────────────────────────────────────────────────────

  it('send error is logged but does not crash or disable the broadcaster', async () => {
    const logError = vi.fn();
    const log = { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    let failOnce = true;
    const pool = {
      claim: vi.fn(() => ({
        release: vi.fn(),
        send: async (): Promise<DispatchResult> => {
          if (failOnce) {
            failOnce = false;
            throw new Error('network error');
          }
          return { ok: true, transport: 'osc' as const, latencyMs: 0 };
        },
      })),
      status: vi.fn(() => []),
    } as unknown as OscPool;

    const b = new ShowTimeOscBroadcaster(clock, pool, log as never);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    expect(logError).toHaveBeenCalled();
    expect(b.isEnabled).toBe(true);
    b.disable();
  });

  // ── re-enable ─────────────────────────────────────────────────────────────

  it('enable() while already enabled switches to new config', async () => {
    const { pool, sent } = makeMockPool();
    const b = new ShowTimeOscBroadcaster(clock, pool);
    b.enable({ host: '127.0.0.1', port: 9000 });
    await flushTick();
    b.enable({ host: '127.0.0.1', port: 9001, address: '/new/addr' });
    await flushTick();
    const lastMsg = sent.at(-1)!;
    expect(lastMsg.address).toBe('/new/addr');
    expect(lastMsg.port).toBe(9001);
    b.disable();
  });
});
