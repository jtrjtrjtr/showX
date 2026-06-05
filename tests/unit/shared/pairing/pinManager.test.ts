import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PinManagerImpl } from '../../../../src/main/src/shared/pairing/pinManager.js';
import { PinInvalidError } from '../../../../src/main/src/shared/pairing/types.js';

describe('PinManagerImpl', () => {
  let pm: PinManagerImpl;

  beforeEach(() => {
    pm = new PinManagerImpl();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generate() returns 6-digit string', () => {
    const rec = pm.generate();
    expect(rec.pin).toMatch(/^\d{6}$/);
    expect(rec.claimed_at).toBeNull();
    expect(rec.attempts).toBe(0);
  });

  it('generate() expiry is ~5 min in the future', () => {
    const before = Date.now();
    const rec = pm.generate();
    const after = Date.now();
    const expectedMs = 5 * 60 * 1000;
    expect(rec.expires_at).toBeGreaterThanOrEqual(before + expectedMs - 100);
    expect(rec.expires_at).toBeLessThanOrEqual(after + expectedMs + 100);
  });

  it('generate() uses injected randomInt and produces leading-zero padded PINs', () => {
    const mockRandom = vi.fn().mockReturnValue(42);
    const freshPm = new PinManagerImpl(mockRandom);
    const rec = freshPm.generate();
    // Verifies crypto.randomInt (or the injected fn) was called with correct range
    expect(mockRandom).toHaveBeenCalledWith(0, 1_000_000);
    expect(rec.pin).toBe('000042');
    expect(rec.pin).toHaveLength(6);
  });

  it('claim(pin) ok once; second claim of same pin → already_claimed', () => {
    const rec = pm.generate();
    const claimed = pm.claim(rec.pin, '127.0.0.1');
    expect(claimed.claimed_at).not.toBeNull();

    try {
      pm.claim(rec.pin, '127.0.0.1');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as PinInvalidError).reason).toBe('already_claimed');
    }
  });

  it('expired PIN → expired error', () => {
    const rec = pm.generate();
    // Mock Date.now to be past the expiry
    vi.spyOn(Date, 'now').mockReturnValue(rec.expires_at + 1000);

    try {
      pm.claim(rec.pin, '127.0.0.1');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as PinInvalidError).reason).toBe('expired');
    }
  });

  it('wrong pin → wrong error', () => {
    try {
      pm.claim('999999', '127.0.0.1');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as PinInvalidError).reason).toBe('wrong');
    }
  });

  it('6 claim attempts from same IP within 60s → 6th throws rate_limited', () => {
    // Generate 6 distinct PINs
    const pins: string[] = [];
    for (let i = 0; i < 6; i++) {
      // Use wrong PINs after the 5th to test rate limit independent of pin validity
      pins.push(pm.generate().pin);
    }

    const ip = '10.0.0.1';
    // First 5 valid claims (each on its own pin)
    for (let i = 0; i < 5; i++) {
      pm.claim(pins[i]!, ip);
    }

    // 6th attempt (same window) → rate_limited regardless of pin validity
    try {
      pm.claim(pins[5]!, ip);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as PinInvalidError).reason).toBe('rate_limited');
    }
  });

  it('rate limit resets after window expires', () => {
    const ip = '10.0.0.2';
    // Exhaust window
    for (let i = 0; i < 5; i++) {
      const rec = pm.generate();
      pm.claim(rec.pin, ip);
    }
    // Move time forward past the 60s window
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    // Fresh window — should not throw rate_limited
    const rec = pm.generate();
    expect(() => pm.claim(rec.pin, ip)).not.toThrow();
  });

  it('cleanupExpired() removes expired PINs', () => {
    const rec = pm.generate();
    expect(pm.activePinCount()).toBe(1);
    vi.spyOn(Date, 'now').mockReturnValue(rec.expires_at + 1000);
    pm.cleanupExpired();
    expect(pm.activePinCount()).toBe(0);
  });

  it('rate limit checks BEFORE pin lookup (wrong-pin attempts count against limit)', () => {
    const ip = '192.168.1.1';
    // Fill up 5 wrong-pin attempts
    for (let i = 0; i < 5; i++) {
      try { pm.claim('000000', ip); } catch { /* expected wrong */ }
    }
    // 6th attempt → rate_limited (not wrong)
    try {
      pm.claim('000001', ip);
      expect.fail('should throw');
    } catch (e) {
      expect((e as PinInvalidError).reason).toBe('rate_limited');
    }
  });
});
