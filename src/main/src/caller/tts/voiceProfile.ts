import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface VoiceProfile {
  voice_id: string;
  name: string;
  created_at: string;
  sample_count: number;
}

const PROFILE_FILE = 'voice_profile.json';

export async function loadVoiceProfile(pkgPath: string): Promise<VoiceProfile | null> {
  try {
    const raw = await fs.readFile(path.join(pkgPath, PROFILE_FILE), 'utf-8');
    return JSON.parse(raw) as VoiceProfile;
  } catch {
    return null;
  }
}

export async function saveVoiceProfile(pkgPath: string, profile: VoiceProfile): Promise<void> {
  const dest = path.join(pkgPath, PROFILE_FILE);
  const tmp = `${dest}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(profile, null, 2) + '\n');
  await fs.rename(tmp, dest);
}
