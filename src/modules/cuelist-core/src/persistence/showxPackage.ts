import * as Y from 'yjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile, cleanOrphanTmps } from './atomicWrite.js';
import {
  docToProjections,
  type ShowJson,
  type CuelistJson,
} from './projections.js';
import { appendHistoryEvent, rotateHistoryIfNeeded } from './historyJsonl.js';
import { writeInfoPlist } from './infoPlist.js';
import { rebuildDocFromJson } from './recovery.js';
import { runMigrations } from '../migrations/index.js';

// ── Errors ────────────────────────────────────────────────────────────────────

export class UnsupportedFormatError extends Error {
  constructor(public readonly version: string) {
    super(
      `unsupported .showx format_version ${version} — upgrade ShowX or rebuild from cloud backup`,
    );
    this.name = 'UnsupportedFormatError';
  }
}

function isSupportedFormatVersion(v: string): boolean {
  const major = parseInt(v.split('.')[0], 10);
  return major === 1;
}

// ── Open ──────────────────────────────────────────────────────────────────────

export interface OpenResult {
  doc: Y.Doc;
  appliedMigrations: string[];
  recoveredFromJson: boolean;
}

/**
 * Open a .showx package directory.
 * Load procedure (per data_model.md §3.9):
 * 1. Validate show.json format_version.
 * 2. Run any pending migrations on JSON projections.
 * 3. Prefer doc.yjs binary; fall back to JSON if missing or corrupt.
 * 4. If migrations ran, save updated state back to disk.
 */
export async function openShowxPackage(pkgPath: string): Promise<OpenResult> {
  await fs.stat(pkgPath); // throws ENOENT if missing

  const showJsonRaw = await fs.readFile(path.join(pkgPath, 'show.json'), 'utf8');
  const showJson = JSON.parse(showJsonRaw) as ShowJson;

  if (!isSupportedFormatVersion(showJson.format_version)) {
    throw new UnsupportedFormatError(showJson.format_version);
  }

  // Load cuelist JSON files
  const cuelists: CuelistJson[] = [];
  for (const entry of showJson.cuelist_index) {
    const raw = await fs.readFile(path.join(pkgPath, entry.file), 'utf8');
    cuelists.push(JSON.parse(raw) as CuelistJson);
  }

  // Pre-validate doc.yjs before running migrations — needed to correctly determine recoveredFromJson
  // when migrations run (migration path always rebuilds from JSON regardless of doc.yjs state).
  const docYjsPath = path.join(pkgPath, 'doc.yjs');
  let yjsDoc: Y.Doc | null = null;
  try {
    const bin = await fs.readFile(docYjsPath);
    if (bin.length > 0) {
      const d = new Y.Doc();
      Y.applyUpdate(d, new Uint8Array(bin));
      yjsDoc = d;
    }
  } catch {
    // Missing, unreadable, or corrupt — yjsDoc stays null
  }

  // Run migrations on JSON projections
  const { migrated, applied } = await runMigrations({ show: showJson, cuelists });

  let doc: Y.Doc;
  let recoveredFromJson = false;

  if (applied.length > 0) {
    // Migrations ran — JSON is now authoritative; doc.yjs holds pre-migration state and must be discarded.
    // Rebuild Y.Doc from migrated JSON so CRDT state matches the migrated projections (data_model.md §11.3).
    doc = await rebuildDocFromJson(pkgPath, migrated.show, migrated.cuelists);
    recoveredFromJson = yjsDoc === null;
  } else if (yjsDoc !== null) {
    doc = yjsDoc;
  } else {
    doc = await rebuildDocFromJson(
      pkgPath,
      migrated.show,
      migrated.cuelists,
    );
    recoveredFromJson = true;
  }

  // If migrations ran, persist updated state so disk + Yjs stay in sync
  if (applied.length > 0) {
    await saveShowxPackage(doc, pkgPath, { reason: 'migration_applied' });
  }

  return { doc, appliedMigrations: applied, recoveredFromJson };
}

// ── Save ──────────────────────────────────────────────────────────────────────

export interface SaveOpts {
  reason: 'autosave' | 'explicit' | 'mode_transition' | 'pre_close' | 'migration_applied';
  by_operator_id?: string;
}

const HISTORY_MAX_BYTES = 50_000_000; // 50 MB
const HISTORY_MAX_AGE_DAYS = 10;

/**
 * Save a Y.Doc to a .showx package directory (per data_model.md §3.8).
 * Four-step atomic save: encode → write .tmp → fsync → rename.
 * All writes are atomic; if any .tmp write fails, the prior package is preserved.
 */
export async function saveShowxPackage(
  doc: Y.Doc,
  pkgPath: string,
  opts: SaveOpts,
): Promise<void> {
  // Ensure all required directories exist
  await fs.mkdir(pkgPath, { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'cuelists'), { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'snapshots'), { recursive: true });
  await fs.mkdir(path.join(pkgPath, 'media'), { recursive: true });

  // Clean orphan .tmp files from previous failed saves
  await cleanOrphanTmps(pkgPath);
  await cleanOrphanTmps(path.join(pkgPath, 'cuelists'));

  // 1. Encode Y.Doc state as binary update
  const docUpdate = Y.encodeStateAsUpdate(doc);

  // 2. Derive JSON projections from Y.Doc
  const { show, cuelists, routing, operators } = docToProjections(doc);

  // 3. Atomic writes (encode → .tmp → fsync → rename)
  await atomicWriteFile(path.join(pkgPath, 'doc.yjs'), Buffer.from(docUpdate));
  await atomicWriteFile(
    path.join(pkgPath, 'show.json'),
    JSON.stringify(show, null, 2) + '\n',
  );
  for (const [id, cl] of Object.entries(cuelists)) {
    await atomicWriteFile(
      path.join(pkgPath, 'cuelists', `cl_${id}.json`),
      JSON.stringify(cl, null, 2) + '\n',
    );
  }
  await atomicWriteFile(
    path.join(pkgPath, 'routing.json'),
    JSON.stringify(routing, null, 2) + '\n',
  );
  await atomicWriteFile(
    path.join(pkgPath, 'operators.json'),
    JSON.stringify(operators, null, 2) + '\n',
  );

  // 4. Info.plist (idempotent macOS bundle hint)
  await writeInfoPlist(pkgPath, show.meta.title);

  // 5. Append save event to history.jsonl (non-atomic append — POSIX-atomic for < PIPE_BUF)
  await appendHistoryEvent(pkgPath, {
    ts: new Date().toISOString(),
    kind: 'save',
    reason: opts.reason,
    by: opts.by_operator_id ?? 'system',
  });

  // 6. Rotate history if over threshold
  await rotateHistoryIfNeeded(pkgPath, {
    maxBytes: HISTORY_MAX_BYTES,
    maxAgeDays: HISTORY_MAX_AGE_DAYS,
  });
}

