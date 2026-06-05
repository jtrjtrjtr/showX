import * as Y from 'yjs';
import type { EventBus, Logger, CueCompleteEvent, ShowModeChangeEvent, ShowMode } from 'showx-shared';
import { authorise, type AuthorityCuelist, type OperatorContext } from './authority.js';
import { IdempotencyStore } from './idempotencyStore.js';
import { isHistoricReplay, RingBuffer } from './replayWindow.js';
import { SequenceCounter } from './sequence.js';
import { getCuelist, getCues } from '../document/cuelist.js';

// ── CRDT guard — data_model.md §2.11: GO fires are events, NOT CRDT state ────

export const FORBIDDEN_CRDT_FIELDS = [
  'fired_at',
  'fire_count',
  'last_fired_at',
  'last_fired_by',
] as const;

export class DesignViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignViolationError';
  }
}

/** Throws DesignViolationError if `field` is a GO-related field that must not be stored in Y.Doc. */
export function assertNotForbiddenCrdtField(field: string): void {
  if ((FORBIDDEN_CRDT_FIELDS as readonly string[]).includes(field)) {
    throw new DesignViolationError(
      `Field "${field}" must not be stored in the CRDT document — GO fires are events, not state (data_model.md §2.11)`,
    );
  }
}

// ── Wire types ─────────────────────────────────────────────────────────────────

export interface GoRequest {
  topic: 'go.request';
  request_id: string;
  cue_id: string;
  cuelist_id: string;
  station_id: string;
  operator_id: string;
  client_ts: string;
  override: boolean;
}

export interface GoDispatched {
  topic: 'go.dispatched';
  request_id: string;
  cue_id: string;
  cuelist_id: string;
  sequence: number;
  dispatched_at: string;
  payloads_dispatched: number;
  payloads_failed: string[];
  fired_by: { station_id: string; operator_id: string };
}

export interface GoRejected {
  topic: 'go.rejected';
  request_id: string;
  cue_id: string;
  reason: 'not_sm' | 'not_owner' | 'historic_replay' | 'duplicate_request' | 'timecode_only' | 'unknown_cue';
  detail?: string;
}

export interface ArmRequest {
  topic: 'arm.request';
  cue_id: string;
  cuelist_id: string;
  station_id: string;
  operator_id: string;
}

export interface ArmBroadcast {
  topic: 'arm.broadcast';
  cuelist_id: string;
  cue_id: string;
  standby_note: string;
}

export interface ModeTransition {
  topic: 'mode.transition';
  show_id: string;
  from: ShowMode;
  to: ShowMode;
  by_operator_id: string;
}

export interface ResumeRequest {
  topic: 'resume';
  station_id: string;
  since_seq: number;
  topic_filter?: string;
}

// ── Side-channel transport abstraction ────────────────────────────────────────
//
// The shell's B001-008 side-channel WSS server is the actual transport.
// GoEventChannel is transport-agnostic — wire via GoChannelDeps in CuelistCore.start().
//
// Wiring gap (document for Architect):
//   - SyncBroker.publishSideChannel broadcasts to ALL clients (no per-station addressing).
//   - For rejected GO messages, include `target_station_id` in the payload so clients filter.
//   - SyncBroker.SideChannelMessage.topic is typed as 'go'|'presence'|'preview'; the granular
//     topic (go.request, go.dispatched, etc.) lives in msg.payload.topic. Adapter must demux.

export interface GoChannelDeps {
  doc: Y.Doc;
  events: EventBus;
  log: Logger;
  /** Send a message to a specific station only (by station_id). */
  publishToStation: (station_id: string, envelope: object) => void;
  /** Broadcast a message to all connected stations. */
  broadcast: (envelope: object) => void;
  /** Subscribe to a wire topic; returns unsubscribe fn. */
  subscribe: (topic: string, handler: (msg: object) => void) => () => void;
  /** Optional operator context for authority checks (ShowX-3 MVP: caller provides from awareness). */
  octx?: OperatorContext;
}

// ── Envelope helper ───────────────────────────────────────────────────────────

function envelope(topic: string, seq: number, payload: object): object {
  return { topic, seq, ts: Date.now(), payload };
}

// ── Extended CueCompleteEvent (B003-009 will populate payloads_dispatched / payloads_failed) ──

type CueCompleteExtended = CueCompleteEvent & {
  payloads_dispatched?: number;
  payloads_failed?: string[];
};

// ── GoEventChannel ────────────────────────────────────────────────────────────

export class GoEventChannel {
  private seq = new SequenceCounter();
  private idem: IdempotencyStore;
  private rings: {
    'go.dispatched': RingBuffer<GoDispatched & { _seq: number }>;
    'go.rejected': RingBuffer<GoRejected & { _seq: number }>;
    'arm.broadcast': RingBuffer<ArmBroadcast & { _seq: number }>;
    'mode.transition': RingBuffer<ModeTransition & { _seq: number }>;
  };
  private unsubs: Array<() => void> = [];

  constructor(private deps: GoChannelDeps, opts?: { idempotencyLruSize?: number; ringCapacity?: number }) {
    this.idem = new IdempotencyStore(opts?.idempotencyLruSize ?? 1000);
    const cap = opts?.ringCapacity ?? 1024;
    this.rings = {
      'go.dispatched': new RingBuffer<GoDispatched & { _seq: number }>(cap),
      'go.rejected': new RingBuffer<GoRejected & { _seq: number }>(cap),
      'arm.broadcast': new RingBuffer<ArmBroadcast & { _seq: number }>(cap),
      'mode.transition': new RingBuffer<ModeTransition & { _seq: number }>(cap),
    };
  }

  start(): void {
    this.unsubs.push(
      this.deps.subscribe('go.request', (msg) => this.onGoRequest(msg as GoRequest)),
      this.deps.subscribe('arm.request', (msg) => this.onArmRequest(msg as ArmRequest)),
      this.deps.subscribe('resume', (msg) => this.onResume(msg as ResumeRequest)),
    );
    const cc = this.deps.events.subscribe('cue-complete', (e: CueCompleteEvent) =>
      this.onCueComplete(e as CueCompleteExtended),
    );
    const mc = this.deps.events.subscribe('show-mode-change', (e: ShowModeChangeEvent) =>
      this.onModeChange(e),
    );
    this.unsubs.push(() => cc.unsubscribe(), () => mc.unsubscribe());
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private onGoRequest(req: GoRequest): void {
    const show_id = this.showId();

    if (isHistoricReplay(req.client_ts)) {
      this.sendRejected(req, 'historic_replay', `client_ts ${req.client_ts} is older than 5s`);
      return;
    }

    if (this.idem.has(show_id, req.request_id)) {
      const cached = this.idem.getDispatched(show_id, req.request_id);
      if (cached) {
        this.deps.publishToStation(
          req.station_id,
          envelope('go.dispatched', cached.sequence, cached),
        );
      } else {
        this.sendRejected(req, 'duplicate_request', 'request_id already processed');
      }
      return;
    }

    const cuelist = this.lookupCuelistJson(req.cuelist_id);
    if (!cuelist) {
      this.sendRejected(req, 'unknown_cue', `cuelist ${req.cuelist_id} not found`);
      return;
    }

    const cueExists = cuelist.cues.some((c) => c.id === req.cue_id);
    if (!cueExists) {
      this.sendRejected(req, 'unknown_cue', `cue ${req.cue_id} not found`);
      return;
    }

    const auth = authorise(req, cuelist, this.deps.octx);
    if (!auth.ok) {
      this.sendRejected(req, auth.reason as GoRejected['reason']);
      return;
    }

    this.idem.mark(show_id, req.request_id, { request: req });

    const cueMap = this.lookupCueMap(req.cuelist_id, req.cue_id);
    const payloads = cueMap ? (cueMap.get('payloads') as Y.Array<Y.Map<unknown>>).toArray().map((p) => p.toJSON()) : [];
    const departments = cueMap ? ((cueMap.get('department') as string[]) ?? []) : [];
    const cueLabel = cueMap ? ((cueMap.get('label') as string) ?? '') : '';

    this.deps.events.publish({
      type: 'cue-fire',
      seq: this.seq.peek(),
      ts: Date.now(),
      source: 'cuelist-core',
      show_id,
      cuelist_id: req.cuelist_id,
      cue_id: req.cue_id,
      cue_label: cueLabel,
      departments: departments as import('showx-shared').DepartmentTag[],
      payloads: payloads as import('showx-shared').Payload[],
      fired_by: req.operator_id,
      trigger_mode: 'manual',
    });
  }

  private onCueComplete(e: CueCompleteExtended): void {
    const original = this.idem.findRecentRequest(e.show_id, e.cue_id);
    if (!original) return;

    const seq = this.seq.next();
    const dispatched: GoDispatched = {
      topic: 'go.dispatched',
      request_id: original.request_id,
      cue_id: e.cue_id,
      cuelist_id: e.cuelist_id,
      sequence: seq,
      dispatched_at: new Date().toISOString(),
      payloads_dispatched: e.payloads_dispatched ?? 0,
      payloads_failed: e.payloads_failed ?? [],
      fired_by: { station_id: original.station_id, operator_id: original.operator_id },
    };

    this.idem.updateDispatched(e.show_id, original.request_id, dispatched);
    this.rings['go.dispatched'].push({ ...dispatched, _seq: seq });
    this.deps.broadcast(envelope('go.dispatched', seq, dispatched));
  }

  private onArmRequest(req: ArmRequest): void {
    const cuelist = this.lookupCuelistJson(req.cuelist_id);
    const cueMap = cuelist ? this.lookupCueMap(req.cuelist_id, req.cue_id) : null;
    const standby_note = cueMap ? ((cueMap.get('standby_note') as string) ?? '') : '';

    const arm: ArmBroadcast = {
      topic: 'arm.broadcast',
      cuelist_id: req.cuelist_id,
      cue_id: req.cue_id,
      standby_note,
    };
    const seq = this.seq.next();
    this.rings['arm.broadcast'].push({ ...arm, _seq: seq });
    this.deps.broadcast(envelope('arm.broadcast', seq, arm));
  }

  private onModeChange(e: ShowModeChangeEvent): void {
    const payload: ModeTransition = {
      topic: 'mode.transition',
      show_id: e.show_id,
      from: e.from,
      to: e.to,
      by_operator_id: e.by_operator_id,
    };
    const seq = this.seq.next();
    this.rings['mode.transition'].push({ ...payload, _seq: seq });
    this.deps.broadcast(envelope('mode.transition', seq, payload));
  }

  private onResume(req: ResumeRequest): void {
    const since = req.since_seq ?? 0;
    const topicFilter = req.topic_filter;
    const topics = topicFilter
      ? ([topicFilter] as Array<keyof typeof this.rings>)
      : (Object.keys(this.rings) as Array<keyof typeof this.rings>);

    for (const topic of topics) {
      const ring = this.rings[topic];
      if (!ring) continue;

      // Gap detection: if since_seq predates the oldest retained item, notify station first
      const allItems = ring.all();
      if (allItems.length > 0) {
        const oldestRetainedSeq = (allItems[0] as { _seq: number })._seq;
        if (oldestRetainedSeq > since + 1) {
          this.deps.publishToStation(req.station_id, {
            type: 'gap',
            topic,
            from_seq: since,
            to_seq: oldestRetainedSeq - 1,
          });
        }
      }

      const missed = ring.since(since, (item) => (item as { _seq: number })._seq);
      for (const item of missed) {
        const { _seq, ...payload } = item as { _seq: number } & Record<string, unknown>;
        this.deps.publishToStation(req.station_id, envelope(topic, _seq, payload));
      }
    }
  }

  private sendRejected(req: GoRequest, reason: GoRejected['reason'], detail?: string): void {
    const rej: GoRejected = { topic: 'go.rejected', request_id: req.request_id, cue_id: req.cue_id, reason, detail };
    const seq = this.seq.next();
    this.rings['go.rejected'].push({ ...rej, _seq: seq });
    this.deps.publishToStation(req.station_id, envelope('go.rejected', seq, rej));
    this.deps.log.warn('GO rejected', { reason, cue_id: req.cue_id, station_id: req.station_id, detail });
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private showId(): string {
    return this.deps.doc.getMap('meta').get('show_id') as string;
  }

  private lookupCuelistJson(cuelistId: string): AuthorityCuelist | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    const authority = (cl.get('go_authority') as string) ?? 'sm_called';
    const cues = getCues(cl)
      .toArray()
      .map((c) => ({ id: c.get('id') as string, department: (c.get('department') as string[]) ?? [] }));
    return {
      go_authority: authority as AuthorityCuelist['go_authority'],
      cues,
    };
  }

  private lookupCueMap(cuelistId: string, cueId: string): Y.Map<unknown> | null {
    const cl = getCuelist(this.deps.doc, cuelistId);
    if (!cl) return null;
    return getCues(cl).toArray().find((c) => c.get('id') === cueId) ?? null;
  }
}
