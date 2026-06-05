import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { SideChannelMessage, Subscription } from 'showx-shared';
import type { Logger } from '../Logger.js';

interface Topic {
  showId: string;
  subscribers: Set<WebSocket>;
  serverSubscribers: Map<string, (m: SideChannelMessage) => void>;
  recent: SideChannelMessage[];
}

const MAX_RECENT = 100;

export class SideChannel {
  private topics = new Map<string, Topic>();
  private wss: WebSocketServer;

  constructor(private readonly log?: Logger) {
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  handleUpgrade(req: object, socket: object, head: Buffer, showId: string): void {
    this.wss.handleUpgrade(
      req as Parameters<WebSocketServer['handleUpgrade']>[0],
      socket as Parameters<WebSocketServer['handleUpgrade']>[1],
      head,
      (ws) => {
        (ws as WebSocket & { _showxShowId?: string })._showxShowId = showId;
        this.wss.emit('connection', ws, req);
      },
    );
  }

  publish(showId: string, msg: SideChannelMessage): void {
    const t = this.getOrCreate(showId);
    t.recent.push(msg);
    if (t.recent.length > MAX_RECENT) t.recent.shift();
    const payload = JSON.stringify({ ...msg, _ts: Date.now() });
    for (const sub of t.subscribers) {
      if (sub.readyState === 1 /* OPEN */) sub.send(payload);
    }
    for (const fn of t.serverSubscribers.values()) {
      try { fn(msg); } catch (err) {
        this.log?.error('side-channel server handler threw', { showId, error: String(err) });
      }
    }
  }

  subscribeServer(showId: string, fn: (m: SideChannelMessage) => void): Subscription {
    const t = this.getOrCreate(showId);
    const id = randomUUID();
    t.serverSubscribers.set(id, fn);
    return { id, unsubscribe: () => t.serverSubscribers.delete(id) };
  }

  close(showId: string): void {
    const t = this.topics.get(showId);
    if (!t) return;
    for (const ws of t.subscribers) {
      try { ws.close(1000, 'topic_closed'); } catch { /* ignore */ }
    }
    this.topics.delete(showId);
  }

  private onConnection(ws: WebSocket, _req: object): void {
    const showId = (ws as WebSocket & { _showxShowId?: string })._showxShowId ?? '';
    const t = this.getOrCreate(showId);
    t.subscribers.add(ws);

    // replay recent buffer for late joiners
    for (const msg of t.recent) {
      ws.send(JSON.stringify({ ...msg, _replay: true }));
    }

    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString('utf8')) as SideChannelMessage;
        if (!parsed || typeof parsed.topic !== 'string') return;
        this.publish(showId, parsed);
      } catch (err) {
        this.log?.warn('side-channel bad message', { showId, error: String(err) });
      }
    });

    ws.on('close', () => t.subscribers.delete(ws));
  }

  private getOrCreate(showId: string): Topic {
    let t = this.topics.get(showId);
    if (!t) {
      t = { showId, subscribers: new Set(), serverSubscribers: new Map(), recent: [] };
      this.topics.set(showId, t);
    }
    return t;
  }
}
