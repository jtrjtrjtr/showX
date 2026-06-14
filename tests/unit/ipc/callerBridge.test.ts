import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const { mockLoadVoiceProfile, mockSaveVoiceProfile, mockPreGenerateCallerAudio } = vi.hoisted(() => ({
  mockLoadVoiceProfile: vi.fn(),
  mockSaveVoiceProfile: vi.fn().mockResolvedValue(undefined),
  mockPreGenerateCallerAudio: vi.fn().mockResolvedValue({
    synthesized: 2,
    skipped: 0,
    failed: 0,
    errors: [],
    status: 'ok',
  }),
}));

vi.mock('../../../src/main/src/caller/tts/voiceProfile.js', () => ({
  loadVoiceProfile: mockLoadVoiceProfile,
  saveVoiceProfile: mockSaveVoiceProfile,
}));

vi.mock('../../../src/modules/cuelist-core/dist/caller/preGenerate.js', () => ({
  preGenerateCallerAudio: mockPreGenerateCallerAudio,
}));

import { registerCallerBridge, type CallerBridgeDeps } from '../../../src/main/src/ipc/callerBridge.js';
import type { IpcMainBridge } from '../../../src/main/src/ipc/index.js';
import type { ElevenLabsClient } from '../../../src/main/src/caller/tts/elevenLabsClient.js';
import type { VoiceProfile } from '../../../src/main/src/caller/tts/voiceProfile.js';

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

function captureHandlers() {
  const handlers: Record<string, HandlerFn> = {};
  const ipc: IpcMainBridge = {
    handle: vi.fn((ch: string, fn: HandlerFn) => {
      handlers[ch] = fn;
    }) as IpcMainBridge['handle'],
  };
  return { ipc, handlers };
}

function makeFakeEL(overrides: Partial<ElevenLabsClient> = {}): ElevenLabsClient {
  return {
    isEnabled: vi.fn().mockResolvedValue(true),
    synthesize: vi.fn().mockResolvedValue({ path: '/tmp/out.mp3', durationSecs: 1.5 }),
    cloneVoice: vi.fn().mockResolvedValue('voice_new_123'),
    ...overrides,
  } as unknown as ElevenLabsClient;
}

function makeFakeDoc(cuelistId = 'cl-001') {
  const meta = new Map<string, unknown>([['active_cuelist_id', cuelistId]]);
  return { getMap: vi.fn(() => ({ get: (k: string) => meta.get(k) })) };
}

function makeFakeActiveShow(pkgPath: string | null = '/shows/my.showx', docArg?: ReturnType<typeof makeFakeDoc>) {
  const doc = docArg ?? makeFakeDoc();
  return { getPkgPath: vi.fn(() => pkgPath), getDoc: vi.fn(() => (pkgPath ? doc : null)) };
}

function makeFakeSecrets() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  };
}

function makeDeps(overrides: Partial<CallerBridgeDeps> = {}): CallerBridgeDeps {
  return {
    elevenlabs: makeFakeEL(),
    activeShow: makeFakeActiveShow() as unknown as CallerBridgeDeps['activeShow'],
    secrets: makeFakeSecrets() as unknown as CallerBridgeDeps['secrets'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveVoiceProfile.mockResolvedValue(undefined);
  mockPreGenerateCallerAudio.mockResolvedValue({
    synthesized: 2, skipped: 0, failed: 0, errors: [], status: 'ok',
  });
});

describe('caller:tts:status', () => {
  it('returns enabled=true when EL client is enabled', async () => {
    const { ipc, handlers } = captureHandlers();
    const deps = makeDeps({ elevenlabs: makeFakeEL({ isEnabled: vi.fn().mockResolvedValue(true) }) });
    registerCallerBridge(deps, ipc);
    const result = await handlers['caller:tts:status']!();
    expect(result).toEqual({ enabled: true });
  });

  it('returns enabled=false when no key', async () => {
    const { ipc, handlers } = captureHandlers();
    const deps = makeDeps({ elevenlabs: makeFakeEL({ isEnabled: vi.fn().mockResolvedValue(false) }) });
    registerCallerBridge(deps, ipc);
    const result = await handlers['caller:tts:status']!();
    expect(result).toEqual({ enabled: false });
  });
});

describe('caller:apikey:set', () => {
  it('saves the API key via SecretStore and returns ok', async () => {
    const { ipc, handlers } = captureHandlers();
    const secrets = makeFakeSecrets();
    const deps = makeDeps({ secrets: secrets as unknown as CallerBridgeDeps['secrets'] });
    registerCallerBridge(deps, ipc);
    const result = await handlers['caller:apikey:set']!(null, 'sk-new-key');
    expect(secrets.set).toHaveBeenCalledWith('elevenlabs-api-key', 'sk-new-key');
    expect(result).toEqual({ ok: true });
  });
});

describe('caller:tts:synthesize', () => {
  it('calls synthesize and returns result', async () => {
    const { ipc, handlers } = captureHandlers();
    const el = makeFakeEL();
    registerCallerBridge(makeDeps({ elevenlabs: el }), ipc);
    const result = await handlers['caller:tts:synthesize']!(null, 'Hello', 'voice_abc', '/tmp/x.mp3');
    expect(el.synthesize).toHaveBeenCalledWith('Hello', 'voice_abc', '/tmp/x.mp3');
    expect(result).toEqual({ path: '/tmp/out.mp3', durationSecs: 1.5 });
  });

  it('propagates error from synthesize', async () => {
    const { ipc, handlers } = captureHandlers();
    const el = makeFakeEL({
      synthesize: vi.fn().mockRejectedValue(new Error('API key not configured')),
    });
    registerCallerBridge(makeDeps({ elevenlabs: el }), ipc);
    await expect(
      handlers['caller:tts:synthesize']!(null, 'Hi', 'vid', '/tmp/x.mp3'),
    ).rejects.toThrow(/API key/i);
  });
});

describe('caller:voice:get', () => {
  it('loads profile from active show pkgPath', async () => {
    const profile: VoiceProfile = {
      voice_id: 'v_123',
      name: 'Caller',
      created_at: '2026-01-01T00:00:00Z',
      sample_count: 2,
    };
    mockLoadVoiceProfile.mockResolvedValueOnce(profile);

    const { ipc, handlers } = captureHandlers();
    registerCallerBridge(makeDeps(), ipc);
    const result = await handlers['caller:voice:get']!();
    expect(mockLoadVoiceProfile).toHaveBeenCalledWith('/shows/my.showx');
    expect(result).toEqual(profile);
  });

  it('returns null when no active show', async () => {
    const { ipc, handlers } = captureHandlers();
    registerCallerBridge(
      makeDeps({
        activeShow: makeFakeActiveShow(null) as unknown as CallerBridgeDeps['activeShow'],
      }),
      ipc,
    );
    const result = await handlers['caller:voice:get']!();
    expect(result).toBeNull();
    expect(mockLoadVoiceProfile).not.toHaveBeenCalled();
  });
});

describe('caller:voice:clone', () => {
  it('clones voice and saves profile, returns VoiceProfile', async () => {
    const { ipc, handlers } = captureHandlers();
    const el = makeFakeEL({ cloneVoice: vi.fn().mockResolvedValue('new_voice_456') });
    registerCallerBridge(makeDeps({ elevenlabs: el }), ipc);

    const result = (await handlers['caller:voice:clone']!(
      null,
      'ShowCaller',
      ['/tmp/s1.wav', '/tmp/s2.wav'],
    )) as VoiceProfile;

    expect(el.cloneVoice).toHaveBeenCalledWith(
      'ShowCaller',
      ['/tmp/s1.wav', '/tmp/s2.wav'],
      undefined,
    );
    expect(mockSaveVoiceProfile).toHaveBeenCalledWith(
      '/shows/my.showx',
      expect.objectContaining({
        voice_id: 'new_voice_456',
        name: 'ShowCaller',
        sample_count: 2,
      }),
    );
    expect(result.voice_id).toBe('new_voice_456');
    expect(result.name).toBe('ShowCaller');
    expect(result.sample_count).toBe(2);
  });

  it('throws when no active show', async () => {
    const { ipc, handlers } = captureHandlers();
    registerCallerBridge(
      makeDeps({
        activeShow: makeFakeActiveShow(null) as unknown as CallerBridgeDeps['activeShow'],
      }),
      ipc,
    );
    await expect(
      handlers['caller:voice:clone']!(null, 'name', ['/tmp/s.wav']),
    ).rejects.toThrow(/No active show/i);
  });
});

describe('caller:pregen', () => {
  it('calls preGenerateCallerAudio with doc, cuelistId, pkgPath, elevenlabs, voiceId', async () => {
    const profile: VoiceProfile = {
      voice_id: 'voice_xyz',
      name: 'ShowCaller',
      created_at: '2026-01-01T00:00:00Z',
      sample_count: 3,
    };
    mockLoadVoiceProfile.mockResolvedValueOnce(profile);

    const { ipc, handlers } = captureHandlers();
    const deps = makeDeps();
    registerCallerBridge(deps, ipc);

    const result = await handlers['caller:pregen']!();
    expect(mockPreGenerateCallerAudio).toHaveBeenCalledWith(
      expect.anything(),  // doc
      'cl-001',           // cuelistId from fake doc
      '/shows/my.showx',  // pkgPath
      deps.elevenlabs,    // ttsClient (ElevenLabsClient satisfies TtsInterface)
      'voice_xyz',        // voiceId from profile
    );
    expect(result).toEqual({ synthesized: 2, skipped: 0, failed: 0, errors: [], status: 'ok' });
  });

  it('returns skipped_no_tts when no active show', async () => {
    const { ipc, handlers } = captureHandlers();
    registerCallerBridge(
      makeDeps({ activeShow: makeFakeActiveShow(null) as unknown as CallerBridgeDeps['activeShow'] }),
      ipc,
    );
    const result = await handlers['caller:pregen']!();
    expect(result).toEqual({ synthesized: 0, skipped: 0, failed: 0, errors: [], status: 'skipped_no_tts' });
    expect(mockPreGenerateCallerAudio).not.toHaveBeenCalled();
  });

  it('passes null voiceId when no voice profile', async () => {
    mockLoadVoiceProfile.mockResolvedValueOnce(null);

    const { ipc, handlers } = captureHandlers();
    registerCallerBridge(makeDeps(), ipc);
    await handlers['caller:pregen']!();
    expect(mockPreGenerateCallerAudio).toHaveBeenCalledWith(
      expect.anything(),
      'cl-001',
      '/shows/my.showx',
      expect.anything(),
      null,
    );
  });
});
