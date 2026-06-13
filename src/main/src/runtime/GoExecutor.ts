import * as Y from 'yjs';
import type { EventBus, Logger, CueFireEvent, SideChannelMessage, Subscription } from 'showx-shared';
import type { Cue, OutputDispatcher, TransportMessage, Transport, DispatchResult } from 'showx-shared';
import { GoEventChannel } from '@showx/module-cuelist-core/go/goEventChannel.js';
import type { OperatorContext, AuditionResult } from '@showx/module-cuelist-core/go/goEventChannel.js';
import { dispatchCue } from '@showx/module-cuelist-core/dispatch/payloadDispatch.js';
import type { DispatchDeps } from '@showx/module-cuelist-core/dispatch/payloadDispatch.js';
import { OscPortListener } from '../shared/input/oscListener.js';
import { getDevicesList } from '@showx/module-cuelist-core/document/devices.js';

// ── DeviceReplyTracker ────────────────────────────────────────────────────────

export interface DeviceReplyUpdate {
  deviceId: string;
  status: 'confirmed' | 'ok';
  updatedAt: number;
}

type ReplyStatusCb = (update: DeviceReplyUpdate) => void;

const CONFIRMED_TTL_MS = 30_000;

type OscListenerFactory = (port: number, log: Logger) => OscPortListener;

interface ReplyEntry {
  host: string;
  listener: OscPortListener;
  decayTimer: ReturnType<typeof setTimeout> | null;
}

/**
 * Tracks per-device OSC reply confirmation.
 * - Binds a UDP listener on device.reply_port; when OSC arrives from device.host → 'confirmed'.
 * - After CONFIRMED_TTL_MS with no further reply, decays back to 'ok'.
 * - Only OSC devices with expects_reply=true + reply_port are registered.
 * - Fire-and-forget devices (no expects_reply) are never registered → never show 'unconfirmed'.
 */
export class DeviceReplyTracker {
  private portListeners = new Map<number, OscPortListener>();
  private portRefCount = new Map<number, number>();
  private entries = new Map<string, ReplyEntry>();
  private cbs = new Set<ReplyStatusCb>();

  constructor(
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
    private readonly listenerFactory: OscListenerFactory = (port, l) => new OscPortListener(port, l),
  ) {}

  async register(deviceId: string, host: string, replyPort: number): Promise<void> {
    if (this.entries.has(deviceId)) return;

    let listener = this.portListeners.get(replyPort);
    if (!listener) {
      listener = this.listenerFactory(replyPort, this.log);
      try {
        await listener.start();
      } catch (err) {
        this.log.warn('reply-tracker: bind failed', { deviceId, replyPort, err: String(err) });
        return;
      }
      this.portListeners.set(replyPort, listener);
      this.portRefCount.set(replyPort, 0);
    }

    const capturedHost = host;
    const capturedDeviceId = deviceId;
    const msgHandler = (msg: { fromHost: string }): void => {
      if (msg.fromHost !== capturedHost) return;
      this.handleReply(capturedDeviceId);
    };

    listener.addHandler(msgHandler as Parameters<OscPortListener['addHandler']>[0]);
    this.portRefCount.set(replyPort, (this.portRefCount.get(replyPort) ?? 0) + 1);

    this.entries.set(deviceId, {
      host,
      listener,
      decayTimer: null,
    });

    this.log.info('reply-tracker: registered', { deviceId, host, replyPort });
  }

  private handleReply(deviceId: string): void {
    const entry = this.entries.get(deviceId);
    if (!entry) return;

    if (entry.decayTimer !== null) clearTimeout(entry.decayTimer);

    const at = this.now();
    entry.decayTimer = setTimeout(() => {
      entry.decayTimer = null;
      this.emit({ deviceId, status: 'ok', updatedAt: this.now() });
    }, CONFIRMED_TTL_MS);

    this.emit({ deviceId, status: 'confirmed', updatedAt: at });
  }

  onStatus(cb: ReplyStatusCb): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  private emit(update: DeviceReplyUpdate): void {
    for (const cb of this.cbs) {
      try { cb(update); } catch { /* ignore */ }
    }
  }

  async unregisterAll(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.decayTimer !== null) clearTimeout(entry.decayTimer);
    }
    this.entries.clear();
    for (const listener of this.portListeners.values()) {
      await listener.stop();
    }
    this.portListeners.clear();
    this.portRefCount.clear();
  }
}

// ── DispatchRecord ─────────────────────────────────────────────────────────────

export interface DispatchRecord {
  ts: string;
  cue_id: string;
  cue_label: string;
  transport_summary: string;
  payloads_dispatched: number;
  payloads_failed: Array<{ payload_id: string; error: string }>;
  duration_ms: number;
  fired_by: string;
}

const RING_SIZE = 100;

// ── SyncBroker interface subset used by GoExecutor ────────────────────────────

interface GoExecutorSyncBroker {
  publishSideChannel(showId: string, msg: SideChannelMessage): void;
  subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription;
}

// ── GoExecutor ────────────────────────────────────────────────────────────────

/** PairingStore subset — operator authority resolution (operator_id == device_id in 3.x). */
interface GoExecutorPairing {
  getDevice(deviceId: string): { owned_departments: string[]; revoked_at?: number } | null;
}

export interface GoExecutorDeps {
  syncBroker: GoExecutorSyncBroker;
  events: EventBus;
  output: OutputDispatcher;
  log: Logger;
  pairing: GoExecutorPairing;
}

/**
 * Wires GoEventChannel + dispatchCue + OutputDispatcher for one active show.
 * Lifecycle is tied to the active show: call attach() on show open, detach() on close.
 * Lives in main runtime (not inside CuelistCore module) because it composes shell-shared
 * services (ActiveShowDoc, SyncBroker.sideChannel, OutputDispatcher).
 */
export class GoExecutor {
  private channel: GoEventChannel | null = null;
  private unsubs: Array<() => void> = [];
  private ring: DispatchRecord[] = [];
  private appendListeners = new Set<(r: DispatchRecord) => void>();
  private replyTracker: DeviceReplyTracker | null = null;
  private replyStatusListeners = new Set<ReplyStatusCb>();

  getLog(): DispatchRecord[] {
    return [...this.ring];
  }

  onAppend(cb: (r: DispatchRecord) => void): () => void {
    this.appendListeners.add(cb);
    return () => this.appendListeners.delete(cb);
  }

  onReplyStatus(cb: ReplyStatusCb): () => void {
    this.replyStatusListeners.add(cb);
    return () => this.replyStatusListeners.delete(cb);
  }

  private pushRecord(record: DispatchRecord): void {
    if (this.ring.length >= RING_SIZE) this.ring.shift();
    this.ring.push(record);
    for (const cb of this.appendListeners) cb(record);
  }

  constructor(private readonly deps: GoExecutorDeps) {}

  attach(showId: string, doc: Y.Doc): void {
    if (this.channel) this.detach();

    const { syncBroker, events, log } = this.deps;

    // Set up reply tracker for OSC devices that opt in to expects_reply
    this.replyTracker = new DeviceReplyTracker(log);
    const tracker = this.replyTracker;
    void this.registerReplyDevices(doc, tracker);
    tracker.onStatus((update) => {
      for (const cb of this.replyStatusListeners) {
        try { cb(update); } catch { /* ignore */ }
      }
    });
    const abort = new AbortController();

    // Always inject an integration OSC fallback so a FRESH DEMO SHOW dispatches out of the box.
    // Default target: 127.0.0.1:7000 (integration osc-ws-bridge). SHOWX_OSC_OUT=host:port overrides.
    // Rule uses sort_key 99999 (lowest priority) — real show device/routing takes precedence.
    const oscOut = process.env['SHOWX_OSC_OUT'] ?? '127.0.0.1:7000';
    this.injectOscDevice(doc, oscOut, log);

    this.channel = new GoEventChannel({
      doc,
      events,
      log,
      // broadcast to ALL stations via the side-channel for this show
      broadcast: (env) => {
        syncBroker.publishSideChannel(showId, env as unknown as SideChannelMessage);
      },
      // publishToStation falls back to broadcast — LAN with a handful of stations;
      // clients filter by topic/cuelist_id on their side (B003-505 SHOW-mode will add targeted delivery)
      publishToStation: (_stationId, env) => {
        syncBroker.publishSideChannel(showId, env as unknown as SideChannelMessage);
      },
      // Authority context from PairingStore: operator_id == device_id (3.x),
      // owned_departments captured at claim (PairingView adds 'SM' for sm-role stations).
      // Revoked devices are explicitly blocked before department checks.
      octx: {
        isRevoked: (operatorId: string): boolean =>
          this.deps.pairing.getDevice(operatorId)?.revoked_at !== undefined,
        operatorOwns: (operatorId: string, dept: string): boolean => {
          const d = this.deps.pairing.getDevice(operatorId);
          return d?.revoked_at === undefined && (d?.owned_departments.includes(dept) ?? false);
        },
        operatorOwned: (operatorId: string): string[] => {
          const d = this.deps.pairing.getDevice(operatorId);
          return d?.revoked_at === undefined ? (d?.owned_departments ?? []) : [];
        },
      } satisfies OperatorContext,
      subscribe: (topic, handler) => {
        const sub = syncBroker.subscribeSideChannel(showId, (m) => {
          const msg = m as unknown as Record<string, unknown>;
          if (msg['topic'] === topic) handler(msg);
        });
        return sub.unsubscribe;
      },
      // Audition: full dispatch pipeline with no-op output — no real sends, no chain advance
      dispatchAudition: async (cueId, cuelistId, payloads): Promise<AuditionResult> => {
        const now = new Date().toISOString();
        const cue: Cue = {
          id: cueId, label: cueId, description: '', department: [],
          standby_note: '', script_line_ref: null, trigger: { kind: 'manual' },
          payloads, duration_hint_ms: null, notes: '', payload_frozen_at: null,
          created_at: now, created_by: 'audition', modified_at: now, modified_by: 'audition',
        };
        const auditDeps: DispatchDeps = {
          doc, show_id: showId, cuelist_id: cuelistId,
          output: makeNopOutput(),
          events, log,
          abortSignal: abort.signal,
          audition: true,
        };
        const result = await dispatchCue(cue, auditDeps);
        this.pushRecord({
          ts: now,
          cue_id: cueId,
          cue_label: cueId,
          transport_summary: buildTransportSummary(result.details),
          payloads_dispatched: result.payloads_dispatched,
          payloads_failed: result.payloads_failed,
          duration_ms: result.duration_ms,
          fired_by: 'audition',
        });
        return {
          topic: 'audition.result',
          request_id: '',
          cue_id: cueId,
          cuelist_id: cuelistId,
          ok: result.ok,
          details: result.details,
        };
      },
    });

    this.channel.start();

    // Subscribe to cue-fire emitted by GoEventChannel.onGoRequest.
    // dispatchCue executes the payloads and publishes cue-complete, which GoEventChannel
    // then uses to broadcast go.dispatched to all stations.
    const fireSub = events.subscribe<CueFireEvent>('cue-fire', (e) => {
      void this.handleCueFire(showId, doc, e, abort.signal);
    });

    this.unsubs.push(() => fireSub.unsubscribe(), () => abort.abort());
  }

  detach(): void {
    this.channel?.stop();
    this.channel = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    void this.replyTracker?.unregisterAll();
    this.replyTracker = null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async registerReplyDevices(doc: Y.Doc, tracker: DeviceReplyTracker): Promise<void> {
    const devices = getDevicesList(doc);
    for (const device of devices) {
      if (device.expects_reply && device.reply_port && device.host) {
        await tracker.register(device.device_id, device.host, device.reply_port);
      }
    }
  }

  private async handleCueFire(
    showId: string,
    doc: Y.Doc,
    e: CueFireEvent,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const { output, events, log } = this.deps;

    // Build a Cue object from the cue-fire event.
    // GoEventChannel already extracted payloads from the Y.Doc; we use those directly
    // so dispatchCue doesn't need to re-query the doc for payload data.
    const now = new Date().toISOString();
    const cue: Cue = {
      id: e.cue_id,
      label: e.cue_label,
      description: '',
      department: e.departments,
      standby_note: '',
      script_line_ref: null,
      trigger: { kind: 'manual' },
      payloads: e.payloads ?? [],
      duration_hint_ms: null,
      notes: '',
      payload_frozen_at: null,
      created_at: now,
      created_by: 'go-executor',
      modified_at: now,
      modified_by: 'go-executor',
    };

    const dispatchDeps: DispatchDeps = {
      doc,
      show_id: showId,
      cuelist_id: e.cuelist_id,
      output,
      events,
      log,
      abortSignal,
    };

    const t0 = Date.now();
    try {
      const result = await dispatchCue(cue, dispatchDeps);
      const duration_ms = Date.now() - t0;

      if (result.payloads_failed.length > 0) {
        log.warn('cue.dispatched', {
          cue_id: e.cue_id,
          cue_label: e.cue_label,
          payloads_dispatched: result.payloads_dispatched,
          payloads_failed: result.payloads_failed.length,
          duration_ms,
        });
      } else {
        log.info('cue.dispatched', {
          cue_id: e.cue_id,
          cue_label: e.cue_label,
          payloads_dispatched: result.payloads_dispatched,
          payloads_failed: 0,
          duration_ms,
        });
      }

      this.pushRecord({
        ts: now,
        cue_id: e.cue_id,
        cue_label: e.cue_label,
        transport_summary: buildTransportSummary(result.details),
        payloads_dispatched: result.payloads_dispatched,
        payloads_failed: result.payloads_failed,
        duration_ms,
        fired_by: e.fired_by ?? 'unknown',
      });
    } catch (err) {
      log.warn('go-executor: dispatchCue threw', { cue_id: e.cue_id, error: String(err) });
      this.pushRecord({
        ts: now,
        cue_id: e.cue_id,
        cue_label: e.cue_label,
        transport_summary: '—',
        payloads_dispatched: 0,
        payloads_failed: [{ payload_id: 'unknown', error: String(err) }],
        duration_ms: Date.now() - t0,
        fired_by: e.fired_by ?? 'unknown',
      });
    }
  }

  // ── Transport summary helper ───────────────────────────────────────────────

  private injectOscDevice(doc: Y.Doc, oscOut: string, log: Logger): void {
    const colonIdx = oscOut.lastIndexOf(':');
    if (colonIdx === -1) {
      log.warn('go-executor: SHOWX_OSC_OUT invalid format, expected host:port', { oscOut });
      return;
    }
    const host = oscOut.slice(0, colonIdx);
    const port = parseInt(oscOut.slice(colonIdx + 1), 10);
    if (!host || isNaN(port) || port < 1 || port > 65535) {
      log.warn('go-executor: SHOWX_OSC_OUT invalid host or port', { oscOut });
      return;
    }

    const DEVICE_ID = 'integration_osc';
    const RULE_ID = 'integration_osc_fallback';

    doc.transact(() => {
      // Register/override the integration OSC device
      const devicesMap = doc.getMap<Y.Map<unknown>>('devices');
      const dm = new Y.Map<unknown>();
      dm.set('device_id', DEVICE_ID);
      dm.set('label', `Integration OSC (${host}:${port})`);
      dm.set('transport', 'osc');
      dm.set('host', host);
      dm.set('port', port);
      dm.set('driver', 'generic');
      dm.set('added_by', 'go-executor');
      dm.set('added_at', new Date().toISOString());
      devicesMap.set(DEVICE_ID, dm);

      // Add a fallback routing rule (lowest sort_key = highest numeric = last priority)
      const routingMap = doc.getMap<Y.Map<unknown>>('routing');
      if (!routingMap.has(RULE_ID)) {
        const rule = new Y.Map<unknown>();
        rule.set('rule_id', RULE_ID);
        rule.set('sort_key', 99999);
        rule.set('match', {});
        rule.set('target_device_id', DEVICE_ID);
        rule.set('notes', 'Integration OSC fallback — SHOWX_OSC_OUT');
        rule.set('added_by', 'go-executor');
        rule.set('added_at', new Date().toISOString());
        routingMap.set(RULE_ID, rule);
      }
    });

    log.info('go-executor: injected integration OSC device', { device_id: DEVICE_ID, host, port });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNopOutput(): OutputDispatcher {
  return {
    send: async (msg: TransportMessage): Promise<DispatchResult> => ({
      ok: true,
      transport: msg.transport as Transport,
      latencyMs: 0,
    }),
    claim: async () => ({ id: 'nop', slug: 'nop', destination: { transport: 'osc' as const } }),
    release: async () => {},
    poolStatus: () => ({ oscConnections: [], midiOutputs: [], dmxUniverses: [] }),
  };
}

function buildTransportSummary(
  details: Array<{ transport: string; result: string }>,
): string {
  const counts = new Map<string, number>();
  for (const d of details) {
    if (d.result !== 'skipped') {
      counts.set(d.transport, (counts.get(d.transport) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '—';
  return [...counts.entries()].map(([t, n]) => `${t}×${n}`).join(' ');
}
