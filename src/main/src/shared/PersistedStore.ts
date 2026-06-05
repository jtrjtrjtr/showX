import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  PersistedStore as PersistedStoreIface,
  ConfigSchemaDescriptor,
  Subscription,
} from 'showx-shared';
import type { Logger } from './Logger.js';
import { type PathLayout, moduleConfigPath } from './paths.js';

interface ChangeHandler<T> {
  id: string;
  fn: (next: T) => void;
}

export class PersistedStore<T = unknown> implements PersistedStoreIface {
  private handlers: ChangeHandler<T>[] = [];
  private currentSchema?: ConfigSchemaDescriptor<T>;

  constructor(
    private readonly slug: string,
    private readonly layout: PathLayout,
    private readonly log?: Logger,
  ) {}

  async load<U>(schema: ConfigSchemaDescriptor<U>): Promise<U> {
    this.currentSchema = schema as unknown as ConfigSchemaDescriptor<T>;
    const path = moduleConfigPath(this.layout, this.slug);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch {
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      return value;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      await this.quarantine(path, raw, 'invalid_json');
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      return value;
    }
    const envelope = parsed as { __schemaVersion?: unknown; value?: unknown };
    const storedVersion = typeof envelope.__schemaVersion === 'number' ? envelope.__schemaVersion : 1;
    let body: unknown = envelope.value ?? parsed;
    if (storedVersion < schema.schemaVersion) {
      if (!schema.migrate) {
        await this.quarantine(path, raw, 'missing_migration');
        body = schema.defaults;
      } else {
        try {
          body = schema.migrate(storedVersion, body);
        } catch (err) {
          this.log?.error('migration threw', { slug: this.slug, error: String(err) });
          await this.quarantine(path, raw, 'migration_failed');
          body = schema.defaults;
        }
      }
    }
    const result = schema.zodSchema.safeParse(body);
    if (!result.success) {
      this.log?.error('config validation failed', { slug: this.slug, error: String(result.error) });
      await this.quarantine(path, raw, 'validation_failed');
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      return value;
    }
    return result.data;
  }

  async save<U>(value: U): Promise<void> {
    if (!this.currentSchema) {
      throw new Error(`PersistedStore for ${this.slug}: load() must be called before save()`);
    }
    const validated = this.currentSchema.zodSchema.safeParse(value);
    if (!validated.success) {
      throw new Error(
        `PersistedStore.save: schema validation failed for ${this.slug}: ${String(validated.error)}`,
      );
    }
    const path = moduleConfigPath(this.layout, this.slug);
    await this.atomicSave(path, validated.data, this.currentSchema.schemaVersion);
    for (const h of this.handlers) {
      try {
        h.fn(validated.data as unknown as T);
      } catch (err) {
        this.log?.error('persist onChange handler threw', { slug: this.slug, error: String(err) });
      }
    }
  }

  onChange<U>(fn: (next: U) => void): Subscription {
    const id = randomUUID();
    this.handlers.push({ id, fn: fn as unknown as (next: T) => void });
    return {
      id,
      unsubscribe: () => {
        this.handlers = this.handlers.filter((h) => h.id !== id);
      },
    };
  }

  private async atomicSave(path: string, value: unknown, schemaVersion: number): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    const payload = JSON.stringify({ __schemaVersion: schemaVersion, value }, null, 2);
    await fs.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, path);
  }

  private async quarantine(path: string, raw: string, reason: string): Promise<void> {
    const dest = `${path}.corrupt-${Date.now()}`;
    try {
      await fs.writeFile(dest, raw, 'utf8');
      this.log?.warn('quarantined corrupt config', { slug: this.slug, dest, reason });
    } catch (err) {
      this.log?.error('quarantine write failed', { slug: this.slug, error: String(err) });
    }
  }
}
