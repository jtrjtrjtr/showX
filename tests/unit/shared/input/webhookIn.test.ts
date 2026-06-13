import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebhookInListener, type WebhookInMessage, type AssetServerLike } from '../../../../src/main/src/shared/input/webhookIn.js';
import type { Logger } from '../../../../src/main/src/shared/Logger.js';
import type { Request, Response } from 'express';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeMockAssets() {
  let capturedHandler: ((req: Request, res: Response) => unknown) | null = null;
  const routeSub = { id: 'route-1', unsubscribe: vi.fn() };

  const assets: AssetServerLike = {
    registerApiRoute: vi.fn((_method, _path, handler) => {
      capturedHandler = handler;
      return routeSub;
    }),
  };

  return {
    assets,
    routeSub,
    invokeHandler: (req: Request, res: Response) => {
      if (!capturedHandler) throw new Error('route not registered');
      capturedHandler(req, res);
    },
  };
}

function makeMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function () { return makeMockLogger(); }),
    close: vi.fn(),
  } as unknown as Logger;
}

function makeReq(hookId: string, body: unknown = {}, hasBody = true): Request {
  return {
    params: { id: hookId },
    method: 'POST',
    path: `/api/hook/${hookId}`,
    headers: { 'content-type': 'application/json' },
    body: hasBody ? body : undefined,
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    headersSent: false,
  };
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebhookInListener — route registration', () => {
  it('registers POST /hook/:id on start()', () => {
    const { assets } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();
    expect(assets.registerApiRoute).toHaveBeenCalledWith('POST', '/hook/:id', expect.any(Function));
  });

  it('does not re-register if start() called twice', () => {
    const { assets } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();
    listener.start();
    expect(assets.registerApiRoute).toHaveBeenCalledTimes(1);
  });

  it('stop() calls routeSub.unsubscribe and clears state', () => {
    const { assets, routeSub } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();
    listener.addHandler('abc', () => {});
    listener.stop();
    expect(routeSub.unsubscribe).toHaveBeenCalled();
    expect(listener.handlerCount).toBe(0);
    expect(listener.hookIds()).toHaveLength(0);
  });
});

describe('WebhookInListener — dispatch', () => {
  it('registered hook id fires bound handler and returns 200 {ok:true}', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    const fired: WebhookInMessage[] = [];
    listener.addHandler('abc', (msg) => fired.push(msg));

    const res = makeRes();
    invokeHandler(makeReq('abc', { x: 1 }), res);

    expect(fired).toHaveLength(1);
    expect(fired[0]!.hookId).toBe('abc');
    expect(fired[0]!.body).toEqual({ x: 1 });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('unknown hook id → 404, no handler fires', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    const fired: WebhookInMessage[] = [];
    listener.addHandler('abc', (msg) => fired.push(msg));

    const res = makeRes();
    invokeHandler(makeReq('unknown', { x: 1 }), res);

    expect(fired).toHaveLength(0);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'unknown_hook_id' });
  });

  it('malformed body (undefined) → 400', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();
    listener.addHandler('abc', () => {});

    const res = makeRes();
    invokeHandler(makeReq('abc', undefined, false), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'malformed_body' });
  });

  it('concurrent hook ids are isolated — abc fires only abc handler', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    const aFired: string[] = [];
    const bFired: string[] = [];
    listener.addHandler('abc', () => aFired.push('abc'));
    listener.addHandler('xyz', () => bFired.push('xyz'));

    invokeHandler(makeReq('abc'), makeRes());

    expect(aFired).toEqual(['abc']);
    expect(bFired).toEqual([]);
  });

  it('handler throw is logged, sibling handler on same hookId still fires', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const log = makeMockLogger();
    const listener = new WebhookInListener(assets, log);
    listener.start();

    const good: string[] = [];
    listener.addHandler('abc', () => { throw new Error('bad handler'); });
    listener.addHandler('abc', () => good.push('ok'));

    invokeHandler(makeReq('abc'), makeRes());

    expect(good).toEqual(['ok']);
    expect(log.error).toHaveBeenCalled();
  });

  it('multiple handlers on same hookId all fire', () => {
    const { assets, invokeHandler } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    const calls: number[] = [];
    listener.addHandler('abc', () => calls.push(1));
    listener.addHandler('abc', () => calls.push(2));
    listener.addHandler('abc', () => calls.push(3));

    invokeHandler(makeReq('abc'), makeRes());

    expect(calls).toHaveLength(3);
  });
});

describe('WebhookInListener — handler lifecycle', () => {
  it('addHandler increments handlerCount', () => {
    const { assets } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    expect(listener.handlerCount).toBe(0);
    listener.addHandler('abc', () => {});
    expect(listener.handlerCount).toBe(1);
    listener.addHandler('abc', () => {});
    expect(listener.handlerCount).toBe(2);
    listener.addHandler('xyz', () => {});
    expect(listener.handlerCount).toBe(3);
  });

  it('removeHandler decrements count and cleans up empty hookId entry', () => {
    const { assets } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    const h = vi.fn();
    listener.addHandler('abc', h);
    expect(listener.handlerCount).toBe(1);
    expect(listener.hookIds()).toContain('abc');

    listener.removeHandler('abc', h);
    expect(listener.handlerCount).toBe(0);
    expect(listener.hookIds()).not.toContain('abc');
  });

  it('hookHandlerCount returns per-hookId count', () => {
    const { assets } = makeMockAssets();
    const listener = new WebhookInListener(assets, makeMockLogger());
    listener.start();

    listener.addHandler('abc', () => {});
    listener.addHandler('abc', () => {});
    listener.addHandler('xyz', () => {});

    expect(listener.hookHandlerCount('abc')).toBe(2);
    expect(listener.hookHandlerCount('xyz')).toBe(1);
    expect(listener.hookHandlerCount('none')).toBe(0);
  });
});
