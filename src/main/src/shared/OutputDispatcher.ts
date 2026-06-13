import { randomUUID } from 'node:crypto';
import type {
  OutputDispatcher as OutputDispatcherIface,
  TransportMessage,
  TransportDestination,
  DispatchResult,
  ClaimToken,
  ClaimConflict,
  PoolStatus,
} from 'showx-shared';
import { OscPool } from './dispatcher/oscClient.js';
import { MidiOutPool } from './dispatcher/midiOut.js';
import { DmxPool } from './dispatcher/dmxOut.js';
import { MscOut } from './dispatcher/mscOut.js';
import { WebhookOut } from './dispatcher/webhookOut.js';
import type { Logger } from './Logger.js';
import type { HealthBus, DeviceHealthEntry } from './HealthBus.js';

interface ActiveClaim {
  token: ClaimToken;
  destination: TransportDestination;
  release(): void;
  sender?: { send(msg: TransportMessage): Promise<DispatchResult> };
}

export interface OutputDispatcherOptions {
  oscPool?: OscPool;
  midiPool?: MidiOutPool;
  dmxPool?: DmxPool;
  webhook?: WebhookOut;
  log?: Logger;
  healthBus?: HealthBus;
}

/**
 * Shared output bus for ShowX. All OSC/MIDI/DMX/MSC/webhook sends go through here.
 *
 * Pool instances (OscPool, MidiOutPool, DmxPool) MUST be created once at shell boot
 * and passed via opts to every per-module facade — they must NOT be re-instantiated
 * per facade or refcounting/exclusivity breaks across modules.
 */
export class OutputDispatcher implements OutputDispatcherIface {
  private readonly osc: OscPool;
  private readonly midi: MidiOutPool;
  private readonly dmx: DmxPool;
  private readonly msc: MscOut;
  private readonly webhook: WebhookOut;
  private readonly claims = new Map<string, ActiveClaim>();
  private readonly healthBus?: HealthBus;

  constructor(
    private readonly slugSeed: string,
    opts: OutputDispatcherOptions = {},
  ) {
    this.osc = opts.oscPool ?? new OscPool(undefined, opts.log);
    this.midi = opts.midiPool ?? new MidiOutPool(undefined, opts.log);
    this.dmx = opts.dmxPool ?? new DmxPool(undefined, opts.log);
    this.msc = new MscOut(this.midi);
    this.webhook = opts.webhook ?? new WebhookOut(opts.log);
    this.healthBus = opts.healthBus;
  }

  async claim(dest: TransportDestination, ownerSlug: string = this.slugSeed): Promise<ClaimToken | ClaimConflict> {
    if (dest.transport === 'osc') {
      if (!dest.host || dest.port === undefined) throw new Error('osc destination needs host+port');
      const handle = this.osc.claim(dest.host, dest.port);
      const token: ClaimToken = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token,
        destination: dest,
        release: () => handle.release(),
        sender: { send: (m) => m.transport === 'osc' ? handle.send(m) : notMatch(m) },
      });
      return token;
    }

    if (dest.transport === 'midi') {
      if (!dest.midiPortName) throw new Error('midi destination needs midiPortName');
      const handle = this.midi.claim(dest.midiPortName, ownerSlug);
      if (!handle.ok) return { ok: false, reason: 'exclusive_owned', ownerSlug: handle.ownerSlug };
      const token: ClaimToken = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token,
        destination: dest,
        release: () => handle.release(),
        sender: { send: (m) => m.transport === 'midi' ? handle.send(m) : notMatch(m) },
      });
      return token;
    }

    if (dest.transport === 'dmx-artnet' || dest.transport === 'dmx-sacn') {
      if (dest.dmxUniverse === undefined) throw new Error('dmx destination needs dmxUniverse');
      const proto = dest.transport === 'dmx-artnet' ? 'artnet' : 'sacn';
      const handle = this.dmx.claim(proto, dest.dmxUniverse, ownerSlug);
      if (!handle.ok) return { ok: false, reason: 'exclusive_owned', ownerSlug: handle.ownerSlug };
      const token: ClaimToken = { id: randomUUID(), slug: ownerSlug, destination: dest };
      this.claims.set(token.id, {
        token,
        destination: dest,
        release: () => handle.release(),
        sender: {
          send: (m) =>
            m.transport === 'dmx-artnet' || m.transport === 'dmx-sacn'
              ? handle.send(m)
              : notMatch(m),
        },
      });
      return token;
    }

    // msc + webhook: no resource claim required
    const token: ClaimToken = { id: randomUUID(), slug: ownerSlug, destination: dest };
    this.claims.set(token.id, { token, destination: dest, release: () => { /* noop */ } });
    return token;
  }

  async release(token: ClaimToken): Promise<void> {
    const c = this.claims.get(token.id);
    if (!c) return;
    try { c.release(); } catch { /* ignore */ }
    this.claims.delete(token.id);
  }

  async send(msg: TransportMessage, deviceId?: string): Promise<DispatchResult> {
    let result: DispatchResult;
    switch (msg.transport) {
      case 'osc': {
        const handle = this.osc.claim(msg.host, msg.port);
        try { result = await handle.send(msg); } finally { handle.release(); }
        break;
      }
      case 'midi': {
        const existing = this.findClaimForPort(msg.midiPortName);
        if (existing?.sender) {
          result = await existing.sender.send(msg);
        } else {
          const auto = this.midi.claim(msg.midiPortName, this.slugSeed);
          if (!auto.ok) {
            result = { ok: false, transport: 'midi', latencyMs: 0, error: `port_owned_by_${auto.ownerSlug}` };
            break;
          }
          try { result = await auto.send(msg); } finally { auto.release(); }
        }
        break;
      }
      case 'msc':
        result = await this.msc.send(msg, this.slugSeed);
        break;
      case 'dmx-artnet':
      case 'dmx-sacn': {
        const proto = msg.transport === 'dmx-artnet' ? 'artnet' : 'sacn';
        const existing = this.findClaimForUniverse(proto, msg.universe);
        if (existing?.sender) {
          result = await existing.sender.send(msg);
        } else {
          const auto = this.dmx.claim(proto, msg.universe, this.slugSeed);
          if (!auto.ok) {
            result = { ok: false, transport: msg.transport, latencyMs: 0, error: `universe_owned_by_${auto.ownerSlug}` };
            break;
          }
          try { result = await auto.send(msg); } finally { auto.release(); }
        }
        break;
      }
      case 'webhook':
        result = await this.webhook.send(msg);
        break;
    }

    if (deviceId && this.healthBus) {
      this.healthBus.report(
        `device:${deviceId}`,
        result!.ok ? 'healthy' : 'error',
        result!.ok ? undefined : result!.error,
      );
    }

    return result!;
  }

  getDeviceHealth(): Map<string, DeviceHealthEntry> {
    return this.healthBus?.getDeviceHealth() ?? new Map();
  }

  poolStatus(): PoolStatus {
    return {
      oscConnections: this.osc.status(),
      midiOutputs: this.midi.status(),
      dmxUniverses: this.dmx.status(),
    };
  }

  private findClaimForPort(portName: string): ActiveClaim | undefined {
    for (const c of this.claims.values()) {
      if (c.destination.transport === 'midi' && c.destination.midiPortName === portName) return c;
    }
    return undefined;
  }

  private findClaimForUniverse(protocol: 'artnet' | 'sacn', universe: number): ActiveClaim | undefined {
    for (const c of this.claims.values()) {
      const t = c.destination.transport;
      const matches =
        (t === 'dmx-artnet' && protocol === 'artnet') ||
        (t === 'dmx-sacn' && protocol === 'sacn');
      if (matches && c.destination.dmxUniverse === universe) return c;
    }
    return undefined;
  }
}

function notMatch(m: TransportMessage): Promise<DispatchResult> {
  return Promise.resolve({ ok: false, transport: m.transport, latencyMs: 0, error: 'transport_mismatch' });
}
