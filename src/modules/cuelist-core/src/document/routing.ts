import * as Y from 'yjs';
import { uuidv7 } from './uuid.js';
import { getRouting, getDevices } from './show.js';
import { ValidationError } from './payload.js';
import { assertEditAllowed } from '../mode/lockGuards.js';

export type RulePayloadType = 'osc' | 'msc' | 'lx_ref' | 'midi' | 'webhook' | 'wait' | 'group';

export interface RoutingRuleMatch {
  payload_type?: RulePayloadType;
  tag_pattern?: string;
  device_id?: string;
}

export interface RoutingRule {
  rule_id: string;
  sort_key: number;
  match: RoutingRuleMatch;
  target_device_id: string;
  notes?: string;
}

const VALID_PAYLOAD_TYPES: RulePayloadType[] = [
  'osc', 'msc', 'lx_ref', 'midi', 'webhook', 'wait', 'group',
];

function validateRule(init: Omit<RoutingRule, 'rule_id' | 'sort_key'>): void {
  if (!init.target_device_id || init.target_device_id.trim().length === 0) {
    throw new ValidationError('target_device_id is required', 'target_device_id');
  }
  if (
    init.match.payload_type !== undefined &&
    !VALID_PAYLOAD_TYPES.includes(init.match.payload_type)
  ) {
    throw new ValidationError(
      `match.payload_type must be one of ${VALID_PAYLOAD_TYPES.join(', ')}`,
      'match.payload_type',
    );
  }
}

function ruleMapToPlain(m: Y.Map<unknown>): RoutingRule {
  const obj = m.toJSON();
  const { added_by: _a, added_at: _b, modified_by: _c, modified_at: _d, ...rest } = obj as Record<string, unknown>;
  return rest as unknown as RoutingRule;
}

export function getRoutingRules(doc: Y.Doc): RoutingRule[] {
  const routing = getRouting(doc);
  const rules: RoutingRule[] = [];
  routing.forEach((m) => rules.push(ruleMapToPlain(m as Y.Map<unknown>)));
  return rules.sort((a, b) => a.sort_key - b.sort_key);
}

export function getRoutingRule(doc: Y.Doc, ruleId: string): RoutingRule | undefined {
  const m = getRouting(doc).get(ruleId);
  if (!m) return undefined;
  return ruleMapToPlain(m as Y.Map<unknown>);
}

export function addRoutingRule(
  doc: Y.Doc,
  init: Omit<RoutingRule, 'rule_id' | 'sort_key'> & { sort_key?: number },
  ctx: { actorId: string },
): RoutingRule {
  assertEditAllowed(doc, 'structure');
  validateRule(init);

  if (!getDevices(doc).has(init.target_device_id)) {
    throw new ValidationError(
      `target_device_id '${init.target_device_id}' not found in devices`,
      'target_device_id',
    );
  }

  const routing = getRouting(doc);
  const ruleId = uuidv7();
  const existing = getRoutingRules(doc);
  const maxSk = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.sort_key));
  const sortKey = init.sort_key ?? maxSk + 1000;

  const m = new Y.Map<unknown>();
  m.set('rule_id', ruleId);
  m.set('sort_key', sortKey);
  m.set('match', init.match);
  m.set('target_device_id', init.target_device_id);
  m.set('notes', init.notes ?? '');
  m.set('added_by', ctx.actorId);
  m.set('added_at', new Date().toISOString());

  doc.transact(() => routing.set(ruleId, m));

  return { rule_id: ruleId, sort_key: sortKey, match: init.match, target_device_id: init.target_device_id, notes: init.notes };
}

export function updateRoutingRule(
  doc: Y.Doc,
  ruleId: string,
  patch: Partial<Omit<RoutingRule, 'rule_id'>>,
  ctx: { actorId: string },
): void {
  assertEditAllowed(doc, 'structure');
  const routing = getRouting(doc);
  const m = routing.get(ruleId) as Y.Map<unknown> | undefined;
  if (!m) throw new Error(`routing rule '${ruleId}' not found`);

  const current = ruleMapToPlain(m);
  const merged = { ...current, ...patch };
  validateRule(merged);

  if (patch.target_device_id && !getDevices(doc).has(patch.target_device_id)) {
    throw new ValidationError(
      `target_device_id '${patch.target_device_id}' not found in devices`,
      'target_device_id',
    );
  }

  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        m.delete(k);
      } else {
        m.set(k, v as unknown);
      }
    }
    m.set('modified_by', ctx.actorId);
    m.set('modified_at', new Date().toISOString());
  });
}

export function removeRoutingRule(
  doc: Y.Doc,
  ruleId: string,
  _ctx: { actorId: string },
): void {
  assertEditAllowed(doc, 'structure');
  const routing = getRouting(doc);
  if (!routing.has(ruleId)) throw new Error(`routing rule '${ruleId}' not found`);
  doc.transact(() => routing.delete(ruleId));
}

export function reorderRoutingRules(
  doc: Y.Doc,
  newOrder: string[],
  _ctx: { actorId: string },
): void {
  assertEditAllowed(doc, 'structure');
  const routing = getRouting(doc);
  doc.transact(() => {
    newOrder.forEach((ruleId, idx) => {
      const m = routing.get(ruleId) as Y.Map<unknown> | undefined;
      if (!m) throw new Error(`routing rule '${ruleId}' not found in reorder`);
      m.set('sort_key', (idx + 1) * 1000);
    });
  });
}
