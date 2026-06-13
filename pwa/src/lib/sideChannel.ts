// ── Legacy simple side-channel (kept for backwards compat) ───────────────────

export type SideChannelEvent =
  | { type: 'go'; cue_id: string; timestamp: number }
  | { type: 'presence'; device_id: string; display_name: string; online: boolean };

export interface SideChannel {
  onEvent(cb: (e: SideChannelEvent) => void): () => void;
  destroy(): void;
}

export function createSideChannel(opts: {
  host: string;
  port: number;
  showId: string;
  token: string;
}): SideChannel {
  const listeners = new Set<(e: SideChannelEvent) => void>();
  const url = `ws://${opts.host}:${opts.port}/events/${opts.showId}?token=${encodeURIComponent(opts.token)}`;
  let ws: WebSocket | null = null;
  let stopped = false;
  const seenIds = new Set<string>();

  function emit(e: SideChannelEvent) {
    for (const l of listeners) l(e);
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as SideChannelEvent & { id?: string };
        if (parsed.id) {
          if (seenIds.has(parsed.id)) return;
          seenIds.add(parsed.id);
          if (seenIds.size > 1000) {
            const first = seenIds.values().next().value;
            if (first !== undefined) seenIds.delete(first);
          }
        }
        emit(parsed);
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      if (!stopped) setTimeout(connect, 2000);
    };
  }

  connect();

  return {
    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      stopped = true;
      ws?.close();
      listeners.clear();
    },
  };
}

// ── Full SideChannelClient (B003-012) ─────────────────────────────────────────

type Listener<T> = (event: T) => void;

function makeEmitter<EventMap extends Record<string, unknown>>() {
  const listeners = new Map<string, Set<Listener<unknown>>>();

  function on<K extends keyof EventMap & string>(event: K, cb: Listener<EventMap[K]>): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb as Listener<unknown>);
    return () => listeners.get(event)?.delete(cb as Listener<unknown>);
  }

  function emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void {
    for (const cb of listeners.get(event) ?? []) cb(payload);
  }

  function removeAll(): void {
    listeners.clear();
  }

  return { on, emit, removeAll };
}

export interface GoPreWait {
  topic: 'go.prewait';
  cue_id: string;
  cuelist_id: string;
  waiting_until_ts: number;
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
  historic: boolean;
}

export interface GoRejected {
  topic: 'go.rejected';
  request_id: string;
  reason: string;
  detail?: string;
}

export interface ArmBroadcast {
  topic: 'arm.broadcast';
  cuelist_id: string;
  cue_id: string;
  standby_note: string;
}

export interface ModeTransition {
  topic: 'mode.transition';
  mode: 'rehearsal' | 'show';
  by_operator_id: string;
}

export interface HeartbeatEvent {
  topic: 'heartbeat';
  uptime_ms: number;
  module_health: Record<string, string>;
}

export interface AuditionResult {
  topic: 'audition.result';
  request_id: string;
  cue_id: string;
  cuelist_id: string;
  ok: boolean;
  details: Array<{ payload_id: string; transport: string; result: string; error?: string }>;
}

export type FrameRate = 24 | 25 | 29.97 | 30;
export type ClockSource = 'internal' | 'mtc' | 'ltc';

export interface ClockAnchor {
  topic: 'clock.anchor';
  /** Shell's current total frame count at the moment of broadcast. */
  totalFrames: number;
  /** Shell-side performance.now() at broadcast — for staleness detection only, NOT for interpolation. */
  at_wall_ms: number;
  rate: FrameRate;
  dropFrame: boolean;
  running: boolean;
  source: ClockSource;
}

export type SideChannelConnectionState = 'open' | 'close' | 'error';

type SideChannelEventMap = {
  'go.dispatched': GoDispatched;
  'go.rejected': GoRejected;
  'go.prewait': GoPreWait;
  'arm.broadcast': ArmBroadcast;
  'mode.transition': ModeTransition;
  'audition.result': AuditionResult;
  heartbeat: HeartbeatEvent;
  'clock.anchor': ClockAnchor;
  connection: SideChannelConnectionState;
};

const BACKOFF_STEPS = [1000, 2000, 5000, 10000, 30000] as const;

export interface SideChannelClientOpts {
  url: string;
  showId: string;
  stationId: string;
  operatorId: string;
  /** Injected for tests — defaults to globalThis.WebSocket */
  _WebSocket?: typeof WebSocket;
}

export class SideChannelClient {
  private ws: WebSocket | undefined;
  private backoffIndex = 0;
  private lastSeq: Record<string, number> = {};
  private stopped = false;
  private emitter = makeEmitter<SideChannelEventMap>();

  constructor(private opts: SideChannelClientOpts) {}

  on<K extends keyof SideChannelEventMap>(
    event: K,
    cb: Listener<SideChannelEventMap[K]>,
  ): () => void {
    return this.emitter.on(event, cb);
  }

  async connect(): Promise<void> {
    if (this.stopped) return;
    const WS = this.opts._WebSocket ?? globalThis.WebSocket;
    const ws = new WS(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.emitter.emit('connection', 'open');
      this.backoffIndex = 0;
      for (const [topic, seq] of Object.entries(this.lastSeq)) {
        ws.send(JSON.stringify({ type: 'resume', topic, since_seq: seq }));
      }
    };

    ws.onmessage = (ev: MessageEvent) => this.handleMessage(ev.data as string);

    ws.onclose = () => {
      this.emitter.emit('connection', 'close');
      if (!this.stopped) {
        const delay = BACKOFF_STEPS[Math.min(this.backoffIndex, BACKOFF_STEPS.length - 1)];
        this.backoffIndex = Math.min(this.backoffIndex + 1, BACKOFF_STEPS.length - 1);
        setTimeout(() => { void this.connect(); }, delay);
      }
    };

    ws.onerror = () => this.emitter.emit('connection', 'error');
  }

  private handleMessage(data: string): void {
    let env: { topic: string; seq?: number; payload: Record<string, unknown> };
    try {
      env = JSON.parse(data) as typeof env;
    } catch {
      return;
    }
    if (env.seq !== undefined) this.lastSeq[env.topic] = env.seq;

    switch (env.topic) {
      case 'go.dispatched': {
        const dispatched_at = (env.payload['dispatched_at'] as string) ?? '';
        const ageMs = Date.now() - new Date(dispatched_at).getTime();
        this.emitter.emit('go.dispatched', {
          topic: 'go.dispatched',
          historic: ageMs > 5000,
          ...(env.payload as Omit<GoDispatched, 'topic' | 'historic'>),
        });
        break;
      }
      case 'go.rejected':
        this.emitter.emit('go.rejected', { topic: 'go.rejected', ...(env.payload as Omit<GoRejected, 'topic'>) });
        break;
      case 'go.prewait':
        this.emitter.emit('go.prewait', { topic: 'go.prewait', ...(env.payload as Omit<GoPreWait, 'topic'>) });
        break;
      case 'arm.broadcast':
        this.emitter.emit('arm.broadcast', { topic: 'arm.broadcast', ...(env.payload as Omit<ArmBroadcast, 'topic'>) });
        break;
      case 'mode.transition':
        this.emitter.emit('mode.transition', { topic: 'mode.transition', ...(env.payload as Omit<ModeTransition, 'topic'>) });
        break;
      case 'heartbeat':
        this.emitter.emit('heartbeat', { topic: 'heartbeat', ...(env.payload as Omit<HeartbeatEvent, 'topic'>) });
        break;
      case 'audition.result':
        this.emitter.emit('audition.result', { topic: 'audition.result', ...(env.payload as Omit<AuditionResult, 'topic'>) });
        break;
      case 'clock.anchor':
        this.emitter.emit('clock.anchor', { topic: 'clock.anchor', ...(env.payload as Omit<ClockAnchor, 'topic'>) });
        break;
    }
  }

  sendGoRequest(cuelistId: string, cueId: string, override = false): string {
    const requestId = globalThis.crypto.randomUUID();
    this.ws?.send(
      JSON.stringify({
        topic: 'go.request',
        request_id: requestId,
        cue_id: cueId,
        cuelist_id: cuelistId,
        station_id: this.opts.stationId,
        operator_id: this.opts.operatorId,
        client_ts: new Date().toISOString(),
        override,
      }),
    );
    return requestId;
  }

  sendArmRequest(cuelistId: string, cueId: string): void {
    this.ws?.send(
      JSON.stringify({
        topic: 'arm.request',
        cuelist_id: cuelistId,
        cue_id: cueId,
        station_id: this.opts.stationId,
        operator_id: this.opts.operatorId,
      }),
    );
  }

  sendAuditionRequest(cuelistId: string, cueId: string): string {
    const requestId = globalThis.crypto.randomUUID();
    this.ws?.send(
      JSON.stringify({
        topic: 'audition.request',
        request_id: requestId,
        cue_id: cueId,
        cuelist_id: cuelistId,
        station_id: this.opts.stationId,
        operator_id: this.opts.operatorId,
      }),
    );
    return requestId;
  }

  disconnect(): void {
    this.stopped = true;
    this.emitter.removeAll();
    this.ws?.close();
  }
}
