import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { getCuelist, getCues } from '../document/cuelist.js';
import type { CallerLineGroup } from 'showx-shared';

// ── Dependency interfaces ─────────────────────────────────────────────────────

export interface TtsInterface {
  isEnabled(): Promise<boolean>;
  synthesize(
    text: string,
    voiceId: string,
    outPath: string,
  ): Promise<{ path: string; durationSecs: number }>;
}

export interface PreGenLogger {
  warn(msg: string, data?: unknown): void;
}

// ── Manifest types ────────────────────────────────────────────────────────────

export interface CallerMediaEntry {
  cue_id: string;
  dept: string | null;
  kind: 'standby' | 'go';
  /** Relative path from pkgPath, e.g. "media/cue123_LX_standby.mp3" */
  file: string;
  text_hash: string;
  text: string;
  duration_secs: number;
}

export interface CallerManifest {
  schema_version: 1;
  generated_at: string;
  /** Keys: "{cue_id}_{dept}_standby" or "{cue_id}_go" */
  entries: Record<string, CallerMediaEntry>;
}

// ── Result types ──────────────────────────────────────────────────────────────

export type PreGenStatus = 'ok' | 'skipped_no_tts' | 'partial';

export interface PreGenError {
  cue_id: string;
  kind: 'standby' | 'go';
  dept: string | null;
  message: string;
}

export interface PreGenResult {
  synthesized: number;
  skipped: number;
  failed: number;
  errors: PreGenError[];
  status: PreGenStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function manifestKey(cueId: string, dept: string | null, kind: 'standby' | 'go'): string {
  return kind === 'standby' ? `${cueId}_${dept}_standby` : `${cueId}_go`;
}

function mediaFile(cueId: string, dept: string | null, kind: 'standby' | 'go'): string {
  return kind === 'standby' ? `media/${cueId}_${dept}_standby.mp3` : `media/${cueId}_go.mp3`;
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const MANIFEST_FILE = 'media/caller_manifest.json';

async function loadManifest(pkgPath: string): Promise<CallerManifest> {
  try {
    const raw = await fs.readFile(path.join(pkgPath, MANIFEST_FILE), 'utf-8');
    return JSON.parse(raw) as CallerManifest;
  } catch {
    return { schema_version: 1, generated_at: '', entries: {} };
  }
}

async function saveManifest(pkgPath: string, manifest: CallerManifest): Promise<void> {
  const dest = path.join(pkgPath, MANIFEST_FILE);
  const tmp = `${dest}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(manifest, null, 2) + '\n');
  await fs.rename(tmp, dest);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Pre-generate all caller audio for a cuelist, writing mp3 files to .showx/media/.
 * Idempotent: skips files whose text hash matches the manifest.
 * Graceful: no TTS key or voice profile → returns skipped_no_tts without error.
 * Per-cue failures are isolated — partial failures do not abort the whole run.
 */
export async function preGenerateCallerAudio(
  doc: Y.Doc,
  cuelistId: string,
  pkgPath: string,
  ttsClient: TtsInterface,
  voiceId: string | null | undefined,
  logger?: PreGenLogger,
): Promise<PreGenResult> {
  const enabled = await ttsClient.isEnabled();
  if (!enabled || !voiceId) {
    logger?.warn('caller.pregen.skipped', {
      reason: !enabled ? 'tts_disabled' : 'no_voice_id',
    });
    return { synthesized: 0, skipped: 0, failed: 0, errors: [], status: 'skipped_no_tts' };
  }

  const cuelist = getCuelist(doc, cuelistId);
  if (!cuelist) {
    logger?.warn('caller.pregen.no_cuelist', { cuelistId });
    return { synthesized: 0, skipped: 0, failed: 0, errors: [], status: 'ok' };
  }

  await fs.mkdir(path.join(pkgPath, 'media'), { recursive: true });
  const manifest = await loadManifest(pkgPath);

  let synthesized = 0;
  let skipped = 0;
  let failed = 0;
  const errors: PreGenError[] = [];

  for (const cueMap of getCues(cuelist).toArray()) {
    const cueId = cueMap.get('id') as string;
    const callerLines = cueMap.get('caller_lines') as CallerLineGroup | null | undefined;
    if (!callerLines) continue;

    // ── Standby per department ───────────────────────────────────────────────
    for (const [dept, standbyText] of Object.entries(callerLines.standby)) {
      const key = manifestKey(cueId, dept, 'standby');
      const hash = textHash(standbyText);
      const existing = manifest.entries[key];

      if (existing?.text_hash === hash) {
        if (await fileExists(path.join(pkgPath, existing.file))) {
          skipped++;
          continue;
        }
      }

      try {
        const file = mediaFile(cueId, dept, 'standby');
        const { durationSecs } = await ttsClient.synthesize(
          standbyText,
          voiceId,
          path.join(pkgPath, file),
        );
        manifest.entries[key] = {
          cue_id: cueId,
          dept,
          kind: 'standby',
          file,
          text_hash: hash,
          text: standbyText,
          duration_secs: durationSecs,
        };
        synthesized++;
      } catch (err) {
        failed++;
        errors.push({ cue_id: cueId, kind: 'standby', dept, message: String(err) });
        logger?.warn('caller.pregen.cue_failed', {
          cueId,
          kind: 'standby',
          dept,
          error: String(err),
        });
      }
    }

    // ── GO ───────────────────────────────────────────────────────────────────
    const goText = callerLines.go;
    const goKey = manifestKey(cueId, null, 'go');
    const goHash = textHash(goText);
    const existingGo = manifest.entries[goKey];

    let shouldSynthGo = true;
    if (existingGo?.text_hash === goHash) {
      if (await fileExists(path.join(pkgPath, existingGo.file))) {
        skipped++;
        shouldSynthGo = false;
      }
    }

    if (shouldSynthGo) {
      try {
        const file = mediaFile(cueId, null, 'go');
        const { durationSecs } = await ttsClient.synthesize(
          goText,
          voiceId,
          path.join(pkgPath, file),
        );
        manifest.entries[goKey] = {
          cue_id: cueId,
          dept: null,
          kind: 'go',
          file,
          text_hash: goHash,
          text: goText,
          duration_secs: durationSecs,
        };
        synthesized++;
      } catch (err) {
        failed++;
        errors.push({ cue_id: cueId, kind: 'go', dept: null, message: String(err) });
        logger?.warn('caller.pregen.cue_failed', {
          cueId,
          kind: 'go',
          dept: null,
          error: String(err),
        });
      }
    }
  }

  manifest.generated_at = new Date().toISOString();
  await saveManifest(pkgPath, manifest);

  return {
    synthesized,
    skipped,
    failed,
    errors,
    status: failed > 0 ? 'partial' : 'ok',
  };
}
