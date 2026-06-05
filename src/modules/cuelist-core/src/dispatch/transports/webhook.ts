import type { WebhookPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';

/** Webhook dispatch is stubbed for MVP. Full Electron net.request implementation deferred. */
export async function dispatchWebhook(
  payload: WebhookPayload,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  deps.log.warn('webhook dispatch not implemented', { url: payload.url });
  return { ok: false, error: 'webhook_not_implemented' };
}
