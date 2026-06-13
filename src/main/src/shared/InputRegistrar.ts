import { randomUUID } from 'node:crypto';
import type { Logger } from './Logger.js';
import { OscPortListener } from './input/oscListener.js';
import { MidiPortListener } from './input/midiIn.js';
import { WebhookInListener, type AssetServerLike } from './input/webhookIn.js';
import type {
  OscInputFilter,
  OscMessage,
  MidiInputFilter,
  MidiMessage,
  Subscription,
  ListenerKey,
} from './input/types.js';
import type { WebhookInFilter, WebhookInMessage, WebhookInKey } from './input/webhookIn.js';

export type { OscInputFilter, MidiInputFilter, OscMessage as InboundOscMessage, MidiMessage as InboundMidiMessage, Subscription as InputSubscription, ListenerKey, WebhookInFilter, WebhookInMessage, WebhookInKey };

export interface InputRegistrar {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  subscribeOsc(
    filter: OscInputFilter,
    handler: (msg: OscMessage) => void,
    opts: { port: number },
  ): Promise<Subscription>;
  subscribeMidi(
    filter: MidiInputFilter,
    handler: (msg: MidiMessage) => void,
    opts: { portName: string },
  ): Promise<Subscription>;
  subscribeWebhook(
    filter: WebhookInFilter,
    handler: (msg: WebhookInMessage) => void,
  ): Promise<Subscription>;
  listActiveListeners(): Array<{ key: ListenerKey | WebhookInKey; subscriberCount: number }>;
}

function compileGlob(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`);
}

type OscListenerFactory = (port: number, logger: Logger) => OscPortListener;
type MidiListenerFactory = (portName: string, logger: Logger) => MidiPortListener;
type WebhookListenerFactory = (assets: AssetServerLike, logger: Logger) => WebhookInListener;

export class InputRegistrarImpl implements InputRegistrar {
  private oscPorts = new Map<number, OscPortListener>();
  private midiPorts = new Map<string, MidiPortListener>();
  private subscriptions = new Map<string, { key: ListenerKey | WebhookInKey; cleanup: () => Promise<void> }>();
  private webhookListener: WebhookInListener | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly oscFactory: OscListenerFactory = (port, log) => new OscPortListener(port, log),
    private readonly midiFactory: MidiListenerFactory = (portName, log) => new MidiPortListener(portName, log),
    private readonly assets?: AssetServerLike,
    private readonly webhookFactory: WebhookListenerFactory = (a, l) => new WebhookInListener(a, l),
  ) {}

  async init(): Promise<void> {
    // no-op — listeners created on first subscribe
  }

  async shutdown(): Promise<void> {
    const stopAll = [
      ...Array.from(this.oscPorts.values()).map((l) => l.stop()),
      ...Array.from(this.midiPorts.values()).map((l) => l.stop()),
    ];
    await Promise.all(stopAll);
    this.webhookListener?.stop();
    this.oscPorts.clear();
    this.midiPorts.clear();
    this.webhookListener = null;
    this.subscriptions.clear();
  }

  async subscribeOsc(
    filter: OscInputFilter,
    handler: (msg: OscMessage) => void,
    opts: { port: number },
  ): Promise<Subscription> {
    let listener = this.oscPorts.get(opts.port);
    if (!listener) {
      listener = this.oscFactory(opts.port, this.logger);
      await listener.start();
      this.oscPorts.set(opts.port, listener);
    }

    // Compile glob once per subscription, not per packet
    const matcher = compileGlob(filter.address);
    const fromHostFilter = filter.fromHost;
    const subId = randomUUID();

    const perSubHandler = (msg: OscMessage): void => {
      if (!matcher.test(msg.address)) return;
      if (fromHostFilter && fromHostFilter !== 'any' && msg.fromHost !== fromHostFilter) return;
      try {
        handler(msg);
      } catch (err) {
        this.logger.error('input.handler.threw', { transport: 'osc', subscriptionId: subId, err: String(err) });
      }
    };

    listener.addHandler(perSubHandler);

    const capturedListener = listener;
    const capturedPort = opts.port;
    const cleanup = async (): Promise<void> => {
      capturedListener.removeHandler(perSubHandler);
      if (capturedListener.handlerCount === 0) {
        await capturedListener.stop();
        this.oscPorts.delete(capturedPort);
      }
    };

    this.subscriptions.set(subId, { key: { kind: 'osc', port: opts.port }, cleanup });

    return {
      id: subId,
      unsubscribe: async () => {
        const sub = this.subscriptions.get(subId);
        if (!sub) return;
        await sub.cleanup();
        this.subscriptions.delete(subId);
      },
    };
  }

  async subscribeMidi(
    filter: MidiInputFilter,
    handler: (msg: MidiMessage) => void,
    opts: { portName: string },
  ): Promise<Subscription> {
    let listener = this.midiPorts.get(opts.portName);
    if (!listener) {
      listener = this.midiFactory(opts.portName, this.logger);
      await listener.start();
      this.midiPorts.set(opts.portName, listener);
    }

    const typeFilter = filter.type ?? 'any';
    const channelFilter = filter.channel ?? 'any';
    const subId = randomUUID();

    const perSubHandler = (msg: MidiMessage): void => {
      if (typeFilter !== 'any' && msg.type !== typeFilter) return;
      if (channelFilter !== 'any' && msg.channel !== channelFilter) return;
      try {
        handler(msg);
      } catch (err) {
        this.logger.error('input.handler.threw', { transport: 'midi', subscriptionId: subId, err: String(err) });
      }
    };

    listener.addHandler(perSubHandler);

    const capturedListener = listener;
    const capturedPortName = opts.portName;
    const cleanup = async (): Promise<void> => {
      capturedListener.removeHandler(perSubHandler);
      if (capturedListener.handlerCount === 0) {
        await capturedListener.stop();
        this.midiPorts.delete(capturedPortName);
      }
    };

    this.subscriptions.set(subId, { key: { kind: 'midi', portName: opts.portName }, cleanup });

    return {
      id: subId,
      unsubscribe: async () => {
        const sub = this.subscriptions.get(subId);
        if (!sub) return;
        await sub.cleanup();
        this.subscriptions.delete(subId);
      },
    };
  }

  async subscribeWebhook(
    filter: WebhookInFilter,
    handler: (msg: WebhookInMessage) => void,
  ): Promise<Subscription> {
    if (!this.assets) {
      throw new Error('InputRegistrarImpl: no AssetServer configured; cannot subscribe webhook-in');
    }

    if (!this.webhookListener) {
      this.webhookListener = this.webhookFactory(this.assets, this.logger);
      this.webhookListener.start();
    }

    const subId = randomUUID();
    const { hookId } = filter;

    const perSubHandler = (msg: WebhookInMessage): void => {
      try {
        handler(msg);
      } catch (err) {
        this.logger.error('input.handler.threw', { transport: 'webhook-in', hookId, subscriptionId: subId, err: String(err) });
      }
    };

    this.webhookListener.addHandler(hookId, perSubHandler);

    const capturedListener = this.webhookListener;
    const cleanup = async (): Promise<void> => {
      capturedListener.removeHandler(hookId, perSubHandler);
      if (capturedListener.handlerCount === 0) {
        capturedListener.stop();
        if (this.webhookListener === capturedListener) {
          this.webhookListener = null;
        }
      }
    };

    this.subscriptions.set(subId, { key: { kind: 'webhook-in', hookId }, cleanup });

    return {
      id: subId,
      unsubscribe: async () => {
        const sub = this.subscriptions.get(subId);
        if (!sub) return;
        await sub.cleanup();
        this.subscriptions.delete(subId);
      },
    };
  }

  listActiveListeners(): Array<{ key: ListenerKey | WebhookInKey; subscriberCount: number }> {
    const result: Array<{ key: ListenerKey | WebhookInKey; subscriberCount: number }> = [];
    for (const [port, listener] of this.oscPorts) {
      result.push({ key: { kind: 'osc', port }, subscriberCount: listener.handlerCount });
    }
    for (const [portName, listener] of this.midiPorts) {
      result.push({ key: { kind: 'midi', portName }, subscriberCount: listener.handlerCount });
    }
    if (this.webhookListener) {
      for (const hookId of this.webhookListener.hookIds()) {
        result.push({ key: { kind: 'webhook-in', hookId }, subscriberCount: this.webhookListener.hookHandlerCount(hookId) });
      }
    }
    return result;
  }
}
