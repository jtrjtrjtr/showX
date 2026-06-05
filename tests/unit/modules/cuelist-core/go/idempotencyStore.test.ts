import { describe, it, expect } from 'vitest';
import { IdempotencyStore } from '../../../../../src/modules/cuelist-core/src/go/idempotencyStore.js';
import type { GoRequest, GoDispatched } from '../../../../../src/modules/cuelist-core/src/go/goEventChannel.js';

function makeReq(overrides: Partial<GoRequest> = {}): GoRequest {
  return {
    topic: 'go.request',
    request_id: 'req-1',
    cue_id: 'cue-1',
    cuelist_id: 'cl-1',
    station_id: 'station-1',
    operator_id: 'op-1',
    client_ts: new Date().toISOString(),
    override: false,
    ...overrides,
  };
}

function makeDispatched(overrides: Partial<GoDispatched> = {}): GoDispatched {
  return {
    topic: 'go.dispatched',
    request_id: 'req-1',
    cue_id: 'cue-1',
    cuelist_id: 'cl-1',
    sequence: 1,
    dispatched_at: new Date().toISOString(),
    payloads_dispatched: 2,
    payloads_failed: [],
    fired_by: { station_id: 'station-1', operator_id: 'op-1' },
    ...overrides,
  };
}

describe('IdempotencyStore — basic operations', () => {
  it('has returns false for unknown request_id', () => {
    const store = new IdempotencyStore(1000);
    expect(store.has('show-1', 'req-1')).toBe(false);
  });

  it('getDispatched returns undefined for unknown request_id', () => {
    const store = new IdempotencyStore(1000);
    expect(store.getDispatched('show-1', 'req-1')).toBeUndefined();
  });

  it('after mark, has returns true', () => {
    const store = new IdempotencyStore(1000);
    store.mark('show-1', 'req-1', { request: makeReq() });
    expect(store.has('show-1', 'req-1')).toBe(true);
  });

  it('getDispatched returns dispatched after updateDispatched', () => {
    const store = new IdempotencyStore(1000);
    const req = makeReq();
    const dispatched = makeDispatched();
    store.mark('show-1', 'req-1', { request: req });
    store.updateDispatched('show-1', 'req-1', dispatched);
    expect(store.getDispatched('show-1', 'req-1')).toEqual(dispatched);
  });

  it('getDispatched returns undefined before updateDispatched', () => {
    const store = new IdempotencyStore(1000);
    store.mark('show-1', 'req-1', { request: makeReq() });
    expect(store.getDispatched('show-1', 'req-1')).toBeUndefined();
  });

  it('different show_ids are isolated', () => {
    const store = new IdempotencyStore(1000);
    store.mark('show-1', 'req-1', { request: makeReq() });
    expect(store.has('show-2', 'req-1')).toBe(false);
  });
});

describe('IdempotencyStore — LRU eviction', () => {
  it('evicts oldest entry when maxSize is reached', () => {
    const store = new IdempotencyStore(3);
    store.mark('show-1', 'req-1', { request: makeReq({ request_id: 'req-1' }) });
    store.mark('show-1', 'req-2', { request: makeReq({ request_id: 'req-2' }) });
    store.mark('show-1', 'req-3', { request: makeReq({ request_id: 'req-3' }) });
    expect(store.size()).toBe(3);
    store.mark('show-1', 'req-4', { request: makeReq({ request_id: 'req-4' }) });
    // req-1 should be evicted (oldest)
    expect(store.has('show-1', 'req-1')).toBe(false);
    expect(store.has('show-1', 'req-4')).toBe(true);
    expect(store.size()).toBe(3);
  });

  it('size stays at maxSize after repeated inserts', () => {
    const store = new IdempotencyStore(2);
    for (let i = 0; i < 10; i++) {
      store.mark('show-1', `req-${i}`, { request: makeReq({ request_id: `req-${i}` }) });
    }
    expect(store.size()).toBe(2);
  });
});

describe('IdempotencyStore — findRecentRequest', () => {
  it('returns the most recent request for a given show + cue', () => {
    const store = new IdempotencyStore(1000);
    const req1 = makeReq({ request_id: 'req-1', cue_id: 'cue-a' });
    const req2 = makeReq({ request_id: 'req-2', cue_id: 'cue-a' });
    store.mark('show-1', 'req-1', { request: req1 });
    store.mark('show-1', 'req-2', { request: req2 });
    const found = store.findRecentRequest('show-1', 'cue-a');
    expect(found?.request_id).toBe('req-2');
  });

  it('returns undefined when no matching cue', () => {
    const store = new IdempotencyStore(1000);
    store.mark('show-1', 'req-1', { request: makeReq({ cue_id: 'cue-x' }) });
    expect(store.findRecentRequest('show-1', 'cue-y')).toBeUndefined();
  });

  it('does not match entries from a different show', () => {
    const store = new IdempotencyStore(1000);
    store.mark('show-1', 'req-1', { request: makeReq({ cue_id: 'cue-a' }) });
    expect(store.findRecentRequest('show-2', 'cue-a')).toBeUndefined();
  });
});
