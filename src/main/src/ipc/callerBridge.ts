import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { IPC } from './channels.js';
import type { IpcMainBridge } from './index.js';
import type { ElevenLabsClient } from '../caller/tts/elevenLabsClient.js';
import { loadVoiceProfile, saveVoiceProfile, type VoiceProfile } from '../caller/tts/voiceProfile.js';
import { preGenerateCallerAudio } from '@showx/module-cuelist-core/caller/preGenerate.js';
import type { CallerManifest, CallerMediaEntry } from '@showx/module-cuelist-core/caller/preGenerate.js';
import type { ActiveShowDoc } from '../runtime/ActiveShowDoc.js';
import type { SecretStore } from 'showx-shared';

export interface CallerBridgeDeps {
  elevenlabs: ElevenLabsClient;
  activeShow: ActiveShowDoc;
  secrets: SecretStore;
}

export function registerCallerBridge(deps: CallerBridgeDeps, ipc: IpcMainBridge): void {
  ipc.handle(IPC.CALLER_TTS_STATUS, async () => {
    const enabled = await deps.elevenlabs.isEnabled();
    return { enabled };
  });

  ipc.handle(IPC.CALLER_APIKEY_SET, async (_e: unknown, apiKey: string) => {
    await deps.secrets.set('elevenlabs-api-key', apiKey);
    return { ok: true };
  });

  ipc.handle(
    IPC.CALLER_TTS_SYNTHESIZE,
    async (_e: unknown, text: string, voiceId: string, outPath: string) => {
      const result = await deps.elevenlabs.synthesize(text, voiceId, outPath);
      return result;
    },
  );

  ipc.handle(IPC.CALLER_VOICE_GET, async () => {
    const pkgPath = deps.activeShow.getPkgPath();
    if (!pkgPath) return null;
    return loadVoiceProfile(pkgPath);
  });

  ipc.handle(
    IPC.CALLER_VOICE_CLONE,
    async (_e: unknown, name: string, samplePaths: string[], description?: string) => {
      const pkgPath = deps.activeShow.getPkgPath();
      if (!pkgPath) throw new Error('No active show — open a show before cloning voice');

      const voiceId = await deps.elevenlabs.cloneVoice(name, samplePaths, description);
      const profile: VoiceProfile = {
        voice_id: voiceId,
        name,
        created_at: new Date().toISOString(),
        sample_count: samplePaths.length,
      };
      await saveVoiceProfile(pkgPath, profile);
      return profile;
    },
  );

  ipc.handle(IPC.CALLER_MEDIA_MANIFEST, async () => {
    const pkgPath = deps.activeShow.getPkgPath();
    if (!pkgPath) return null;
    const manifestPath = path.join(pkgPath, 'media', 'caller_manifest.json');
    let manifest: CallerManifest;
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(raw) as CallerManifest;
    } catch {
      return null;
    }
    // Add file:// URL to each entry for the renderer to play directly
    const entriesWithUrl: Record<string, CallerMediaEntry & { fileUrl: string }> = {};
    for (const [key, entry] of Object.entries(manifest.entries)) {
      entriesWithUrl[key] = {
        ...entry,
        fileUrl: pathToFileURL(path.join(pkgPath, entry.file)).href,
      };
    }
    return { ...manifest, entries: entriesWithUrl };
  });

  ipc.handle(IPC.CALLER_PREGEN, async () => {
    const doc = deps.activeShow.getDoc();
    const pkgPath = deps.activeShow.getPkgPath();
    if (!doc || !pkgPath) {
      return { synthesized: 0, skipped: 0, failed: 0, errors: [], status: 'skipped_no_tts' };
    }

    const cuelistId = doc.getMap('meta').get('active_cuelist_id') as string | undefined;
    if (!cuelistId) {
      return { synthesized: 0, skipped: 0, failed: 0, errors: [], status: 'skipped_no_tts' };
    }

    const profile = await loadVoiceProfile(pkgPath);
    return preGenerateCallerAudio(doc, cuelistId, pkgPath, deps.elevenlabs, profile?.voice_id ?? null);
  });
}
