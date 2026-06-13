import type { Cue, Payload, OutputDispatcher, TransportMessage, Transport, DispatchResult } from 'showx-shared';
import { validatePayload } from '../document/payload.js';
import { CycleDetector } from './cycleDetect.js';
import { dispatchOsc } from './transports/osc.js';
import { dispatchMsc } from './transports/msc.js';
import { dispatchLxRef } from './transports/lxRef.js';
import { dispatchMidi } from './transports/midi.js';
import { dispatchDmx } from './transports/dmx.js';
import { dispatchWebhook } from './transports/webhook.js';
import { dispatchWait } from './transports/wait.js';
import { dispatchGroup } from './transports/group.js';
import type { DispatchDeps, SingleDispatchResult } from './types.js';
import type { RoutingEntry, TransportDescriptor } from './resolveRouting.js';
import { buildDispatchRoutingTable, resolveRoutingWithBackup } from './resolveRouting.js';
import type { ResolveRoutingParams } from './resolveRouting.js';

export type { DispatchDeps } from './types.js';

/** No-op OutputDispatcher used in audition mode — records nothing, sends nothing. */
function makeAuditionOutput(): OutputDispatcher {
  return {
    send: async (msg: TransportMessage): Promise<DispatchResult> => ({
      ok: true,
      transport: msg.transport as Transport,
      latencyMs: 0,
    }),
    claim: async () => ({ id: 'audition-nop', slug: 'audition-nop', destination: { transport: 'osc' as const } }),
    release: async () => {},
    poolStatus: () => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] }),
  };
}

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
 * Returns ResolveRoutingParams for device-routed payload types (osc, msc, lx_ref, midi).
 * Returns null for webhook/wait/group which don't use device routing.
 */
function payloadToResolveParams(p: Payload): ResolveRoutingParams | null {
  switch (p.type) {
    case 'osc': return { payloadType: 'osc', deviceId: p.device_id, tag: p.tag ?? undefined };
    case 'msc': return { payloadType: 'msc', deviceId: p.device_id };
    case 'lx_ref': return { payloadType: 'lx_ref', deviceId: p.device_id };
    case 'midi': return { payloadType: 'midi', deviceId: p.device_id };
    default: return null;
  }
}

/** Builds a single-entry routing table that maps deviceId → backupTransport (specificity 4). */
function buildBackupRoutingTable(
  backupTransport: TransportDescriptor,
  deviceId: string,
): Record<string, RoutingEntry> {
  return {
    '__backup__': {
      id: '__backup__',
      match: { device_id: deviceId },
      transport: backupTransport,
      enabled: true,
      notes: 'backup',
    },
  };
}

/**
 * Dispatch all payloads for a cue in declaration order.
 * Emits `cue-complete` on EventBus when done (top-level call only).
 * Group sub-dispatches pass _internal=true to suppress nested events.
 * When deps.audition=true: full route-resolve pipeline runs but no real transport bytes leave;
 * details are prefixed [AUDITION] and cue-complete is suppressed.
 */
export async function dispatchCue(
  cue: Cue,
  deps: DispatchDeps,
  cycleCtx: CycleDetector = new CycleDetector(),
  _internal = false,
): Promise<CueDispatchResult> {
  const t0 = Date.now();
  // Audition: substitute no-op output so routing/validation runs but nothing is sent
  const effectiveDeps: DispatchDeps = deps.audition ? { ...deps, output: makeAuditionOutput() } : deps;

  // QLab disarm: skip payload dispatch but complete chain normally
  if (!(cue.armed ?? true)) {
    const duration_ms = Date.now() - t0;
    if (!_internal && !deps.audition) {
      deps.events.publish({
        type: 'cue-complete',
        seq: 0,
        ts: Date.now(),
        source: 'cuelist-core',
        show_id: deps.show_id,
        cuelist_id: deps.cuelist_id,
        cue_id: cue.id,
        duration_ms,
        success: true,
        errors: [],
        payloads_dispatched: 0,
        payloads_failed: [],
      });
    }
    return {
      ok: true,
      payloads_dispatched: 0,
      payloads_failed: [],
      duration_ms,
      details: [{ payload_id: cue.id, transport: 'disarmed', result: 'skipped', error: '[DISARMED]' }],
    };
  }

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
    const routing = buildDispatchRoutingTable(effectiveDeps.doc);

    for (const p of cue.payloads) {
      if (effectiveDeps.abortSignal.aborted) {
        details.push({ payload_id: p.id, transport: p.type, result: 'skipped', error: 'aborted' });
        continue;
      }

      try {
        validatePayloadSafe(p);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ payload_id: p.id, transport: p.type, result: 'error', error: msg });
        failed.push({ payload_id: p.id, error: msg });
        effectiveDeps.log.warn('payload validation failed before dispatch', { payload_id: p.id, cue_id: cue.id, error: msg });
        continue;
      }

      try {
        const r = await dispatchOne(p, effectiveDeps, routing, cycleCtx);
        if (r.ok) {
          details.push({ payload_id: p.id, transport: p.type, result: 'ok' });
          ok_count++;
        } else {
          // Primary failed — attempt failover to backup if the matched rule has one
          const resolveParams = payloadToResolveParams(p);
          let failedToBackup = false;
          if (resolveParams && resolveParams.deviceId) {
            const resolution = resolveRoutingWithBackup(effectiveDeps.doc, resolveParams);
            if (!('error' in resolution) && resolution.backup) {
              const backupRouting = buildBackupRoutingTable(resolution.backup.transport, resolveParams.deviceId);
              try {
                const br = await dispatchOne(p, effectiveDeps, backupRouting, cycleCtx);
                if (br.ok) {
                  details.push({ payload_id: p.id, transport: `${p.type}→backup`, result: 'ok' });
                  ok_count++;
                } else {
                  const combinedErr = `primary: ${r.error ?? 'unknown'}; backup: ${br.error ?? 'unknown'}`;
                  details.push({ payload_id: p.id, transport: p.type, result: 'error', error: combinedErr });
                  failed.push({ payload_id: p.id, error: combinedErr });
                }
                failedToBackup = true;
              } catch (backupErr) {
                const combinedErr = `primary: ${r.error ?? 'unknown'}; backup threw: ${String(backupErr)}`;
                details.push({ payload_id: p.id, transport: p.type, result: 'error', error: combinedErr });
                failed.push({ payload_id: p.id, error: combinedErr });
                failedToBackup = true;
              }
            }
          }
          if (!failedToBackup) {
            details.push({ payload_id: p.id, transport: p.type, result: 'error', error: r.error });
            failed.push({ payload_id: p.id, error: r.error ?? 'unknown' });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ payload_id: p.id, transport: p.type, result: 'error', error: msg });
        failed.push({ payload_id: p.id, error: msg });
        effectiveDeps.log.warn('payload dispatch threw', { payload_id: p.id, cue_id: cue.id, error: msg });
      }
    }
  } finally {
    cycleCtx.exit();
  }

  // Audition: prefix every detail entry so Dispatch Log is visually distinct
  if (deps.audition) {
    for (const d of details) {
      d.transport = `[AUDITION] ${d.transport}`;
    }
  }

  const duration_ms = Date.now() - t0;
  const result: CueDispatchResult = {
    ok: failed.length === 0,
    payloads_dispatched: ok_count,
    payloads_failed: failed,
    duration_ms,
    details,
  };

  // Audition: suppress cue-complete so GoEventChannel does NOT broadcast go.dispatched
  // and the playhead/auto-chain are not advanced.
  if (!_internal && !deps.audition) {
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
    case 'dmx':
      return dispatchDmx(payload, routing, deps);
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
