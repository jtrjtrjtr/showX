import * as Y from 'yjs';
import type { EventBus, Logger, CueFireEvent } from 'showx-shared';
import type { SideChannelMessage, Subscription } from 'showx-shared';
import type { OutputDispatcher } from 'showx-shared';
import { GoEventChannel } from '@showx/module-cuelist-core/go/goEventChannel.js';
import { dispatchCue } from '@showx/module-cuelist-core/dispatch/payloadDispatch.js';
import type { DispatchDeps } from '@showx/module-cuelist-core/dispatch/payloadDispatch.js';
import type { Cue } from 'showx-shared';

// ── SyncBroker interface subset used by GoExecutor ────────────────────────────

interface GoExecutorSyncBroker {
  publishSideChannel(showId: string, msg: SideChannelMessage): void;
  subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription;
}

// ── GoExecutor ────────────────────────────────────────────────────────────────

export interface GoExecutorDeps {
  syncBroker: GoExecutorSyncBroker;
  events: EventBus;
  output: OutputDispatcher;
  log: Logger;
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

  constructor(private readonly deps: GoExecutorDeps) {}

  attach(showId: string, doc: Y.Doc): void {
    if (this.channel) this.detach();

    const { syncBroker, events, log } = this.deps;
    const abort = new AbortController();

    // SHOWX_OSC_OUT=host:port — when set, register/override the integration OSC device + fallback rule.
    // Allows testing against osc-ws-bridge without manually configuring devices in the show.
    const oscOut = process.env['SHOWX_OSC_OUT'];
    if (oscOut) {
      this.injectOscDevice(doc, oscOut, log);
    }

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
      subscribe: (topic, handler) => {
        const sub = syncBroker.subscribeSideChannel(showId, (m) => {
          const msg = m as unknown as Record<string, unknown>;
          if (msg['topic'] === topic) handler(msg);
        });
        return sub.unsubscribe;
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
  }

  // ── Private helpers ────────────────────────────────────────────────────────

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
    } catch (err) {
      log.warn('go-executor: dispatchCue threw', { cue_id: e.cue_id, error: String(err) });
    }
  }

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
