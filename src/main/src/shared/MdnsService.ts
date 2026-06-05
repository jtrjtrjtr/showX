import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Subscription } from 'showx-shared';
import type { Logger } from './Logger.js';

export interface BonjourLike {
  publish(opts: { name: string; type: string; port: number; txt?: Record<string, string> }): BonjourServiceLike;
  find(opts: { type: string }, listener?: (svc: BonjourServiceLike) => void): BonjourBrowserLike;
  destroy(cb?: () => void): void;
}

export interface BonjourServiceLike {
  name: string;
  host: string;
  port: number;
  txt?: unknown;
  stop?(): void;
}

export interface BonjourBrowserLike {
  stop(): void;
  on(ev: string, fn: (svc: BonjourServiceLike) => void): void;
}

export interface MdnsServiceOptions {
  log?: Logger;
  factory?: () => BonjourLike;
}

export interface MdnsPeer {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
}

interface Advertisement { id: string; service: BonjourServiceLike; }
interface Browse        { id: string; stop(): void; }

const SHOWX_SERVICE_TYPE = 'showx';

export class MdnsService {
  private bonjour: BonjourLike;
  private ads: Advertisement[] = [];
  private browses: Browse[] = [];

  constructor(private readonly opts: MdnsServiceOptions = {}) {
    this.bonjour = (opts.factory ?? defaultFactory)();
  }

  /**
   * Advertise this FOH server via mDNS `_showx._tcp.local`.
   *
   * Required TXT keys per protocol_dictionary.md §8:
   *   role, tier, version, hostname, fingerprint (SHA-256 hex of local secret)
   */
  advertise(name: string, port: number, txt: Record<string, string>): Subscription {
    const id = randomUUID();
    const service = this.bonjour.publish({ name, type: SHOWX_SERVICE_TYPE, port, txt });
    this.ads.push({ id, service });
    this.opts.log?.info('mdns advertise', { name, port });
    return { id, unsubscribe: () => this.unpublish(id) };
  }

  browse(serviceType: string, handler: (peer: MdnsPeer) => void): Subscription {
    const id = randomUUID();
    const finder = this.bonjour.find({ type: serviceType }, (svc) => {
      handler({
        name: svc.name,
        host: svc.host,
        port: svc.port,
        txt: (svc.txt as Record<string, string>) ?? {},
      });
    });
    this.browses.push({ id, stop: () => finder.stop() });
    return { id, unsubscribe: () => this.unbrowse(id) };
  }

  async stop(): Promise<void> {
    for (const b of this.browses) b.stop();
    this.browses = [];
    for (const ad of this.ads) ad.service.stop?.();
    this.ads = [];
    await new Promise<void>((resolve) => this.bonjour.destroy(() => resolve()));
  }

  private unpublish(id: string): void {
    const ad = this.ads.find(a => a.id === id);
    if (!ad) return;
    ad.service.stop?.();
    this.ads = this.ads.filter(a => a.id !== id);
  }

  private unbrowse(id: string): void {
    const b = this.browses.find(x => x.id === id);
    if (!b) return;
    b.stop();
    this.browses = this.browses.filter(x => x.id !== id);
  }
}

function defaultFactory(): BonjourLike {
  const req = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const BonjourClass = req('bonjour-service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return new BonjourClass() as BonjourLike;
}
