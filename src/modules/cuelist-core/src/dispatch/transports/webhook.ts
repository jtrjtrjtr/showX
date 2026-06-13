import type { WebhookPayload } from 'showx-shared';
import type { DispatchDeps, SingleDispatchResult } from '../types.js';

export async function dispatchWebhook(
  payload: WebhookPayload,
  deps: DispatchDeps,
): Promise<SingleDispatchResult> {
  const result = await deps.output.send({
    transport: 'webhook',
    url: payload.url,
    method: payload.method,
    headers: Object.keys(payload.headers).length > 0 ? payload.headers : undefined,
    body: payload.body ?? undefined,
    timeout_ms: payload.timeout_ms,
  });
  if (!result.ok) {
    deps.log.warn('webhook dispatch failed', { url: payload.url, error: result.error });
  }
  return { ok: result.ok, error: result.error };
}
