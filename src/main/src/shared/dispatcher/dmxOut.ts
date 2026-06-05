import { createRequire } from 'node:module';
import type { DmxArtnetMessage, DmxSacnMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

const _require = createRequire(import.meta.url);

export interface DmxAdapter {
  send(universe: number, data: number[], opts: { priority?: number; host?: string }): Promise<void>;
  close(): Promise<void>;
}

export interface DmxFactories {
  artnet?: () => DmxAdapter;
  sacn?: () => DmxAdapter;
}

export type DmxProtocol = 'artnet' | 'sacn';

interface UniverseLock {
  adapter: DmxAdapter;
  protocol: DmxProtocol;
  ownerSlug: string;
}

type ClaimOk = {
  ok: true;
  release(): void;
  send(msg: DmxArtnetMessage | DmxSacnMessage): Promise<DispatchResult>;
};

type ClaimConflict = {
  ok: false;
  reason: 'exclusive_owned';
  ownerSlug: string;
};

function defaultDmxFactories(): DmxFactories {
  return {
    artnet: () => {
      const dmxnet = _require('dmxnet') as { dmxnet: new (opts: unknown) => unknown };
      const dmx = new dmxnet.dmxnet({ log: { level: 'warn' } }) as {
        newSender(opts: { ip: string; subnet: number; universe: number; net: number }): {
          setChannel(ch: number, val: number): void;
          transmit(): void;
          stop?(): void;
        };
      };
      let sender: ReturnType<typeof dmx.newSender> | undefined;
      return {
        async send(universe: number, data: number[]) {
          sender = sender ?? dmx.newSender({ ip: '255.255.255.255', subnet: 0, universe, net: 0 });
          for (let i = 0; i < data.length; i++) sender.setChannel(i + 1, data[i]!);
          sender.transmit();
        },
        async close() {
          try { sender?.stop?.(); } catch { /* ignore */ }
        },
      };
    },
    sacn: () => {
      const e131 = _require('e131') as {
        Client: new (universe: number) => {
          createPacket(slots: number): {
            setSourceName(n: string): void;
            setUniverse(u: number): void;
            setPriority(p: number): void;
            setOption(opt: number, val: boolean): void;
            getSlotsData(): Uint8Array;
            Options: { PREVIEW: number };
          };
          send(pkt: unknown, cb: (err: unknown) => void): void;
        };
      };
      let e131Client: InstanceType<typeof e131.Client> | undefined;
      return {
        async send(universe: number, data: number[], opts: { priority?: number }) {
          if (!e131Client) e131Client = new e131.Client(universe);
          const pkt = e131Client.createPacket(data.length);
          pkt.setSourceName('ShowX');
          pkt.setUniverse(universe);
          pkt.setPriority(opts.priority ?? 100);
          pkt.setOption(pkt.Options.PREVIEW, false);
          const slots = pkt.getSlotsData();
          for (let i = 0; i < data.length; i++) slots[i] = data[i]!;
          await new Promise<void>((resolve, reject) =>
            e131Client!.send(pkt, (err) => (err ? reject(err) : resolve())),
          );
        },
        async close() { /* e131 has no explicit close */ },
      };
    },
  };
}

export class DmxPool {
  private universes = new Map<string, UniverseLock>();

  constructor(
    private readonly factories: DmxFactories = defaultDmxFactories(),
    private readonly log?: Logger,
  ) {}

  claim(protocol: DmxProtocol, universe: number, ownerSlug: string): ClaimOk | ClaimConflict {
    const key = `${protocol}:${universe}`;
    const existing = this.universes.get(key);
    if (existing) {
      return { ok: false, reason: 'exclusive_owned', ownerSlug: existing.ownerSlug };
    }
    const factory = protocol === 'artnet' ? this.factories.artnet : this.factories.sacn;
    if (!factory) throw new Error(`DMX adapter not configured: ${protocol}`);
    const adapter = factory();
    const lock: UniverseLock = { adapter, protocol, ownerSlug };
    this.universes.set(key, lock);
    return {
      ok: true,
      release: () => this.release(key),
      send: async (msg) => {
        const t0 = performance.now();
        try {
          await adapter.send(universe, msg.data, {
            priority: 'priority' in msg ? msg.priority : undefined,
            host: 'host' in msg ? msg.host : undefined,
          });
          return { ok: true, transport: msg.transport, latencyMs: performance.now() - t0 };
        } catch (err) {
          this.log?.error('dmx send failed', { protocol, universe, error: String(err) });
          return { ok: false, transport: msg.transport, latencyMs: performance.now() - t0, error: String(err) };
        }
      },
    };
  }

  status(): Array<{ universe: number; protocol: DmxProtocol; ownerSlug: string }> {
    return Array.from(this.universes.entries()).map(([key, lock]) => {
      const colonIdx = key.indexOf(':');
      const universe = Number(key.slice(colonIdx + 1));
      return { universe, protocol: lock.protocol, ownerSlug: lock.ownerSlug };
    });
  }

  private async release(key: string): Promise<void> {
    const lock = this.universes.get(key);
    if (!lock) return;
    try { await lock.adapter.close(); } catch { /* ignore */ }
    this.universes.delete(key);
  }
}
