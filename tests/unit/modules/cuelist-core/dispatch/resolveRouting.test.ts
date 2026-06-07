import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { resolveDeviceTransport, resolveRoutingForPayload } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import type { RoutingEntry, OscTransport } from '../../../../../src/modules/cuelist-core/src/dispatch/resolveRouting.js';
import { initShowDoc } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addDevice } from '../../../../../src/modules/cuelist-core/src/document/devices.js';
import { addRoutingRule, getRoutingRules, removeRoutingRule } from '../../../../../src/modules/cuelist-core/src/document/routing.js';
import type { ActorCtx } from '../../../../../src/modules/cuelist-core/src/document/devices.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeOscEntry(overrides: Partial<RoutingEntry> = {}): RoutingEntry {
  return {
    id: 'r1',
    match: {},
    transport: { kind: 'osc', host: '192.168.1.10', port: 8000 },
    enabled: true,
    notes: '',
    ...overrides,
  };
}

const ctx: ActorCtx = { actorId: 'test' };

function makeResolverDoc() {
  return initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
}

function clearAutoRules(doc: ReturnType<typeof makeResolverDoc>): void {
  const rules = getRoutingRules(doc);
  for (const r of rules) removeRoutingRule(doc, r.rule_id, ctx);
}

// ── Legacy resolveDeviceTransport tests ───────────────────────────────────────

describe('resolveDeviceTransport', () => {
  it('returns null when no entries', () => {
    expect(resolveDeviceTransport('dev1', 'osc', {})).toBeNull();
  });

  it('device_id + payload_type + tag: highest specificity wins', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1', payload_type: 'osc', tag: 'LX' }, transport: { kind: 'osc', host: 'best', port: 9000 } }),
      r2: makeOscEntry({ id: 'r2', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device-only', port: 9001 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('best');
  });

  it('device_id alone match: specificity 4', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device-only', port: 9001 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('device-only');
  });

  it('payload_type alone match: specificity 2', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { payload_type: 'osc' }, transport: { kind: 'osc', host: 'type-match', port: 9002 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect(t).not.toBeNull();
    expect((t as { host: string }).host).toBe('type-match');
  });

  it('no match when only unrelated device_id', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'other-device' } }),
    };
    expect(resolveDeviceTransport('dev1', 'osc', routing)).toBeNull();
  });

  it('disabled entry skipped', () => {
    const routing: Record<string, RoutingEntry> = {
      r1: makeOscEntry({ id: 'r1', match: { device_id: 'dev1' }, enabled: false }),
    };
    expect(resolveDeviceTransport('dev1', 'osc', routing)).toBeNull();
  });

  it('device_id (4) beats payload_type (2) when both match', () => {
    const routing: Record<string, RoutingEntry> = {
      rA: makeOscEntry({ id: 'rA', match: { payload_type: 'osc' }, transport: { kind: 'osc', host: 'type', port: 1 } }),
      rB: makeOscEntry({ id: 'rB', match: { device_id: 'dev1' }, transport: { kind: 'osc', host: 'device', port: 2 } }),
    };
    const t = resolveDeviceTransport('dev1', 'osc', routing);
    expect((t as { host: string }).host).toBe('device');
  });
});

// ── New resolveRoutingForPayload tests ────────────────────────────────────────

describe('resolveRoutingForPayload', () => {
  it('returns error when no rules', () => {
    const doc = makeResolverDoc();
    clearAutoRules(doc);
    const r = resolveRoutingForPayload(doc, { payloadType: 'osc' });
    expect(r).toEqual({ error: 'no_route' });
  });

  it('returns error when matched rule has no device', () => {
    const doc = makeResolverDoc();
    // Manually add a rule pointing to a nonexistent device via Y.Map
    const routing = doc.getMap('routing');
    const ruleMap = new Y.Map<unknown>();
    ruleMap.set('rule_id', 'test-rule');
    ruleMap.set('sort_key', 1000);
    ruleMap.set('match', { payload_type: 'osc' });
    ruleMap.set('target_device_id', 'ghost-device');
    ruleMap.set('notes', '');
    doc.transact(() => routing.set('test-rule', ruleMap));
    const r = resolveRoutingForPayload(doc, { payloadType: 'osc' });
    expect(r).toEqual({ error: 'no_route' });
  });

  it('exact device_id match (class 1) wins over tag_pattern match (class 2)', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'dev1', label: 'EOS', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    addDevice(doc, { device_id: 'dev2', label: 'Fallback', transport: 'osc', host: '10.0.0.2', port: 8001 }, ctx);
    clearAutoRules(doc);

    // Class 2: matches osc with tag 'LX' → dev2
    addRoutingRule(doc, { match: { payload_type: 'osc', tag_pattern: 'LX' }, target_device_id: 'dev2', sort_key: 100 }, ctx);
    // Class 1: matches exact device_id 'dev1' → dev1
    addRoutingRule(doc, { match: { device_id: 'dev1' }, target_device_id: 'dev1', sort_key: 200 }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'osc', deviceId: 'dev1', tag: 'LX' });
    expect((r as OscTransport).host).toBe('10.0.0.1'); // class 1 wins
  });

  it('tag_pattern literal match routes to correct device', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'sound_dev', label: 'SX', transport: 'osc', host: '10.0.1.1', port: 8002 }, ctx);
    clearAutoRules(doc);

    addRoutingRule(doc, { match: { payload_type: 'osc', tag_pattern: 'SX' }, target_device_id: 'sound_dev' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'osc', tag: 'SX' });
    expect((r as OscTransport).host).toBe('10.0.1.1');
  });

  it('tag_pattern regex match routes to correct device', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'lx_dev', label: 'LX', transport: 'osc', host: '10.0.2.1', port: 8003 }, ctx);
    clearAutoRules(doc);

    // Pattern matches LX or LX_FOLLOW via regex
    addRoutingRule(doc, { match: { payload_type: 'osc', tag_pattern: '^LX' }, target_device_id: 'lx_dev' }, ctx);

    const r1 = resolveRoutingForPayload(doc, { payloadType: 'osc', tag: 'LX' });
    const r2 = resolveRoutingForPayload(doc, { payloadType: 'osc', tag: 'LX_FOLLOW' });
    const rNoMatch = resolveRoutingForPayload(doc, { payloadType: 'osc', tag: 'SX' });

    expect((r1 as OscTransport).host).toBe('10.0.2.1');
    expect((r2 as OscTransport).host).toBe('10.0.2.1');
    expect(rNoMatch).toEqual({ error: 'no_route' });
  });

  it('sort_key precedence: lower sort_key wins within same class', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'high_pri', label: 'High', transport: 'osc', host: '10.1.0.1', port: 9001 }, ctx);
    addDevice(doc, { device_id: 'low_pri', label: 'Low', transport: 'osc', host: '10.1.0.2', port: 9002 }, ctx);
    clearAutoRules(doc);

    // Both match by payload_type (class 2); sort_key determines winner
    addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'low_pri', sort_key: 2000 }, ctx);
    addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'high_pri', sort_key: 1000 }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'osc' });
    expect((r as OscTransport).host).toBe('10.1.0.1'); // sort_key 1000 wins
  });

  it('LX driver (eos) returns OscTransport with encoding=eos — lxRef omits sourceURI via this encoding', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'lx_eos', label: 'ETC Eos', transport: 'osc', host: '192.168.10.5', port: 3032, driver: 'eos' }, ctx);
    clearAutoRules(doc);

    addRoutingRule(doc, { match: { device_id: 'lx_eos' }, target_device_id: 'lx_eos' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'lx_ref', deviceId: 'lx_eos' });
    expect((r as OscTransport).kind).toBe('osc');
    expect((r as OscTransport).encoding).toBe('eos');
    expect((r as OscTransport).host).toBe('192.168.10.5');
  });

  it('MA3 driver maps to encoding=ma3', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'ma3', label: 'GrandMA3', transport: 'osc', host: '192.168.10.10', port: 2001, driver: 'ma3' }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { device_id: 'ma3' }, target_device_id: 'ma3' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'lx_ref', deviceId: 'ma3' });
    expect((r as OscTransport).encoding).toBe('ma3');
  });

  it('hog4 driver maps to encoding=hog', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'hog', label: 'Hog4', transport: 'osc', host: '192.168.10.20', port: 7001, driver: 'hog4' }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { device_id: 'hog' }, target_device_id: 'hog' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'lx_ref', deviceId: 'hog' });
    expect((r as OscTransport).encoding).toBe('hog');
  });

  it('midi device returns MidiTransport', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'midi_dev', label: 'MIDI', transport: 'midi', midi_port: 'IAC Bus 1' }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { payload_type: 'midi' }, target_device_id: 'midi_dev' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'midi' });
    expect((r as { kind: string }).kind).toBe('midi');
    expect((r as { port_name: string }).port_name).toBe('IAC Bus 1');
  });

  it('unmatched payload_type returns error', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'osc_dev', label: 'OSC', transport: 'osc', host: '10.0.0.1', port: 8000 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'osc_dev' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'midi' });
    expect(r).toEqual({ error: 'no_route' });
  });

  it('rule with no match fields (catch-all) matches any payload_type', () => {
    const doc = makeResolverDoc();
    addDevice(doc, { device_id: 'catch_all', label: 'All', transport: 'osc', host: '0.0.0.0', port: 9999 }, ctx);
    clearAutoRules(doc);
    addRoutingRule(doc, { match: {}, target_device_id: 'catch_all' }, ctx);

    const r = resolveRoutingForPayload(doc, { payloadType: 'osc' });
    expect((r as OscTransport).host).toBe('0.0.0.0');
  });
});
