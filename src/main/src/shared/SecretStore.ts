import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { SecretStore as SecretStoreIface } from 'showx-shared';
import type { Logger } from './Logger.js';
import { type PathLayout, secretFallbackPath } from './paths.js';

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, value: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
};

const KEYTAR_SERVICE = (slug: string) => `showx:${slug}`;

export interface SecretStoreOptions {
  keytarLoader?: () => Promise<KeytarModule | null>;
  log?: Logger;
}

export class SecretStore implements SecretStoreIface {
  private keytar: KeytarModule | null | undefined = undefined;

  constructor(
    private readonly slug: string,
    private readonly layout: PathLayout,
    private readonly opts: SecretStoreOptions = {},
  ) {}

  async get(key: string): Promise<string | undefined> {
    const kt = await this.tryKeytar();
    if (kt) {
      try {
        const v = await kt.getPassword(KEYTAR_SERVICE(this.slug), key);
        return v ?? undefined;
      } catch (err) {
        this.opts.log?.warn('keytar get failed, falling back', { slug: this.slug, error: String(err) });
      }
    }
    const blob = await this.readFallback();
    return blob[key];
  }

  async set(key: string, value: string): Promise<void> {
    const kt = await this.tryKeytar();
    if (kt) {
      try {
        await kt.setPassword(KEYTAR_SERVICE(this.slug), key, value);
        return;
      } catch (err) {
        this.opts.log?.warn('keytar set failed, falling back', { slug: this.slug, error: String(err) });
      }
    }
    const blob = await this.readFallback();
    blob[key] = value;
    await this.writeFallback(blob);
  }

  async delete(key: string): Promise<void> {
    const kt = await this.tryKeytar();
    if (kt) {
      try {
        await kt.deletePassword(KEYTAR_SERVICE(this.slug), key);
        return;
      } catch (err) {
        this.opts.log?.warn('keytar delete failed, falling back', { slug: this.slug, error: String(err) });
      }
    }
    const blob = await this.readFallback();
    delete blob[key];
    await this.writeFallback(blob);
  }

  async list(): Promise<string[]> {
    const kt = await this.tryKeytar();
    if (kt) {
      try {
        const all = await kt.findCredentials(KEYTAR_SERVICE(this.slug));
        return all.map((c) => c.account);
      } catch (err) {
        this.opts.log?.warn('keytar list failed, falling back', { slug: this.slug, error: String(err) });
      }
    }
    const blob = await this.readFallback();
    return Object.keys(blob);
  }

  private async tryKeytar(): Promise<KeytarModule | null> {
    if (this.keytar !== undefined) return this.keytar;
    if (this.opts.keytarLoader) {
      this.keytar = await this.opts.keytarLoader();
    } else {
      try {
        const _require = createRequire(import.meta.url);
        this.keytar = _require('keytar') as KeytarModule;
      } catch {
        this.keytar = null;
      }
    }
    return this.keytar;
  }

  private async readFallback(): Promise<Record<string, string>> {
    const path = secretFallbackPath(this.layout, this.slug);
    let raw: Buffer;
    try {
      raw = await fs.readFile(path);
    } catch {
      return {};
    }
    try {
      return await this.decrypt(raw);
    } catch (err) {
      this.opts.log?.error('secret fallback decrypt failed', { slug: this.slug, error: String(err) });
      return {};
    }
  }

  private async writeFallback(blob: Record<string, string>): Promise<void> {
    const path = secretFallbackPath(this.layout, this.slug);
    await fs.mkdir(dirname(path), { recursive: true });
    const enc = await this.encrypt(blob);
    const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    await fs.writeFile(tmp, enc, { mode: 0o600 });
    await fs.rename(tmp, path);
  }

  private async encrypt(blob: Record<string, string>): Promise<Buffer> {
    const key = await this.loadLocalSecret();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const json = Buffer.from(JSON.stringify(blob), 'utf8');
    const ct = Buffer.concat([cipher.update(json), cipher.final()]);
    const tag = cipher.getAuthTag();
    // file layout: [iv(12)][tag(16)][ciphertext...]
    return Buffer.concat([iv, tag, ct]);
  }

  private async decrypt(buf: Buffer): Promise<Record<string, string>> {
    const key = await this.loadLocalSecret();
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(pt.toString('utf8')) as Record<string, string>;
  }

  private async loadLocalSecret(): Promise<Buffer> {
    const path = this.layout.localSecretFile;
    try {
      const existing = await fs.readFile(path);
      if (existing.length === 32) return existing;
    } catch { /* missing or wrong size — generate fresh */ }
    await fs.mkdir(dirname(path), { recursive: true });
    const fresh = randomBytes(32);
    const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    await fs.writeFile(tmp, fresh, { mode: 0o600 });
    await fs.rename(tmp, path);
    return fresh;
  }
}
