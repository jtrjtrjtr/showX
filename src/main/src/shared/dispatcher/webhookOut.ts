import type { WebhookMessage, DispatchResult } from 'showx-shared';
import type { Logger } from '../Logger.js';

export class WebhookOut {
  constructor(private readonly log?: Logger) {}

  async send(msg: WebhookMessage): Promise<DispatchResult> {
    const t0 = Date.now();
    const timeoutMs = msg.timeout_ms ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const rawBody =
        msg.body === undefined
          ? undefined
          : typeof msg.body === 'string'
            ? msg.body
            : JSON.stringify(msg.body);

      const body = msg.method === 'GET' ? undefined : rawBody;

      const response = await fetch(msg.url, {
        method: msg.method,
        headers: msg.headers,
        body,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - t0;
      if (response.ok) {
        return { ok: true, transport: 'webhook', latencyMs };
      }
      this.log?.warn('webhook non-2xx', { url: msg.url, status: response.status });
      return { ok: false, transport: 'webhook', latencyMs, error: `http_${response.status}` };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      if (controller.signal.aborted) {
        return { ok: false, transport: 'webhook', latencyMs, error: 'timeout' };
      }
      const message = err instanceof Error ? err.message : String(err);
      this.log?.warn('webhook request failed', { url: msg.url, error: message });
      return { ok: false, transport: 'webhook', latencyMs, error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}
