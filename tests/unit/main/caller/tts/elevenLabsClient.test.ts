import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.stubGlobal('fetch', mockFetch);

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
  },
}));

import { ElevenLabsClient } from '../../../../../src/main/src/caller/tts/elevenLabsClient.js';
import type { SecretStore } from 'showx-shared';

function makeSecrets(key?: string): SecretStore {
  return {
    get: vi.fn().mockResolvedValue(key ?? null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  };
}

function makeOkResponse(body: Uint8Array | string, contentType = 'audio/mpeg'): Response {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  return {
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(buf.buffer),
    text: vi.fn().mockResolvedValue(''),
    json: vi.fn().mockResolvedValue({}),
    headers: new Headers({ 'content-type': contentType }),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ElevenLabsClient.isEnabled', () => {
  it('returns true when API key is stored', async () => {
    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    expect(await client.isEnabled()).toBe(true);
  });

  it('returns false when no API key', async () => {
    const client = new ElevenLabsClient(makeSecrets(undefined));
    expect(await client.isEnabled()).toBe(false);
  });
});

describe('ElevenLabsClient.synthesize', () => {
  it('writes mp3 and returns path + durationSecs when enabled', async () => {
    const audioBytes = Buffer.alloc(16000); // 1 second at 128kbps
    mockFetch.mockResolvedValueOnce(makeOkResponse(audioBytes));

    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    const result = await client.synthesize('Hello world', 'voice_abc', '/tmp/out.mp3');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/text-to-speech/voice_abc');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      text: 'Hello world',
      model_id: 'eleven_multilingual_v2',
    });

    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/out.mp3', expect.any(Buffer));
    expect(result.path).toBe('/tmp/out.mp3');
    expect(result.durationSecs).toBeCloseTo(1, 1);
  });

  it('throws when no API key is configured', async () => {
    const client = new ElevenLabsClient(makeSecrets(undefined));
    await expect(client.synthesize('text', 'vid', '/tmp/x.mp3')).rejects.toThrow(
      /API key not configured/i,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws and does not write file on API error', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, 'Unauthorized'));
    const client = new ElevenLabsClient(makeSecrets('sk-bad'));
    await expect(client.synthesize('text', 'vid', '/tmp/x.mp3')).rejects.toThrow(/401/);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('wraps network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    await expect(client.synthesize('text', 'vid', '/tmp/x.mp3')).rejects.toThrow(
      /network error/i,
    );
  });
});

describe('ElevenLabsClient.cloneVoice', () => {
  it('posts multipart form and returns voice_id', async () => {
    const fakeBytes = Buffer.from('audio');
    vi.mocked(fs.readFile).mockResolvedValueOnce(fakeBytes as never);

    const jsonRes = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ voice_id: 'cloned_voice_123' }),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(jsonRes);

    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    const voiceId = await client.cloneVoice('ShowCaller', ['/tmp/sample.wav'], 'test clone');

    expect(voiceId).toBe('cloned_voice_123');
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/voices/add');
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it('throws when no API key', async () => {
    const client = new ElevenLabsClient(makeSecrets(undefined));
    await expect(client.cloneVoice('name', ['/tmp/x.wav'])).rejects.toThrow(/API key/i);
  });

  it('throws on clone API error', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(Buffer.from('audio') as never);
    mockFetch.mockResolvedValueOnce(makeErrorResponse(400, 'Bad request'));
    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    await expect(client.cloneVoice('name', ['/tmp/x.wav'])).rejects.toThrow(/400/);
  });

  it('throws when response missing voice_id', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(Buffer.from('audio') as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    } as unknown as Response);
    const client = new ElevenLabsClient(makeSecrets('sk-test'));
    await expect(client.cloneVoice('name', ['/tmp/x.wav'])).rejects.toThrow(/voice_id/i);
  });
});
