import * as crypto from 'node:crypto';
import type { SecretStore } from 'showx-shared';
import { TokenPayload, TokenInvalidError } from './types.js';

const SECRET_KEY = 'pairing.hmac_secret';

export interface TokenManager {
  init(): Promise<void>;
  sign(payload: Omit<TokenPayload, 'iat'>): string;
  validate(token: string): TokenPayload;
  revoke(deviceId: string): Promise<void>;
  isRevoked(deviceId: string): boolean;
  hashToken(token: string): string;
}

function base64url(data: Buffer | string): string {
  const b64 = Buffer.isBuffer(data)
    ? data.toString('base64')
    : Buffer.from(data, 'utf8').toString('base64');
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export class TokenManagerImpl implements TokenManager {
  private secret: Buffer | null = null;
  private revokedDeviceIds = new Set<string>();

  constructor(private readonly secretStore: SecretStore) {}

  async init(): Promise<void> {
    let s = await this.secretStore.get(SECRET_KEY);
    if (!s) {
      s = crypto.randomBytes(32).toString('base64');
      await this.secretStore.set(SECRET_KEY, s);
    }
    this.secret = Buffer.from(s, 'base64');
  }

  sign(payload: Omit<TokenPayload, 'iat'>): string {
    if (!this.secret) throw new Error('TokenManager not initialised — call init() first');
    const header = { alg: 'HS256', typ: 'SHOWX1' };
    const fullPayload: TokenPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
    const h = base64url(JSON.stringify(header));
    const p = base64url(JSON.stringify(fullPayload));
    const sigBuf = crypto.createHmac('sha256', this.secret).update(`${h}.${p}`).digest();
    const sig = base64url(sigBuf);
    return `${h}.${p}.${sig}`;
  }

  validate(token: string): TokenPayload {
    if (!this.secret) throw new Error('TokenManager not initialised — call init() first');
    const parts = token.split('.');
    if (parts.length !== 3) throw new TokenInvalidError('malformed');
    const [h, p, sig] = parts;

    // Decode sig to raw bytes for constant-time comparison
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, 'base64url');
    } catch {
      throw new TokenInvalidError('bad_sig');
    }
    const expectedBuf = crypto.createHmac('sha256', this.secret).update(`${h}.${p}`).digest();

    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      throw new TokenInvalidError('bad_sig');
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(base64urlDecode(p)) as TokenPayload;
    } catch {
      throw new TokenInvalidError('malformed');
    }

    if (payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new TokenInvalidError('expired');
    }

    if (this.revokedDeviceIds.has(payload.device_id)) {
      throw new TokenInvalidError('revoked');
    }

    return payload;
  }

  async revoke(deviceId: string): Promise<void> {
    this.revokedDeviceIds.add(deviceId);
  }

  isRevoked(deviceId: string): boolean {
    return this.revokedDeviceIds.has(deviceId);
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
