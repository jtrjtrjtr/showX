export interface DeviceRecord {
  device_id: string;
  display_name: string;
  owned_departments: string[];
  tier: 'free' | 'pro';
  last_seen: number | null;
  token_hash: string;
  created_at: number;
  revoked_at?: number;
}

export interface TokenPayload {
  device_id: string;
  display_name: string;
  owned_departments: string[];
  tier: 'free' | 'pro';
  iat: number;
  exp?: number;
}

export interface PinRecord {
  pin: string;
  expires_at: number;
  claimed_at: number | null;
  attempts: number;
}

export interface InitiateRequest {
  display_name?: string;
}
export interface InitiateResponse {
  pin: string;
  expires_at: number;
  qr_data_url: string;
  pair_url: string;
}

export interface ClaimRequest {
  pin: string;
  display_name: string;
  owned_departments?: string[];
}
export interface ClaimResponse {
  token: string;
  device: DeviceRecord;
}

export class TokenInvalidError extends Error {
  constructor(public reason: 'expired' | 'bad_sig' | 'malformed' | 'revoked') {
    super(reason);
    this.name = 'TokenInvalidError';
  }
}

export class PinInvalidError extends Error {
  constructor(public reason: 'expired' | 'wrong' | 'already_claimed' | 'rate_limited') {
    super(reason);
    this.name = 'PinInvalidError';
  }
}
