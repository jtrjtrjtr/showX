import { describe, it, expect, vi } from 'vitest';
import {
  enumerateAudioDevices,
  type AudifyFactory,
  type RtAudioLike,
} from '../../src/main/src/shared/audio/audioDevices.js';

// Build a stub AudifyFactory from a list of device descriptors.
function makeFactory(
  devices: {
    name?: string;
    inputChannels?: number;
    outputChannels?: number;
    isDefaultInput?: boolean;
    isDefaultOutput?: boolean;
    preferredSampleRate?: number;
  }[],
): AudifyFactory {
  const rt: RtAudioLike = {
    getDeviceCount: () => devices.length,
    getDeviceInfo: (id: number) => {
      const d = devices[id];
      if (!d) return null;
      return {
        id,
        name: d.name ?? `Device ${id}`,
        inputChannels: d.inputChannels ?? 0,
        outputChannels: d.outputChannels ?? 0,
        isDefaultInput: d.isDefaultInput ?? false,
        isDefaultOutput: d.isDefaultOutput ?? false,
        preferredSampleRate: d.preferredSampleRate ?? 44100,
      };
    },
  };
  return { createRtAudio: () => rt };
}

describe('enumerateAudioDevices', () => {
  it('returns ok + populated device list when factory succeeds', () => {
    const factory = makeFactory([
      { name: 'Built-in Microphone', inputChannels: 2, outputChannels: 0, isDefaultInput: true, isDefaultOutput: false, preferredSampleRate: 44100 },
      { name: 'Built-in Output', inputChannels: 0, outputChannels: 2, isDefaultInput: false, isDefaultOutput: true, preferredSampleRate: 44100 },
    ]);

    const result = enumerateAudioDevices(undefined, factory);

    expect(result.status).toBe('ok');
    expect(result.devices).toHaveLength(2);
    expect(result.devices[0].name).toBe('Built-in Microphone');
    expect(result.devices[0].inputChannels).toBe(2);
    expect(result.devices[0].isDefaultInput).toBe(true);
    expect(result.devices[1].name).toBe('Built-in Output');
    expect(result.devices[1].isDefaultOutput).toBe(true);
  });

  it('returns unavailable + [] when factory is null (audify absent / headless)', () => {
    const result = enumerateAudioDevices(undefined, null);

    expect(result.status).toBe('unavailable');
    expect(result.devices).toHaveLength(0);
  });

  it('returns unavailable + [] when createRtAudio throws', () => {
    const brokenFactory: AudifyFactory = {
      createRtAudio: () => { throw new Error('CoreAudio unavailable'); },
    };

    const result = enumerateAudioDevices(undefined, brokenFactory);

    expect(result.status).toBe('unavailable');
    expect(result.devices).toHaveLength(0);
  });

  it('returns unavailable + [] when getDeviceCount throws', () => {
    const brokenFactory: AudifyFactory = {
      createRtAudio: () => ({
        getDeviceCount: () => { throw new Error('audio init failed'); },
        getDeviceInfo: () => null,
      }),
    };

    const result = enumerateAudioDevices(undefined, brokenFactory);

    expect(result.status).toBe('unavailable');
    expect(result.devices).toHaveLength(0);
  });

  it('device shape has all required fields', () => {
    const factory = makeFactory([
      { name: 'Test Device', inputChannels: 1, outputChannels: 1, isDefaultInput: false, isDefaultOutput: false, preferredSampleRate: 48000 },
    ]);

    const result = enumerateAudioDevices(undefined, factory);

    expect(result.status).toBe('ok');
    expect(result.devices).toHaveLength(1);
    const d = result.devices[0]!;
    expect(typeof d.id).toBe('number');
    expect(typeof d.name).toBe('string');
    expect(typeof d.inputChannels).toBe('number');
    expect(typeof d.outputChannels).toBe('number');
    expect(typeof d.isDefaultInput).toBe('boolean');
    expect(typeof d.isDefaultOutput).toBe('boolean');
    expect(typeof d.preferredSampleRate).toBe('number');
  });

  it('empty device list → ok with no devices', () => {
    const result = enumerateAudioDevices(undefined, makeFactory([]));

    expect(result.status).toBe('ok');
    expect(result.devices).toHaveLength(0);
  });

  it('logs warning when factory is null', () => {
    const warn = vi.fn();
    const mockLog = { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enumerateAudioDevices(mockLog as any, null);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('IPC channel AUDIO_DEVICES_LIST contract', () => {
  it('channel name is audio:devices:list', async () => {
    const { IPC } = await import('../../src/main/src/ipc/channels.js');
    expect(IPC.AUDIO_DEVICES_LIST).toBe('audio:devices:list');
  });

  it('registerAudioDevicesBridge registers the handler and calls enumerateAudioDevices', async () => {
    const { registerAudioDevicesBridge } = await import('../../src/main/src/ipc/audioDevicesBridge.js');
    const { IPC } = await import('../../src/main/src/ipc/channels.js');

    const handled: Array<{ channel: string; listener: (...args: unknown[]) => unknown }> = [];
    const mockIpc = {
      handle(channel: string, listener: (...args: unknown[]) => unknown) {
        handled.push({ channel, listener });
      },
    };
    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const factory = makeFactory([
      { name: 'Out 1', inputChannels: 0, outputChannels: 2, isDefaultOutput: true },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAudioDevicesBridge({ logger: mockLogger as any, audifyFactory: factory }, mockIpc);

    const entry = handled.find((h) => h.channel === IPC.AUDIO_DEVICES_LIST);
    expect(entry).toBeTruthy();

    // Call the handler and verify it returns device list from the factory
    const result = await entry!.listener();
    expect(result).toEqual({
      status: 'ok',
      devices: expect.arrayContaining([expect.objectContaining({ name: 'Out 1' })]),
    });
  });
});
