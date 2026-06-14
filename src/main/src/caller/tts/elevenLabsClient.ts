import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import type { SecretStore } from 'showx-shared';

const API_BASE = 'https://api.elevenlabs.io/v1';
const MODEL_ID = 'eleven_multilingual_v2';

// ElevenLabs default TTS output: 128 kbps mp3
const BYTES_PER_SEC = 128_000 / 8;

const SECRET_KEY = 'elevenlabs-api-key';

export type SynthesizeResult = {
  path: string;
  durationSecs: number;
};

export class ElevenLabsClient {
  constructor(private readonly secrets: SecretStore) {}

  async isEnabled(): Promise<boolean> {
    const k = await this.secrets.get(SECRET_KEY);
    return !!k;
  }

  async synthesize(text: string, voiceId: string, outPath: string): Promise<SynthesizeResult> {
    const apiKey = await this.requireKey();

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
    } catch (err) {
      throw new Error(`ElevenLabs network error: ${String(err)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${body}`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, bytes);

    const durationSecs = bytes.length / BYTES_PER_SEC;
    return { path: outPath, durationSecs };
  }

  async cloneVoice(name: string, samplePaths: string[], description = ''): Promise<string> {
    const apiKey = await this.requireKey();

    const form = new FormData();
    form.append('name', name);
    form.append('description', description);

    for (const sp of samplePaths) {
      const bytes = await fs.readFile(sp);
      const filename = sp.split('/').pop() ?? 'sample.wav';
      form.append('files', new Blob([bytes]), filename);
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/voices/add`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      });
    } catch (err) {
      throw new Error(`ElevenLabs network error: ${String(err)}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs voice clone failed (${res.status}): ${body}`);
    }

    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) throw new Error('ElevenLabs clone response missing voice_id');
    return json.voice_id;
  }

  private async requireKey(): Promise<string> {
    const k = await this.secrets.get(SECRET_KEY);
    if (!k) throw new Error('ElevenLabs API key not configured. Add it via Settings > Caller.');
    return k;
  }
}
