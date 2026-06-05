import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type {
  SyncBroker as SyncBrokerIface,
  YDocHandle,
  SideChannelMessage,
  Subscription,
  AwarenessHandler,
} from 'showx-shared';
import { YWebsocketAdapter, type PersistenceHook } from './syncBroker/yWebsocketAdapter.js';
import { SideChannel } from './syncBroker/sideChannel.js';
import { type PairingValidator, PermissiveValidator, extractToken } from './syncBroker/authGate.js';
import type { Logger } from './Logger.js';

export type { PersistenceHook } from './syncBroker/yWebsocketAdapter.js';
export type { PairingValidator } from './syncBroker/authGate.js';
export { PermissiveValidator } from './syncBroker/authGate.js';

export interface SyncBrokerOptions {
  validator?: PairingValidator;
  log?: Logger;
}

export class SyncBroker implements SyncBrokerIface {
  private yjs: YWebsocketAdapter;
  private events: SideChannel;
  private attached: HttpServer | null = null;
  private validator: PairingValidator;

  constructor(opts: SyncBrokerOptions = {}) {
    this.yjs = new YWebsocketAdapter(opts.log);
    this.events = new SideChannel(opts.log);
    this.validator = opts.validator ?? new PermissiveValidator();
  }

  attach(server: HttpServer): void {
    if (this.attached) throw new Error('SyncBroker already attached');
    this.attached = server;
    server.on('upgrade', (req, socket, head) => void this.onUpgrade(req, socket, head));
  }

  setValidator(v: PairingValidator): void {
    this.validator = v;
  }

  openDocument(name: string): YDocHandle {
    const entry = this.yjs.openDocument(name);
    return {
      name,
      doc: entry.doc,
      destroy: () => this.yjs.closeDocument(name),
    };
  }

  closeDocument(handle: YDocHandle): void {
    this.yjs.closeDocument(handle.name);
  }

  registerPersistence(name: string, hook: PersistenceHook): void {
    this.yjs.registerPersistence(name, hook);
  }

  subscribeAwareness(name: string, handler: AwarenessHandler): Subscription {
    const entry = this.yjs.openDocument(name);
    const wrap = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    ) => {
      const states = entry.awareness.getStates() as Map<number, Record<string, unknown>>;
      for (const id of [...added, ...updated]) {
        handler(id, states.get(id) ?? null);
      }
      for (const id of removed) {
        handler(id, null);
      }
    };
    entry.awareness.on('update', wrap);
    return {
      id: `aw-${name}-${Date.now()}`,
      unsubscribe: () => entry.awareness.off('update', wrap),
    };
  }

  publishSideChannel(showId: string, msg: SideChannelMessage): void {
    this.events.publish(showId, msg);
  }

  subscribeSideChannel(showId: string, handler: (msg: SideChannelMessage) => void): Subscription {
    return this.events.subscribeServer(showId, handler);
  }

  private async onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = req.url ?? '';
    const yMatch = url.match(/^\/yjs\/([A-Za-z0-9_-]+)(\?|$)/);
    const eMatch = url.match(/^\/events\/([A-Za-z0-9_-]+)(\?|$)/);
    if (!yMatch && !eMatch) return; // let other upgrade listeners handle

    const token = extractToken(req as { headers: Record<string, string | string[] | undefined>; url?: string });
    if (!token) return this.reject(socket, 401, 'missing_token');
    const claims = await this.validator.validate(token);
    if (!claims) return this.reject(socket, 401, 'invalid_token');

    if (yMatch) {
      this.yjs.handleUpgrade(req, socket, head, yMatch[1]);
    } else if (eMatch) {
      this.events.handleUpgrade(req, socket, head, eMatch[1]);
    }
  }

  private reject(socket: Duplex, code: number, reason: string): void {
    const body = `HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`;
    try { socket.write(body); } catch { /* ignore */ }
    try { socket.destroy(); } catch { /* ignore */ }
  }
}
