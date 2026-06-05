import type { WebhookMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

/** Stub for ShowX 0.1 — real HTTP dispatch deferred to B003-* */
export class WebhookOut {
  constructor(private readonly log?: Logger) {}

  async send(_msg: WebhookMessage): Promise<DispatchResult> {
    this.log?.warn('webhook dispatch not implemented in 0.1');
    return { ok: false, transport: 'webhook', latencyMs: 0, error: 'not_implemented' };
  }
}
