import type { Request, Response } from 'express';
import type { Logger } from '../Logger.js';

export interface WebhookInFilter {
  hookId: string;
}

export interface WebhookInMessage {
  hookId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: number;
}

export interface WebhookInKey {
  kind: 'webhook-in';
  hookId: string;
}

/** Minimal AssetServer surface needed for webhook route registration (testable). */
export interface AssetServerLike {
  registerApiRoute(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    handler: (req: Request, res: Response) => Promise<unknown> | unknown,
  ): { id: string; unsubscribe(): void };
}

type Handler = (msg: WebhookInMessage) => void;

/**
 * Registers POST /api/hook/:id on the Express AssetServer and fans inbound
 * requests to handlers registered per hookId. A single route handles all hookIds;
 * per-hookId dispatch happens inside the handler.
 *
 * Token/id gating: unknown hookId → 404, no side effect.
 */
export class WebhookInListener {
  private readonly hookHandlers = new Map<string, Set<Handler>>();
  private routeSub: { id: string; unsubscribe(): void } | null = null;
  private _handlerCount = 0;

  constructor(
    private readonly assets: AssetServerLike,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.routeSub) return;
    this.routeSub = this.assets.registerApiRoute(
      'POST',
      '/hook/:id',
      (req: Request, res: Response) => { this._handle(req, res); },
    );
  }

  stop(): void {
    this.routeSub?.unsubscribe();
    this.routeSub = null;
    this.hookHandlers.clear();
    this._handlerCount = 0;
  }

  addHandler(hookId: string, fn: Handler): void {
    let set = this.hookHandlers.get(hookId);
    if (!set) {
      set = new Set();
      this.hookHandlers.set(hookId, set);
    }
    set.add(fn);
    this._handlerCount++;
  }

  removeHandler(hookId: string, fn: Handler): void {
    const set = this.hookHandlers.get(hookId);
    if (!set) return;
    if (set.delete(fn)) this._handlerCount--;
    if (set.size === 0) this.hookHandlers.delete(hookId);
  }

  get handlerCount(): number {
    return this._handlerCount;
  }

  hookIds(): string[] {
    return Array.from(this.hookHandlers.keys());
  }

  hookHandlerCount(hookId: string): number {
    return this.hookHandlers.get(hookId)?.size ?? 0;
  }

  /** @internal — exposed for unit testing via mock req/res injection */
  _handle(req: Request, res: Response): void {
    const hookId = req.params['id'] as string | undefined;
    if (!hookId) {
      res.status(400).json({ error: 'missing_hook_id' });
      return;
    }
    // express.json() sets body to undefined when Content-Type is missing or body is unparseable
    if ((req.body as unknown) === undefined) {
      res.status(400).json({ error: 'malformed_body' });
      return;
    }
    const handlers = this.hookHandlers.get(hookId);
    if (!handlers || handlers.size === 0) {
      res.status(404).json({ error: 'unknown_hook_id' });
      return;
    }
    const msg: WebhookInMessage = {
      hookId,
      method: req.method,
      path: req.path,
      headers: req.headers as Record<string, string>,
      body: req.body as unknown,
      receivedAt: Date.now(),
    };
    for (const handler of handlers) {
      try {
        handler(msg);
      } catch (err) {
        this.logger.error('input.webhook.handler_threw', { hookId, err: String(err) });
      }
    }
    res.json({ ok: true });
  }
}
