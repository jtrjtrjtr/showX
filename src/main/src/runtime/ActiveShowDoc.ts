import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  openShowxPackage,
  saveShowxPackage,
} from '../../../modules/cuelist-core/dist/persistence/showxPackage.js';
import type { Logger } from 'showx-shared';

interface ActiveShowMeta {
  pkgPath: string;
  title: string;
  mode: 'rehearsal' | 'show';
}

type ChangeKind = 'opened' | 'closed' | 'mutated';
type ChangeListener = (kind: ChangeKind) => void;

type YUpdateHandler = (update: Uint8Array, origin: unknown, doc: Y.Doc) => void;

const SAVE_DEBOUNCE_MS = 350;

const ShowMetaZ = z.object({
  meta: z
    .object({
      title: z.string().optional(),
      mode: z.enum(['rehearsal', 'show']).optional(),
    })
    .optional(),
});

export class ActiveShowDoc {
  private doc: Y.Doc | null = null;
  private meta: ActiveShowMeta | null = null;
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<ChangeListener>();
  private updateHandler: YUpdateHandler | null = null;

  constructor(private readonly logger: Logger) {}

  getDoc(): Y.Doc | null {
    return this.doc;
  }

  getPkgPath(): string | null {
    return this.meta?.pkgPath ?? null;
  }

  getActiveShow(): ActiveShowMeta | null {
    return this.meta;
  }

  async open(pkgPath: string): Promise<void> {
    if (this.meta) await this.close();

    const { doc } = await openShowxPackage(pkgPath);

    let title = path.basename(pkgPath, '.showx') || 'Untitled';
    let mode: 'rehearsal' | 'show' = 'rehearsal';

    try {
      const raw = await fs.readFile(path.join(pkgPath, 'show.json'), 'utf-8');
      const parsed = ShowMetaZ.safeParse(JSON.parse(raw));
      if (parsed.success) {
        title = parsed.data.meta?.title ?? title;
        mode = parsed.data.meta?.mode ?? mode;
      }
    } catch {
      // Use fallback title from path
    }

    this.doc = doc;
    this.meta = { pkgPath, title, mode };
    this.dirty = false;

    this.updateHandler = (_update: Uint8Array, _origin: unknown, _doc: Y.Doc) =>
      this.scheduleSave();
    doc.on('update', this.updateHandler);

    this.logger.info('active_show.opened', { pkgPath });
    this.listeners.forEach((cb) => cb('opened'));
  }

  async close(): Promise<void> {
    const pkgPath = this.meta?.pkgPath ?? null;
    const savedDirty = this.dirty;

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.doc && this.meta && this.dirty) {
      this.dirty = false;
      await saveShowxPackage(this.doc, this.meta.pkgPath, { reason: 'autosave' });
    }

    if (this.doc && this.updateHandler) {
      this.doc.off('update', this.updateHandler);
    }
    this.updateHandler = null;
    this.doc = null;
    this.meta = null;
    this.dirty = false;

    this.logger.info('active_show.closed', { pkgPath, savedDirty });
    this.listeners.forEach((cb) => cb('closed'));
  }

  onChange(cb: ChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_DEBOUNCE_MS);
  }

  private async flushSave(): Promise<void> {
    if (!this.doc || !this.meta || !this.dirty) return;
    const start = Date.now();
    const { doc, meta } = { doc: this.doc, meta: this.meta };
    this.dirty = false;
    this.saveTimer = null;
    await saveShowxPackage(doc, meta.pkgPath, { reason: 'autosave' });
    this.logger.debug('active_show.autosave', {
      pkgPath: meta.pkgPath,
      durationMs: Date.now() - start,
    });
    this.listeners.forEach((cb) => cb('mutated'));
  }
}
