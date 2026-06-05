import { z } from 'zod';
import type { PersistedStore as PersistedStoreIface } from 'showx-shared';
import { DeviceRecord, TokenInvalidError } from './pairing/types.js';
import type { TokenManager } from './pairing/tokenManager.js';

export interface PairingStore {
  init(): Promise<void>;
  listDevices(): DeviceRecord[];
  getDevice(deviceId: string): DeviceRecord | null;
  addDevice(d: Omit<DeviceRecord, 'created_at' | 'last_seen'>): Promise<DeviceRecord>;
  updateLastSeen(deviceId: string, now?: number): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
  resolveToken(token: string): DeviceRecord;
}

const DeviceRecordSchema = z.object({
  device_id: z.string(),
  display_name: z.string(),
  owned_departments: z.array(z.string()),
  tier: z.enum(['free', 'pro']),
  last_seen: z.number().nullable(),
  token_hash: z.string(),
  created_at: z.number(),
  revoked_at: z.number().optional(),
});

const PairingDataSchema = z.object({
  devices: z.array(DeviceRecordSchema),
});

type PairingData = z.infer<typeof PairingDataSchema>;

const PAIRING_SCHEMA = {
  schemaVersion: 1,
  zodSchema: PairingDataSchema,
  defaults: { devices: [] } as PairingData,
};

export class PairingStoreImpl implements PairingStore {
  private devices = new Map<string, DeviceRecord>();

  constructor(
    private readonly store: PersistedStoreIface,
    private readonly tokens: TokenManager,
  ) {}

  async init(): Promise<void> {
    const data = await this.store.load(PAIRING_SCHEMA);
    for (const d of data.devices) {
      this.devices.set(d.device_id, d);
      // Re-populate in-memory revoked set from persisted state
      if (d.revoked_at !== undefined) {
        await this.tokens.revoke(d.device_id);
      }
    }
  }

  listDevices(): DeviceRecord[] {
    return [...this.devices.values()];
  }

  getDevice(deviceId: string): DeviceRecord | null {
    return this.devices.get(deviceId) ?? null;
  }

  async addDevice(d: Omit<DeviceRecord, 'created_at' | 'last_seen'>): Promise<DeviceRecord> {
    const record: DeviceRecord = {
      ...d,
      created_at: Date.now(),
      last_seen: null,
    };
    this.devices.set(record.device_id, record);
    await this.persist();
    return record;
  }

  async updateLastSeen(deviceId: string, now = Date.now()): Promise<void> {
    const record = this.devices.get(deviceId);
    if (!record) return;
    record.last_seen = now;
    await this.persist();
  }

  async revokeDevice(deviceId: string): Promise<void> {
    const record = this.devices.get(deviceId);
    if (!record) return;
    record.revoked_at = Date.now();
    await this.tokens.revoke(deviceId);
    await this.persist();
  }

  resolveToken(token: string): DeviceRecord {
    // Throws TokenInvalidError if token is invalid/revoked
    const payload = this.tokens.validate(token);
    const record = this.devices.get(payload.device_id);
    if (!record) throw new TokenInvalidError('bad_sig');
    if (record.revoked_at !== undefined) throw new TokenInvalidError('revoked');
    return record;
  }

  private async persist(): Promise<void> {
    await this.store.save({ devices: [...this.devices.values()] });
  }
}
