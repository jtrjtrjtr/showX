import dgram from 'node:dgram';
import { createRequire } from 'node:module';
import type { OscMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

export interface OscSocketFactory {
  create(): dgram.Socket;
}

const defaultFactory: OscSocketFactory = { create: () => dgram.createSocket('udp4') };

type OscMinModule = { toBuffer(msg: Record<string, unknown>): Buffer };

function getOscMin(): OscMinModule {
  return _require('osc-min') as OscMinModule;
}

function toOscArg(arg: unknown): unknown {
  if (typeof arg === 'number') {
    return Number.isInteger(arg) ? { type: 'integer', value: arg } : { type: 'float', value: arg };
  }
  if (typeof arg === 'string') return { type: 'string', value: arg };
  if (typeof arg === 'boolean') return { type: arg ? 'true' : 'false' };
  if (Buffer.isBuffer(arg)) return { type: 'blob', value: arg };
  return { type: 'string', value: String(arg) };
}

export class OscPool {
  private connections = new Map<string, { socket: dgram.Socket; refcount: number }>();

  constructor(
    private readonly factory: OscSocketFactory = defaultFactory,
    private readonly log?: Logger,
  ) {}

  private keyFor(host: string, port: number): string {
    return `${host}:${port}`;
  }

  claim(host: string, port: number): { release(): void; send(msg: OscMessage): Promise<DispatchResult> } {
    const key = this.keyFor(host, port);
    let entry = this.connections.get(key);
    if (!entry) {
      entry = { socket: this.factory.create(), refcount: 0 };
      this.connections.set(key, entry);
    }
    entry.refcount += 1;
    const capturedEntry = entry;
    return {
      release: () => this.release(key),
      send: (msg) => this.sendOn(capturedEntry.socket, msg),
    };
  }

  private async sendOn(socket: dgram.Socket, msg: OscMessage): Promise<DispatchResult> {
    const t0 = performance.now();
    try {
      const buf = getOscMin().toBuffer({
        oscType: 'message',
        address: msg.address,
        args: msg.args.map(toOscArg),
      });
      await new Promise<void>((resolve, reject) => {
        socket.send(buf, msg.port, msg.host, (err) => (err ? reject(err) : resolve()));
      });
      return { ok: true, transport: 'osc', latencyMs: performance.now() - t0 };
    } catch (err) {
      this.log?.error('osc send failed', { host: msg.host, port: msg.port, error: String(err) });
      return { ok: false, transport: 'osc', latencyMs: performance.now() - t0, error: String(err) };
    }
  }

  private release(key: string): void {
    const entry = this.connections.get(key);
    if (!entry) return;
    entry.refcount -= 1;
    if (entry.refcount <= 0) {
      try { entry.socket.close(); } catch { /* ignore */ }
      this.connections.delete(key);
    }
  }

  status(): Array<{ host: string; port: number; refcount: number }> {
    return Array.from(this.connections.entries()).map(([key, entry]) => {
      const colonIdx = key.lastIndexOf(':');
      const host = key.slice(0, colonIdx);
      const port = Number(key.slice(colonIdx + 1));
      return { host, port, refcount: entry.refcount };
    });
  }
}
