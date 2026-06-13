import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookOut } from '../../../../src/main/src/shared/dispatcher/webhookOut.js';
import type { WebhookMessage } from 'showx-shared';

function makeMsg(overrides: Partial<WebhookMessage> = {}): WebhookMessage {
  return {
    transport: 'webhook',
    url: 'https://example.com/hook',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"key":"value"}',
    timeout_ms: 5_000,
    ...overrides,
  };
}

function makeResponse(status: number, ok: boolean): Response {
  return { ok, status } as Response;
}

describe('WebhookOut.send', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('POST with JSON body + custom header → fetch called with correct args, returns ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, true));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg());
    vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.transport).toBe('webhook');
    expect(typeof result.latencyMs).toBe('number');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"key":"value"}');
  });

  it('GET request omits body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, true));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg({ method: 'GET', body: '{"should":"be ignored"}' }));
    vi.runAllTimersAsync();
    await promise;

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('DELETE method is passed through', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, true));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg({ method: 'DELETE', body: undefined }));
    vi.runAllTimersAsync();
    await promise;

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('DELETE');
  });

  it('404 → ok:false, error:http_404', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(404, false));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg());
    vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_404');
  });

  it('500 → ok:false, error:http_500', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(500, false));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg());
    vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toBe('http_500');
  });

  it('network error → ok:false, error contains message', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg());
    vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('timeout → abort signal fired → ok:false, error:timeout', async () => {
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(new DOMException('AbortError', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg({ timeout_ms: 100 }));
    // advance timers to fire the abort
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.error).toBe('timeout');
  });

  it('object body is JSON-serialized', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, true));
    vi.stubGlobal('fetch', mockFetch);

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg({ method: 'POST', body: { foo: 'bar' } }));
    vi.runAllTimersAsync();
    await promise;

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe('{"foo":"bar"}');
  });

  it('uses default 30s timeout when timeout_ms omitted', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, true));
    vi.stubGlobal('fetch', mockFetch);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const hook = new WebhookOut();
    const promise = hook.send(makeMsg({ timeout_ms: undefined }));
    vi.runAllTimersAsync();
    await promise;

    const timeouts = setTimeoutSpy.mock.calls.map((c) => c[1] as number);
    expect(timeouts.some((t) => t === 30_000)).toBe(true);
  });
});
