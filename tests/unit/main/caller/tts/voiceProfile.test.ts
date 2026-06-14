import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockWriteFile, mockRename } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockRename: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    rename: mockRename,
  },
}));

import { loadVoiceProfile, saveVoiceProfile } from '../../../../../src/main/src/caller/tts/voiceProfile.js';
import type { VoiceProfile } from '../../../../../src/main/src/caller/tts/voiceProfile.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
  mockRename.mockResolvedValue(undefined);
});

const SAMPLE_PROFILE: VoiceProfile = {
  voice_id: 'v_abc123',
  name: 'Test Caller',
  created_at: '2026-06-14T00:00:00.000Z',
  sample_count: 3,
};

describe('loadVoiceProfile', () => {
  it('returns parsed profile when file exists', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(SAMPLE_PROFILE));
    const profile = await loadVoiceProfile('/shows/my.showx');
    expect(profile).toEqual(SAMPLE_PROFILE);
    expect(mockReadFile).toHaveBeenCalledWith('/shows/my.showx/voice_profile.json', 'utf-8');
  });

  it('returns null when file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const profile = await loadVoiceProfile('/shows/my.showx');
    expect(profile).toBeNull();
  });

  it('returns null on JSON parse error', async () => {
    mockReadFile.mockResolvedValueOnce('{ bad json }');
    const profile = await loadVoiceProfile('/shows/my.showx');
    expect(profile).toBeNull();
  });
});

describe('saveVoiceProfile', () => {
  it('writes profile to a tmp file then renames atomically', async () => {
    await saveVoiceProfile('/shows/my.showx', SAMPLE_PROFILE);

    expect(mockWriteFile).toHaveBeenCalledOnce();
    const [tmpPath, content] = mockWriteFile.mock.calls[0] as [string, string];
    expect(tmpPath).toMatch(/voice_profile\.json\.tmp-/);
    expect(JSON.parse(content)).toEqual(SAMPLE_PROFILE);

    expect(mockRename).toHaveBeenCalledOnce();
    const [from, to] = mockRename.mock.calls[0] as [string, string];
    expect(from).toBe(tmpPath);
    expect(to).toBe('/shows/my.showx/voice_profile.json');
  });

  it('stores and loads a round-trip correctly', async () => {
    let stored = '';
    mockWriteFile.mockImplementationOnce((_p: string, c: string) => {
      stored = c;
      return Promise.resolve();
    });
    await saveVoiceProfile('/shows/my.showx', SAMPLE_PROFILE);

    mockReadFile.mockResolvedValueOnce(stored);
    const loaded = await loadVoiceProfile('/shows/my.showx');
    expect(loaded).toEqual(SAMPLE_PROFILE);
  });
});
