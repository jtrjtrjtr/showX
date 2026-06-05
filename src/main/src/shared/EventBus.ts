import { randomUUID } from 'node:crypto';
import type { EventBus as EventBusIface, ShowxEvent, Subscription } from 'showx-shared';
import type { Logger } from './Logger.js';

type Handler = (e: ShowxEvent) => void;

interface HandlerEntry {
  id: string;
  matcher: (e: ShowxEvent) => boolean;
  fn: Handler;
}

// '*' in pattern matches any run of characters except nothing is excluded —
// implemented as `.*` in regex so `cue*` matches `cue-fired` and `cue-catalog-updated`.
// This is intentionally permissive; power-user only.
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
}

export class EventBus implements EventBusIface {
  private handlers: HandlerEntry[] = [];

  constructor(private readonly log?: Logger) {}

  publish<T extends ShowxEvent>(event: T): void {
    for (const h of [...this.handlers]) {
      if (!h.matcher(event)) continue;
      try {
        h.fn(event);
      } catch (err) {
        this.log?.error('event handler threw', { eventType: event.type, error: String(err) });
      }
    }
  }

  subscribe<T extends ShowxEvent>(
    type: T['type'] | T['type'][] | '*',
    fn: (e: T) => void,
  ): Subscription {
    const matcher: (e: ShowxEvent) => boolean =
      type === '*'
        ? () => true
        : Array.isArray(type)
          ? (e) => (type as string[]).includes(e.type)
          : (e) => e.type === type;
    return this.register(matcher, fn as unknown as Handler);
  }

  subscribePattern(pattern: string, fn: (e: ShowxEvent) => void): Subscription {
    const regex = globToRegex(pattern);
    return this.register((e) => regex.test(e.type), fn);
  }

  private register(matcher: (e: ShowxEvent) => boolean, fn: Handler): Subscription {
    const id = randomUUID();
    this.handlers.push({ id, matcher, fn });
    return {
      id,
      unsubscribe: () => {
        this.handlers = this.handlers.filter((h) => h.id !== id);
      },
    };
  }
}
