import { describe, it, expect, vi } from 'vitest';
import type { WebhookPayload } from 'showx-shared';
import { dispatchWebhook } from '../../../../../../src/modules/cuelist-core/src/dispatch/transports/webhook.js';
import { initShowDoc } from '../../../../../../src/modules/cuelist-core/src/document/show.js';
import type { DispatchDeps } from '../../../../../../src/modules/cuelist-core/src/dispatch/types.js';

function makeDeps(
  sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 }),
): DispatchDeps {
  const doc = initShowDoc({ title: 'T', venue: null, date: null, created_by: 'test' });
  return {
    doc,
    show_id: 'show-1',
    cuelist_id: 'cl-1',
    output: { send: sendFn, claim: vi.fn(), release: vi.fn(), poolStatus: vi.fn() },
    events: {
      publish: vi.fn(),
      subscribe: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }),
      subscribePattern: vi.fn().mockReturnValue({ id: '1', unsubscribe: vi.fn() }),
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
    abortSignal: new AbortController().signal,
  };
}

function makePayload(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    id: 'p1',
    type: 'webhook',
    tag: null,
    note: '',
    url: 'https://example.com/hook',
    method: 'POST',
    headers: { 'X-Source': 'showx' },
    body: '{"cue":"1"}',
    timeout_ms: 5_000,
    ...overrides,
  };
}

describe('dispatchWebhook', () => {
  it('calls output.send with webhook transport, correct url/method/headers/body/timeout', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 5 });
    const deps = makeDeps(sendFn);

    const result = await dispatchWebhook(makePayload(), deps);

    expect(result.ok).toBe(true);
    expect(sendFn).toHaveBeenCalledOnce();
    const msg = sendFn.mock.calls[0][0];
    expect(msg.transport).toBe('webhook');
    expect(msg.url).toBe('https://example.com/hook');
    expect(msg.method).toBe('POST');
    expect(msg.headers).toEqual({ 'X-Source': 'showx' });
    expect(msg.body).toBe('{"cue":"1"}');
    expect(msg.timeout_ms).toBe(5_000);
  });

  it('GET method passes through', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload({ method: 'GET', body: null }), deps);

    const msg = sendFn.mock.calls[0][0];
    expect(msg.method).toBe('GET');
    expect(msg.body).toBeUndefined();
  });

  it('DELETE method passes through', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload({ method: 'DELETE', body: null }), deps);

    const msg = sendFn.mock.calls[0][0];
    expect(msg.method).toBe('DELETE');
  });

  it('null body mapped to undefined', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload({ body: null }), deps);

    const msg = sendFn.mock.calls[0][0];
    expect(msg.body).toBeUndefined();
  });

  it('empty headers mapped to undefined', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload({ headers: {} }), deps);

    const msg = sendFn.mock.calls[0][0];
    expect(msg.headers).toBeUndefined();
  });

  it('non-2xx result → ok:false, error propagated', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: false, transport: 'webhook', latencyMs: 3, error: 'http_404' });
    const deps = makeDeps(sendFn);

    const result = await dispatchWebhook(makePayload(), deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_404');
  });

  it('timeout error propagated as ok:false', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: false, transport: 'webhook', latencyMs: 5_001, error: 'timeout' });
    const deps = makeDeps(sendFn);

    const result = await dispatchWebhook(makePayload({ timeout_ms: 5_000 }), deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
  });

  it('network error propagated as ok:false', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: false, transport: 'webhook', latencyMs: 1, error: 'ECONNREFUSED' });
    const deps = makeDeps(sendFn);

    const result = await dispatchWebhook(makePayload(), deps);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('logs warning on failed dispatch', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: false, transport: 'webhook', latencyMs: 0, error: 'http_500' });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload(), deps);

    expect((deps.log.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'webhook dispatch failed',
      expect.objectContaining({ url: 'https://example.com/hook' }),
    );
  });

  it('does not log on success', async () => {
    const sendFn = vi.fn().mockResolvedValue({ ok: true, transport: 'webhook', latencyMs: 0 });
    const deps = makeDeps(sendFn);

    await dispatchWebhook(makePayload(), deps);

    expect((deps.log.warn as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
