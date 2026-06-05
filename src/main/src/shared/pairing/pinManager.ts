import * as crypto from 'node:crypto';
import { PinRecord, PinInvalidError } from './types.js';

export interface PinManager {
  generate(): PinRecord;
  claim(pin: string, sourceIp: string): PinRecord;
  cleanupExpired(): void;
  activePinCount(): number;
  /** Register a persistent PIN for test mode. This PIN never expires and is never consumed. */
  registerTestPin(pin: string): void;
}

const TTL_MS = 5 * 60 * 1000;
const RATE_MAX = 5;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_COLLISION_RETRIES = 5;

interface RateBucket {
  count: number;
  windowStart: number;
}

export class PinManagerImpl implements PinManager {
  private pins = new Map<string, PinRecord>();
  private rateLimit = new Map<string, RateBucket>();
  private testPins = new Set<string>();
  private readonly secureRandomInt: (min: number, max: number) => number;

  // Inject randomInt for testability; defaults to crypto.randomInt (secure)
  constructor(randomIntFn: (min: number, max: number) => number = crypto.randomInt) {
    this.secureRandomInt = randomIntFn;
  }

  generate(): PinRecord {
    let pin: string;
    let attempts = 0;
    do {
      if (attempts >= MAX_COLLISION_RETRIES) {
        throw new Error('PIN collision: failed to generate unique PIN after 5 retries');
      }
      pin = String(this.secureRandomInt(0, 1_000_000)).padStart(6, '0');
      attempts++;
    } while (this.pins.has(pin));

    const rec: PinRecord = {
      pin,
      expires_at: Date.now() + TTL_MS,
      claimed_at: null,
      attempts: 0,
    };
    this.pins.set(pin, rec);
    return rec;
  }

  claim(pin: string, sourceIp: string): PinRecord {
    // Rate limit BEFORE pin lookup — prevents timing-based enumeration
    this.checkRate(sourceIp);

    const rec = this.pins.get(pin);
    if (!rec) throw new PinInvalidError('wrong');

    if (rec.expires_at < Date.now()) {
      this.pins.delete(pin);
      throw new PinInvalidError('expired');
    }

    if (rec.claimed_at !== null) throw new PinInvalidError('already_claimed');

    if (!this.testPins.has(pin)) {
      // Normal PINs are consumed on claim; test PINs remain claimable indefinitely
      rec.claimed_at = Date.now();
    }
    return rec;
  }

  registerTestPin(pin: string): void {
    this.testPins.add(pin);
    this.pins.set(pin, {
      pin,
      expires_at: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      claimed_at: null,
      attempts: 0,
    });
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [pin, rec] of this.pins) {
      if (rec.expires_at < now) this.pins.delete(pin);
    }
  }

  activePinCount(): number {
    return this.pins.size;
  }

  private checkRate(ip: string): void {
    const now = Date.now();
    const entry = this.rateLimit.get(ip);

    if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
      this.rateLimit.set(ip, { count: 1, windowStart: now });
      return;
    }

    if (entry.count >= RATE_MAX) {
      throw new PinInvalidError('rate_limited');
    }

    entry.count++;
  }
}
