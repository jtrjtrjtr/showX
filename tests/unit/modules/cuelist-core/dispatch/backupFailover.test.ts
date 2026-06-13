import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { Cue, OscPayload, ShowxEvent } from 'showx-shared';
import { dispatchCue } from '../../../../../src/modules/cuelist-core/src/dispatch/payloadDispatch.js';
import { initShowDoc, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addDevice } from '../../../../../src/modules/cuelist-core/src/document/devices.js';
import { addRoutingRule, getRoutingRules, removeRoutingRule } from '../../../../../src/modules/cuelist-core/src/document/routing.js';
import { resolveRoutingWithBackup } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import type { DispatchDeps } from '../../../../../src/modules/cuelist-core/src/dispatch/types.js';
import type { ActorCtx } from '../../../../../src/modules/cuelist-core/src/document/devices.js';

const ctx: ActorCtx = { actorId: 'test' };

function makeDoc() {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  setMode(doc, 'rehearsal');
  return doc;
}

function clearAutoRules(doc: Y.Doc) {
  const rules = getRoutingRules(doc);
  for (const r of rules) removeRoutingRule(doc, r.rule_id, ctx);
}

function makeBus() {
  const published: ShowxEvent[] = [];
  return {
    bus: {
      publish: vi.fn((e: ShowxEvent) => { published.push(e); }),
      subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }),
    },
    published,
  };
}

function makeDeps(
  doc: ReturnType<typeof makeDoc>,
  sendFn = vi.fn().mockResolvedValue({ ok: true }),
  bus = makeBus(),
): DispatchDeps & { published: ShowxEvent[] } {
  return {
    doc,
    show_id: 'show-1',
    cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: bus.bus,
    log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
    published: bus.published,
  };
}

function makeCue(payloads: Cue['payloads']): Cue {
  return {
    id: 'c1', label: 'C1', description: '', department: ['LX'],
    standby_note: '', script_line_ref: null, trigger: { kind: 'manual' },
    payloads, duration_hint_ms: null, notes: '', payload_frozen_at: null,
    created_at: new Date().toISOString(), created_by: 'test',
    modified_at: new Date().toISOString(), modified_by: 'test',
  };
}

function makeOscPayload(id = 'p1', device_id = 'primary_dev'): OscPayload {
  return { id, type: 'osc', tag: null, note: '', device_id, address: '/go', args: [] };
}

// ── resolveRoutingWithBackup ──────────────────────────────────────────────────

describe('resolveRoutingWithBackup', () => {
  it('returns error when no rules', () => {
    const doc = makeDoc();
    clearAutoRules(doc);
    const r = resolveRoutingWithBackup(doc, { payloadType: 'osc' });
    expect(r).toEqual({ error: 'no_route' });
  });

  it('returns primary transport when rule has no backup_device_id', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'dev1', label: 'D1', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'dev1' }, ctx);

    const r = resolveRoutingWithBackup(doc, { payloadType: 'osc' });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.primary).toMatchObject({ kind: 'osc', host: '10.0.0.1' });
    expect(r.backup).toBeUndefined();
  });

  it('returns primary + backup transports when backup_device_id is set', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'dev1', label: 'Primary', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'dev2', label: 'Backup', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc' },
      target_device_id: 'dev1',
      backup_device_id: 'dev2',
    }, ctx);

    const r = resolveRoutingWithBackup(doc, { payloadType: 'osc' });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.primary).toMatchObject({ kind: 'osc', host: '10.0.0.1' });
    expect(r.backup).toBeDefined();
    expect(r.backup!.transport).toMatchObject({ kind: 'osc', host: '10.0.0.2' });
    expect(r.backup!.deviceId).toBe('dev2');
  });

  it('returns backup=undefined when backup_device_id device does not exist', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'dev1', label: 'Primary', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    clearAutoRules(doc);
    // We must use a Y.Map directly to add a rule with backup_device_id pointing to non-existent device
    // (addRoutingRule validates device existence — so inject via raw Y.Map)
    const routingMap = doc.getMap<Y.Map<unknown>>('routing');
    const ruleMap = new Y.Map<unknown>();
    ruleMap.set('rule_id', 'r-test');
    ruleMap.set('sort_key', 1000);
    ruleMap.set('match', { payload_type: 'osc' });
    ruleMap.set('target_device_id', 'dev1');
    ruleMap.set('backup_device_id', 'ghost-backup');
    ruleMap.set('notes', '');
    doc.transact(() => routingMap.set('r-test', ruleMap));

    const r = resolveRoutingWithBackup(doc, { payloadType: 'osc' });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.backup).toBeUndefined();
  });

  it('primaryDeviceId is set correctly', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'lx', label: 'LX', transport: 'osc', host: '1.2.3.4', port: 9000 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'lx' }, ctx);

    const r = resolveRoutingWithBackup(doc, { payloadType: 'osc' });
    if ('error' in r) throw new Error('expected resolution');
    expect(r.primaryDeviceId).toBe('lx');
  });
});

// ── addRoutingRule backup_device_id validation ────────────────────────────────

describe('addRoutingRule backup_device_id validation', () => {
  it('accepts backup_device_id when device exists', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary', label: 'P', transport: 'osc', host: '1.1.1.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup', label: 'B', transport: 'osc', host: '1.1.1.2', port: 8001 }, ctx);
    clearAutoRules(doc);

    const rule = addRoutingRule(doc, {
      match: { payload_type: 'osc' },
      target_device_id: 'primary',
      backup_device_id: 'backup',
    }, ctx);
    expect(rule.backup_device_id).toBe('backup');
  });

  it('throws ValidationError when backup_device_id device does not exist', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary', label: 'P', transport: 'osc', host: '1.1.1.1', port: 8000 }, ctx);
    clearAutoRules(doc);

    expect(() =>
      addRoutingRule(doc, {
        match: { payload_type: 'osc' },
        target_device_id: 'primary',
        backup_device_id: 'nonexistent',
      }, ctx),
    ).toThrow('backup_device_id');
  });

  it('stores backup_device_id in Y.Doc and retrieves via getRoutingRules', () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary', label: 'P', transport: 'osc', host: '1.1.1.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup', label: 'B', transport: 'osc', host: '1.1.1.2', port: 8001 }, ctx);
    clearAutoRules(doc);

    addRoutingRule(doc, {
      match: { payload_type: 'osc' },
      target_device_id: 'primary',
      backup_device_id: 'backup',
    }, ctx);

    const rules = getRoutingRules(doc);
    expect(rules[0].backup_device_id).toBe('backup');
  });
});

// ── dispatchCue failover ──────────────────────────────────────────────────────

describe('dispatchCue — backup failover', () => {
  it('primary ok → backup not attempted, result ok', async () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary_dev', label: 'P', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup_dev', label: 'B', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc', device_id: 'primary_dev' },
      target_device_id: 'primary_dev',
      backup_device_id: 'backup_dev',
    }, ctx);

    const sendFn = vi.fn().mockResolvedValue({ ok: true });
    const deps = makeDeps(doc, sendFn);
    const cue = makeCue([makeOscPayload()]);

    const result = await dispatchCue(cue, deps);
    expect(result.ok).toBe(true);
    expect(result.details[0].result).toBe('ok');
    // transport should be plain 'osc' (no →backup suffix)
    expect(result.details[0].transport).toBe('osc');
    // send called once (primary only)
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it('primary fail → backup attempted, backup ok → overall ok with →backup label', async () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary_dev', label: 'P', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup_dev', label: 'B', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc', device_id: 'primary_dev' },
      target_device_id: 'primary_dev',
      backup_device_id: 'backup_dev',
    }, ctx);

    const sendFn = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'connection refused' }) // primary fails
      .mockResolvedValueOnce({ ok: true });                               // backup succeeds

    const deps = makeDeps(doc, sendFn);
    const cue = makeCue([makeOscPayload()]);

    const result = await dispatchCue(cue, deps);
    expect(result.ok).toBe(true);
    expect(result.details[0].result).toBe('ok');
    expect(result.details[0].transport).toBe('osc→backup');
    expect(sendFn).toHaveBeenCalledTimes(2);
    // First send to primary host, second to backup host
    expect((sendFn.mock.calls[0][0] as { host: string }).host).toBe('10.0.0.1');
    expect((sendFn.mock.calls[1][0] as { host: string }).host).toBe('10.0.0.2');
  });

  it('primary fail → backup fail → error, both errors in message', async () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary_dev', label: 'P', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup_dev', label: 'B', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc', device_id: 'primary_dev' },
      target_device_id: 'primary_dev',
      backup_device_id: 'backup_dev',
    }, ctx);

    const sendFn = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'primary down' })
      .mockResolvedValueOnce({ ok: false, error: 'backup down' });

    const deps = makeDeps(doc, sendFn);
    const cue = makeCue([makeOscPayload()]);

    const result = await dispatchCue(cue, deps);
    expect(result.ok).toBe(false);
    expect(result.details[0].result).toBe('error');
    expect(result.details[0].error).toContain('primary: primary down');
    expect(result.details[0].error).toContain('backup: backup down');
    expect(sendFn).toHaveBeenCalledTimes(2);
  });

  it('no backup_device_id set → primary fail → error (no retry)', async () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary_dev', label: 'P', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc', device_id: 'primary_dev' },
      target_device_id: 'primary_dev',
    }, ctx);

    const sendFn = vi.fn().mockResolvedValue({ ok: false, error: 'network error' });
    const deps = makeDeps(doc, sendFn);
    const cue = makeCue([makeOscPayload()]);

    const result = await dispatchCue(cue, deps);
    expect(result.ok).toBe(false);
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(result.details[0].transport).toBe('osc');
  });

  it('dispatch log detail transport shows fired device (primary vs backup)', async () => {
    const doc = makeDoc();
    addDevice(doc, { device_id: 'primary_dev', label: 'P', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'backup_dev', label: 'B', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, {
      match: { payload_type: 'osc', device_id: 'primary_dev' },
      target_device_id: 'primary_dev',
      backup_device_id: 'backup_dev',
    }, ctx);

    // Primary fails, backup succeeds
    const sendFn = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'down' })
      .mockResolvedValueOnce({ ok: true });
    const deps = makeDeps(doc, sendFn);
    const cue = makeCue([makeOscPayload()]);

    const result = await dispatchCue(cue, deps);
    const detail = result.details[0];
    // Transport label includes '→backup' to indicate failover was used
    expect(detail.transport).toContain('backup');
  });
});
