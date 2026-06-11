import { dialog, app, Menu, BrowserWindow } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ShellConfigStore } from '../Shell.js';
import type { IpcMainBridge } from './index.js';

// ── Recent shows schema ───────────────────────────────────────────────────────

const RecentShowZ = z.object({
  path: z.string(),
  last_opened_at: z.string(),
  cue_count: z.number().optional(),
});
type RecentShow = z.infer<typeof RecentShowZ>;

const RECENT_KEY = 'cuelist-core:recent-shows';
const MAX_RECENT = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRecents(config: ShellConfigStore): RecentShow[] {
  const raw = config.get(RECENT_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const res = RecentShowZ.safeParse(r);
    return res.success ? [res.data] : [];
  });
}

async function pushRecent(
  config: ShellConfigStore,
  showPath: string,
  cueCount?: number,
): Promise<void> {
  const recents = getRecents(config);
  const filtered = recents.filter((r) => r.path !== showPath);
  const entry: RecentShow = {
    path: showPath,
    last_opened_at: new Date().toISOString(),
    ...(cueCount !== undefined && { cue_count: cueCount }),
  };
  filtered.unshift(entry);
  await config.set(RECENT_KEY, filtered.slice(0, MAX_RECENT));
}

function getDemoSrc(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'demo-show', 'demo.showx');
  }
  // Dev: resources live in the project root relative to cwd
  return path.resolve(process.cwd(), 'resources', 'demo-show', 'demo.showx');
}

function sendOpenShow(showPath: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  win?.webContents.send('cuelist-core/open-show', showPath);
}

// ── Integration OSC device seeding ───────────────────────────────────────────

/**
 * When SHOWX_OSC_OUT=host:port is set, returns a legacy-shape routing entry so a
 * fresh show dispatches OSC out of the box to the integration osc-ws-bridge.
 * GoExecutor.attach() also injects this device at show-open time for existing shows.
 */
function buildIntegrationOscEntry(): Record<string, unknown> | null {
  const oscOut = process.env['SHOWX_OSC_OUT'];
  if (!oscOut) return null;
  const colonIdx = oscOut.lastIndexOf(':');
  if (colonIdx === -1) return null;
  const host = oscOut.slice(0, colonIdx);
  const port = parseInt(oscOut.slice(colonIdx + 1), 10);
  if (!host || isNaN(port) || port < 1 || port > 65535) return null;
  return {
    id: 'integration_osc_fallback',
    match: {},
    transport: { kind: 'osc', host, port },
    enabled: true,
    notes: `Integration OSC fallback — SHOWX_OSC_OUT=${oscOut}`,
  };
}

// ── Empty show factory ────────────────────────────────────────────────────────

function makeEmptyShow(showName: string) {
  const showId = randomUUID();
  const cuelistId = randomUUID();
  const now = new Date().toISOString();

  const show = {
    $schema: 'https://showx.xlab.cz/schema/show.v1.json',
    format_version: '1.0',
    schema_version: 1,
    show_id: showId,
    meta: {
      schema_version: 1,
      show_id: showId,
      title: showName,
      venue: null as string | null,
      date: null as string | null,
      departments: [] as string[],
      mode: 'rehearsal',
      active_cuelist_id: cuelistId,
      created_at: now,
      last_meta_editor: null as string | null,
    },
    cuelist_index: [{ id: cuelistId, name: 'Main Show', file: 'cuelists/cl_main.json' }],
    snapshot_index: [] as unknown[],
    applied_migrations: [] as string[],
  };

  const cuelist = {
    id: cuelistId,
    name: 'Main Show',
    default_trigger: 'manual',
    go_authority: 'sm_called',
    sm_offline_policy: { kind: 'freeze' },
    playhead: { cue_id: null, armed_cue_id: null },
    show_snapshot_id: null,
    cues: [],
  };

  // Seed a default integration routing entry when SHOWX_OSC_OUT is set.
  // This uses the legacy embedded-transport shape (compatible with buildDispatchRoutingTable)
  // so a fresh show can dispatch without manual device configuration.
  // For production shows, add proper devices via the Routing UI.
  const integrationOscEntry = buildIntegrationOscEntry();
  const routing = { entries: integrationOscEntry ? [integrationOscEntry] : [] };
  const operators = { operators: [], stations: [] };
  const historyLines = [
    JSON.stringify({ ts: now, kind: 'show_created', show_id: showId, by: 'user' }),
  ];

  return { show, cuelist, routing, operators, historyLines };
}

async function writeEmptyShowPkg(showPath: string, showName: string): Promise<void> {
  const { show, cuelist, routing, operators, historyLines } = makeEmptyShow(showName);
  await fs.mkdir(path.join(showPath, 'cuelists'), { recursive: true });
  await fs.mkdir(path.join(showPath, 'snapshots'), { recursive: true });
  await fs.mkdir(path.join(showPath, 'media'), { recursive: true });
  await fs.writeFile(path.join(showPath, 'show.json'), JSON.stringify(show, null, 2) + '\n');
  await fs.writeFile(
    path.join(showPath, 'cuelists', 'cl_main.json'),
    JSON.stringify(cuelist, null, 2) + '\n',
  );
  await fs.writeFile(path.join(showPath, 'routing.json'), JSON.stringify(routing, null, 2) + '\n');
  await fs.writeFile(
    path.join(showPath, 'operators.json'),
    JSON.stringify(operators, null, 2) + '\n',
  );
  await fs.writeFile(path.join(showPath, 'history.jsonl'), historyLines.join('\n') + '\n');
}

// ── Exported handler functions (callable from IPC and menu click handlers) ────

export async function handleOpenDemo(
  config: ShellConfigStore,
): Promise<{ path?: string; cancelled?: boolean }> {
  const demoSrc = getDemoSrc();
  const destDir = path.join(app.getPath('documents'), 'ShowX');
  await fs.mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, 'Demo Show.showx');

  if (existsSync(dest)) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Open existing', 'Replace with fresh demo', 'Cancel'],
      message: 'Demo Show already exists',
      detail:
        'You have an existing Demo Show. Open it (keep your edits) or replace with a fresh copy?',
    });
    if (response === 2) return { cancelled: true };
    if (response === 1) await fs.rm(dest, { recursive: true, force: true });
  }

  if (!existsSync(dest)) {
    await fs.cp(demoSrc, dest, { recursive: true });
  }

  await pushRecent(config, dest, 25);
  buildAppMenu(config);
  return { path: dest };
}

export async function handleOpenFilePicker(
  config: ShellConfigStore,
): Promise<{ path?: string; cancelled?: boolean }> {
  const result = await dialog.showOpenDialog({
    title: 'Open ShowX Show',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { cancelled: true };
  }
  const showPath = result.filePaths[0]!;
  await pushRecent(config, showPath);
  buildAppMenu(config);
  return { path: showPath };
}

export async function handleCreateNew(
  config: ShellConfigStore,
): Promise<{ path?: string; cancelled?: boolean; error?: string }> {
  const result = await dialog.showSaveDialog({
    title: 'Save New Show',
    defaultPath: path.join(app.getPath('documents'), 'ShowX', 'Untitled.showx'),
    properties: ['createDirectory'],
  });
  if (result.canceled || !result.filePath) {
    return { cancelled: true };
  }
  const showPath = result.filePath;
  if (existsSync(showPath)) {
    return { error: 'path_exists', path: showPath };
  }
  const showName = path.basename(showPath, '.showx') || 'Untitled';
  await writeEmptyShowPkg(showPath, showName);
  await pushRecent(config, showPath, 0);
  buildAppMenu(config);
  return { path: showPath };
}

// ── Application menu ──────────────────────────────────────────────────────────

export function buildAppMenu(config: ShellConfigStore): void {
  const recents = getRecents(config);

  const recentSubmenu: MenuItemConstructorOptions[] =
    recents.length > 0
      ? recents.map((r) => ({
          label: path.basename(r.path, '.showx'),
          click: () => sendOpenShow(r.path),
        }))
      : [{ label: 'No Recent Shows', enabled: false }];

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Demo Show',
          click: () => {
            void handleOpenDemo(config).then((result) => {
              if (result.path) sendOpenShow(result.path);
            });
          },
        },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void handleOpenFilePicker(config).then((result) => {
              if (result.path) sendOpenShow(result.path);
            });
          },
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: 'New Show…',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void handleCreateNew(config).then((result) => {
              if (result.path) sendOpenShow(result.path);
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── Register handlers ─────────────────────────────────────────────────────────

export function registerShowActions(config: ShellConfigStore, ipc: IpcMainBridge): void {
  ipc.handle('cuelist-core:recent-shows-get', async () => getRecents(config));

  ipc.handle('cuelist-core:recent-shows-clear', async () => {
    await config.set(RECENT_KEY, []);
    buildAppMenu(config);
    return { ok: true };
  });

  ipc.handle('cuelist-core:open-file-picker', async () => handleOpenFilePicker(config));

  ipc.handle('cuelist-core:create-new', async () => handleCreateNew(config));

  ipc.handle('cuelist-core:open-demo', async () => handleOpenDemo(config));

  buildAppMenu(config);
}
