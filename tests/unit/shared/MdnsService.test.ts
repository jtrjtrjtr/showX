import { describe, it, expect, vi } from 'vitest';
import { MdnsService, type BonjourLike, type BonjourServiceLike } from '../../../src/main/src/shared/MdnsService.js';

type PublishOpts = { name: string; type: string; port: number; txt?: Record<string, string> };

function createMockBonjour() {
  const published: Array<{ opts: PublishOpts; stopFn: ReturnType<typeof vi.fn> }> = [];
  const browsers: Array<{ opts: { type: string }; triggerUp: (svc: BonjourServiceLike) => void; stopped: boolean }> = [];
  const destroyFn = vi.fn((cb?: () => void) => cb?.());

  const factory = (): BonjourLike => ({
    publish(opts) {
      const stopFn = vi.fn();
      published.push({ opts, stopFn });
      return { ...opts, stop: stopFn } as BonjourServiceLike;
    },
    find(opts, listener) {
      let upListener: ((svc: BonjourServiceLike) => void) = listener ?? (() => undefined);
      const browser = {
        opts,
        triggerUp: (svc: BonjourServiceLike) => upListener(svc),
        stopped: false,
        stop: vi.fn(() => { browser.stopped = true; }),
        on(ev: string, fn: (svc: BonjourServiceLike) => void) { if (ev === 'up') upListener = fn; },
      };
      browsers.push(browser);
      return browser;
    },
    destroy: destroyFn,
  });

  return { factory, published, browsers, destroyFn };
}

describe('MdnsService', () => {
  it('advertise() calls publish with correct args', () => {
    const { factory, published } = createMockBonjour();
    const svc = new MdnsService({ factory });
    svc.advertise('foh-mac', 5300, { role: 'foh-server' });
    expect(published).toHaveLength(1);
    expect(published[0]!.opts).toMatchObject({ name: 'foh-mac', port: 5300, type: 'showx' });
    expect(published[0]!.opts.txt).toEqual({ role: 'foh-server' });
  });

  it('advertise() subscription unsubscribe calls service.stop', () => {
    const { factory, published } = createMockBonjour();
    const svc = new MdnsService({ factory });
    const sub = svc.advertise('foh-mac', 5300, { role: 'foh-server' });
    sub.unsubscribe();
    expect(published[0]!.stopFn).toHaveBeenCalledOnce();
  });

  it('browse() invokes handler when peer discovered', () => {
    const { factory, browsers } = createMockBonjour();
    const svc = new MdnsService({ factory });
    const handler = vi.fn();
    svc.browse('showx', handler);
    browsers[0]!.triggerUp({ name: 'peer1', host: 'peer1.local', port: 5300, txt: { role: 'foh-server' } });
    expect(handler).toHaveBeenCalledWith({ name: 'peer1', host: 'peer1.local', port: 5300, txt: { role: 'foh-server' } });
  });

  it('browse() subscription unsubscribe stops the finder', () => {
    const { factory, browsers } = createMockBonjour();
    const svc = new MdnsService({ factory });
    const sub = svc.browse('showx', vi.fn());
    sub.unsubscribe();
    expect(browsers[0]!.stopped).toBe(true);
  });

  it('stop() clears all advertisements, browses, and destroys bonjour', async () => {
    const { factory, published, browsers, destroyFn } = createMockBonjour();
    const svc = new MdnsService({ factory });
    svc.advertise('foh-mac', 5300, { role: 'foh-server' });
    svc.browse('showx', vi.fn());
    await svc.stop();
    expect(published[0]!.stopFn).toHaveBeenCalledOnce();
    expect(browsers[0]!.stopped).toBe(true);
    expect(destroyFn).toHaveBeenCalledOnce();
  });

  it('multiple advertise() produce distinct IDs; unsubscribing one leaves another', () => {
    const { factory, published } = createMockBonjour();
    const svc = new MdnsService({ factory });
    const sub1 = svc.advertise('foh-mac-1', 5300, { role: 'foh-server' });
    const sub2 = svc.advertise('foh-mac-2', 5301, { role: 'foh-server' });
    expect(sub1.id).not.toBe(sub2.id);
    sub1.unsubscribe();
    expect(published[0]!.stopFn).toHaveBeenCalledOnce();
    expect(published[1]!.stopFn).not.toHaveBeenCalled();
  });

  it('TXT record passed verbatim to publish', () => {
    const { factory, published } = createMockBonjour();
    const svc = new MdnsService({ factory });
    const txt = { role: 'foh-server', tier: 'pro', version: '0.5.0', hostname: 'foh.local', fingerprint: 'abc123' };
    svc.advertise('ShowX FOH', 5300, txt);
    expect(published[0]!.opts.txt).toEqual(txt);
  });
});
