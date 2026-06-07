import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { initShowDoc, setMode } from '../../../../../src/modules/cuelist-core/src/document/show.js';
import { addDevice, type Device, type ActorCtx } from '../../../../../src/modules/cuelist-core/src/document/devices.js';
import {
  addRoutingRule,
  updateRoutingRule,
  removeRoutingRule,
  reorderRoutingRules,
  getRoutingRules,
  getRoutingRule,
  type RoutingRule,
} from '../../../../../src/modules/cuelist-core/src/document/routing.js';
import { ValidationError } from '../../../../../src/modules/cuelist-core/src/document/payload.js';
import { LockedError } from '../../../../../src/modules/cuelist-core/src/mode/lockGuards.js';

function makeDoc(): Y.Doc {
  return initShowDoc({ title: 'Test', venue: null, date: null, created_by: 'op1' });
}

const ctx: ActorCtx = { actorId: 'op1' };

const oscDevice: Device = { device_id: 'lx_eos', label: 'ETC Eos', transport: 'osc', host: '192.168.1.100', port: 8000 };
const midiDevice: Device = { device_id: 'midi_con', label: 'MIDI Console', transport: 'midi' };

function makeDocWithDevices(): Y.Doc {
  const doc = makeDoc();
  addDevice(doc, oscDevice, ctx);
  addDevice(doc, midiDevice, ctx);
  return doc;
}

describe('addRoutingRule', () => {
  it('adds a rule and it appears in getRoutingRules', () => {
    const doc = makeDocWithDevices();
    // Clear auto-created rules to start fresh
    const initialRules = getRoutingRules(doc);
    for (const r of initialRules) removeRoutingRule(doc, r.rule_id, ctx);

    const rule = addRoutingRule(doc, {
      match: { payload_type: 'osc' },
      target_device_id: 'lx_eos',
    }, ctx);
    expect(rule.rule_id).toBeTruthy();
    const rules = getRoutingRules(doc);
    expect(rules).toHaveLength(1);
    expect(rules[0].target_device_id).toBe('lx_eos');
    expect(rules[0].match.payload_type).toBe('osc');
  });

  it('assigns sort_key in 1000-increments', () => {
    const doc = makeDocWithDevices();
    const before = getRoutingRules(doc);
    for (const r of before) removeRoutingRule(doc, r.rule_id, ctx);

    addRoutingRule(doc, { match: {}, target_device_id: 'lx_eos' }, ctx);
    addRoutingRule(doc, { match: {}, target_device_id: 'midi_con' }, ctx);
    const rules = getRoutingRules(doc);
    expect(rules[0].sort_key).toBe(1000);
    expect(rules[1].sort_key).toBe(2000);
  });

  it('throws ValidationError for missing target_device_id', () => {
    const doc = makeDocWithDevices();
    expect(() =>
      addRoutingRule(doc, { match: {}, target_device_id: '' }, ctx),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError for invalid payload_type', () => {
    const doc = makeDocWithDevices();
    expect(() =>
      addRoutingRule(doc, { match: { payload_type: 'invalid_type' as never }, target_device_id: 'lx_eos' }, ctx),
    ).toThrow(ValidationError);
  });

  it('throws ValidationError when target_device_id not in devices', () => {
    const doc = makeDocWithDevices();
    expect(() =>
      addRoutingRule(doc, { match: {}, target_device_id: 'nonexistent_device' }, ctx),
    ).toThrow(ValidationError);
  });

  it('throws LockedError in SHOW mode', () => {
    const doc = makeDocWithDevices();
    setMode(doc, 'show');
    expect(() =>
      addRoutingRule(doc, { match: {}, target_device_id: 'lx_eos' }, ctx),
    ).toThrow(LockedError);
  });

  it('getRoutingRule returns the rule by id', () => {
    const doc = makeDocWithDevices();
    const before = getRoutingRules(doc);
    for (const r of before) removeRoutingRule(doc, r.rule_id, ctx);

    const rule = addRoutingRule(doc, { match: { payload_type: 'midi' }, target_device_id: 'midi_con' }, ctx);
    const found = getRoutingRule(doc, rule.rule_id);
    expect(found).toBeDefined();
    expect(found!.match.payload_type).toBe('midi');
  });
});

describe('updateRoutingRule', () => {
  let doc: Y.Doc;
  let ruleId: string;

  beforeEach(() => {
    doc = makeDocWithDevices();
    const before = getRoutingRules(doc);
    for (const r of before) removeRoutingRule(doc, r.rule_id, ctx);
    const rule = addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'lx_eos' }, ctx);
    ruleId = rule.rule_id;
  });

  it('updates match', () => {
    updateRoutingRule(doc, ruleId, { match: { payload_type: 'midi' } }, ctx);
    const r = getRoutingRule(doc, ruleId);
    expect(r!.match.payload_type).toBe('midi');
  });

  it('updates target_device_id', () => {
    updateRoutingRule(doc, ruleId, { target_device_id: 'midi_con' }, ctx);
    const r = getRoutingRule(doc, ruleId);
    expect(r!.target_device_id).toBe('midi_con');
  });

  it('throws for unknown rule id', () => {
    expect(() => updateRoutingRule(doc, 'nonexistent', { target_device_id: 'lx_eos' }, ctx)).toThrow(/not found/);
  });

  it('throws ValidationError when new target not in devices', () => {
    expect(() => updateRoutingRule(doc, ruleId, { target_device_id: 'ghost_device' }, ctx)).toThrow(ValidationError);
  });

  it('throws LockedError in SHOW mode', () => {
    setMode(doc, 'show');
    expect(() => updateRoutingRule(doc, ruleId, { notes: 'x' }, ctx)).toThrow(LockedError);
  });
});

describe('removeRoutingRule', () => {
  it('removes the rule from doc', () => {
    const doc = makeDocWithDevices();
    const before = getRoutingRules(doc);
    for (const r of before) removeRoutingRule(doc, r.rule_id, ctx);

    const rule = addRoutingRule(doc, { match: {}, target_device_id: 'lx_eos' }, ctx);
    removeRoutingRule(doc, rule.rule_id, ctx);
    expect(getRoutingRules(doc)).toHaveLength(0);
  });

  it('throws for nonexistent rule', () => {
    const doc = makeDocWithDevices();
    expect(() => removeRoutingRule(doc, 'no_such_rule', ctx)).toThrow(/not found/);
  });

  it('throws LockedError in SHOW mode', () => {
    const doc = makeDocWithDevices();
    const rules = getRoutingRules(doc);
    const ruleId = rules[0].rule_id;
    setMode(doc, 'show');
    expect(() => removeRoutingRule(doc, ruleId, ctx)).toThrow(LockedError);
  });
});

describe('reorderRoutingRules', () => {
  let doc: Y.Doc;
  let r1: RoutingRule;
  let r2: RoutingRule;
  let r3: RoutingRule;

  beforeEach(() => {
    doc = makeDocWithDevices();
    const before = getRoutingRules(doc);
    for (const r of before) removeRoutingRule(doc, r.rule_id, ctx);
    r1 = addRoutingRule(doc, { match: { payload_type: 'osc' }, target_device_id: 'lx_eos' }, ctx);
    r2 = addRoutingRule(doc, { match: { payload_type: 'midi' }, target_device_id: 'midi_con' }, ctx);
    r3 = addRoutingRule(doc, { match: {}, target_device_id: 'lx_eos' }, ctx);
  });

  it('reorders rules by assigning new sort_keys', () => {
    reorderRoutingRules(doc, [r3.rule_id, r1.rule_id, r2.rule_id], ctx);
    const rules = getRoutingRules(doc);
    expect(rules[0].rule_id).toBe(r3.rule_id);
    expect(rules[1].rule_id).toBe(r1.rule_id);
    expect(rules[2].rule_id).toBe(r2.rule_id);
  });

  it('getRoutingRules returns rules sorted by sort_key after reorder', () => {
    reorderRoutingRules(doc, [r2.rule_id, r3.rule_id, r1.rule_id], ctx);
    const rules = getRoutingRules(doc);
    expect(rules[0].rule_id).toBe(r2.rule_id);
    expect(rules.every((r, i, arr) => i === 0 || r.sort_key > arr[i - 1].sort_key)).toBe(true);
  });

  it('throws LockedError in SHOW mode', () => {
    setMode(doc, 'show');
    expect(() => reorderRoutingRules(doc, [r1.rule_id, r2.rule_id, r3.rule_id], ctx)).toThrow(LockedError);
  });

  it('throws for unknown rule id in newOrder', () => {
    expect(() => reorderRoutingRules(doc, [r1.rule_id, 'ghost', r3.rule_id], ctx)).toThrow(/not found/);
  });
});

describe('reference integrity with devices', () => {
  it('rule added from device auto-create is valid', () => {
    const doc = makeDoc();
    addDevice(doc, oscDevice, ctx);
    const rules = getRoutingRules(doc);
    expect(rules).toHaveLength(1);
    expect(rules[0].target_device_id).toBe('lx_eos');
  });
});

describe('getRoutingRules — migration and backward compat', () => {
  it('is idempotent: calling twice returns same rules', () => {
    const doc = makeDocWithDevices();
    const r1 = getRoutingRules(doc);
    const r2 = getRoutingRules(doc);
    expect(r1.map((r) => r.rule_id)).toEqual(r2.map((r) => r.rule_id));
    expect(r1.map((r) => r.target_device_id)).toEqual(r2.map((r) => r.target_device_id));
  });

  it('plain objects stored in Y.Map (old test fixture style) are skipped without crash', () => {
    const doc = makeDocWithDevices();
    // Clear existing rules then store a plain object (old RoutingEntry style) directly in Y.Map
    const initialRules = getRoutingRules(doc);
    for (const r of initialRules) removeRoutingRule(doc, r.rule_id, ctx);

    const routingYMap = doc.getMap('routing');
    const oldEntry = {
      id: 'legacy-r1',
      match: { payload_type: 'osc' },
      transport: { kind: 'osc', host: '1.2.3.4', port: 8000 },
      enabled: true,
      notes: '',
    };
    doc.transact(() => routingYMap.set('legacy-r1', oldEntry));

    // Should not throw; old plain objects are excluded from results
    expect(() => getRoutingRules(doc)).not.toThrow();
    const rules = getRoutingRules(doc);
    expect(rules.every((r) => r.target_device_id !== undefined)).toBe(true);
  });

  it('Y.Map rule without target_device_id is excluded from results', () => {
    const doc = makeDocWithDevices();
    const initialRules = getRoutingRules(doc);
    for (const r of initialRules) removeRoutingRule(doc, r.rule_id, ctx);

    // Store a Y.Map rule missing target_device_id (old Y.Map shape)
    const routingYMap = doc.getMap('routing');
    const oldYMap = new Y.Map<unknown>();
    oldYMap.set('id', 'old-ym-rule');
    oldYMap.set('match', { payload_type: 'osc', tag: 'LX' });
    oldYMap.set('transport', { kind: 'osc', host: '5.6.7.8', port: 9000 });
    oldYMap.set('enabled', true);
    doc.transact(() => routingYMap.set('old-ym-rule', oldYMap));

    const rules = getRoutingRules(doc);
    // Old rule excluded (no target_device_id), but no crash
    expect(rules.find((r) => (r as unknown as { id?: string }).id === 'old-ym-rule')).toBeUndefined();
  });

  it('migration renames id → rule_id and tag → tag_pattern in old Y.Map rule (idempotent)', () => {
    const doc = makeDocWithDevices();
    const initialRules = getRoutingRules(doc);
    for (const r of initialRules) removeRoutingRule(doc, r.rule_id, ctx);

    const routingYMap = doc.getMap('routing');
    const oldYMap = new Y.Map<unknown>();
    oldYMap.set('id', 'migrated-rule');
    oldYMap.set('match', { payload_type: 'osc', tag: 'LX' });
    oldYMap.set('transport', { kind: 'osc', host: '5.6.7.8', port: 9000 });
    oldYMap.set('enabled', true);
    doc.transact(() => routingYMap.set('migrated-rule', oldYMap));

    // First call runs migration (renames fields)
    getRoutingRules(doc);
    expect(oldYMap.get('rule_id')).toBe('migrated-rule');
    expect(oldYMap.has('sort_key')).toBe(true);

    const matchAfter = oldYMap.get('match') as Record<string, unknown>;
    expect('tag_pattern' in matchAfter).toBe(true);
    expect(matchAfter['tag_pattern']).toBe('LX');

    // Second call: idempotent — same state
    getRoutingRules(doc);
    expect(oldYMap.get('rule_id')).toBe('migrated-rule');
    expect(Object.prototype.hasOwnProperty.call(oldYMap.get('match'), 'tag_pattern')).toBe(true);
  });

  it('new-shape rules (from B003-101) are returned correctly after idempotent migration call', () => {
    const doc = makeDocWithDevices();
    const initialRules = getRoutingRules(doc);

    // All auto-created rules should have target_device_id
    for (const r of initialRules) {
      expect(r.target_device_id).toBeTruthy();
      expect(r.rule_id).toBeTruthy();
    }

    // Second call — same rules
    const secondCall = getRoutingRules(doc);
    expect(secondCall.map((r) => r.rule_id)).toEqual(initialRules.map((r) => r.rule_id));
  });
});
