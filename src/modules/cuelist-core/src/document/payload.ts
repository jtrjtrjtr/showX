import * as Y from 'yjs';
import type { Cue, Payload, OscPayload, WebhookPayload, WaitPayload, MscPayload, LxRefPayload, MidiPayload, GroupPayload } from 'showx-shared';
import { uuidv7 } from './uuid.js';
import { getCuelist, getCues } from './cuelist.js';
import { assertEditAllowed } from '../mode/lockGuards.js';
import { assertCueInvariants } from '../cue/invariants.js';

// ── Validation ────────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a plain payload object (pre-Y.Map creation).
 * Used in makePayloadMap and updatePayload.
 * NOTE: do NOT use Y.Map.get() here — prelim maps return undefined.
 */
export function validatePayload(payload: Partial<Omit<Payload, 'id'>>): void {
  const type = payload.type;
  switch (type) {
    case 'osc': {
      const address = (payload as Partial<OscPayload>).address;
      if (!address?.startsWith('/')) {
        throw new ValidationError('osc address must start with /', 'address');
      }
      break;
    }
    case 'webhook': {
      const url = (payload as Partial<WebhookPayload>).url ?? '';
      const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost|::1)(:\d+)?(\/|$)/.test(url);
      if (!url.startsWith('https://') && !isLoopback) {
        throw new ValidationError(
          'webhook url must be https (loopback http allowed)',
          'url',
        );
      }
      break;
    }
    case 'wait': {
      const ms = (payload as Partial<WaitPayload>).duration_ms;
      if (ms === undefined || ms < 0 || ms > 600_000) {
        throw new ValidationError('wait duration_ms must be 0..600000', 'duration_ms');
      }
      break;
    }
    case 'msc': {
      const did = (payload as Partial<MscPayload>).device_id_msc;
      if (did === undefined || did < 0 || did > 127) {
        throw new ValidationError('msc device_id_msc must be 0..127', 'device_id_msc');
      }
      break;
    }
    case 'lx_ref': {
      const cl = (payload as Partial<LxRefPayload>).cue_list;
      const cn = (payload as Partial<LxRefPayload>).cue_number;
      if (cl === undefined || cl < 1) {
        throw new ValidationError('lx_ref cue_list must be ≥ 1', 'cue_list');
      }
      if (cn === undefined || cn < 0) {
        throw new ValidationError('lx_ref cue_number must be ≥ 0', 'cue_number');
      }
      break;
    }
    case 'midi': {
      const msg = (payload as Partial<MidiPayload>).message;
      if (msg && 'channel' in msg) {
        const ch = (msg as { channel: number }).channel;
        if (ch < 1 || ch > 16) {
          throw new ValidationError('midi channel must be 1..16', 'message.channel');
        }
      }
      break;
    }
    case 'group': {
      const children = (payload as Partial<GroupPayload>).child_cue_ids;
      if (children && children.length > 32) {
        throw new ValidationError('group child_cue_ids must be ≤ 32', 'child_cue_ids');
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Validate an integrated Y.Map payload (for use in updatePayload only).
 * Only call this when the map is already part of a Y.Doc.
 */
export function validatePayloadMap(m: Y.Map<unknown>): void {
  const plain: Record<string, unknown> = {};
  m.forEach((v, k) => { plain[k] = v; });
  validatePayload(plain as unknown as Partial<Omit<Payload, 'id'>>);
}

function assertCueMapValid(cueMap: Y.Map<unknown>): void {
  assertCueInvariants(cueMap.toJSON() as Cue);
}

// ── Payload accessors ─────────────────────────────────────────────────────────

export function getPayloads(cueMap: Y.Map<unknown>): Y.Array<Y.Map<unknown>> {
  return cueMap.get('payloads') as Y.Array<Y.Map<unknown>>;
}

// ── Payload factories ─────────────────────────────────────────────────────────

export function makePayloadMap(payload: Omit<Payload, 'id'>): Y.Map<unknown> {
  // Validate plain object BEFORE creating Y.Map (prelim maps cannot be read).
  validatePayload(payload);

  const m = new Y.Map<unknown>();
  m.set('id', uuidv7());
  m.set('type', payload.type);
  m.set('tag', payload.tag ?? null);
  m.set('note', payload.note ?? '');
  for (const [k, v] of Object.entries(payload)) {
    if (!['id', 'type', 'tag', 'note'].includes(k)) {
      m.set(k, v);
    }
  }
  return m;
}

// ── Payload mutators ──────────────────────────────────────────────────────────

export function addPayload(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  payload: Omit<Payload, 'id'>,
): string {
  assertEditAllowed(doc, 'payload');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  const payloads = getPayloads(cue);
  const m = makePayloadMap(payload);
  doc.transact(() => payloads.push([m]));
  assertCueMapValid(cue);
  return m.get('id') as string;
}

export function removePayload(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  payloadId: string,
): void {
  assertEditAllowed(doc, 'payload');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  const payloads = getPayloads(cue);
  const arr = payloads.toArray();
  const idx = arr.findIndex((p) => p.get('id') === payloadId);
  if (idx === -1) throw new Error(`payload ${payloadId} not found`);
  doc.transact(() => payloads.delete(idx, 1));
  assertCueMapValid(cue);
}

export function updatePayload(
  doc: Y.Doc,
  cuelistId: string,
  cueId: string,
  payloadId: string,
  updates: Partial<Omit<Payload, 'id'>>,
): void {
  assertEditAllowed(doc, 'payload');
  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) throw new Error(`cuelist ${cuelistId} not found`);
  const cue = getCues(cuelist).toArray().find((c) => c.get('id') === cueId);
  if (!cue) throw new Error(`cue ${cueId} not found`);
  const payloads = getPayloads(cue);
  const payload = payloads.toArray().find((p) => p.get('id') === payloadId);
  if (!payload) throw new Error(`payload ${payloadId} not found`);

  if ('type' in updates && updates.type !== payload.get('type')) {
    throw new ValidationError('payload.type is immutable after creation', 'type');
  }

  doc.transact(() => {
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'id') payload.set(k, v);
    }
    // Re-validate integrated map (m.get() works here since map is in doc).
    validatePayloadMap(payload);
  });
  assertCueMapValid(cue);
}

// ── Department inference (Q4 MVP heuristic) ───────────────────────────────────

const CANONICAL = new Set(['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER']);

export function inferPayloadDepartment(
  cue: Y.Map<unknown>,
  payload: Y.Map<unknown>,
): string | null {
  const dept = cue.get('department') as string[] | undefined;
  if (!dept) return null;
  if (dept.length === 1) return dept[0];
  // Fall back to tag heuristic per data_model.md §6.3 (Q4 default)
  const tag = payload.get('tag') as string | null;
  if (tag && CANONICAL.has(tag)) return tag;
  return null;
}
