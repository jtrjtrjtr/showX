import type { Cue, Payload } from 'showx-shared';
import { validatePayload } from '../document/payload.js';
import { CycleDetector } from './cycleDetect.js';
import { dispatchOsc } from './transports/osc.js';
import { dispatchMsc } from './transports/msc.js';
import { dispatchLxRef } from './transports/lxRef.js';
import { dispatchMidi } from './transports/midi.js';
import { dispatchWebhook } from './transports/webhook.js';
import { dispatchWait } from './transports/wait.js';
import { dispatchGroup } from './transports/group.js';
import type { DispatchDeps, SingleDispatchResult } from './types.js';
import type { RoutingEntry } from './resolveRouting.js';
import { buildDispatchRoutingTable } from './resolveRouting.js';

export type { DispatchDeps } from './types.js';

export interface CueDispatchResult {
  ok: boolean;
  payloads_dispatched: number;
  payloads_failed: Array<{ payload_id: string; error: string }>;
  duration_ms: number;
  details: Array<{
    payload_id: string;
    transport: string;
    result: 'ok' | 'error' | 'skipped';
    error?: string;
  }>;
}

const MAX_GROUP_DEPTH = 4;

/**
 * Dispatch all payloads for a cue in declaration order.
 * Emits `cue-complete` on EventBus when done (top-level call only).
 * Group sub-dispatches pass _internal=true to suppress nested events.
 */
export async function dispatchCue(
  cue: Cue,
  deps: DispatchDeps,
  cycleCtx: CycleDetector = new CycleDetector(),
  _internal = false,
): Promise<CueDispatchResult> {
  const t0 = Date.now();
  const details: CueDispatchResult['details'] = [];
  const failed: CueDispatchResult['payloads_failed'] = [];
  let ok_count = 0;

  if (cycleCtx.depth() >= MAX_GROUP_DEPTH) {
    deps.events.publish({
      type: 'system-error',
      seq: 0,
      ts: Date.now(),
      source: 'cuelist-core',
      module: 'cuelist-core',
      severity: 'error',
      code: 'group-nesting-too-deep',
      message: `group nesting exceeded ${MAX_GROUP_DEPTH} levels`,
      context: { cue_id: cue.id },
    });
    const duration_ms = Date.now() - t0;
    return {
      ok: false,
      payloads_dispatched: 0,
      payloads_failed: [{ payload_id: cue.id, error: 'group-nesting-too-deep' }],
      duration_ms,
      details: [],
    };
  }

  if (cycleCtx.contains(cue.id)) {
    deps.events.publish({
      type: 'system-error',
      seq: 0,
      ts: Date.now(),
      source: 'cuelist-core',
      module: 'cuelist-core',
      severity: 'error',
      code: 'group-cycle-detected',
      message: `group cycle: cue ${cue.id} already in call stack`,
      context: { cue_id: cue.id, stack: cycleCtx.snapshot() },
    });
    const duration_ms = Date.now() - t0;
    return {
      ok: false,
      payloads_dispatched: 0,
      payloads_failed: [{ payload_id: cue.id, error: 'group-cycle-detected' }],
      duration_ms,
      details: [],
    };
  }

  cycleCtx.enter(cue.id);

  try {
    const routing = buildDispatchRoutingTable(deps.doc);

    for (const p of cue.payloads) {
      if (deps.abortSignal.aborted) {
        details.push({ payload_id: p.id, transport: p.type, result: 'skipped', error: 'aborted' });
        continue;
      }

      try {
        validatePayloadSafe(p);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ payload_id: p.id, transport: p.type, result: 'error', error: msg });
        failed.push({ payload_id: p.id, error: msg });
        deps.log.warn('payload validation failed before dispatch', { payload_id: p.id, cue_id: cue.id, error: msg });
        continue;
      }

      try {
        const r = await dispatchOne(p, deps, routing, cycleCtx);
        if (r.ok) {
          details.push({ payload_id: p.id, transport: p.type, result: 'ok' });
          ok_count++;
        } else {
          details.push({ payload_id: p.id, transport: p.type, result: 'error', error: r.error });
          failed.push({ payload_id: p.id, error: r.error ?? 'unknown' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ payload_id: p.id, transport: p.type, result: 'error', error: msg });
        failed.push({ payload_id: p.id, error: msg });
        deps.log.warn('payload dispatch threw', { payload_id: p.id, cue_id: cue.id, error: msg });
      }
    }
  } finally {
    cycleCtx.exit();
  }

  const duration_ms = Date.now() - t0;
  const result: CueDispatchResult = {
    ok: failed.length === 0,
    payloads_dispatched: ok_count,
    payloads_failed: failed,
    duration_ms,
    details,
  };

  if (!_internal) {
    deps.events.publish({
      type: 'cue-complete',
      seq: 0,
      ts: Date.now(),
      source: 'cuelist-core',
      show_id: deps.show_id,
      cuelist_id: deps.cuelist_id,
      cue_id: cue.id,
      duration_ms: result.duration_ms,
      success: result.ok,
      errors: result.payloads_failed.map((f) => f.error),
      payloads_dispatched: result.payloads_dispatched,
      payloads_failed: result.payloads_failed.map((f) => f.payload_id),
    });
  }

  return result;
}

async function dispatchOne(
  payload: Payload,
  deps: DispatchDeps,
  routing: Record<string, RoutingEntry>,
  cycleCtx: CycleDetector,
): Promise<SingleDispatchResult> {
  switch (payload.type) {
    case 'osc':
      return dispatchOsc(payload, routing, deps);
    case 'msc':
      return dispatchMsc(payload, routing, deps);
    case 'lx_ref':
      return dispatchLxRef(payload, routing, deps);
    case 'midi':
      return dispatchMidi(payload, routing, deps);
    case 'webhook':
      return dispatchWebhook(payload, deps);
    case 'wait':
      return dispatchWait(payload, deps);
    case 'group':
      return dispatchGroup(payload, deps, cycleCtx, async (child, ctx) =>
        dispatchCue(child, deps, ctx, true).then((r) => ({
          ok: r.ok,
          error: r.payloads_failed[0]?.error,
        })),
      );
    default: {
      const t = (payload as { type: string }).type;
      return { ok: false, error: `unknown payload type ${t}` };
    }
  }
}

function validatePayloadSafe(p: Payload): void {
  validatePayload(p as unknown as Parameters<typeof validatePayload>[0]);
}
