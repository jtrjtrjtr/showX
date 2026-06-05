import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchWait } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/wait.js';
import type { WaitPayload } from 'showx-shared';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(signal = new AbortController().signal): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc, show_id: 'show-1', cuelist_id: 'cl-1',
    output: { send: vi.fn(), claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: { publish: vi.fn(), subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }) },
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: signal,
  };
}

function makeWaitPayload(duration_ms: number): WaitPayload {
  return { id: 'p1', type: 'wait', tag: null, note: '', duration_ms };
}

describe('dispatchWait', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('wait(100) resolves after advancing timers 100ms', async () => {
    const deps = makeDeps();
    const promise = dispatchWait(makeWaitPayload(100), deps);
    vi.advanceTimersByTime(100);
    const r = await promise;
    expect(r.ok).toBe(true);
  });

  it('wait(0) resolves immediately on next tick', async () => {
    const deps = makeDeps();
    const promise = dispatchWait(makeWaitPayload(0), deps);
    vi.advanceTimersByTime(0);
    const r = await promise;
    expect(r.ok).toBe(true);
  });

  it('wait respects abortSignal — rejects on abort', async () => {
    const ac = new AbortController();
    const deps = makeDeps(ac.signal);
    const promise = dispatchWait(makeWaitPayload(60_000), deps);
    ac.abort();
    vi.advanceTimersByTime(0);
    await expect(promise).rejects.toThrow('aborted');
  });
});
