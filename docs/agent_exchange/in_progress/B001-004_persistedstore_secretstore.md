---
id: "B001-004"
title: "PersistedStore + SecretStore services"
type: "implementation"
estimated_size_lines: 400
priority: "P0"
depends_on: ["B001-002"]
target_files:
  - "src/main/src/shared/PersistedStore.ts"
  - "src/main/src/shared/SecretStore.ts"
  - "src/main/src/shared/paths.ts"
  - "src/main/package.json"
  - "tests/unit/shared/PersistedStore.test.ts"
  - "tests/unit/shared/SecretStore.test.ts"
acceptance_criteria:
  - "`PersistedStore` instance is per-slug-scoped; constructor takes `{ slug, rootDir }`; cannot read another module's blob"
  - "`load<T>(schema)` reads JSON from `<rootDir>/modules/<slug>/config.json`, runs migration if schemaVersion lower, validates via zod, returns typed value; on parse fail returns defaults + quarantines"
  - "`save<T>(value)` atomically writes via `<file>.tmp` + `fs.rename`; never leaves a half-written file"
  - "`onChange<T>(handler)` fires after successful save"
  - "Quarantine of corrupt file: rename to `<file>.corrupt-<timestamp>` and log error; subsequent load returns defaults"
  - "`SecretStore` instance is per-slug-scoped; keys namespaced `showx:<slug>:<key>` in OS keychain via keytar"
  - "SecretStore falls back to encrypted-at-rest file when keytar throws (CI / headless); fallback path = `<rootDir>/secrets/<slug>.enc`; encryption key = local secret per docs/specs/pairing_auth.md §Local secret"
  - "SecretStore `list()` returns key names (not values); `delete()` removes a key; `get(missing)` returns undefined"
  - "All operations namespaced — no SecretStore method accepts another slug; sandbox enforced by constructor binding"
  - "≥16 vitest test cases total across both files using tmpdir + mocked keytar"
  - "`pnpm --filter showx-main typecheck` passes"
  - "`pnpm vitest run tests/unit/shared/PersistedStore tests/unit/shared/SecretStore` passes 100%"
---

## Context

Modules need two persistence services: **PersistedStore** for unencrypted JSON config (cuelist settings, EventX subscription tables, router rules) and **SecretStore** for credentials (Supabase service keys, OAuth tokens, pairing secrets). Both are constructed by the module loader (B001-010) at module init time with the slug baked in, so module code physically cannot reach into another module's slot.

PersistedStore implements the contract in `docs/specs/module_loader.md` §7. SecretStore implements the contract in `docs/specs/pairing_auth.md` (read the "Local secret" section and the SecretStore subsection). The Local Secret is a 32-byte random value generated on first run and stored at `<userData>/local_secret.bin` with `chmod 600` — used as the AES-256-GCM key for the fallback encrypted file.

## Implementation notes

### Package deps to add to `src/main/package.json`

```json
{
  "dependencies": {
    "showx-shared": "workspace:*",
    "zod": "^3.22.0",
    "keytar": "^7.9.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0"
  }
}
```

`keytar` ships native bindings; document in done report that Electron rebuild may be needed (`pnpm rebuild keytar`). The fallback file approach means tests don't actually need keytar working — we'll mock it.

### `src/main/src/shared/paths.ts`

Helper functions for resolving filesystem paths. Single source of truth so PersistedStore + SecretStore + AssetServer all agree on directory layout.

```ts
import { app } from 'electron';   // optional — wrapped in lazy require for tests
import { join } from 'node:path';

export interface PathLayout {
  rootDir: string;          // <userData>/showx
  modulesDir: string;       // <rootDir>/modules
  secretsDir: string;       // <rootDir>/secrets
  localSecretFile: string;  // <rootDir>/local_secret.bin
  logsDir: string;          // <rootDir>/logs
  assetsDir: string;        // <rootDir>/assets
}

export function resolvePaths(opts: { override?: string } = {}): PathLayout {
  const base = opts.override ?? defaultUserDataDir();
  const rootDir = join(base, 'showx');
  return {
    rootDir,
    modulesDir: join(rootDir, 'modules'),
    secretsDir: join(rootDir, 'secrets'),
    localSecretFile: join(rootDir, 'local_secret.bin'),
    logsDir: join(rootDir, 'logs'),
    assetsDir: join(rootDir, 'assets'),
  };
}

function defaultUserDataDir(): string {
  // Lazy: try Electron; if not in Electron (tests), fall back to env or tmpdir.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    if (electron?.app?.getPath) return electron.app.getPath('userData');
  } catch { /* not in electron */ }
  return process.env.SHOWX_USER_DATA ?? join(process.cwd(), '.showx-userdata');
}

export function moduleConfigPath(layout: PathLayout, slug: string): string {
  return join(layout.modulesDir, slug, 'config.json');
}

export function secretFallbackPath(layout: PathLayout, slug: string): string {
  return join(layout.secretsDir, `${slug}.enc`);
}
```

Tests pass `{ override: tmpdir }` so they never touch real userData.

### `src/main/src/shared/PersistedStore.ts`

```ts
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type {
  PersistedStore as PersistedStoreIface,
  ConfigSchemaDescriptor, Subscription,
} from 'showx-shared';
import { randomUUID } from 'node:crypto';
import type { Logger } from './Logger.js';
import { type PathLayout, moduleConfigPath } from './paths.js';

interface ChangeHandler<T> {
  id: string;
  fn: (next: T) => void;
}

export class PersistedStore<T = unknown> implements PersistedStoreIface {
  private cached?: T;
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
    } catch (err: unknown) {
      // ENOENT → first-run; write defaults
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      this.cached = value as unknown as T;
      return value;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      await this.quarantine(path, raw, 'invalid_json');
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      this.cached = value as unknown as T;
      return value;
    }
    const storedVersion = typeof parsed.__schemaVersion === 'number' ? parsed.__schemaVersion : 1;
    let body = parsed.value ?? parsed;
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
      this.log?.error('config validation failed', { slug: this.slug, issues: result.error.issues });
      await this.quarantine(path, raw, 'validation_failed');
      const value = schema.defaults;
      await this.atomicSave(path, value, schema.schemaVersion);
      this.cached = value as unknown as T;
      return value;
    }
    this.cached = result.data as unknown as T;
    return result.data;
  }

  async save<U>(value: U): Promise<void> {
    if (!this.currentSchema) throw new Error(`PersistedStore for ${this.slug}: load() must be called before save()`);
    const validated = this.currentSchema.zodSchema.safeParse(value);
    if (!validated.success) {
      throw new Error(`PersistedStore.save: schema validation failed for ${this.slug}: ${JSON.stringify(validated.error.issues)}`);
    }
    const path = moduleConfigPath(this.layout, this.slug);
    await this.atomicSave(path, validated.data, this.currentSchema.schemaVersion);
    this.cached = validated.data as unknown as T;
    for (const h of this.handlers) {
      try { h.fn(validated.data as unknown as T); } catch (err) {
        this.log?.error('persist onChange handler threw', { slug: this.slug, error: String(err) });
      }
    }
  }

  onChange<U>(fn: (next: U) => void): Subscription {
    const id = randomUUID();
    this.handlers.push({ id, fn: fn as (next: T) => void });
    return { id, unsubscribe: () => {
      this.handlers = this.handlers.filter((h) => h.id !== id);
    }};
  }

  private async atomicSave(path: string, value: unknown, schemaVersion: number) {
    await fs.mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    const payload = JSON.stringify({ __schemaVersion: schemaVersion, value }, null, 2);
    await fs.writeFile(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, path);
  }

  private async quarantine(path: string, raw: string, reason: string) {
    const dest = `${path}.corrupt-${Date.now()}`;
    try {
      await fs.writeFile(dest, raw, 'utf8');
      this.log?.warn('quarantined corrupt config', { slug: this.slug, dest, reason });
    } catch (err) {
      this.log?.error('quarantine write failed', { slug: this.slug, error: String(err) });
    }
  }
}
```

Critical behavior:
- Slug-bound at construction → impossible to read another slug's file via public API.
- First-run (ENOENT): writes defaults atomically.
- Corrupt JSON / schema mismatch / migration throw → quarantine + return defaults.
- `save()` validates with zod before writing.
- Atomic via tmp + rename. `mode: 0o600` (owner-only) since some configs hold semi-sensitive data.
- `onChange` fires synchronously after `save` returns; handler throw never poisons store.

### `src/main/src/shared/SecretStore.ts`

```ts
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretStore as SecretStoreIface } from 'showx-shared';
import type { Logger } from './Logger.js';
import { type PathLayout, secretFallbackPath } from './paths.js';

// keytar lazy-loaded so tests can mock without native rebuild
type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, value: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
};

const SERVICE_PREFIX = 'showx';   // OS keychain "service" field
const KEYTAR_SERVICE = (slug: string) => `${SERVICE_PREFIX}:${slug}`;

export interface SecretStoreOptions {
  keytarLoader?: () => Promise<KeytarModule | null>;
  log?: Logger;
}

export class SecretStore implements SecretStoreIface {
  private keytar: KeytarModule | null | undefined = undefined;   // undefined = not yet probed

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
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        this.keytar = require('keytar') as KeytarModule;
      } catch {
        this.keytar = null;
      }
    }
    return this.keytar;
  }

  // ---- fallback encrypted file ----

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
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
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
    return JSON.parse(pt.toString('utf8'));
  }

  private async loadLocalSecret(): Promise<Buffer> {
    const path = this.layout.localSecretFile;
    try {
      const existing = await fs.readFile(path);
      if (existing.length === 32) return existing;
    } catch { /* missing */ }
    await fs.mkdir(dirname(path), { recursive: true });
    const fresh = randomBytes(32);
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, fresh, { mode: 0o600 });
    await fs.rename(tmp, path);
    return fresh;
  }
}
```

Critical behavior:
- Keytar tried first on every call. On any keytar error, fall back to encrypted file.
- Encrypted file uses AES-256-GCM with 12-byte IV + 16-byte auth tag prepended.
- Local secret (32 bytes) is generated on first need and persisted at `<rootDir>/local_secret.bin` with mode 0600. Reused across modules — single key for all fallback files. Per `docs/specs/pairing_auth.md`.
- `list()` returns key names only — never values.
- Slug-bound at construction. Keytar service field includes slug so OS keychain is also namespaced; deleting one module's secrets cannot affect another.

## Test plan

### `tests/unit/shared/PersistedStore.test.ts` (≥10 cases)

Use `os.tmpdir()` + `randomUUID()` per-test for isolation. Pass `{ override: tmpdir }` to `resolvePaths`.

- First load: file doesn't exist → returns `schema.defaults` and writes them.
- Round-trip: `save({a: 1})` → fresh `load()` returns `{a: 1}`.
- Save validates: `save(invalidShape)` throws and file unchanged.
- Migration: stored `{__schemaVersion: 1, value: {old: 1}}`, schema version 2 with migrate → returns migrated shape.
- Migration missing: stored version older than current and no `migrate` → quarantine + defaults.
- Migration throws → quarantine + defaults; original raw file moved to `.corrupt-<ts>`.
- Corrupt JSON → quarantine + defaults.
- Validation fail after parse → quarantine + defaults.
- `onChange` fires after save with new value.
- `unsubscribe()` stops onChange.
- Atomic write: simulate concurrent saves by triggering two saves in flight; final state matches last write (use `Promise.all` + read final file).
- Slug-bound: instantiate `new PersistedStore('a', ...)` and `new PersistedStore('b', ...)` — saves to one don't appear in the other's load.

### `tests/unit/shared/SecretStore.test.ts` (≥6 cases)

Mock keytar via `{ keytarLoader: async () => mockKeytar }`. Use a `mockKeytar` object backed by a `Map`.

- Set + get round-trip via mocked keytar.
- Get missing key returns undefined.
- `list()` returns all keys for the slug.
- `delete()` removes a key.
- Keytar throws → fallback file used; round-trip still works.
- Fallback file persists across two SecretStore instances (write with first, read with second).
- Local secret is reused: open one SecretStore, check `local_secret.bin` exists with 32 bytes; open second; same file used (mtime unchanged).
- Encrypted file is not human-readable: write a known secret via fallback, read raw bytes, assert the secret string does NOT appear in the file.
- Slug namespace: keytar mock invoked with `service === 'showx:eventx-bridge'` for slug `'eventx-bridge'`.
- File mode 0600: `fs.stat(localSecretFile).mode & 0o777 === 0o600`.

## Out of scope

- Cross-machine secret sync (manual export tool, future).
- Migration of secrets between fallback file and keytar when one becomes available later (deferred).
- Backup of local secret (operator responsibility for now).
- Concurrent multi-process safety beyond atomic rename (single Electron process is the only writer).
- Pluggable encryption algorithms (AES-256-GCM only).
- PairingStore-specific secrets (B001-009 layers on top of SecretStore).

## Notes for Critic

- Verify atomic write: search code for the temp-file + rename pattern; ensure NO path writes directly to the final filename. Critic should also check that `mode: 0o600` is passed on every writeFile.
- Quarantine path naming: must include timestamp (millis) so multiple corruptions don't overwrite each other.
- The keytar service field MUST include the slug; check `KEYTAR_SERVICE` helper is the only path producing service strings.
- Local secret reuse: confirm `loadLocalSecret` checks `existing.length === 32` to detect corruption; otherwise it must regenerate.
- AES-GCM auth tag handling: order is IV(12) || tag(16) || ciphertext. Both encrypt and decrypt must agree. Bonus check: round-trip with empty `{}` blob still works.
- Slug sandbox: try to construct a `PersistedStore` that reads `../<other-slug>/config.json` — should be impossible via the public API. Confirm `moduleConfigPath` only joins layout.modulesDir + slug + config.json with no caller-controlled traversal.
- Watch for unhandled rejections in tests — every `await` should be awaited; no `void promise` patterns.
- `zod` import is in showx-shared (B001-002) AND in showx-main (this task). Both must agree on version (^3.22.0). Critic: grep `package.json`s.
